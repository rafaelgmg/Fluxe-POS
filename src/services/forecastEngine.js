/**
 * forecastEngine.js — Pure inventory forecast computation.
 *
 * Input:  { products, sales (last 30d), retailLocations, warehouseLocations }
 * Output: array of ForecastRow sorted by urgency
 *
 * READ-ONLY. Does NOT modify products, sales, stock, or any storage.
 *
 * Rules:
 *  - reorderable | coreProduct=true → full forecast (transfer + reorder suggestions)
 *  - seasonal  → monitor only (no transfer/reorder suggestions)
 *  - do_not_reorder | discontinued | test_product → skipped entirely
 */

const SKIP_STATUSES   = new Set(['do_not_reorder', 'discontinued', 'test_product'])
const MONITOR_ONLY    = new Set(['seasonal'])
const URGENCY_ORDER   = { critical: 0, warning: 1, monitor: 2, healthy: 3 }

const MS_PER_DAY = 86_400_000

/**
 * @typedef {Object} ForecastRow
 * @property {object}   product
 * @property {object}   location          retail location
 * @property {number}   retailStock
 * @property {number}   warehouseStock    total across all warehouse locations
 * @property {number}   totalStock
 * @property {number}   sold7d
 * @property {number}   sold14d
 * @property {number}   sold30d
 * @property {number}   avgDailySales
 * @property {number}   daysUntilStockout Infinity when avgDailySales = 0
 * @property {number}   targetStock       ceil(avgDailySales × targetDaysOfStock)
 * @property {number}   suggestedTransfer from warehouse → this retail location
 * @property {number}   suggestedReorder  external purchase needed
 * @property {'critical'|'warning'|'healthy'|'monitor'} urgency
 * @property {'transfer'|'reorder'|'ok'|'monitor'}      action
 * @property {string}   supplier
 * @property {number}   leadTime
 */

/**
 * @param {{ products: object[], sales: object[], retailLocations: object[], warehouseLocations: object[] }}
 * @returns {ForecastRow[]}
 */
export function computeForecast({ products, sales, retailLocations, warehouseLocations }) {
  const now      = Date.now()
  const cut30    = now - 30 * MS_PER_DAY
  const cut14    = now - 14 * MS_PER_DAY
  const cut7     = now - 7  * MS_PER_DAY

  // Index products by id and barcode for O(1) lookup
  const byId      = {}
  const byBarcode = {}
  for (const p of products) {
    if (p.id     != null) byId[p.id]       = p
    if (p.barcode)        byBarcode[p.barcode] = p
  }

  // Build velocity map: vel[productId][locId] = { sold7, sold14, sold30 }
  const vel = {}

  const retailLocByName = {}
  for (const l of retailLocations) retailLocByName[l.name] = l

  for (const sale of sales) {
    if (sale.status === 'voided') continue
    const ts = new Date(sale.timestamp || sale.completedAt || sale.createdAt).getTime()
    if (ts < cut30) continue

    const loc = retailLocByName[sale.location]
    if (!loc) continue  // skip warehouse or unknown location sales

    for (const item of (sale.items || [])) {
      const prod = byId[item.productId] || byBarcode[item.barcode] || null
      if (!prod) continue

      const qty = item.qty || 1
      if (!vel[prod.id])        vel[prod.id]        = {}
      if (!vel[prod.id][loc.id]) vel[prod.id][loc.id] = { sold7: 0, sold14: 0, sold30: 0 }

      vel[prod.id][loc.id].sold30 += qty
      if (ts >= cut14) vel[prod.id][loc.id].sold14 += qty
      if (ts >= cut7)  vel[prod.id][loc.id].sold7  += qty
    }
  }

  const rows = []

  for (const product of products) {
    if (product.status === 'inactive') continue

    const rs = product.reorderStatus || 'reorderable'
    if (SKIP_STATUSES.has(rs)) continue

    // Only include reorderable or coreProduct (seasonal gets monitor-only)
    const isMonitorOnly = MONITOR_ONLY.has(rs)
    if (!isMonitorOnly && rs !== 'reorderable' && !product.coreProduct) continue

    // Total warehouse stock (sum across all warehouse locations)
    const warehouseStock = warehouseLocations.reduce(
      (sum, wh) => sum + (product.qtyByLoc?.[wh.id] ?? 0), 0
    )

    for (const loc of retailLocations) {
      const retailStock  = product.qtyByLoc?.[loc.id] ?? 0
      const totalStock   = retailStock + warehouseStock

      const v            = vel[product.id]?.[loc.id] || { sold7: 0, sold14: 0, sold30: 0 }
      const avgDailySales = v.sold30 / 30

      const leadTime     = product.leadTimeDays     ?? 7
      const targetDays   = product.targetDaysOfStock ?? 14
      const targetStock  = Math.ceil(avgDailySales * targetDays)

      // Days until stockout (retail only)
      const daysUntilStockout = avgDailySales > 0 ? retailStock / avgDailySales : Infinity

      // Transfer / reorder suggestions (not for monitor-only products)
      let suggestedTransfer = 0
      let suggestedReorder  = 0

      if (!isMonitorOnly) {
        const deficit         = Math.max(0, targetStock - retailStock)
        suggestedTransfer     = Math.min(deficit, warehouseStock)
        suggestedReorder      = Math.max(0, deficit - suggestedTransfer)

        // Also honour explicit reorderPoint: if total company stock <= reorderPoint, always reorder
        if (product.reorderPoint != null && totalStock <= product.reorderPoint) {
          const rp_deficit    = Math.max(0, (product.minStockTarget ?? targetStock) - retailStock)
          suggestedTransfer   = Math.min(rp_deficit, warehouseStock)
          suggestedReorder    = Math.max(suggestedReorder, rp_deficit - suggestedTransfer)
        }
      }

      // Urgency
      let urgency
      if (isMonitorOnly) {
        urgency = 'monitor'
      } else if (avgDailySales < 0.033) {
        // Less than 1 sale per month — insufficient data
        urgency = (retailStock === 0 && product.coreProduct) ? 'warning' : 'monitor'
      } else if (daysUntilStockout <= leadTime) {
        urgency = 'critical'
      } else if (daysUntilStockout <= 7) {
        urgency = 'warning'
      } else {
        urgency = 'healthy'
      }

      // Action
      let action = 'ok'
      if (urgency === 'monitor') {
        action = 'monitor'
      } else if (suggestedTransfer > 0) {
        action = 'transfer'
      } else if (suggestedReorder > 0) {
        action = 'reorder'
      }

      // Include only rows that need attention
      const needsAttention = urgency === 'critical' || urgency === 'warning' ||
                             suggestedTransfer > 0 || suggestedReorder > 0 ||
                             (product.coreProduct && retailStock === 0)
      const includeMonitor = urgency === 'monitor' && (retailStock <= 2 || product.coreProduct)

      if (!needsAttention && !includeMonitor) continue

      rows.push({
        product,
        location: loc,
        retailStock,
        warehouseStock,
        totalStock,
        sold7d:  v.sold7,
        sold14d: v.sold14,
        sold30d: v.sold30,
        avgDailySales,
        daysUntilStockout,
        targetStock,
        suggestedTransfer,
        suggestedReorder,
        urgency,
        action,
        supplier:       product.supplierName || '',
        leadTime,
        reorderPoint:   product.reorderPoint   ?? null,
        minStockTarget: product.minStockTarget  ?? null,
        coreProduct:    product.coreProduct     ?? false,
        reorderStatus:  rs,
      })
    }
  }

  // Sort: critical → warning → monitor → healthy, then by daysUntilStockout asc
  rows.sort((a, b) => {
    const ud = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
    if (ud !== 0) return ud
    const da = isFinite(a.daysUntilStockout) ? a.daysUntilStockout : 999
    const db = isFinite(b.daysUntilStockout) ? b.daysUntilStockout : 999
    return da - db
  })

  return rows
}

/** Summary counts from a forecast result */
export function forecastSummary(rows) {
  return {
    critical:         rows.filter(r => r.urgency === 'critical').length,
    warning:          rows.filter(r => r.urgency === 'warning').length,
    transferNeeded:   rows.filter(r => r.action  === 'transfer').length,
    reorderNeeded:    rows.filter(r => r.action  === 'reorder').length,
    monitor:          rows.filter(r => r.urgency === 'monitor').length,
  }
}
