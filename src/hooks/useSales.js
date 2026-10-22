import { useState, useCallback, useEffect, useRef } from 'react'
import { loadCategories } from '../utils/categoriesStorage'
import { loadAllSales, persistSaleChanges, nextInvoiceNumber as _nextInvoiceNumber } from '../utils/salesStorage'
import { fetchSales, fetchCategories } from '../services/supabaseRead'
import { writeSaleToSupabase, voidSaleInSupabase, partialRefundInventoryInSupabase } from '../services/supabaseWrite'
import { mergeSalesForDisplay } from '../utils/localSalesDb'
import { isDemoMode } from '../demo/demoSeed'

// Status values aligned with Supabase schema enum (sale_status).
// Translates any legacy localStorage value to the canonical backend value.
const STATUS_MAP = {
  normal:    'completed',
  completed: 'completed',
  deleted:   'voided',
  voided:    'voided',
}

// Re-export so App.jsx import stays unchanged
export { _nextInvoiceNumber as nextInvoiceNumber }

export function useSales() {
  const [sales, setSales] = useState(loadAllSales)

  // Phase 2: categories ref hydrated from Supabase so categoryId in saved
  // invoices is a UUID (matching Supabase schema) instead of a legacy integer.
  const categoriesRef = useRef(loadCategories())
  useEffect(() => {
    fetchCategories().then(remote => { if (remote) categoriesRef.current = remote })
  }, [])

  // Hydrate sales from Supabase after initial localStorage render, then poll
  // every 30s so Competition stays current across both kiosks.
  // Demo mode skips Supabase entirely — all sales are localStorage-only.
  useEffect(() => {
    if (isDemoMode()) return
    const hydrate = () =>
      fetchSales().then(remote => {
        if (!remote) return
        setSales(prev => {
          return mergeSalesForDisplay(
            remote.filter(s => s.location !== 'Fluxe Demo Store'),
            [...loadAllSales(), ...prev.filter(s => s._localPending)],
          )
        })
      }).catch(error => console.warn('[Fluxe] Sales refresh failed:', error.name))
    hydrate()
    const id = setInterval(hydrate, 30_000)
    return () => clearInterval(id)
  }, [])

  const saveSale = useCallback(async (invoice) => {
    const serialized = {
      ...invoice,
      _localPending: true,
      tip:    invoice.tip    ?? 0,
      // Phase 2: status uses canonical enum values (completed/voided).
      // Legacy 'normal'/'deleted' values are mapped for backward compat.
      status: STATUS_MAP[invoice.status] ?? 'completed',
      timestamp: invoice.timestamp instanceof Date
        ? invoice.timestamp.toISOString()
        : invoice.timestamp,
      items: (() => {
        // Build name→id map from Supabase categories (UUID ids) when available,
        // falling back to localStorage categories (integer ids) if cache is empty.
        const catMap = {}
        try {
          categoriesRef.current.forEach(c => { catMap[c.name] = c.id })
        } catch {}

        return (invoice.items || []).map((item, idx) => {
          const categoryName = item.product?.category || item.category || ''
          return {
            // ── Line identity (stable refund key within this invoice) ────────
            lineId:      `${invoice.number}-${idx + 1}`,
            // ── IDs (stable backend references) ─────────────────────────────
            productId:   item.product?.id   ?? item.productId   ?? null,
            categoryId:  catMap[categoryName] ?? null,
            // ── Name snapshots (display + history — never change after sale) ──
            name:        item.product?.name        || item.name        || '',
            barcode:     item.product?.barcode     || item.barcode     || '',
            description: item.product?.description || item.description || '',
            size:        item.product?.size        || item.size        || '',
            category:    categoryName,
            // ── Price snapshots ──────────────────────────────────────────────
            qty:         item.qty,
            salePrice:   item.salePrice,
            systemPrice: item.product?.systemPrice || item.systemPrice || item.salePrice,
            minPrice:    item.product?.minPrice    ?? item.minPrice    ?? 0,
            discount:    item.discount ?? 0,
            subtotal:    item.subtotal,
            spare:       item.spare ?? 0,
          }
        })
      })(),
    }

    // Await local durability before the cloud request; cloud failure retains the pending copy.
    await persistSaleChanges([serialized])
    setSales(prev => [...prev, serialized])
    if (isDemoMode()) return { saleId: null, serverNumber: serialized.number }
    const { saleId, serverNumber } = await writeSaleToSupabase(serialized)
    const confirmed = {
      ...serialized,
      number: serverNumber ?? serialized.number,
      supabaseId: saleId || null,
      _localPending: !saleId,
    }
    await persistSaleChanges([confirmed], confirmed.number !== serialized.number ? [serialized.number] : [])
    setSales(prev => [
      ...prev.filter(s => String(s.number) !== String(serialized.number) && String(s.number) !== String(confirmed.number)),
      confirmed,
    ])

    // Return saleId (UUID) + confirmed number so caller can chain inventory write.
    return { saleId, serverNumber: serverNumber ?? serialized.number }
  }, [])

  /** Patch any field(s) on an existing sale by invoice number (local only). */
  const updateSale = useCallback((invoiceNumber, patch) => {
    setSales(prev => {
      const updated = prev.map(s =>
        s.number === invoiceNumber ? { ...s, ...patch, _localPending: true } : s
      )
      persistSaleChanges(updated.filter(s => s.number === invoiceNumber))
      return updated
    })
  }, [])

  /**
   * Void a sale: update local state to status='voided' AND propagate to Supabase.
   * Also restores inventory_stock and creates inventory_movements type='refund'.
   *
   * Fire-and-forget on the Supabase side — local state is always updated first.
   *
   * @param {object}      invoice        Full invoice object (needs .items[], .locationId)
   * @param {string|null} performedById  UUID of the employee performing the void (optional)
   */
  const voidSale = useCallback((invoice, performedById = null) => {
    // 1. Immediate local update
    setSales(prev => {
      const updated = prev.map(s =>
        s.number === invoice.number ? { ...s, status: 'voided', _localPending: true } : s
      )
      persistSaleChanges(updated.filter(s => s.number === invoice.number))
      return updated
    })
    // 2. Backend void + inventory restore (fire-and-forget)
    voidSaleInSupabase(invoice, { performedById })
      .catch(err => console.warn('[Fluxe] voidSale backend error:', err.message))
  }, [])

  /**
   * Process a refund (full or partial).
   *
   * Full refund  → marks sale status='refunded', stores refund record, voids in Supabase.
   * Partial refund → keeps sale completed, appends refund record, restores only returned items.
   *
   * @param {object} invoice     Full invoice object
   * @param {object} refundData  { type, items, refundMethod, subtotal, tax, total, authorizedBy, refundId }
   */
  const refundSale = useCallback((invoice, refundData) => {
    const record = { ...refundData, timestamp: new Date().toISOString() }

    if (refundData.type === 'full') {
      setSales(prev => {
        const updated = prev.map(s =>
          s.number === invoice.number
            ? { ...s, status: 'refunded', refunds: [record], _localPending: true }
            : s
        )
        persistSaleChanges(updated.filter(s => s.number === invoice.number))
        return updated
      })
      voidSaleInSupabase(invoice, { performedById: null })
        .catch(err => console.warn('[Fluxe] refundSale (full) backend error:', err.message))
    } else {
      setSales(prev => {
        const updated = prev.map(s => {
          if (s.number !== invoice.number) return s
          return { ...s, refunds: [...(s.refunds || []), record], _localPending: true }
        })
        persistSaleChanges(updated.filter(s => s.number === invoice.number))
        return updated
      })
      partialRefundInventoryInSupabase(invoice, refundData.items, { performedById: null })
        .catch(err => console.warn('[Fluxe] refundSale (partial) backend error:', err.message))
    }
  }, [])

  return { sales, saveSale, updateSale, voidSale, refundSale }
}
