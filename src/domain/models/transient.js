/**
 * transient.js — Shapes that exist only at runtime or in localStorage.
 * NONE of these are persisted to the backend / Supabase.
 *
 * ── Rules for transient shapes ────────────────────────────────────────────────
 *  - They may live in localStorage as operational state (e.g. frozen carts)
 *  - They are derived or short-lived (e.g. PosSession is re-created on login)
 *  - They MUST NOT be referenced by persisted entities (no FK to a FrozenSale)
 *  - When backend migration happens, these stay in the client
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Active login session for the POS terminal.
 * Created in LoginScreen, destroyed on logout/reload.
 * NOT persisted — reconstructed from LOCATIONS_CFG on next login.
 *
 * @typedef {Object} PosSession
 * @property {string}      account     business/account name
 * @property {string}      region      'US' | 'INTL'
 * @property {string}      location    location display name (used for config lookups by name)
 * @property {string|null} locationId  stable FK; null if location not found in LOCATIONS_CFG
 */

/**
 * A temporarily held (frozen) cart that can be swapped back in.
 * Stored in localStorage as operational state between cart swaps.
 * NOT a backend entity — contains live product references (not serialized SaleItems).
 *
 * @typedef {Object} FrozenSale
 * @property {number}      id       Date.now() — local only
 * @property {string|null} user     seller name at freeze time
 * @property {Array}       items    live cart items (with product reference, not serialized shape)
 * @property {string}      time     ISO string
 * @property {number}      subtotal
 */

/**
 * A single entry in the station lock/unlock audit log.
 * Stored in localStorage. Future: could be a lightweight backend event log.
 *
 * @typedef {Object} LockLogEntry
 * @property {number}      id          Date.now() — local only
 * @property {string|null} lockedBy    employee name
 * @property {string}      lockedAt    ISO string
 * @property {string|null} unlockedBy  employee name
 * @property {string|null} unlockedAt  ISO string
 */
