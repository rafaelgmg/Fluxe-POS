/**
 * Single source of truth for CRM localStorage.
 * All modules that read/write CRM customers must use this key and these helpers.
 */
export const CRM_KEY = 'perfume-passage-crm-v1'

export function loadCRM() {
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
