/**
 * inventoryHistoryStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Storage functions for the inventory adjustment history log.
 * Used by: InventoryAdmin component.
 *
 * Supabase migration point: replace localStorage calls here.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_INV_HISTORY } from './storageKeys'

/**
 * Load all inventory history entries.
 *
 * @returns {object[]}
 */
export function loadInventoryHistory() {
  try {
    const raw = localStorage.getItem(KEY_INV_HISTORY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Persist the full inventory history array.
 *
 * @param {object[]} history
 */
export function saveInventoryHistory(history) {
  localStorage.setItem(KEY_INV_HISTORY, JSON.stringify(history))
}
