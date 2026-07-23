/**
 * supabaseOrgSettings.js
 * Fetches the org_settings row from Supabase and applies it to the live
 * branding bindings so all modules pick up the tenant config on boot.
 */

import { isSupabaseConfigured } from './supabaseRead'
import { getAccessToken }       from './supabaseSession'
import { applyOrgSettings }     from '../config/branding'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL     || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function authBearer() {
  const token = getAccessToken()
  return token ? `Bearer ${token}` : `Bearer ${SUPABASE_KEY}`
}

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: authBearer(),
      Accept:        'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GET ${path} ${res.status}: ${text}`)
  }
  return res.json()
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   authBearer(),
      'Content-Type':  'application/json',
      Prefer:          'return=representation',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PATCH ${path} ${res.status}: ${text}`)
  }
  return res.json()
}

/**
 * Fetch org settings from Supabase and apply to the branding live bindings.
 * Returns the settings object, or null if Supabase is not configured / offline.
 */
export async function fetchOrgSettings() {
  if (!isSupabaseConfigured()) return null
  try {
    const rows = await sbGet('org_settings?select=*&limit=1')
    if (!rows?.length) return null
    const row = rows[0]
    const settings = {
      business_name:     row.business_name,
      business_short:    row.business_short,
      industry:          row.industry,
      tax_rate:          row.tax_rate,
      currency_symbol:   row.currency_symbol,
      locations:         Array.isArray(row.locations) ? row.locations : [],
      receipt_footer:    row.receipt_footer,
      receipt_legal:     row.receipt_legal,
      crm_sms_signature: row.crm_sms_signature,
    }
    applyOrgSettings(settings)
    return settings
  } catch (err) {
    console.warn('[OrgSettings] fetch failed, using branding.js defaults:', err.message)
    return null
  }
}

/**
 * Persist a partial update to org_settings in Supabase.
 * Only the fields provided are updated; others remain unchanged.
 */
export async function saveOrgSettings(partial) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured')
  const orgId = import.meta.env.VITE_SUPABASE_ORG_ID
  const rows = await sbPatch(
    `org_settings?organization_id=eq.${orgId}`,
    { ...partial, updated_at: new Date().toISOString() },
  )
  if (rows?.length) applyOrgSettings(rows[0])
  return rows?.[0] ?? null
}
