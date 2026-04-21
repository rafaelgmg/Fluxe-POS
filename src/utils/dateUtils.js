/**
 * dateUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for date-key logic across the Fluxe POS.
 *
 * WHY local timezone?
 *   new Date().toISOString() returns UTC. In Las Vegas (UTC-7/8) a sale at
 *   11:30 PM would be stored as the NEXT UTC day, placing it in the wrong
 *   business-day bucket for commission, bonus and ranking calculations.
 *   All day-key logic must use the device's local wall-clock date.
 *
 * Rule:
 *   Use localDateKey() for any "which business day does this belong to?" logic.
 *   Use new Date().toISOString() for absolute timestamps (createdAt, updatedAt).
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Returns "YYYY-MM-DD" using the LOCAL calendar date of the given moment.
 *
 * @param {Date|string|number} [ts=new Date()] — anything new Date() accepts,
 *   or a Date object. Defaults to right now.
 * @returns {string} e.g. "2025-04-16"
 */
export function localDateKey(ts = new Date()) {
  const d = ts instanceof Date ? ts : new Date(ts)
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
