/**
 * competitionBonusEngine.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Competition placement bonus calculator.
 *
 * Each location can configure up to three independent bonus groups:
 *  - Sales  (based on daily subtotal ranking)
 *  - Spare  (based on daily spare generated ranking)
 *  - Hybrid (based on daily subtotal + spare × multiplier ranking)
 *
 * Each group: { enabled, top1, top2, top3, minimumToQualify }
 *
 * minimumToQualify filters who enters the ranked pool BEFORE ranking.
 * Employees below the minimum are excluded entirely — not placed 4th,
 * simply not eligible for that group's bonus.
 *
 * competitionBonusCombinationMode:
 *  'sum_all'      → employee earns bonuses from ALL enabled groups
 *  'highest_only' → employee earns only the HIGHEST single bonus earned
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *  const result = calcDayCompetitionBonus(empName, dateKey, location, salesForDay)
 *  // result.totalCompBonus — amount to add to final daily pay
 *  // result.salesRank / spareRank / hybridRank — position for display
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

import { loadLocationConfig } from './locationConfig'
import { sumItemSpare } from './spareUtils'

const ZERO = {
  salesBonus:     0, spareBonus:  0, hybridBonus: 0,
  totalCompBonus: 0,
  salesRank:      null, spareRank: null, hybridRank: null,
  salesValue:     0, spareValue: 0, hybridValue: 0,
}

/**
 * Calculate competition placement bonus for an employee on a single day.
 *
 * @param {string}   empName          - employee name
 * @param {string}   dateKey          - 'YYYY-MM-DD'
 * @param {string}   location         - location name
 * @param {object[]} allSalesForDay   - ALL non-deleted sales at this location on this day
 * @param {number}   hybridMultiplier - score = sales + spare × multiplier (default 1.0)
 * @returns {{
 *   salesBonus:     number,
 *   spareBonus:     number,
 *   hybridBonus:    number,
 *   totalCompBonus: number,
 *   salesRank:      number|null,
 *   spareRank:      number|null,
 *   hybridRank:     number|null,
 *   salesValue:     number,   — employee's daily subtotal
 *   spareValue:     number,   — employee's daily spare
 *   hybridValue:    number,   — employee's hybrid score
 * }}
 */
/**
 * @param {string}   empName
 * @param {string}   dateKey
 * @param {string}   location
 * @param {object[]} allSalesForDay
 * @param {number}   [hybridMultiplier=1.0]
 * @param {object}   [opts]
 * @param {object}   [opts.locationCfg] - pre-loaded location config object.
 *   If omitted, falls back to loadLocationConfig(location) from storage.
 *   Pass this when calling from backend context to avoid storage reads.
 */
export function calcDayCompetitionBonus(
  empName,
  dateKey,
  location,
  allSalesForDay,
  hybridMultiplier = 1.0,
  { locationCfg } = {},
) {
  const cfg = locationCfg ?? loadLocationConfig(location)
  if (!cfg) return { ...ZERO }

  const bonusSalesCfg  = cfg.competitionBonusSales  || {}
  const bonusSpareCfg  = cfg.competitionBonusSpare  || {}
  const bonusHybridCfg = cfg.competitionBonusHybrid || {}
  const combMode       = cfg.competitionBonusCombinationMode || 'sum_all'

  // ── Build per-employee totals for the day ──────────────────────────────────
  const empTotals = {} // { empName: { subtotal, spare } }
  for (const sale of allSalesForDay) {
    const emp = sale.employee
    if (!emp) continue
    if (!empTotals[emp]) empTotals[emp] = { subtotal: 0, spare: 0 }
    empTotals[emp].subtotal += sale.subtotal || 0
    empTotals[emp].spare    += sumItemSpare(sale.items)
  }

  const myTotals = empTotals[empName] || { subtotal: 0, spare: 0 }

  // ── Calculate rank + bonus for one group ──────────────────────────────────
  function calcGroup(groupCfg, getValue) {
    if (!groupCfg.enabled) return { bonus: 0, rank: null }
    const min = Number(groupCfg.minimumToQualify || 0)

    // Only employees at or above the minimum qualify
    const qualified = Object.entries(empTotals)
      .filter(([, v]) => getValue(v) >= min)
      .sort(([, a], [, b]) => getValue(b) - getValue(a))

    const idx = qualified.findIndex(([name]) => name === empName)
    if (idx === -1) return { bonus: 0, rank: null } // not in pool

    const rank  = idx + 1 // 1-indexed
    const bonus =
      rank === 1 ? Number(groupCfg.top1 || 0) :
      rank === 2 ? Number(groupCfg.top2 || 0) :
      rank === 3 ? Number(groupCfg.top3 || 0) : 0

    return { bonus, rank }
  }

  const salesResult  = calcGroup(bonusSalesCfg,  v => v.subtotal)
  const spareResult  = calcGroup(bonusSpareCfg,  v => v.spare)
  const hybridResult = calcGroup(bonusHybridCfg, v => v.subtotal + v.spare * hybridMultiplier)

  const bonuses      = [salesResult.bonus, spareResult.bonus, hybridResult.bonus]
  const totalCompBonus = combMode === 'highest_only'
    ? Math.max(...bonuses)
    : bonuses.reduce((s, b) => s + b, 0)

  return {
    salesBonus:     Math.round(salesResult.bonus  * 100) / 100,
    spareBonus:     Math.round(spareResult.bonus  * 100) / 100,
    hybridBonus:    Math.round(hybridResult.bonus * 100) / 100,
    totalCompBonus: Math.round(totalCompBonus     * 100) / 100,
    salesRank:      salesResult.rank,
    spareRank:      spareResult.rank,
    hybridRank:     hybridResult.rank,
    salesValue:     Math.round(myTotals.subtotal * 100) / 100,
    spareValue:     Math.round(myTotals.spare    * 100) / 100,
    hybridValue:    Math.round(
      (myTotals.subtotal + myTotals.spare * hybridMultiplier) * 100
    ) / 100,
  }
}

/**
 * Check if any competition bonus group is enabled for a location.
 * Used to conditionally show bonus columns in reports.
 *
 * @param {string} locationName
 * @param {object} [opts]
 * @param {object} [opts.locationCfg] - pre-loaded location config (see calcDayCompetitionBonus)
 * @returns {boolean}
 */
export function hasCompetitionBonusConfigured(locationName, { locationCfg } = {}) {
  const cfg = locationCfg ?? loadLocationConfig(locationName)
  if (!cfg) return false
  return !!(
    cfg.competitionBonusSales?.enabled ||
    cfg.competitionBonusSpare?.enabled ||
    cfg.competitionBonusHybrid?.enabled
  )
}
