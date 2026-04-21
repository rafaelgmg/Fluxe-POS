import { USER_DEFAULTS } from '../models/user'

/**
 * Normalizes a raw user record to the canonical User shape.
 * Safe to call on already-normalized objects.
 *
 * Handles: legacy `name` field (pre-split) → firstName / lastName.
 *
 * Note: usersStorage.js has its own migrateUser() that covers the same
 * localStorage migration path. This adapter is the canonical reference
 * for backend normalization (e.g., Supabase row → frontend User).
 *
 * @param {object} raw
 * @returns {import('../models/user').User}
 */
export function normalizeUser(raw) {
  if (!raw) return raw

  let { firstName, lastName } = raw

  // Migrate legacy single `name` field
  if (!firstName && raw.name) {
    const parts = raw.name.trim().split(/\s+/)
    firstName = parts[0] || raw.name
    lastName  = parts.slice(1).join(' ') || ''
  }

  return {
    ...USER_DEFAULTS,
    ...raw,
    firstName:  (firstName  ?? '').trim(),
    lastName:   (lastName   ?? '').trim(),
    hourlyRate: raw.hourlyRate ?? 0,
    status:     raw.status     ?? 'active',
    photo:      raw.photo      ?? null,
  }
}
