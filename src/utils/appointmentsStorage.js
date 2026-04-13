const KEY = 'fluxe-appointments-v1'

export function loadAppointments() {
  try { return JSON.parse(localStorage.getItem(KEY)) || [] } catch { return [] }
}
export function saveAppointments(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
}
export function getCustomerAppointments(customerId) {
  return loadAppointments().filter(a => a.customerId === customerId)
}
export function upsertAppointment(appt) {
  const list = loadAppointments()
  const isNew = !appt.id
  const entry = isNew
    ? { ...appt, id: 'appt_' + Date.now(), createdAt: new Date().toISOString() }
    : appt
  const idx = list.findIndex(a => a.id === entry.id)
  const updated = idx >= 0
    ? list.map((a, i) => i === idx ? entry : a)
    : [...list, entry]
  saveAppointments(updated)
  return updated
}
export function deleteAppointment(id) {
  const updated = loadAppointments().filter(a => a.id !== id)
  saveAppointments(updated)
  return updated
}
