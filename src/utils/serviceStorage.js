/**
 * serviceStorage.js — Fluxe Service Mode
 *
 * Stores the service catalog (treatments, procedures, etc.) and
 * service staff (providers / technicians).
 *
 * Appointments are handled by the existing appointmentsStorage.js —
 * do NOT duplicate that logic here.
 */

// ── Key constants ─────────────────────────────────────────────────────────────
const SERVICES_KEY = 'fluxe-services-v1'
const STAFF_KEY    = 'fluxe-service-staff-v1'

// ── Helpers ───────────────────────────────────────────────────────────────────
function genId(prefix) {
  return prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
}

// ── Service Catalog ───────────────────────────────────────────────────────────
// Shape: { id, name, category, duration (min), price, description, status }

export function loadServices() {
  try { return JSON.parse(localStorage.getItem(SERVICES_KEY)) || [] } catch { return [] }
}

export function saveServices(list) {
  localStorage.setItem(SERVICES_KEY, JSON.stringify(list))
}

export function upsertService(service) {
  const list = loadServices()
  const isNew = !service.id
  const entry = isNew
    ? { ...service, id: genId('svc'), createdAt: new Date().toISOString(), status: service.status || 'active' }
    : { ...service, updatedAt: new Date().toISOString() }
  const idx = list.findIndex(s => s.id === entry.id)
  const updated = idx >= 0 ? list.map((s, i) => i === idx ? entry : s) : [...list, entry]
  saveServices(updated)
  return updated
}

export function deleteService(id) {
  const updated = loadServices().filter(s => s.id !== id)
  saveServices(updated)
  return updated
}

// ── Service Staff / Providers ─────────────────────────────────────────────────
// Shape: { id, name, role, specialties (array), phone, status }

export function loadServiceStaff() {
  try { return JSON.parse(localStorage.getItem(STAFF_KEY)) || [] } catch { return [] }
}

export function saveServiceStaff(list) {
  localStorage.setItem(STAFF_KEY, JSON.stringify(list))
}

export function upsertServiceStaff(member) {
  const list = loadServiceStaff()
  const isNew = !member.id
  const entry = isNew
    ? { ...member, id: genId('staff'), createdAt: new Date().toISOString(), status: member.status || 'active' }
    : { ...member, updatedAt: new Date().toISOString() }
  const idx = list.findIndex(m => m.id === entry.id)
  const updated = idx >= 0 ? list.map((m, i) => i === idx ? entry : m) : [...list, entry]
  saveServiceStaff(updated)
  return updated
}

export function deleteServiceStaff(id) {
  const updated = loadServiceStaff().filter(m => m.id !== id)
  saveServiceStaff(updated)
  return updated
}
