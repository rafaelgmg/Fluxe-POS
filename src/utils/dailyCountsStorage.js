import { KEY_DAILY_COUNTS } from './storageKeys'

const SEQ_KEY = 'fluxe-daily-counts-seq'

function nextSeq() {
  const n = parseInt(localStorage.getItem(SEQ_KEY) || '0') + 1
  localStorage.setItem(SEQ_KEY, String(n))
  return n
}

export function formatCountNumber(n) {
  return `DC-${String(n).padStart(4, '0')}`
}

export function loadDailyCounts() {
  try { return JSON.parse(localStorage.getItem(KEY_DAILY_COUNTS) || '[]') } catch { return [] }
}

function persist(counts) {
  localStorage.setItem(KEY_DAILY_COUNTS, JSON.stringify(counts))
}

export function addDailyCount(entry) {
  const seq = nextSeq()
  const full = { ...entry, seq, countNumber: formatCountNumber(seq) }
  const counts = loadDailyCounts()
  counts.unshift(full)
  if (counts.length > 1000) counts.length = 1000
  persist(counts)
  return full
}

export function getDailyCount(id) {
  return loadDailyCounts().find(c => c.id === id) || null
}

export function updateDailyCount(id, patch) {
  const counts = loadDailyCounts()
  const idx = counts.findIndex(c => c.id === id)
  if (idx < 0) return null
  counts[idx] = { ...counts[idx], ...patch }
  persist(counts)
  return counts[idx]
}

export function updateDailyCountItem(countId, productId, patch) {
  const counts = loadDailyCounts()
  const idx = counts.findIndex(c => c.id === countId)
  if (idx < 0) return null
  const items = counts[idx].items.map(it =>
    it.productId === productId ? { ...it, ...patch } : it
  )
  counts[idx] = { ...counts[idx], items }
  persist(counts)
  return counts[idx]
}

// Derive overall status from items after partial apply
export function deriveCountStatus(count) {
  const { items } = count
  if (!items?.length) return 'ok'
  const hasDiff     = items.some(it => it.difference !== 0)
  const allApplied  = items.every(it => it.difference === 0 || it.itemStatus === 'applied')
  const someApplied = items.some(it => it.itemStatus === 'applied')
  if (count.status === 'rejected') return 'rejected'
  if (allApplied)  return 'applied'
  if (someApplied) return 'partial'
  if (hasDiff)     return 'count_error'
  return 'ok'
}
