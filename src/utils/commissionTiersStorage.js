/**
 * commissionTiersStorage.js
 * Persistence layer for daily commission tiers and spare rate.
 * Keys:
 *   'fluxe-commission-tiers-v1'    — tier thresholds/rates
 *   'fluxe-commission-spare-rate'  — NC spare rate (default 30%)
 *
 * Each tier: { id, threshold (number), rate (number, stored as % e.g. 20) }
 * Tiers are sorted by threshold descending at read time.
 *
 * Default tiers (used if nothing is saved):
 *   threshold  600 → rate 20%
 *   threshold 1000 → rate 25%
 *   threshold 1500 → rate 30%
 */

const KEY       = 'fluxe-commission-tiers-v1'
const SPARE_KEY = 'fluxe-commission-spare-rate'

export const DEFAULT_SPARE_RATE = 30  // stored as % (e.g. 30 = 30%)

/** Load spare rate for NC categories. Returns value as % (e.g. 30). */
export function loadSpareRate() {
  try {
    const raw = localStorage.getItem(SPARE_KEY)
    if (raw !== null) {
      const val = parseFloat(raw)
      if (!isNaN(val) && val >= 0 && val <= 100) return val
    }
  } catch {}
  return DEFAULT_SPARE_RATE
}

/** Persist spare rate (stored as %, e.g. 30). */
export function saveSpareRate(rate) {
  try {
    localStorage.setItem(SPARE_KEY, String(rate))
  } catch {}
}

export const DEFAULT_TIERS = [
  { id: 1, threshold: 600,  rate: 20 },
  { id: 2, threshold: 1000, rate: 25 },
  { id: 3, threshold: 1500, rate: 30 },
]

/** Load tiers sorted highest threshold first. Falls back to defaults. */
export function loadCommissionTiers() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return [...parsed].sort((a, b) => b.threshold - a.threshold)
      }
    }
  } catch {}
  return [...DEFAULT_TIERS].sort((a, b) => b.threshold - a.threshold)
}

/** Persist tiers array. */
export function saveCommissionTiers(tiers) {
  try {
    localStorage.setItem(KEY, JSON.stringify(tiers))
  } catch {}
}

/** Next safe id. */
export function nextTierId(tiers) {
  return tiers.length > 0 ? Math.max(...tiers.map(t => t.id)) + 1 : 1
}

/**
 * Given a day's subtotal, return the applicable rate (decimal, e.g. 0.20).
 * Returns 0 if no tier threshold is met.
 */
export function getRateForSubtotal(daySubtotal, tiers) {
  // tiers already sorted highest-first
  const match = tiers.find(t => daySubtotal >= t.threshold)
  return match ? match.rate / 100 : 0
}
