/**
 * lockLogStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage functions for the station lock/unlock audit log.
 * Frontend-only operational state — no backend sync currently needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_LOCK_LOG } from './storageKeys'

const MAX_ENTRIES = 200   // cap to avoid unbounded growth

/**
 * Load the lock log array.
 *
 * @returns {object[]}
 */
export function loadLockLog() {
  try {
    return JSON.parse(localStorage.getItem(KEY_LOCK_LOG) || '[]')
  } catch {
    return []
  }
}

/**
 * Overwrite the full lock log.
 *
 * @param {object[]} log
 */
export function saveLockLog(log) {
  try {
    localStorage.setItem(KEY_LOCK_LOG, JSON.stringify(log))
  } catch {}
}

/**
 * Append a single entry to the log, capped at MAX_ENTRIES.
 *
 * @param {object} entry
 */
export function appendLockEntry(entry) {
  try {
    const log = loadLockLog()
    log.push(entry)
    saveLockLog(log.slice(-MAX_ENTRIES))
  } catch {}
}

/**
 * Find and update the most recent unresolved lock entry (sets unlockedAt/By).
 *
 * @param {string} unlockedAt   - ISO timestamp
 * @param {string} unlockedBy   - employee name
 */
export function resolveLastLockEntry(unlockedAt, unlockedBy) {
  try {
    const log  = loadLockLog()
    const last = log.findLast ? log.findLast(e => !e.unlockedAt)
      : [...log].reverse().find(e => !e.unlockedAt)
    if (last) {
      last.unlockedAt = unlockedAt
      last.unlockedBy = unlockedBy
    }
    saveLockLog(log)
  } catch {}
}
