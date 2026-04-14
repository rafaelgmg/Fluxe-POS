/**
 * commissionEngine.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Tier-based daily commission engine.
 *
 * ── Business rules ────────────────────────────────────────────────────────────
 *
 *  1. The seller must reach $600 in subtotal on a given day to earn ANY
 *     commission that day. Below $600 → commission = $0 for all items.
 *
 *  2. Commission is RETROACTIVE within the day: if the seller ends the day
 *     at a higher tier, that rate applies to all eligible items sold that day.
 *
 *  Day tiers (based on daily subtotal, tax excluded):
 *    < $600  → rate 0%   (no commission)
 *    $600+   → rate 20%
 *    $1000+  → rate 25%
 *    $1500+  → rate 30%
 *
 * ── Commission types per category ────────────────────────────────────────────
 *
 *  'tier_nc'        → New Collections: (subtotal - spare) × tierRate + spare × spareRate% (per-location, default 30%)
 *  'pct_subtotal'   → Brands: fixed % of subtotal (e.g. 5%) — rate from category
 *  'pct_spare'      → Spare: fixed % of spare (e.g. 30%) — rate from category
 *  'fixed_per_unit' → Fixed $ per unit sold — rate from category
 *  'none' / null    → No commission
 *
 *  All types are still gated by the $600 daily minimum. Below $600 = $0.
 *
 * ── Architecture ─────────────────────────────────────────────────────────────
 *
 *  Commission is calculated at REPORT TIME using current category config.
 *  If you later need point-in-time accuracy, store commissionSnapshot in the
 *  invoice at sale time and read it here first (fallback to current config).
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

import { buildCategoryMap } from './categoriesStorage'
import { loadCommissionTiers, loadSpareRate } from './commissionTiersStorage'
import { resolveSpareRateForDay } from './locationConfig'

/**
 * Given a day's subtotal, return the applicable tier rate (decimal) and label.
 * Reads live tiers from localStorage — respects Admin configuration.
 *
 * @param  {number} daySubtotal
 * @returns {{ rate: number, label: string }}
 */
export function getDayTier(daySubtotal) {
  const tiers = loadCommissionTiers()   // sorted highest-first
  const match = tiers.find(t => daySubtotal >= t.threshold)
  if (!match) return { rate: 0, label: 'Below $' + (tiers.length > 0 ? Math.min(...tiers.map(t => t.threshold)) : 600) }
  return {
    rate:  match.rate / 100,
    label: `$${match.threshold.toLocaleString()}+ (${match.rate}%)`,
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

/** "YYYY-MM-DD" in LOCAL timezone — used as day grouping key. */
function localDateKey(ts) {
  const d   = new Date(ts)
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Resolve both cart-shape and serialized-shape items.
 * Cart:       { product: { name, category }, qty, salePrice, spare, subtotal }
 * Serialized: { name, category, qty, salePrice, spare, subtotal }
 */
function resolveItemFields(item) {
  return {
    name:     item.product?.name     || item.name     || '',
    category: item.product?.category || item.category || '',
    qty:      Math.max(0, item.qty   || 1),
    subtotal: item.subtotal ?? ((item.salePrice || 0) * Math.max(0, item.qty || 1)),
    spare:    item.spare    ?? 0,
  }
}

// ── Core item calculation ──────────────────────────────────────────────────────

/**
 * Calculate commission for a single line item.
 *
 * @param {object}      item         - raw item from invoice.items
 * @param {object|null} catConfig    - category config { commissionType, commissionRate }
 * @param {number}      tierRate     - day tier rate in decimal (0 = below $600 = no commission)
 * @param {number|null} spareRatePct - spare commission % (e.g. 30). null = use global default.
 * @returns {number} commission in dollars, rounded to 2 decimals
 */
export function calcItemCommission(item, catConfig, tierRate = 0, spareRatePct = null) {
  if (!catConfig) return 0
  const { commissionType, commissionRate } = catConfig
  if (!commissionType || commissionType === 'none') return 0

  // ── $600 gate: if the day didn't reach the minimum, no commission at all ─────
  if (tierRate === 0) return 0

  const { qty, subtotal, spare } = resolveItemFields(item)
  // Resolve spare rate: use per-location value if provided, else global default
  const spareRate = (spareRatePct ?? loadSpareRate()) / 100

  switch (commissionType) {
    case 'tier_nc': {
      // New Collections: split product value and spare.
      // productCommission = (subtotal - spare) * tierRate  (day tier, retroactive)
      // spareCommission   = spare * spareRate              (configurable per location, default 30%)
      const productValue = Math.max(0, subtotal - spare)
      const productComm  = productValue * tierRate
      const spareComm    = spare * spareRate
      return Math.max(0, Math.round((productComm + spareComm) * 100) / 100)
    }

    case 'pct_subtotal': {
      // Brands: fixed % of subtotal. If spareCommissionEnabled, spare is split out
      // and paid at the NC spare rate instead of the brand rate.
      const rate = (commissionRate ?? 0) / 100
      if (catConfig.spareCommissionEnabled) {
        const productValue = Math.max(0, subtotal - spare)
        const productComm  = productValue * rate
        const spareComm    = spare * spareRate
        return Math.max(0, Math.round((productComm + spareComm) * 100) / 100)
      }
      return Math.max(0, Math.round(subtotal * rate * 100) / 100)
    }

    case 'pct_spare':
      // Spare: fixed % of spare generated.
      return Math.max(0, Math.round(spare * ((commissionRate ?? 0) / 100) * 100) / 100)

    case 'fixed_per_unit':
      // Fixed $ per unit regardless of price.
      return Math.max(0, Math.round(qty * (commissionRate ?? 0) * 100) / 100)

    default:
      return 0
  }
}

// ── Invoice calculation ────────────────────────────────────────────────────────

/**
 * Calculate commission for a single invoice.
 *
 * @param {object}      invoice
 * @param {object}      categoryMap   - from buildCategoryMap()
 * @param {number}      tierRate      - day tier rate (pass 0 if day is below $600)
 * @param {number|null} spareRatePct  - spare commission % for this location (null = global default)
 * @returns {{ total: number, breakdown: object[] }}
 */
export function calcInvoiceCommission(invoice, categoryMap, tierRate = 0, spareRatePct = null) {
  if (!invoice || invoice.status === 'deleted') {
    return { total: 0, breakdown: [] }
  }

  const spareRate = (spareRatePct ?? loadSpareRate()) / 100

  const breakdown = (invoice.items || []).map(raw => {
    const item       = resolveItemFields(raw)
    const catConfig  = categoryMap[item.category] || null
    const commission = calcItemCommission(raw, catConfig, tierRate, spareRatePct)

    // For tier_nc and pct_subtotal w/ spare split, compute breakdown for display
    let productCommission = null
    let spareCommission   = null
    const commType = catConfig?.commissionType
    if (commType === 'tier_nc' && tierRate > 0) {
      const productValue = Math.max(0, item.subtotal - item.spare)
      productCommission  = Math.round(productValue * tierRate  * 100) / 100
      spareCommission    = Math.round(item.spare   * spareRate * 100) / 100
    } else if (commType === 'pct_subtotal' && catConfig?.spareCommissionEnabled && tierRate > 0) {
      const rate         = (catConfig.commissionRate ?? 0) / 100
      const productValue = Math.max(0, item.subtotal - item.spare)
      productCommission  = Math.round(productValue * rate      * 100) / 100
      spareCommission    = Math.round(item.spare   * spareRate * 100) / 100
    }

    return {
      name:              item.name,
      category:          item.category || '(no category)',
      commissionType:    catConfig?.commissionType || 'none',
      commissionRate:    catConfig?.commissionRate ?? null,
      qty:               item.qty,
      spare:             item.spare,
      subtotal:          item.subtotal,
      commission:        Math.round(commission * 100) / 100,
      productCommission,
      spareCommission,
    }
  })

  const total = breakdown.reduce((s, b) => s + b.commission, 0)
  return { total: Math.round(total * 100) / 100, breakdown }
}

// ── Period calculation ─────────────────────────────────────────────────────────

/**
 * Calculate commission for an employee over a set of sales.
 *
 * Flow:
 *  1. Group valid sales by local date → compute day subtotal
 *  2. Look up tier per day using getDayTier()
 *  3. For each invoice, apply that day's tier to each item
 *
 * @param {object[]} sales       - invoices already filtered to employee + period
 * @param {object}   categoryMap - from buildCategoryMap()
 * @returns {{
 *   totalCommission: number,
 *   byCategory: { [cat]: { units, spare, subtotal, commission, type, rate } },
 *   byInvoice:  Array<{ number, timestamp, invoiceTotal, commission, tierRate, dayKey }>,
 *   dayTierMap: { [dateKey]: { subtotal, rate, label } }
 * }}
 */
export function calcPeriodCommission(sales, categoryMap) {
  const validSales = sales.filter(s => s.status !== 'deleted')

  // ── Step 1: sum subtotals and spare totals per local day ──────────────────
  const daySubtotals = {}
  const daySpares    = {}
  for (const s of validSales) {
    const key = localDateKey(s.timestamp)
    daySubtotals[key] = (daySubtotals[key] || 0) + (s.subtotal || 0)
    // Sum spare across all line items for the spare-tier threshold lookup
    const invoiceSpare = (s.items || []).reduce((sum, raw) => sum + (raw.spare ?? 0), 0)
    daySpares[key] = (daySpares[key] || 0) + invoiceSpare
  }

  // ── Step 2: product tier per day ──────────────────────────────────────────
  const dayTierMap = {}
  for (const [key, sub] of Object.entries(daySubtotals)) {
    const tier = getDayTier(sub)
    dayTierMap[key] = { subtotal: sub, rate: tier.rate, label: tier.label }
  }

  // ── Step 3: commission per invoice + category rollup ──────────────────────
  const byInvoice  = []
  const byCategory = {}

  for (const invoice of validSales) {
    const dayKey       = localDateKey(invoice.timestamp)
    const tierRate     = dayTierMap[dayKey]?.rate ?? 0
    // Resolve spare rate: fixed % OR tiered based on the day's total spare
    const spareRatePct = resolveSpareRateForDay(invoice.location, daySpares[dayKey] ?? 0)

    const { total, breakdown } = calcInvoiceCommission(invoice, categoryMap, tierRate, spareRatePct)

    byInvoice.push({
      number:       invoice.number,
      timestamp:    invoice.timestamp,
      invoiceTotal: invoice.total,
      commission:   total,
      tierRate,
      dayKey,
    })

    for (const item of breakdown) {
      if (!byCategory[item.category]) {
        byCategory[item.category] = {
          units:      0,
          spare:      0,
          subtotal:   0,
          commission: 0,
          type:       item.commissionType,
          rate:       item.commissionRate,
        }
      }
      byCategory[item.category].units      += item.qty
      byCategory[item.category].spare      += item.spare
      byCategory[item.category].subtotal   += item.subtotal
      byCategory[item.category].commission += item.commission
    }
  }

  // Round category totals
  for (const key of Object.keys(byCategory)) {
    byCategory[key].commission = Math.round(byCategory[key].commission * 100) / 100
    byCategory[key].spare      = Math.round(byCategory[key].spare      * 100) / 100
    byCategory[key].subtotal   = Math.round(byCategory[key].subtotal   * 100) / 100
  }

  const totalCommission = byInvoice.reduce((s, i) => s + i.commission, 0)

  return {
    totalCommission: Math.round(totalCommission * 100) / 100,
    byCategory,
    byInvoice,
    dayTierMap,
  }
}

/**
 * Convenience wrapper — loads fresh category map then runs period calculation.
 * Use this from UserReport and any screen that needs commission data.
 *
 * @param {object[]} sales
 * @returns same shape as calcPeriodCommission
 */
export function calcPeriodCommissionFresh(sales) {
  const categoryMap = buildCategoryMap()
  return calcPeriodCommission(sales, categoryMap)
}

/**
 * Check if any category has commission configured.
 * Useful to conditionally show the commission column in reports.
 */
export function hasAnyCommissionConfigured() {
  const map = buildCategoryMap()
  return Object.values(map).some(c =>
    c.commissionType &&
    c.commissionType !== 'none' &&
    (c.commissionRate > 0 || c.commissionType === 'tier_nc')
  )
}
