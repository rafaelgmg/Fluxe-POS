/**
 * frozenSalesStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage functions for in-progress (frozen / held) sales.
 * Frozen sales are frontend-only operational state — no backend sync needed.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_FROZEN_SALES } from './storageKeys'

/**
 * Load all frozen sales from storage.
 *
 * @returns {object[]}
 */
export function loadFrozenSales() {
  try {
    return JSON.parse(localStorage.getItem(KEY_FROZEN_SALES) || '[]')
  } catch {
    return []
  }
}

/**
 * Persist the full frozen sales array.
 *
 * @param {object[]} sales
 */
export function saveFrozenSales(sales) {
  try {
    localStorage.setItem(KEY_FROZEN_SALES, JSON.stringify(sales))
  } catch {}
}
