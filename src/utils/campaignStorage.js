const KEY        = 'fluxe-campaigns-v1'
const KEY_LEGACY = 'fluxe_campaigns'

// Migrate legacy underscore key on first load
;(function migrateLegacyCampaigns() {
  const legacy = localStorage.getItem(KEY_LEGACY)
  if (!legacy) return
  if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, legacy)
  localStorage.removeItem(KEY_LEGACY)
})()

export function loadCampaigns() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function saveCampaign(entry) {
  const list = loadCampaigns()
  list.unshift(entry)
  if (list.length > 200) list.length = 200
  localStorage.setItem(KEY, JSON.stringify(list))
  return entry
}

export function deleteCampaign(id) {
  const list = loadCampaigns().filter(c => c.id !== id)
  localStorage.setItem(KEY, JSON.stringify(list))
}

export function updateCampaign(id, patch) {
  const list = loadCampaigns().map(c => c.id === id ? { ...c, ...patch } : c)
  localStorage.setItem(KEY, JSON.stringify(list))
}
