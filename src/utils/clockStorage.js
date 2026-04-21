/**
 * clockStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage functions for employee clock-in/clock-out records.
 * Used by: ClockInOut component, UserReport component.
 *
 * Supabase migration point: replace localStorage calls with Supabase calls.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_CLOCK_RECORDS } from './storageKeys'

/**
 * Load all clock records.
 *
 * @returns {object[]}
 */
export function loadClockRecords() {
  try {
    const raw = localStorage.getItem(KEY_CLOCK_RECORDS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Persist the full clock records array.
 *
 * @param {object[]} records
 */
export function saveClockRecords(records) {
  localStorage.setItem(KEY_CLOCK_RECORDS, JSON.stringify(records))
}
