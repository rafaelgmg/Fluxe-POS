/**
 * supabaseDashboard.js — Data layer for the /dashboard page.
 */

import { fetchSales }     from './supabaseRead'
import { initOrgSession } from './supabaseAuth'

// ── Fetch ─────────────────────────────────────────────────────────────────────

/**
 * @param {Date} startDate
 * @param {Date} endDate
 */
export async function fetchDashboardData(startDate, endDate) {
  try { await initOrgSession() } catch {}

  const sales = await fetchSales()
  if (!sales) return null

  const active  = s => s.status !== 'voided'
  const inRange = (s, from, to) => { const d = new Date(s.timestamp); return d >= from && d < to }

  const selected   = sales.filter(s => active(s) && inRange(s, startDate, endDate))

  // Comparison period: same duration immediately before the selected range
  const duration    = endDate.getTime() - startDate.getTime()
  const compareEnd  = startDate
  const compareStart = new Date(startDate.getTime() - duration)
  const comparison  = sales.filter(s => active(s) && inRange(s, compareStart, compareEnd))

  return {
    current:    computeMetrics(selected),
    comparison: computeMetrics(comparison),
    feed:       selected.slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 60),
    fetchedAt:  new Date(),
  }
}

// ── Metrics ───────────────────────────────────────────────────────────────────

export function computeMetrics(sales) {
  const empty = {
    total: 0, subtotal: 0, totalTax: 0, count: 0, avgTicket: 0,
    byEmployee: [], byLocation: [], byPayment: [],
    byHour: Array(24).fill(0), peakHour: -1, topProduct: null,
  }
  if (!sales.length) return empty

  let total    = 0
  let totalTax = 0
  const empMap  = {}
  const locMap  = {}
  const payMap  = {}
  const prodMap = {}
  const byHour  = Array(24).fill(0)

  for (const s of sales) {
    const amt = s.total || 0
    total    += amt
    totalTax += s.tax || 0

    const emp = s.employee || s.employeeName || (s.employees?.[0]?.name) || 'Unknown'
    if (!empMap[emp]) empMap[emp] = { name: emp, total: 0, count: 0 }
    empMap[emp].total += amt
    empMap[emp].count++

    const loc = s.location || s.locationName || 'Unknown'
    if (!locMap[loc]) locMap[loc] = { name: loc, total: 0, count: 0 }
    locMap[loc].total += amt
    locMap[loc].count++

    const payments = Array.isArray(s.payments) && s.payments.length > 0
      ? s.payments
      : [{ method: s.paymentMethod || 'unknown', amount: amt }]
    for (const p of payments) {
      const m = normalizeMethod(p.method)
      payMap[m] = (payMap[m] || 0) + (p.amount || 0)
    }

    byHour[new Date(s.timestamp).getHours()] += amt

    for (const item of (s.items || [])) {
      const name = item.name || 'Unknown'
      if (!prodMap[name]) prodMap[name] = { name, qty: 0, total: 0 }
      prodMap[name].qty   += item.qty   || 1
      prodMap[name].total += item.subtotal || (item.salePrice * (item.qty || 1)) || 0
    }
  }

  const byEmployee = Object.values(empMap).sort((a, b) => b.total - a.total)
  const byLocation = Object.values(locMap).sort((a, b) => b.total - a.total)
  const byPayment  = Object.entries(payMap)
    .map(([method, total]) => ({ method, total }))
    .sort((a, b) => b.total - a.total)
  const peakHour   = byHour.indexOf(Math.max(...byHour))
  const topProduct = Object.values(prodMap).sort((a, b) => b.total - a.total)[0] || null
  const count      = sales.length

  return { total, subtotal: total - totalTax, totalTax, count, avgTicket: count > 0 ? total / count : 0, byEmployee, byLocation, byPayment, byHour, peakHour, topProduct }
}

function normalizeMethod(m) {
  if (!m) return 'other'
  const l = m.toLowerCase()
  if (l === 'cash')           return 'cash'
  if (l.includes('card'))     return 'card'
  if (l.includes('external')) return 'external'
  if (l.includes('check'))    return 'check'
  if (l === 'split')          return 'split'
  return l
}
