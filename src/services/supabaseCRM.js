/**
 * supabaseCRM.js — Phase 7: Supabase CRM read/write layer.
 *
 * All functions are fire-and-forget-safe (they throw on hard failure;
 * callers decide whether to swallow or propagate).
 *
 * Dedup strategy (mirrors localStorage logic):
 *   1. Find by phone_normalized (digits only) within org
 *   2. Find by lower(email) within org
 *   3. Insert new row
 *
 * On match, PATCH the existing row (never duplicates).
 */

import { getAccessToken } from './supabaseSession'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function isUUID(v) { return typeof v === 'string' && UUID_RE.test(v) }

function authBearer() { return getAccessToken() || SUPABASE_KEY }

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function headers(extra = {}) {
  return {
    apikey:         SUPABASE_KEY,
    Authorization:  `Bearer ${authBearer()}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function restGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: headers() })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`)
  return res.json()
}

async function restPost(path, body, prefer = 'return=representation') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: headers({ Prefer: prefer }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST ${path} ${res.status}: ${text}`)
  }
  return prefer === 'return=minimal' ? null : res.json()
}

async function restPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PATCH ${path} ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function fromRow(row) {
  return {
    supabaseId:           row.id,
    organizationId:       row.organization_id,
    firstName:            row.first_name           || '',
    lastName:             row.last_name            || '',
    phone:                row.phone                || '',
    phoneNormalized:      row.phone_normalized     || '',
    email:                row.email                || '',
    birthday:             row.birthday             || '',
    fragrancePreferences: Array.isArray(row.fragrance_preferences) ? row.fragrance_preferences : [],
    marketingConsent:     row.marketing_consent    ?? false,
    preferredChannel:     row.preferred_channel    || '',
    notes:                row.notes                || '',
    tags:                 Array.isArray(row.tags)  ? row.tags : [],
    crmScore:             row.crm_score            ?? 0,
    capturedByUserId:     row.captured_by_user_id  || null,
    capturedLocationId:   row.captured_location_id || null,
    capturedAt:           row.captured_at          || null,
    purchases:            Array.isArray(row.purchases) ? row.purchases : [],
    lastInteraction:      row.last_interaction     || null,
    archived:             row.archived             ?? false,
    archivedAt:           row.archived_at          || null,
    legacyLocalId:        row.legacy_local_id      || null,
    createdAt:            row.created_at           || null,
    updatedAt:            row.updated_at           || null,
    // SMS consent (Phase 1)
    smsConsentStatus:     row.sms_consent_status   || 'unknown',
    smsConsentSource:     row.sms_consent_source   || null,
    smsOptedOutAt:        row.sms_opted_out_at      || null,
  }
}

function toPayload(local, orgId, userId, locationId) {
  const phoneNorm = (local.phone || '').replace(/\D/g, '')
  const payload = {
    organization_id:       orgId,
    first_name:            (local.firstName || '').trim(),
    last_name:             (local.lastName  || '').trim(),
    phone:                 local.phone                    || '',
    phone_normalized:      phoneNorm,
    email:                 (local.email     || '').trim(),
    birthday:              local.birthday                 || '',
    fragrance_preferences: Array.isArray(local.fragrancePreferences)
      ? local.fragrancePreferences
      : (local.fragrancePreferences ? [local.fragrancePreferences] : []),
    marketing_consent:     local.marketingConsent         ?? false,
    preferred_channel:     local.preferredChannel         || '',
    notes:                 local.notes                    || '',
    tags:                  Array.isArray(local.tags)       ? local.tags : [],
    crm_score:             local.crmScore                 ?? 0,
    purchases:             Array.isArray(local.purchases) ? local.purchases : [],
    last_interaction:      local.lastInteraction          || null,
    archived:              local.archived                 ?? false,
    archived_at:           local.archivedAt               || null,
    legacy_local_id:       local.id                       || null,
  }
  if (isUUID(userId))     payload.captured_by_user_id  = userId
  if (isUUID(locationId)) payload.captured_location_id = locationId
  // Preserve the original capture timestamp so dashboard filters work correctly.
  // Without this, PostgreSQL sets captured_at = NOW() on sync, making old leads look new.
  const capturedAt = local.capturedAt || local.createdAt || null
  if (capturedAt) payload.captured_at = capturedAt
  return payload
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all customers for an org.
 * Returns array of camelCase customer objects (with supabaseId).
 */
export async function fetchCustomers(orgId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !orgId) return []
  const rows = await restGet(
    `/customers?organization_id=eq.${orgId}&order=created_at.desc&limit=2000`
  )
  return rows.map(fromRow)
}

/**
 * Write (upsert) a customer to Supabase with dedup.
 *
 * Dedup order:
 *   1. phone_normalized match within org → PATCH
 *   2. email match within org (case-insensitive) → PATCH
 *   3. No match → INSERT
 *
 * @param {object} local      — local customer object from useCRM
 * @param {string} orgId      — posSession.orgId
 * @param {string|null} userId      — currentUser.id (UUID) or null
 * @param {string|null} locationId  — posSession.locationUUID or null
 * @returns {Promise<{ supabaseId: string, isNew: boolean }>}
 */
export async function writeCustomerToSupabase(local, orgId, userId, locationId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !orgId) return null

  const phoneNorm = (local.phone || '').replace(/\D/g, '')
  const emailNorm = (local.email || '').trim().toLowerCase()

  // 1. Find by phone
  if (phoneNorm) {
    const hits = await restGet(
      `/customers?organization_id=eq.${orgId}&phone_normalized=eq.${encodeURIComponent(phoneNorm)}&limit=1`
    )
    if (hits.length > 0) {
      const rows = await patchCustomerInSupabase(hits[0].id, local, orgId)
      return { supabaseId: hits[0].id, isNew: false }
    }
  }

  // 2. Find by email
  if (emailNorm) {
    const hits = await restGet(
      `/customers?organization_id=eq.${orgId}&email=ilike.${encodeURIComponent(emailNorm)}&limit=1`
    )
    if (hits.length > 0) {
      await patchCustomerInSupabase(hits[0].id, local, orgId)
      return { supabaseId: hits[0].id, isNew: false }
    }
  }

  // 3. Insert new
  const payload = toPayload(local, orgId, userId, locationId)
  const rows    = await restPost('/customers', payload)
  const created = Array.isArray(rows) ? rows[0] : rows
  return { supabaseId: created.id, isNew: true }
}

/**
 * PATCH an existing customer row by Supabase UUID.
 * Only updates non-null / non-empty fields from `local`.
 */
export async function patchCustomerInSupabase(supabaseId, local, orgId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !supabaseId) return null

  const phoneNorm = (local.phone || '').replace(/\D/g, '')
  const patch = {
    first_name:            (local.firstName || '').trim()  || undefined,
    last_name:             (local.lastName  || '').trim()  !== undefined ? (local.lastName || '').trim() : undefined,
    phone:                 local.phone                     || undefined,
    phone_normalized:      phoneNorm                       || undefined,
    email:                 (local.email     || '').trim()  || undefined,
    birthday:              local.birthday                  || undefined,
    fragrance_preferences: Array.isArray(local.fragrancePreferences) ? local.fragrancePreferences : undefined,
    marketing_consent:     local.marketingConsent          !== undefined ? local.marketingConsent : undefined,
    notes:                 local.notes                     !== undefined ? local.notes : undefined,
    purchases:             Array.isArray(local.purchases)  ? local.purchases : undefined,
    last_interaction:      local.lastInteraction           || undefined,
    archived:              local.archived                  !== undefined ? local.archived : undefined,
    archived_at:           local.archivedAt                !== undefined ? local.archivedAt : undefined,
  }

  // Strip undefined entries so we only PATCH what changed
  Object.keys(patch).forEach(k => patch[k] === undefined && delete patch[k])
  if (Object.keys(patch).length === 0) return null

  const rows = await restPatch(`/customers?id=eq.${supabaseId}`, patch)
  return Array.isArray(rows) ? rows[0] : rows
}

/**
 * Soft-delete (archive) a customer in Supabase.
 */
export async function archiveCustomerInSupabase(supabaseId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !supabaseId) return null
  const rows = await restPatch(`/customers?id=eq.${supabaseId}`, {
    archived:    true,
    archived_at: new Date().toISOString(),
  })
  return Array.isArray(rows) ? rows[0] : rows
}

/**
 * Restore a customer from archived state.
 */
export async function restoreCustomerInSupabase(supabaseId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !supabaseId) return null
  const rows = await restPatch(`/customers?id=eq.${supabaseId}`, {
    archived:    false,
    archived_at: null,
  })
  return Array.isArray(rows) ? rows[0] : rows
}

// ── SMS Phase 1 ───────────────────────────────────────────────────────────────

/**
 * Fetch message history for a customer (outbound + inbound).
 * Returns newest-first array of message objects.
 */
export async function fetchMessageHistory(supabaseCustomerId) {
  if (!SUPABASE_URL || !SUPABASE_KEY || !supabaseCustomerId) return []
  try {
    const rows = await restGet(
      `/customer_messages?customer_id=eq.${supabaseCustomerId}&order=created_at.desc&limit=50`
    )
    return rows.map(r => ({
      id:        r.id,
      direction: r.direction,
      channel:   r.channel,
      body:      r.body,
      status:    r.status,
      twilioSid: r.twilio_message_sid,
      createdAt: r.created_at,
    }))
  } catch {
    return []
  }
}

/**
 * Manually update SMS consent from the CRM UI.
 * source should be 'manual' when triggered by a staff action.
 */
export async function updateSmsConsentInSupabase(supabaseId, status, source = 'manual') {
  if (!SUPABASE_URL || !SUPABASE_KEY || !supabaseId) return null
  const patch = { sms_consent_status: status, sms_consent_source: source }
  if (status === 'opted_out') patch.sms_opted_out_at = new Date().toISOString()
  if (status === 'opted_in')  patch.sms_opted_out_at = null
  try {
    const rows = await restPatch(`/customers?id=eq.${supabaseId}`, patch)
    return Array.isArray(rows) ? rows[0] : rows
  } catch {
    return null
  }
}
