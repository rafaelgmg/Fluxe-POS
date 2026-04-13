/**
 * bonusStorage.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Persistence for daily bonus rules and manual bonus adjustments.
 *
 * ── Bonus Rules (admin-configured, per date + location) ──────────────────────
 * Key: 'fluxe-bonus-rules-v1'
 * Shape: [{ id, date, location, tiers: [{ threshold, bonusAmount }] }]
 *
 * ── Manual Adjustments (per employee + date) ──────────────────────────────────
 * Key: 'fluxe-bonus-manual-v1'
 * Shape: [{ id, employee, date, adjustment, note }]
 * ────────────────────────────────────────────────────────────────────────────
 */

const RULES_KEY  = 'fluxe-bonus-rules-v1'
const MANUAL_KEY = 'fluxe-bonus-manual-v1'

// ── Bonus Rules ───────────────────────────────────────────────────────────────

export function loadBonusRules() {
  try {
    const raw = localStorage.getItem(RULES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveBonusRules(rules) {
  try { localStorage.setItem(RULES_KEY, JSON.stringify(rules)) } catch {}
}

export function nextRuleId(rules) {
  return rules.length > 0 ? Math.max(...rules.map(r => r.id)) + 1 : 1
}

/**
 * Find the bonus rule for a given date + location.
 * Returns the rule object or null if not configured.
 */
export function findBonusRule(date, location) {
  const rules = loadBonusRules()
  return rules.find(r => r.date === date && r.location === location) || null
}

// ── Manual Adjustments ────────────────────────────────────────────────────────

export function loadManualBonuses() {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveManualBonuses(list) {
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(list)) } catch {}
}

/**
 * Get manual adjustment for a specific employee + date.
 * Returns { adjustment: number, note: string } or { adjustment: 0, note: '' }.
 */
export function getManualBonus(employee, date) {
  const list = loadManualBonuses()
  const match = list.find(m => m.employee === employee && m.date === date)
  return match
    ? { adjustment: match.adjustment ?? 0, note: match.note ?? '' }
    : { adjustment: 0, note: '' }
}

/**
 * Upsert a manual bonus for employee + date.
 * Pass adjustment=0 and note='' to effectively clear it (entry is kept for audit).
 */
export function setManualBonus(employee, date, adjustment, note = '') {
  const list = loadManualBonuses()
  const idx  = list.findIndex(m => m.employee === employee && m.date === date)
  const entry = {
    id:         idx >= 0 ? list[idx].id : (list.length > 0 ? Math.max(...list.map(m => m.id)) + 1 : 1),
    employee,
    date,
    adjustment: parseFloat(adjustment) || 0,
    note:       String(note).trim(),
    updatedAt:  new Date().toISOString(),
  }
  if (idx >= 0) list[idx] = entry
  else list.push(entry)
  saveManualBonuses(list)
  return entry
}
