/**
 * bonusEngine.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Daily bonus calculation logic.
 *
 * ── Business rules ────────────────────────────────────────────────────────────
 *
 *  1. Admin creates bonus rules per date + location.
 *     Each rule has tiers: [{ threshold, bonusAmount }]
 *
 *  2. autoBonus = highest bonusAmount whose threshold the seller's
 *     day subtotal has reached. (Same retroactive logic as commission tiers.)
 *
 *  3. manualBonus = admin-set per-employee per-date override (can be positive
 *     or negative, e.g. deducting a bonus).
 *
 *  4. finalBonus = autoBonus + manualBonus
 *
 *  5. finalDailyPay = Math.max(hourlyPay, totalCommission) + finalBonus
 *     where hourlyPay = (hoursWorked) × (employee hourlyRate)
 *     If hourlyRate is not configured (0), hourlyPay = 0.
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

import { findBonusRule, getManualBonus } from './bonusStorage'

/**
 * Calculate the automatic bonus for a seller on a given day.
 *
 * @param {number} daySubtotal  - seller's total subtotal for the day
 * @param {string} date         - 'YYYY-MM-DD'
 * @param {string} location     - location name (e.g. 'Perfume Passage')
 * @returns {number} autoBonus in dollars
 */
export function calcAutoBonus(daySubtotal, date, location) {
  const rule = findBonusRule(date, location)
  if (!rule || !rule.tiers || rule.tiers.length === 0) return 0

  // Sort highest threshold first, pick the first one met
  const sorted = [...rule.tiers].sort((a, b) => b.threshold - a.threshold)
  const match  = sorted.find(t => daySubtotal >= t.threshold)
  return match ? match.bonusAmount : 0
}

/**
 * Get the full bonus result for a seller on a given day.
 *
 * @param {number} daySubtotal
 * @param {string} date         - 'YYYY-MM-DD'
 * @param {string} location
 * @param {string} employee     - employee full name
 * @returns {{
 *   autoBonus:    number,
 *   manualBonus:  number,
 *   manualNote:   string,
 *   finalBonus:   number,
 * }}
 */
export function getDayBonusResult(daySubtotal, date, location, employee) {
  const autoBonus  = calcAutoBonus(daySubtotal, date, location)
  const manual     = getManualBonus(employee, date)
  const finalBonus = autoBonus + (manual.adjustment ?? 0)
  return {
    autoBonus,
    manualBonus: manual.adjustment ?? 0,
    manualNote:  manual.note       ?? '',
    finalBonus,
  }
}

/**
 * Calculate the final daily pay for a seller.
 *
 * @param {number} hoursMs         - milliseconds worked that day
 * @param {number} hourlyRate      - employee's hourly rate in $
 * @param {number} totalCommission - commission earned that day
 * @param {number} finalBonus      - auto + manual bonus
 * @returns {{
 *   hourlyPay:    number,
 *   basePay:      number,   Math.max(hourlyPay, totalCommission)
 *   finalDailyPay: number,
 * }}
 */
export function calcFinalDailyPay(hoursMs, hourlyRate, totalCommission, finalBonus) {
  const hourlyPay    = (hoursMs / 3600000) * (hourlyRate || 0)
  const basePay      = Math.max(hourlyPay, totalCommission)
  const finalDailyPay = basePay + finalBonus
  return {
    hourlyPay:    Math.round(hourlyPay    * 100) / 100,
    basePay:      Math.round(basePay      * 100) / 100,
    finalDailyPay: Math.round(finalDailyPay * 100) / 100,
  }
}
