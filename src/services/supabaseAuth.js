/**
 * supabaseAuth.js — Phase 6 + Phase 9: employee PIN verification, session context,
 * and machine account sign-in for RLS.
 *
 * verifyEmployeePin()
 *   Calls the `verify_employee_pin` PostgreSQL RPC (SECURITY DEFINER).
 *   The RPC verifies the bcrypt hash server-side and never exposes pin_hash.
 *   Falls back to local plaintext comparison when Supabase is unavailable.
 *
 * resolveSessionContext()
 *   Fetches org UUID + location UUID at login time. Called once in LoginScreen.
 *
 * initOrgSession()   [Phase 9]
 *   Signs in to Supabase Auth as the machine account (one per organization).
 *   Stores the access token in supabaseSession.js for all subsequent requests.
 *   Schedules automatic token refresh before expiry.
 *   MUST be called at app boot before any Supabase data fetch with RLS enabled.
 *
 * Machine account setup (Phase 9 pre-requisite):
 *   1. Create a Supabase Auth user: pos-machine@perfumepassage.local
 *   2. Set app_metadata.org_id to your org UUID (see phase9_rls.sql for SQL)
 *   3. Add to .env:
 *        VITE_ORG__email()=pos-machine@perfumepassage.local
 *        VITE_ORG__pass()=<strong-password>
 *        VITE_SUPABASE_ORG_ID=<org-uuid>   ← required when RLS is active
 */

import { isSupabaseConfigured, getOrgId, setOrgIdCache } from './supabaseRead'
import { setAccessToken, clearAccessToken, getAccessToken } from './supabaseSession'
import { loadActiveEmployees, loadUsers, saveUsers } from '../utils/usersStorage'
import { LOCATIONS_CFG } from '../config/branding'

import { getClientConfig } from './clientConfig'

function _url()   { return getClientConfig().supabaseUrl }
function _key()   { return getClientConfig().supabaseAnonKey }
function _email() { return getClientConfig().machineEmail }
function _pass()  { return getClientConfig().machinePassword }

// ── HTTP helpers (Phase 6 originals — still use anon key for RPC/auth endpoints) ─

async function rpcPost(fnName, params) {
  // RPC uses the machine account token when available (so SECURITY DEFINER functions
  // receive the correct role context). Falls back to anon for offline/dev.
  const bearer = getAccessToken() || _key()
  const res = await fetch(`${_url()}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey:          _key(),
      Authorization:   `Bearer ${bearer}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`RPC ${fnName} ${res.status}: ${text}`)
  }
  return res.json()
}

async function restGet(path) {
  const bearer = getAccessToken() || _key()
  const res = await fetch(`${_url()}/rest/v1${path}`, {
    headers: {
      apikey:        _key(),
      Authorization: `Bearer ${bearer}`,
    },
  })
  if (!res.ok) throw new Error(`GET ${path} ${res.status}`)
  return res.json()
}

// ── Machine account session (Phase 9) ────────────────────────────────────────

let _refreshTimer = null

/** Extract org_id from a Supabase JWT without verifying the signature. */
function extractOrgId(accessToken) {
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload?.app_metadata?.org_id || null
  } catch {
    return null
  }
}

/** Returns true if the JWT is missing or its exp claim is in the past. */
function isTokenExpired(accessToken) {
  if (!accessToken) return true
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

async function doRefresh(refreshToken) {
  try {
    const res = await fetch(`${_url()}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: _key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) throw new Error(`Refresh ${res.status}`)
    const data = await res.json()
    setAccessToken(data.access_token)
    scheduleRefresh(data.refresh_token, data.expires_in)
    console.log('[Fluxe] Machine account token refreshed successfully')
  } catch (err) {
    clearAccessToken()
    console.warn('[Fluxe] Token refresh failed — Supabase reads will use offline fallback until restart:', err.message)
  }
}

function scheduleRefresh(refreshToken, expiresIn) {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  // Refresh 2 minutes before expiry, minimum 60 seconds
  const delay = Math.max((expiresIn - 120) * 1000, 60_000)
  _refreshTimer = setTimeout(() => doRefresh(refreshToken), delay)
}

/**
 * Sign in to Supabase Auth as the organization machine account.
 * Stores the access token in supabaseSession.js.
 * Also populates the org_id cache from the JWT so getOrgId() needs no DB query.
 *
 * Call once at app boot (before any Supabase data fetch when RLS is active).
 * Fire-and-forget safe — the app continues from localStorage on failure.
 *
 * @returns {Promise<string|null>}  access_token or null on failure
 */
let _sessionPromise = null

/**
 * Returns a singleton promise for the org session.
 * Safe to call multiple times — sign-in only happens once.
 * Await this before any Supabase fetch that requires RLS context.
 */
export function awaitOrgSession() {
  if (!_sessionPromise) _sessionPromise = initOrgSession()
  return _sessionPromise
}

export async function initOrgSession() {
  if (!isSupabaseConfigured() || !_email() || !_pass()) return null
  try {
    const res = await fetch(`${_url()}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: _key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: _email(), password: _pass() }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Machine sign-in ${res.status}: ${text}`)
    }
    const data = await res.json()
    setAccessToken(data.access_token)

    // Cache org_id from JWT so getOrgId() doesn't need a DB query with RLS active
    const orgId = extractOrgId(data.access_token)
    if (orgId) setOrgIdCache(orgId)

    // Schedule token refresh before expiry
    if (data.expires_in) scheduleRefresh(data.refresh_token, data.expires_in)

    console.log('[Fluxe] Machine account signed in — RLS context active')
    return data.access_token
  } catch (err) {
    console.warn('[Fluxe] initOrgSession failed — app will run from localStorage:', err.message)
    return null
  }
}

// ── Visibility-change recovery ────────────────────────────────────────────────
// Tablets and phones suspend setTimeout timers when the screen locks or the
// browser goes to the background. When the device wakes up the scheduled
// refresh may never have fired, leaving an expired token. Listening for
// visibilitychange lets us detect this and re-authenticate immediately.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    if (!isTokenExpired(getAccessToken())) return
    console.log('[Fluxe] Tab visible with expired token — re-initializing session')
    _sessionPromise = null   // reset singleton so initOrgSession runs fresh
    awaitOrgSession()
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify an employee PIN via the `verify_employee_pin` Supabase RPC.
 *
 * The RPC uses pgcrypto.crypt() to compare against the stored bcrypt hash.
 * pin_hash is NEVER returned to the client — only non-secret fields.
 *
 * Falls back to local plaintext comparison when Supabase is unavailable
 * (offline-first guarantee — kiosk must always be usable).
 *
 * Phase 9: after RLS is enabled, the local fallback path can be removed
 * and the plain `pin` column dropped from localStorage + Supabase.
 *
 * @param {string} employeeName  Full name from dropdown (e.g. 'Rafael' or 'Natalia Menezes')
 * @param {string} pin           Plaintext PIN entered by the employee
 * @returns {Promise<{id: string|number, name: string, role: string, photo: string|null} | null>}
 */
export async function verifyEmployeePin(employeeName, pin) {
  // Demo mode: skip Supabase RPC, validate directly from seeded localStorage
  if (localStorage.getItem('fluxe-demo-mode') === '1') {
    const emp = loadActiveEmployees().find(e => e.name === employeeName)
    return (emp && emp.pin === pin) ? { id: null, name: emp.name, role: emp.role, photo: emp.photo } : null
  }
  if (isSupabaseConfigured()) {
    try {
      const orgId = await getOrgId()
      const rows  = await rpcPost('verify_employee_pin', {
        p_org_id:        orgId,
        p_employee_name: employeeName,
        p_pin:           pin,
      })
      if (Array.isArray(rows) && rows.length > 0) {
        const u = rows[0]
        // Prefer local role — Supabase position can be null for legacy/seeded users
        const localEmp = loadActiveEmployees().find(e => e.name === employeeName)

        // Auto-cache PIN + supabaseId in localStorage so offline fallback works and
        // UUID → short-name lookups (Competition, EOD merge) resolve correctly on all devices.
        try {
          const users = loadUsers()
          const idx = users.findIndex(usr =>
            usr.supabaseId === u.id ||
            `${usr.firstName} ${usr.lastName}`.trim().toLowerCase() === employeeName.toLowerCase()
          )
          if (idx >= 0) {
            const needsUpdate = users[idx].pin !== pin || users[idx].supabaseId !== u.id
            if (needsUpdate) {
              users[idx] = { ...users[idx], pin, supabaseId: u.id }
              saveUsers(users)
            }
          }
        } catch {}

        return {
          id:    u.id,
          name:  (`${u.first_name || ''} ${u.last_name || ''}`).replace(/\s+/g, ' ').trim() || employeeName,
          role:  localEmp?.role || (u.position || 'sales').toLowerCase(),
          photo: localEmp?.photo || null,
        }
      }
      // RPC returned no rows — Supabase hash may be stale (e.g. set_user_pin failed).
      // Fall through to local plaintext check so a recently-changed PIN still works.
      console.warn('[Fluxe] verify_employee_pin returned no rows — trying local PIN fallback.')
    } catch (err) {
      console.warn('[Fluxe] verify_employee_pin RPC failed — falling back to local:', err.message)
    }
  }

  // ── Offline / dev fallback: local plaintext comparison ─────────────────────
  // This path runs when:
  //   (a) Supabase is not configured (dev environment without .env)
  //   (b) Supabase is unreachable (network outage, kiosk offline)
  //
  // Security note: PINs in localStorage are plaintext. This is intentional for
  // offline operation. Phase 9 (RLS) will restrict table reads so pin_hash
  // cannot be read without authentication, at which point this fallback
  // becomes safe to remove.
  console.warn('[Fluxe] PIN verified locally (offline/dev fallback). Phase 9 will enforce RLS.')
  const employees = loadActiveEmployees()
  const emp = employees.find(e => e.name === employeeName)
  if (emp && emp.pin === pin) {
    // Use id: null in offline fallback — emp.id may be a stale localStorage UUID that no longer
    // exists in users, which would cause a 23503 FK violation on the next sale insert.
    // employee_name is preserved in the sale row as a reliable display snapshot.
    return { id: null, name: emp.name, role: emp.role, photo: emp.photo }
  }
  return null
}

/**
 * Fetch orgId + locationUUID at login time and enrich posSession.
 * Called once in LoginScreen after the location password is accepted.
 *
 * Fetches locationUUID directly (not from the _legacyToUUID cache in
 * supabaseRead) so it is available before fetchProducts() runs on boot.
 *
 * @param {string|null} legacyLocationId  e.g. 'loc_01'
 * @returns {Promise<{ orgId: string|null, locationUUID: string|null }>}
 */
export async function resolveSessionContext(legacyLocationId) {
  if (!isSupabaseConfigured()) return { orgId: null, locationUUID: null }
  try {
    const orgId  = await getOrgId()
    const locCfg = LOCATIONS_CFG.find(l => l.id === legacyLocationId)
    if (!locCfg) return { orgId, locationUUID: null }

    const rows = await restGet(
      `/locations?select=id&name=eq.${encodeURIComponent(locCfg.name)}&organization_id=eq.${orgId}&limit=1`
    )
    return { orgId, locationUUID: rows[0]?.id || null }
  } catch (err) {
    console.warn('[Fluxe] resolveSessionContext failed:', err.message)
    return { orgId: null, locationUUID: null }
  }
}
