/**
 * clientConfig.js — Runtime client credentials (multi-tenant support).
 *
 * Single-tenant / dev:  falls back to VITE_* env vars baked at build time.
 * Multi-tenant / SaaS:  reads from localStorage — each client has their own creds.
 *
 * Flow:
 *   1. First launch: no localStorage config + no env vars → SetupScreen
 *   2. SetupScreen tests connection, extracts orgId from JWT, saves to localStorage
 *   3. All service files call _url() / _key() / _email() / _pass() inside their functions
 *   4. Next boot: reads from localStorage, skips SetupScreen
 */

const STORAGE_KEY = 'fluxe-client-config-v1'

// Build-time fallbacks — populated when env vars are set (dev / single-tenant Vercel)
const ENV = {
  supabaseUrl:     import.meta.env.VITE_SUPABASE_URL           || '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY      || '',
  machineEmail:    import.meta.env.VITE_ORG_MACHINE_EMAIL       || '',
  machinePassword: import.meta.env.VITE_ORG_MACHINE_PASSWORD    || '',
  orgId:           import.meta.env.VITE_SUPABASE_ORG_ID        || '',
}

/** Read credentials: localStorage overrides env vars. */
export function getClientConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...ENV, ...JSON.parse(raw) }
  } catch {}
  return { ...ENV }
}

/**
 * Persist credentials to localStorage.
 * Does NOT reload — the caller decides when to reload (setup completes → reload).
 */
export function saveClientConfig(config) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

/** Remove localStorage credentials (app reverts to env var fallbacks). */
export function clearClientConfig() {
  localStorage.removeItem(STORAGE_KEY)
}

/**
 * True if the app has enough credentials to attempt a Supabase connection.
 * Returns true in demo mode (no real credentials needed).
 */
export function isClientConfigured() {
  if (localStorage.getItem('fluxe-demo-mode') === '1') return true
  const c = getClientConfig()
  return Boolean(c.supabaseUrl && c.supabaseAnonKey && c.machineEmail && c.machinePassword)
}
