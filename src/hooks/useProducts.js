import { useState, useCallback, useEffect } from 'react'
import { loadAllProducts, saveAllProducts } from '../utils/productsStorage'
import { loadInventoryHistory, saveInventoryHistory } from '../utils/inventoryHistoryStorage'
import { localId } from '../domain/utils/ids'
import { fetchProducts, getLocationUUID } from '../services/supabaseRead'
import { awaitOrgSession } from '../services/supabaseAuth'
import { writeInventoryToSupabase } from '../services/supabaseWrite'

export function useProducts() {
  const [products, setProducts] = useState(loadAllProducts)

  // Phase 1: hydrate from Supabase after initial localStorage render.
  // Falls back silently to localStorage data if Supabase is unavailable.
  useEffect(() => {
    awaitOrgSession().then(() => fetchProducts()).then(remote => {
      if (!remote) return
      // Merge: remote provides live stock (qty/qtyByLoc), local provides category name
      // because Supabase products table stores category_id (UUID) not the name string
      const localMap = Object.fromEntries(loadAllProducts().map(p => [p.barcode, p]))
      const merged = remote.map(p => ({
        ...p,
        category: localMap[p.barcode]?.category || p.category || '',
      }))
      setProducts(merged)
    })
  }, [])

  /**
   * Subtract sold quantities from inventory after a sale is finalized.
   * Updates both the total qty and the per-location qty (qtyByLoc[locId]).
   * When saleInfo is provided, also appends InventoryMovement entries of type 'sale'
   * to the audit trail — one entry per product sold.
   *
   * Future refund path: call a parallel `restoreStock(items, locId, refundInfo)` that
   * generates movements of type 'refund'. decrementStock itself does not need changes.
   *
   * @param {object[]}    items     invoice.items (cart-shape or serialized-shape)
   * @param {string|null} locId     location ID for per-location tracking (null = skip)
   * @param {object|null} saleInfo  { invoiceNumber, locationName, employee } — omit to skip movement log
   */
  const decrementStock = useCallback((items, locId, saleInfo = null, saleId = null) => {
    setProducts(prev => {
      const ts           = new Date().toISOString()
      const movements    = []
      const stockChanges = []   // Phase 4: collected for Supabase inventory write

      const updated = prev.map(p => {
        const soldQty = (items || [])
          .filter(i => (i.product?.barcode || i.barcode) === p.barcode)
          .reduce((sum, i) => sum + Math.max(0, i.qty), 0)
        if (soldQty === 0) return p

        const locBefore   = locId ? (p.qtyByLoc?.[locId] || 0) : p.qty
        const newQty      = Math.max(0, p.qty - soldQty)
        const newQtyByLoc = locId && p.qtyByLoc
          ? { ...p.qtyByLoc, [locId]: Math.max(0, (p.qtyByLoc[locId] || 0) - soldQty) }
          : p.qtyByLoc
        const locAfter = locId ? Math.max(0, locBefore - soldQty) : newQty

        // Phase 4: build stock change for Supabase (only when locId and saleId are available)
        if (locId && saleId) {
          stockChanges.push({
            productId:    p.id,
            locationUUID: getLocationUUID(locId),   // 'loc_01' → UUID (populated on boot)
            qtyBefore:    locBefore,
            qtyAfter:     locAfter,
          })
        }

        if (saleInfo) {
          movements.push({
            id:            localId('inv'),
            timestamp:     ts,
            type:          'sale',
            productId:     p.id,
            productName:   p.name,
            barcode:       p.barcode,
            locationId:    locId    || '',
            locationName:  saleInfo.locationName || '',
            before:        locBefore,
            after:         locAfter,
            invoiceNumber: saleInfo.invoiceNumber,
            note:          `Invoice #${saleInfo.invoiceNumber}`,
            performedBy:   saleInfo.employee || '',
            // delta kept for local display only — NEVER send to Supabase
            // (GENERATED ALWAYS AS (qty_after - qty_before) STORED in schema)
            delta:         locAfter - locBefore,
          })
        }

        return { ...p, qty: newQty, qtyByLoc: newQtyByLoc }
      })

      saveAllProducts(updated)

      if (movements.length > 0) {
        const history = loadInventoryHistory()
        saveInventoryHistory([...movements, ...history])
      }

      // Phase 4: fire-and-forget Supabase inventory write — local state already updated
      if (stockChanges.length > 0) {
        writeInventoryToSupabase(stockChanges, {
          saleId,
          note:         saleInfo ? `Invoice #${saleInfo.invoiceNumber}` : '',
          performedById: null,   // Phase 6: replace with employee UUID when login layer exists
        })
      }

      return updated
    })
  }, [])

  return { products, decrementStock }
}
