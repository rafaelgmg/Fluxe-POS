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
import { writeCheckoutCache, CHECKOUT_CACHE_ERROR } from './checkoutCache'

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
  return writeCheckoutCache(localStorage, KEY_INV_HISTORY, history, (error) => {
    console.warn('[Fluxe] Local inventory history could not be saved.',
      { errorType: error?.name || 'UnknownError', recordCount: history.length })
    window.dispatchEvent(new Event(CHECKOUT_CACHE_ERROR))
  })
}
