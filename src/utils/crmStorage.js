/**
 * Single source of truth for CRM localStorage.
 * All modules that read/write CRM customers must use this key and these helpers.
 */
export const CRM_KEY       = 'fluxe-crm-v1'
const LEGACY_CRM_KEY = 'perfume-passage-crm-v1'

/**
 * One-time migration: if data exists under the old key, move it to the new key
 * and remove the old entry. Safe to call on every load — exits immediately if
 * the legacy key is absent.
 */
function migrateLegacyKey() {
  try {
    const legacy = localStorage.getItem(LEGACY_CRM_KEY)
    if (!legacy) return
    // Only migrate if new key is empty — never overwrite existing new-key data
    const current = localStorage.getItem(CRM_KEY)
    if (!current) {
      localStorage.setItem(CRM_KEY, legacy)
    }
    localStorage.removeItem(LEGACY_CRM_KEY)
  } catch {
    // Migration failure is non-fatal — data stays under legacy key for next attempt
  }
}

export function loadCRM() {
  migrateLegacyKey()
  try {
    const raw = localStorage.getItem(CRM_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCRM(list) {
  try {
    localStorage.setItem(CRM_KEY, JSON.stringify(list))
  } catch (e) {
    console.warn('[CRM] Failed to persist to localStorage:', e)
  }
}
