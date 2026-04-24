/**
 * dashboardService.js — Pure aggregation helpers for the Dashboard module.
 *
 * All functions are stateless: they receive data as arguments and return
 * derived values. No Supabase calls, no localStorage reads (except whoIsAtWork).
 * This makes them easy to test and reuse across components.
 */


// ── Date preset builders ──────────────────────────────────────────────────────

export function buildPreset(key) {
  const now   = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eod   = new Date(today.getTime() + 86_400_000 - 1)   // 23:59:59.999

  switch (key) {
    case 'today':
      return { from: today, to: eod }
    case 'yesterday': {
      const y = new Date(today.getTime() - 86_400_000)
      return { from: y, to: new Date(today.getTime() - 1) }
    }
    case 'week':
      return { from: new Date(today.getTime() - 6 * 86_400_000), to: eod }
    case 'month':
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: eod }
    default:
      return { from: today, to: eod }
  }
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export function filterSales(sales, { from, to, locationId }) {
  return sales.filter(s => {
    if (s.status === 'voided' || s.status === 'deleted') return false
    const ts = new Date(s.timestamp)
    if (from && ts < from) return false
    if (to   && ts > to)   return false
    if (locationId && locationId !== 'all') {
      if (s.locationId !== locationId && s.location !== locationId) return false
    }
    return true
  })
}

// ── KPI aggregation ───────────────────────────────────────────────────────────

/**
 * @param {object[]} sales — filtered sales (each item must carry costPrice snapshot)
 */
export function calcKPIs(sales) {
  let net = 0, gross = 0, invCost = 0

  for (const s of sales) {
    net   += s.subtotal || 0
    gross += s.total    || 0
    for (const item of (s.items || [])) {
      invCost += (item.qty || 0) * (item.costPrice || 0)
    }
  }

  return {
    netRevenue:    net,
    grossRevenue:  gross,
    taxRevenue:    gross - net,
    inventoryCost: invCost,
    netProfit:     net - invCost,
    saleCount:     sales.length,
  }
}

// ── Breakdown tables ──────────────────────────────────────────────────────────

export function byLocation(sales) {
  const map = {}
  for (const s of sales) {
    const k = s.location || 'Unknown'
    if (!map[k]) map[k] = { label: k, count: 0, total: 0 }
    map[k].count++
    map[k].total += s.subtotal || 0
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export function byEmployee(sales) {
  const map = {}
  for (const s of sales) {
    const k = s.employee || 'Unknown'
    if (!map[k]) map[k] = { label: k, count: 0, total: 0, spare: 0 }
    map[k].count++
    map[k].total += s.subtotal || 0
    map[k].spare += s.totalSpare || 0
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export function byProduct(sales) {
  const map = {}
  for (const s of sales) {
    for (const item of (s.items || [])) {
      const k = item.barcode || item.name || 'Unknown'
      if (!map[k]) map[k] = { label: item.name || k, barcode: item.barcode || '', qty: 0, total: 0 }
      map[k].qty   += item.qty || 0
      map[k].total += item.subtotal || 0
    }
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

export function byPaymentMethod(sales) {
  const map = {}
  for (const s of sales) {
    // Support split-payment arrays if present, otherwise use single paymentMethod
    const entries = Array.isArray(s.payments) && s.payments.length > 0
      ? s.payments.map(p => ({ method: p.method || p.type || 'unknown', amount: p.amount || 0 }))
      : [{ method: s.paymentMethod || 'unknown', amount: s.total || 0 }]

    for (const p of entries) {
      const k = p.method.toLowerCase()
      if (!map[k]) map[k] = { label: k, count: 0, total: 0 }
      map[k].count++
      map[k].total += p.amount
    }
  }
  return Object.values(map).sort((a, b) => b.total - a.total)
}

// ── Clock In / Who is at Work ─────────────────────────────────────────────────

/**
 * Derive active clock-ins from a records array (Supabase-sourced).
 * Applies a today guard as a safety net in case stale records slip through.
 *
 * @param {object[]} records  — from fetchTodayClockRecords (normalized)
 * @param {string|null} locationName — when set, filters to that location only
 */
export function whoIsAtWork(records = [], locationName = null) {
  const today = new Date().toDateString()
  return records.filter(r => {
    if (new Date(r.clockIn).toDateString() !== today) return false
    if (r.clockOut) return false
    if (locationName && r.location && r.location !== locationName) return false
    return true
  }).map(r => ({ employee: r.employee, location: r.location || '', clockIn: r.clockIn }))
}
