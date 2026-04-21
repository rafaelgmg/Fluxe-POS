/**
 * localId — generates a temporary local ID suitable for offline-first entities.
 * Replaces raw Date.now() calls so that local IDs are visually distinct from
 * backend UUIDs in migration audits and logs.
 *
 * Format: "<prefix>_<timestamp>_<random4>" — e.g. "cust_1714000000000_a3f2"
 *
 * ── Migration checklist ───────────────────────────────────────────────────────
 * When Supabase goes live, the following local IDs must be replaced or mapped:
 *
 *   Entity              Current ID format       Future ID
 *   ──────────────────  ──────────────────────  ─────────────────────────────
 *   Customer            'cust_' + Date.now()    UUID (supabase: uuid default)
 *   ClockRecord         Date.now() (number)     UUID
 *   InventoryMovement   Date.now() (number)     UUID (auto from insert)
 *   LockLogEntry        Date.now() (number)     UUID or bigint sequence
 *   ManualBonus         Date.now() (number)     UUID or bigint sequence
 *   Appointment         'appt_' + Date.now()    UUID
 *   CashDrawerEntry     Date.now() (number)     UUID
 *
 *   FrozenSale          Date.now() (number)     local-only — not persisted to backend
 *
 * ── NOT in this checklist ─────────────────────────────────────────────────────
 *   Product.id          numeric integer seed    → stays as integer PK in Supabase
 *   User.id             numeric integer seed    → stays as integer PK in Supabase
 *   Sale.number         sequential counter      → stays as bigint sequence in Supabase
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @param {string} [prefix='local']
 * @returns {string}
 */
export function localId(prefix = 'local') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
