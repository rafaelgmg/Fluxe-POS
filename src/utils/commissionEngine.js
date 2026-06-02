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
 *  'tier_nc'        → New Collections (see formula below)
 *  'pct_subtotal'   → Brands: fixed % of subtotal (e.g. 5%) — rate from category
 *  'pct_spare'      → Spare: fixed % of spare (e.g. 30%) — rate from category
 *  'fixed_per_unit' → Fixed $ per unit sold — rate from category
 *  'none' / null    → No commission
 *
 *  All types are still gated by the $600 daily minimum. Below $600 = $0.
 *
 * ── tier_nc formula (aggregate — NOT per item) ───────────────────────────────
 *
 *  The NC commission is computed on ALL nc items in an invoice together:
 *
 *    ncSpare      = Σ item.spare  (raw/unclamped — can be negative)
 *    baseNormal   = max(0, ncTotalSubtotal - ncSpare)
 *    spareForComm = max(0, ncSpare)
 *    commission   = baseNormal × tierRate + spareForComm × spareRate
 *
 *  WHY aggregate and not per item:
 *    When an item is sold below minPrice, its line spare is negative.
 *    Per-item calculation clamps each spare to 0 → negative contributions
 *    disappear → inflated commission (bug). Aggregate calculation sums
 *    the raw spare (including negatives) first, then applies the formula
 *    once → correct result.
 *
 *  Example: total=$600, spare=$40, tier=20%, spareRate=30%
 *    baseNormal = 600 - 40 = 560
 *    commission = 560×20% + 40×30% = 112 + 12 = $124
 *
 *  Per-item breakdown is prorated proportionally to each item's subtotal
 *  within the NC group. The last item absorbs any cent-level rounding residual
 *  so Σ per-item == exact aggregate total.
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
import { localDateKey } from './dateUtils'
import { sumItemSpare, calcProductValue } from './spareUtils'

/**
 * Given a day's subtotal, return the applicable tier rate (decimal) and label.
 *
 * @param  {number}   daySubtotal
 * @param  {object}   [opts]
 * @param  {object[]} [opts.tiers] - pre-loaded commission tiers array.
 *   If omitted, falls back to loadCommissionTiers() from storage.
 *   Pass this when calling from backend context to avoid storage reads.
 * @returns {{ rate: number, label: string }}
 */
export function getDayTier(daySubtotal, { tiers } = {}) {
  const resolvedTiers = tiers ?? loadCommissionTiers()
  const match = resolvedTiers.find(t => daySubtotal >= t.threshold)
  if (!match) return { rate: 0, label: 'Below $' + (resolvedTiers.length > 0 ? Math.min(...resolvedTiers.map(t => t.threshold)) : 600) }
  return {
    rate:  match.rate / 100,
    label: `$${match.threshold.toLocaleString()}+ (${match.rate}%)`,
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────────

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
    // Clamp spare to 0 for commission: selling below minPrice earns 0 spare
    // commission, not negative. The raw item.spare can be negative (Phase 8 fix).
    spare:    Math.max(0, item.spare ?? 0),
  }
}

// ── Core item calculation ──────────────────────────────────────────────────────

/**
 * Calculate commission for a single line item.
 *
 * @param {object}      item         - raw item from invoice.items
 * @param {object|null} catConfig    - category config { commissionType, commissionRate }
 * @param {number}      tierRate     - day tier rate in decimal (0 = below $600 = no commission)
 * @param {number|null} spareRatePct - spare commission % (e.g. 30).
 *   If null/omitted, falls back to loadSpareRate() from storage.
 *   Pass the resolved value when calling from backend context.
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
      const productValue = calcProductValue(subtotal, spare)
      const productComm  = productValue * tierRate
      const spareComm    = spare * spareRate
      return Math.max(0, Math.round((productComm + spareComm) * 100) / 100)
    }

    case 'pct_subtotal': {
      // Brands: fixed % of subtotal. If spareCommissionEnabled, spare is split out
      // and paid at the NC spare rate instead of the brand rate.
      const rate = (commissionRate ?? 0) / 100
      if (catConfig.spareCommissionEnabled) {
        const productValue = calcProductValue(subtotal, spare)
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
  if (!invoice || invoice.status === 'deleted' || invoice.status === 'voided') {
    return { total: 0, breakdown: [] }
  }

  const spareRate  = (spareRatePct ?? loadSpareRate()) / 100
  const rawItems   = invoice.items || []

  // ── tier_nc: aggregate calculation (raw/unclamped spare) ─────────────────────
  // Items are grouped across the whole invoice. Raw spare (can be negative) is
  // summed first so negatives offset positives before the formula is applied.
  // This prevents inflated commission when some items are sold below minPrice.
  const ncRaws = rawItems.filter(raw => {
    if ((raw.qty ?? 1) <= 0) return false  // exchange return lines earn no commission
    const cat = categoryMap[(raw.product?.category || raw.category || '').toLowerCase()]
    return cat?.commissionType === 'tier_nc'
  })

  // ncCommMap: Map<rawItem, { commission, productCommission, spareCommission }>
  const ncCommMap = new Map()
  if (ncRaws.length > 0 && tierRate > 0) {
    // Use raw (unclamped) spare from the item directly — resolveItemFields clamps,
    // so we read item.spare before calling it.
    const ncTotalSubtotal = ncRaws.reduce((s, r) => s + (r.subtotal ?? 0), 0)
    const ncTotalSpare    = ncRaws.reduce((s, r) => s + (r.spare    ?? 0), 0)  // raw, can be negative
    const ncBaseNormal    = Math.max(0, ncTotalSubtotal - ncTotalSpare)
    const ncSpareForComm  = Math.max(0, ncTotalSpare)
    const ncExact         = ncBaseNormal * tierRate + ncSpareForComm * spareRate

    // Prorate per item by subtotal weight; last item absorbs cent-level residual
    let distComm  = 0
    let distProd  = 0
    let distSpare = 0
    ncRaws.forEach((raw, idx) => {
      const weight   = ncTotalSubtotal > 0 ? (raw.subtotal ?? 0) / ncTotalSubtotal : 1 / ncRaws.length
      const isLast   = idx === ncRaws.length - 1
      const itemComm = isLast
        ? Math.round((ncExact                      - distComm)  * 100) / 100
        : Math.round(ncExact                      * weight * 100) / 100
      const prodComm = isLast
        ? Math.round((ncBaseNormal   * tierRate    - distProd)  * 100) / 100
        : Math.round(ncBaseNormal   * tierRate    * weight * 100) / 100
      const spareComm = isLast
        ? Math.round((ncSpareForComm * spareRate   - distSpare) * 100) / 100
        : Math.round(ncSpareForComm * spareRate   * weight * 100) / 100

      ncCommMap.set(raw, { commission: itemComm, productCommission: prodComm, spareCommission: spareComm })
      distComm  += itemComm
      distProd  += prodComm
      distSpare += spareComm
    })
  } else {
    ncRaws.forEach(raw => ncCommMap.set(raw, { commission: 0, productCommission: null, spareCommission: null }))
  }

  // ── Per-item breakdown ────────────────────────────────────────────────────────
  const breakdown = rawItems.map(raw => {
    const item      = resolveItemFields(raw)
    const catConfig = categoryMap[(item.category || '').toLowerCase()] || null
    const commType  = catConfig?.commissionType

    let commission        = 0
    let productCommission = null
    let spareCommission   = null

    if (commType === 'tier_nc') {
      const nc       = ncCommMap.get(raw) || { commission: 0, productCommission: null, spareCommission: null }
      commission        = nc.commission
      productCommission = nc.productCommission
      spareCommission   = nc.spareCommission
    } else {
      commission = calcItemCommission(raw, catConfig, tierRate, spareRatePct)
      if (commType === 'pct_subtotal' && catConfig?.spareCommissionEnabled && tierRate > 0) {
        const rate        = (catConfig.commissionRate ?? 0) / 100
        const pv          = calcProductValue(item.subtotal, item.spare)
        productCommission = Math.round(pv         * rate      * 100) / 100
        spareCommission   = Math.round(item.spare * spareRate * 100) / 100
      }
    }

    return {
      name:              item.name,
      category:          item.category || '(no category)',
      commissionType:    commType || 'none',
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
  const validSales = sales.filter(s => s.status !== 'deleted' && s.status !== 'voided')

  // ── Step 1: sum subtotals and spare totals per local day ──────────────────
  const daySubtotals = {}
  const daySpares    = {}
  for (const s of validSales) {
    const key = localDateKey(s.timestamp)
    daySubtotals[key] = (daySubtotals[key] || 0) + (s.subtotal || 0)
    // Sum spare across all line items for the spare-tier threshold lookup
    daySpares[key] = (daySpares[key] || 0) + sumItemSpare(s.items)
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
 * Convenience wrapper — resolves category map then runs period calculation.
 * Use this from UserReport and any screen that needs commission data.
 *
 * @param {object[]} sales
 * @param {object}   [opts]
 * @param {object}   [opts.categoryMap] - pre-built category map { [name]: categoryConfig }.
 *   If omitted, falls back to buildCategoryMap() from storage.
 *   Pass this when calling from backend context to avoid storage reads.
 * @returns same shape as calcPeriodCommission
 */
export function calcPeriodCommissionFresh(sales, { categoryMap } = {}) {
  const map = categoryMap ?? buildCategoryMap()
  return calcPeriodCommission(sales, map)
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
