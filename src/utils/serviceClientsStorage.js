/**
 * serviceClientsStorage.js — Fluxe Service Mode
 *
 * Clients for service businesses (beauty, wellness, etc.).
 * Intentionally separate from retail CRM (crmStorage.js) to keep the
 * two modes completely isolated.
 *
 * Shape: { id, name, phone, instagram, notes, createdAt, updatedAt }
 */

const KEY = 'fluxe-service-clients-v1'

function genId() {
  return 'sc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
}

export function loadServiceClients() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}

export function saveServiceClients(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function upsertServiceClient(client) {
  const list = loadServiceClients()
  const isNew = !client.id
  const entry = isNew
    ? { ...client, id: genId(), createdAt: new Date().toISOString() }
    : { ...client, updatedAt: new Date().toISOString() }
  const idx = list.findIndex(c => c.id === entry.id)
  const updated = idx >= 0 ? list.map((c, i) => i === idx ? entry : c) : [...list, entry]
  saveServiceClients(updated)
  return updated
}

export function deleteServiceClient(id) {
  const updated = loadServiceClients().filter(c => c.id !== id)
  saveServiceClients(updated)
  return updated
}
