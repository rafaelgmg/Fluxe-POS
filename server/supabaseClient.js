/**
 * supabaseClient.js — Server-side Supabase client (service role)
 *
 * Uses SUPABASE_SERVICE_KEY (service_role) which bypasses RLS.
 * NEVER expose this key to the frontend.
 *
 * Required env vars:
 *   SUPABASE_URL          — same as VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY  — from Supabase dashboard → Settings → API → service_role
 */

const { createClient } = require('@supabase/supabase-js')

let _client = null

function getClient() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    console.warn('[Supabase] Server credentials not set — SMS logs will not be persisted to database')
    return null
  }
  _client = createClient(url, key, { auth: { persistSession: false } })
  return _client
}

// ── Message logging ───────────────────────────────────────────────────────────

/**
 * Insert a row in customer_messages.
 * Returns the new row id, or null if Supabase is not configured.
 */
async function logMessage({
  organizationId,
  locationId,
  customerId,
  sentByUserId,
  direction,
  channel,
  body,
  status,
  twilioSid,
  errorMessage,
}) {
  const sb = getClient()
  if (!sb || !customerId || !organizationId) return null

  try {
    const { data, error } = await sb
      .from('customer_messages')
      .insert({
        organization_id:    organizationId,
        location_id:        locationId    || null,
        customer_id:        customerId,
        sent_by_user_id:    sentByUserId  || null,
        direction:          direction     || 'outbound',
        channel:            channel       || 'sms',
        body,
        status:             status        || 'sent',
        twilio_message_sid: twilioSid     || null,
        error_message:      errorMessage  || null,
      })
      .select('id')
      .single()

    if (error) throw error
    return data?.id
  } catch (err) {
    console.warn('[Supabase] logMessage failed:', err.message)
    return null
  }
}

/**
 * Update the status of an existing message by Twilio SID.
 * Used when a webhook delivers status callbacks.
 */
async function updateMessageStatus(twilioSid, status, errorMessage = null) {
  const sb = getClient()
  if (!sb || !twilioSid) return

  try {
    const { error } = await sb
      .from('customer_messages')
      .update({ status, error_message: errorMessage })
      .eq('twilio_message_sid', twilioSid)
    if (error) throw error
  } catch (err) {
    console.warn('[Supabase] updateMessageStatus failed:', err.message)
  }
}

// ── SMS consent ───────────────────────────────────────────────────────────────

/**
 * Update sms_consent_status on a customer row.
 * @param {string} customerId     Supabase UUID of the customer
 * @param {'unknown'|'opted_in'|'opted_out'} status
 * @param {'checkout'|'manual'|'imported'|'reply'} source
 */
async function updateSmsConsent(customerId, status, source) {
  const sb = getClient()
  if (!sb || !customerId) return

  try {
    const patch = { sms_consent_status: status, sms_consent_source: source }
    if (status === 'opted_out') patch.sms_opted_out_at = new Date().toISOString()

    const { error } = await sb
      .from('customers')
      .update(patch)
      .eq('id', customerId)

    if (error) throw error
  } catch (err) {
    console.warn('[Supabase] updateSmsConsent failed:', err.message)
  }
}

/**
 * Find a customer by normalized phone within an org.
 * Returns { id, first_name, sms_consent_status, marketing_consent } or null.
 */
async function findCustomerByPhone(orgId, phoneNormalized) {
  const sb = getClient()
  if (!sb || !orgId || !phoneNormalized) return null

  try {
    const { data } = await sb
      .from('customers')
      .select('id, first_name, sms_consent_status, marketing_consent')
      .eq('organization_id', orgId)
      .eq('phone_normalized', phoneNormalized)
      .eq('archived', false)
      .limit(1)
      .maybeSingle()

    return data || null
  } catch (err) {
    console.warn('[Supabase] findCustomerByPhone failed:', err.message)
    return null
  }
}

/**
 * Fetch sms_consent_status for a customer by Supabase UUID.
 * Returns the status string or null if not found / no Supabase.
 */
async function getConsentStatus(supabaseId) {
  const sb = getClient()
  if (!sb || !supabaseId) return null

  try {
    const { data } = await sb
      .from('customers')
      .select('sms_consent_status, marketing_consent')
      .eq('id', supabaseId)
      .maybeSingle()

    return data || null
  } catch {
    return null
  }
}

module.exports = {
  getClient,
  logMessage,
  updateMessageStatus,
  updateSmsConsent,
  findCustomerByPhone,
  getConsentStatus,
}
