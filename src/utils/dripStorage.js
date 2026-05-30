const RULES_KEY = 'fluxe_drip_rules'
const LOG_KEY   = 'fluxe_drip_log'

export function loadDripRules() {
  try { return JSON.parse(localStorage.getItem(RULES_KEY) || '[]') } catch { return [] }
}

export function saveDripRule(rule) {
  const list = loadDripRules()
  const idx  = list.findIndex(r => r.id === rule.id)
  if (idx >= 0) list[idx] = rule
  else list.push(rule)
  localStorage.setItem(RULES_KEY, JSON.stringify(list))
}

export function deleteDripRule(id) {
  const list = loadDripRules().filter(r => r.id !== id)
  localStorage.setItem(RULES_KEY, JSON.stringify(list))
}

export function loadDripLog() {
  try { return JSON.parse(localStorage.getItem(LOG_KEY) || '[]') } catch { return [] }
}

export function appendDripLog(entries) {
  const list = loadDripLog()
  const next = [...entries, ...list]
  if (next.length > 1000) next.length = 1000
  localStorage.setItem(LOG_KEY, JSON.stringify(next))
}

export function clearDripLog() {
  localStorage.setItem(LOG_KEY, '[]')
}
