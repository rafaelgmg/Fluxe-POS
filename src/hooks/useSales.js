import { useState, useCallback } from 'react'

const SALES_KEY   = 'fluxe-sales-v1'
const COUNTER_KEY = 'fluxe-invoice-counter-v1'
const SERVER_URL  = 'http://localhost:3001'

function loadSales() {
  try {
    const raw = localStorage.getItem(SALES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function persistSales(sales) {
  localStorage.setItem(SALES_KEY, JSON.stringify(sales))
}

// Sequential invoice number — never collides
export function nextInvoiceNumber() {
  const current = parseInt(localStorage.getItem(COUNTER_KEY) || '60000', 10)
  const next = current + 1
  localStorage.setItem(COUNTER_KEY, String(next))
  return next
}

export function useSales() {
  const [sales, setSales] = useState(loadSales)

  const saveSale = useCallback(async (invoice) => {
    const serialized = {
      ...invoice,
      tip:    invoice.tip    ?? 0,
      status: invoice.status ?? 'normal',
      timestamp: invoice.timestamp instanceof Date
        ? invoice.timestamp.toISOString()
        : invoice.timestamp,
      items: (invoice.items || []).map(item => ({
        name:        item.product?.name        || item.name        || '',
        barcode:     item.product?.barcode     || item.barcode     || '',
        description: item.product?.description || item.description || '',
        size:        item.product?.size        || item.size        || '',
        category:    item.product?.category    || item.category    || '',
        qty:         item.qty,
        salePrice:   item.salePrice,
        systemPrice: item.product?.systemPrice || item.systemPrice || item.salePrice,
        minPrice:    item.product?.minPrice    ?? item.minPrice    ?? 0,
        discount:    item.discount ?? 0,
        subtotal:    item.subtotal,
        spare:       item.spare ?? 0,
      })),
    }

    setSales(prev => {
      const updated = [...prev, serialized]
      persistSales(updated)
      return updated
    })

    // Try to persist to backend (fire-and-forget, already saved locally)
    try {
      await fetch(`${SERVER_URL}/api/sales`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(serialized),
      })
    } catch {
      // Server offline — local copy is the source of truth
    }
  }, [])

  /** Patch any field(s) on an existing sale by invoice number */
  const updateSale = useCallback((invoiceNumber, patch) => {
    setSales(prev => {
      const updated = prev.map(s =>
        s.number === invoiceNumber ? { ...s, ...patch } : s
      )
      persistSales(updated)
      return updated
    })
  }, [])

  return { sales, saveSale, updateSale }
}
