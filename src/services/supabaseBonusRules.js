/**
 * supabaseBonusRules.js — CRUD assíncrono para bonus_rules no Supabase.
 * Mantém localStorage como cache local; findBonusRule() (sync) continua funcionando.
 */

import { getOrgId, isSupabaseConfigured } from './supabaseRead'
import { getAccessToken }                  from './supabaseSession'
import { saveBonusRules }                  from '../utils/bonusStorage'

import { getClientConfig } from './clientConfig'
function _url() { return getClientConfig().supabaseUrl }
function _key() { return getClientConfig().supabaseAnonKey }

function authBearer() { return getAccessToken() || _key() }

function baseHeaders() {
  return {
    apikey:         _key(),
    Authorization:  `Bearer ${authBearer()}`,
    'Content-Type': 'application/json',
  }
}

async function sbGet(path) {
  const res = await fetch(`${_url()}/rest/v1${path}`, { headers: baseHeaders() })
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`GET ${path} ${res.status}: ${b}`) }
  return res.json()
}

async function sbPost(path, body) {
  const res = await fetch(`${_url()}/rest/v1${path}`, {
    method: 'POST', headers: { ...baseHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`POST ${path} ${res.status}: ${b}`) }
  return res.json()
}

async function sbPatch(path, body) {
  const res = await fetch(`${_url()}/rest/v1${path}`, {
    method: 'PATCH', headers: { ...baseHeaders(), Prefer: 'return=representation' }, body: JSON.stringify(body),
  })
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`PATCH ${path} ${res.status}: ${b}`) }
  return res.json()
}

async function sbDelete(path) {
  const res = await fetch(`${_url()}/rest/v1${path}`, { method: 'DELETE', headers: baseHeaders() })
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`DELETE ${path} ${res.status}: ${b}`) }
}

function fromRow(row) {
  return { id: row.id, date: row.date, location: row.location, tiers: row.tiers || [] }
}

/**
 * Busca todas as regras do Supabase e sincroniza o localStorage.
 * Retorna null se Supabase indisponível (caller usa cache local).
 */
export async function fetchBonusRules() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbGet(`/bonus_rules?organization_id=eq.${orgId}&order=date.desc`)
    const rules = rows.map(fromRow)
    saveBonusRules(rules)
    return rules
  } catch (err) {
    console.warn('[Fluxe] fetchBonusRules failed:', err.message)
    return null
  }
}

/**
 * Cria uma nova regra. Retorna a regra criada (com UUID) ou null em caso de erro.
 */
export async function createBonusRule({ date, location, tiers }) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbPost('/bonus_rules', { organization_id: orgId, date, location, tiers })
    return fromRow(rows[0])
  } catch (err) {
    console.warn('[Fluxe] createBonusRule failed:', err.message)
    return null
  }
}

/**
 * Atualiza uma regra existente pelo id (UUID). Retorna a regra atualizada ou null.
 */
export async function updateBonusRule({ id, date, location, tiers }) {
  if (!isSupabaseConfigured()) return null
  try {
    const rows = await sbPatch(
      `/bonus_rules?id=eq.${id}`,
      { date, location, tiers, updated_at: new Date().toISOString() },
    )
    return fromRow(rows[0])
  } catch (err) {
    console.warn('[Fluxe] updateBonusRule failed:', err.message)
    return null
  }
}

/**
 * Remove uma regra pelo id (UUID). Retorna true em sucesso, false em erro.
 */
export async function deleteBonusRule(id) {
  if (!isSupabaseConfigured()) return false
  try {
    await sbDelete(`/bonus_rules?id=eq.${id}`)
    return true
  } catch (err) {
    console.warn('[Fluxe] deleteBonusRule failed:', err.message)
    return false
  }
}
