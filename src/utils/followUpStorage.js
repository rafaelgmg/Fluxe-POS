/**
 * followUpStorage.js — Fluxe Service Mode
 *
 * Stores the "contacted" flag per client.
 * Shape: { [clientId]: { contactedAt: ISO, note: string } }
 */

const KEY = 'fluxe-followup-contacts-v1'

export function loadContactedRecords() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} }
}

export function markAsContacted(clientId, note = '') {
  const records = loadContactedRecords()
  records[clientId] = { contactedAt: new Date().toISOString(), note }
  localStorage.setItem(KEY, JSON.stringify(records))
  return records
}

export function clearContacted(clientId) {
  const records = loadContactedRecords()
  delete records[clientId]
  localStorage.setItem(KEY, JSON.stringify(records))
  return records
}
