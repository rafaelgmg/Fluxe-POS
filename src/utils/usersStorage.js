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
const PHOTO_KEY      = 'fluxe-user-photos-v1'
const SCHEMA_VERSION = 1

// ─── Module-level error flag (read by UsersScreen to show warning) ────────────
let _corrupted = false
export function hadStorageError() { return _corrupted }

// ─── Default seed ─────────────────────────────────────────────────────────────
const DEFAULT_USERS = [
  { id: 1, firstName: 'Rafael', lastName: '', position: 'Manager', email: '', phone: '', pin: '', status: 'active', photo: null, createdAt: new Date().toISOString() },
]

// ─── Schema migration: fills in missing fields from older formats ──────────────
function migrateUser(u) {
  return {
    id:         u.id         ?? 0,
    firstName:  (u.firstName ?? u.name ?? '').trim(),
    lastName:   (u.lastName  ?? '').trim(),
    position:   u.position   ?? 'Sales',
    email:      (u.email     ?? '').trim(),
    phone:      (u.phone     ?? '').trim(),
    pin:        u.pin        ?? '',
    status:     u.status     ?? 'active',
    photo:      u.photo      ?? null,
    hourlyRate: u.hourlyRate ?? 0,
    createdAt:  u.createdAt  ?? new Date().toISOString(),
    supabaseId: u.supabaseId ?? null,
  }
}

// ─── Photo store (separate key — immune to Supabase sync overwrites) ─────────

export function saveUserPhoto(userId, photoDataUrl) {
  try {
    const map = JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}')
    if (photoDataUrl) map[String(userId)] = photoDataUrl
    else delete map[String(userId)]
    localStorage.setItem(PHOTO_KEY, JSON.stringify(map))
  } catch {}
}

function loadPhotoMap() {
  try { return JSON.parse(localStorage.getItem(PHOTO_KEY) || '{}') }
  catch { return {} }
}

// ─── Core persistence ─────────────────────────────────────────────────────────

export function loadUsers() {
  _corrupted = false
  const raw      = localStorage.getItem(STORAGE_KEY)
  const photoMap = loadPhotoMap()
  const applyPhotos = (list) =>
    list.map(u => ({ ...u, photo: u.photo || photoMap[String(u.id)] || null }))

  // Nothing saved yet — use seed
  if (!raw) return applyPhotos(DEFAULT_USERS)

  try {
    const parsed = JSON.parse(raw)

    // New format: { v: N, users: [...] }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && Array.isArray(parsed.users)) {
      return applyPhotos(parsed.users.map(migrateUser))
    }

    // Legacy format: plain array — migrate transparently
    if (Array.isArray(parsed)) {
      const migrated = parsed.map(migrateUser)
      saveUsers(migrated)
      return applyPhotos(migrated)
    }

    // Unrecognized format — treat as corrupt
    throw new Error('Unrecognized format')
  } catch {
    _corrupted = true
    // Preserve corrupted data for manual recovery — never silently discard
    try { localStorage.setItem(BACKUP_KEY, raw) } catch {}
    return applyPhotos(DEFAULT_USERS)
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
 * Async variant: fetches from Supabase, merges with local (preserving PINs),
 * saves the merged result to localStorage, and returns it.
 *
 * Merge strategy:
 *   - Remote provides fresh data (name, role, email, hourlyRate, status, etc.)
 *   - Local provides PINs — Supabase never returns them (security)
 *   - Match by supabaseId first, then by full name (case-insensitive)
 *   - New employees from Supabase get pin: '' — they appear in lists but
 *     cannot authenticate until their PIN is set locally (Phase 6: server RPC)
 *
 * Falls back to loadUsers() if Supabase is unavailable.
 */
export async function loadUsersAsync() {
  try {
    const { fetchUsers } = await import('../services/supabaseRead')
    const remote = await fetchUsers()
    if (!remote || remote.length === 0) return loadUsers()

    const local  = loadUsers()
    const merged = remote.map(r => {
      const match = local.find(l =>
        l.supabaseId === r.id ||
        `${l.firstName} ${l.lastName}`.trim().toLowerCase() ===
        `${r.firstName} ${r.lastName}`.trim().toLowerCase()
      )
      return { ...r, id: match?.id ?? r.id, supabaseId: r.id, pin: match?.pin || '', photo: r.photo ?? match?.photo ?? null }
    })
    // Preserve local-only users (not yet synced to Supabase — added while offline or sync failed).
    // Without this, a successful sync permanently deletes them from localStorage.
    const remoteNames = new Set(remote.map(r => `${r.firstName} ${r.lastName}`.trim().toLowerCase()))
    const localOnly = local.filter(l =>
      !l.supabaseId &&
      !remoteNames.has(`${l.firstName} ${l.lastName}`.trim().toLowerCase())
    )
    const final = [...merged, ...localOnly]
    saveUsers(final)
    return final
  } catch {}
  return loadUsers()
}
