/**
 * supabaseOrgSettings.js
 * Fetches the org_settings row from Supabase and applies it to the live
 * branding bindings so all modules pick up the tenant config on boot.
 */

import { isSupabaseConfigured } from './supabaseRead'
import { getAccessToken }       from './supabaseSession'
import { applyOrgSettings }     from '../config/branding'

import { getClientConfig } from './clientConfig'
function _url() { return getClientConfig().supabaseUrl }
function _key() { return getClientConfig().supabaseAnonKey }

function authBearer() {
  const token = getAccessToken()
  return token ? `Bearer ${token}` : `Bearer ${_key()}`
}

async function sbGet(path) {
  const res = await fetch(`${_url()}/rest/v1/${path}`, {
    headers: {
      apikey:        _key(),
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
  const res = await fetch(`${_url()}/rest/v1/${path}`, {
    method: 'PATCH',
    headers: {
      apikey:          _key(),
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

const DEMO_ORG_SETTINGS = {
  business_name:     'Fluxe Demo Store',
  business_short:    'FLUXE DEMO',
  industry:          'retail',
  tax_rate:          8.5,
  currency_symbol:   '$',
  locations:         [{ id: 'loc_demo', name: 'Fluxe Demo Store', address: 'Las Vegas, NV', region: 'demo', business_type: 'retail', location_type: 'retail' }],
  receipt_footer:    'Thank you for shopping with us!',
  receipt_legal:     'This receipt confirms your purchase.',
  crm_sms_signature: '— Fluxe Demo',
}

/**
 * Fetch org settings from Supabase and apply to the branding live bindings.
 * Returns the settings object, or null if Supabase is not configured / offline.
 */
export async function fetchOrgSettings() {
  // Demo mode: use isolated branding, never touch production Supabase org settings
  if (localStorage.getItem('fluxe-demo-mode') === '1') {
    applyOrgSettings(DEMO_ORG_SETTINGS)
    return DEMO_ORG_SETTINGS
  }
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
  const orgId = getClientConfig().orgId
  const rows = await sbPatch(
    `org_settings?organization_id=eq.${orgId}`,
    { ...partial, updated_at: new Date().toISOString() },
  )
  if (rows?.length) applyOrgSettings(rows[0])
  return rows?.[0] ?? null
}

/**
 * Create or replace org_settings for a new client (INSERT ... ON CONFLICT UPDATE).
 * Used by OrgOnboardingScreen on first-time setup.
 */
export async function upsertOrgSettings(data) {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured')
  const orgId = getClientConfig().orgId
  const res = await fetch(`${_url()}/rest/v1/org_settings`, {
    method: 'POST',
    headers: {
      apikey:          _key(),
      Authorization:   authBearer(),
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ organization_id: orgId, ...data, updated_at: new Date().toISOString() }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`upsertOrgSettings ${res.status}: ${text}`)
  }
  const rows = await res.json()
  if (rows?.length) applyOrgSettings(rows[0])
  return rows?.[0] ?? null
}
