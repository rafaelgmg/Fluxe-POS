/**
 * supabaseSession.js — Phase 9: shared auth token store.
 *
 * Single source of truth for the machine account access token.
 * Extracted as a standalone module to prevent circular imports:
 *   supabaseAuth (writes token) ← supabaseSession → supabaseRead (reads token)
 *   supabaseAuth also imports from supabaseRead, so a direct import
 *   in either direction would create a cycle.
 */

let _accessToken = null

/** The current machine account JWT (null when not signed in). */
export function getAccessToken()  { return _accessToken }
export function setAccessToken(t) { _accessToken = t }
export function clearAccessToken(){ _accessToken = null }
