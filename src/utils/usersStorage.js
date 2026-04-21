/**
 * Shared persistence layer for Users.
 * Single source of truth — read by UsersScreen, LoginModal, SellerSelectModal.
 * Ready for future backend migration: swap loadUsers/saveUsers implementations only.
 *
 * Storage format: { v: 1, users: User[] }
 * Legacy format (plain array) is auto-migrated on first read.
 */

const STORAGE_KEY    = 'fluxe-users-v1'
const BACKUP_KEY     = 'fluxe-users-v1-corrupted-backup'
const SCHEMA_VERSION = 1

// ─── Module-level error flag (read by UsersScreen to show warning) ────────────
let _corrupted = false
export function hadStorageError() { return _corrupted }

// ─── Default seed ─────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { id: 1, firstName: 'Rafael',  lastName: '',        position: 'Manager', email: '',                           phone: '(702) 517-2206', pin: '1234', status: 'active', photo: null, createdAt: new Date().toISOString() },
  { id: 2, firstName: 'Natalia', lastName: 'Menezes', position: 'Sales',   email: 'nataalia.menezes@gmail.com', phone: '(725) 256-5543', pin: '5678', status: 'active', photo: null, createdAt: new Date().toISOString() },
  { id: 3, firstName: 'Nate',    lastName: '',        position: 'Sales',   email: '',                           phone: '',               pin: '9012', status: 'active', photo: null, createdAt: new Date().toISOString() },
]

// ─── Schema migration: fills in missing fields from older formats ──────────────
function migrateUser(u) {
  return {
    id:        u.id        ?? 0,
    firstName: (u.firstName ?? u.name ?? '').trim(),
    lastName:  (u.lastName  ?? '').trim(),
    position:  u.position  ?? 'Sales',
    email:     (u.email     ?? '').trim(),
    phone:     (u.phone     ?? '').trim(),
    pin:        u.pin        ?? '',
    status:     u.status     ?? 'active',
    photo:      u.photo      ?? null,
    hourlyRate: u.hourlyRate ?? 0,
    createdAt:  u.createdAt  ?? new Date().toISOString(),
  }
}

// ─── Core persistence ─────────────────────────────────────────────────────────

export function loadUsers() {
  _corrupted = false
  const raw = localStorage.getItem(STORAGE_KEY)

  // Nothing saved yet — use seed
  if (!raw) return DEFAULT_USERS

  try {
    const parsed = JSON.parse(raw)

    // New format: { v: N, users: [...] }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.users)) {
      return parsed.users.map(migrateUser)
    }

    // Legacy format: plain array — migrate transparently
    if (Array.isArray(parsed)) {
      const migrated = parsed.map(migrateUser)
      // Upgrade storage to new format in-place
      saveUsers(migrated)
      return migrated
    }

    // Unrecognized format — treat as corrupt
    throw new Error('Unrecognized format')
  } catch {
    _corrupted = true
    // Preserve corrupted data for manual recovery — never silently discard
    try { localStorage.setItem(BACKUP_KEY, raw) } catch {}
    return DEFAULT_USERS
  }
}

export function saveUsers(users) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: SCHEMA_VERSION, users }))
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

/**
 * Convert a user record to the minimal shape expected by
 * LoginModal and SellerSelectModal: { id, name, pin, role, photo }
 */
export function userToEmployee(u) {
  const name = `${u.firstName} ${u.lastName}`.replace(/\s+/g, ' ').trim()
  return {
    id:    u.id,
    name,
    pin:   u.pin,
    role:  u.position.toLowerCase(),
    photo: u.photo || null,
  }
}

/** Returns only active users mapped to employee shape */
export function loadActiveEmployees() {
  return loadUsers()
    .filter(u => u.status === 'active')
    .map(userToEmployee)
}

/**
 * Async variant: tries Supabase first, falls back to loadUsers() on failure.
 * Use this from hooks/effects where async is acceptable.
 * Phase 1 only reads — no writes to Supabase.
 */
export async function loadUsersAsync() {
  try {
    const { fetchUsers } = await import('../services/supabaseRead')
    const remote = await fetchUsers()
    if (remote) return remote
  } catch {}
  return loadUsers()
}
