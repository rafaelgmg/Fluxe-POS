/**
 * A single inventory movement logged in the audit trail.
 * Covers manual adjustments, transfers, count reconciliations, and product edits.
 *
 * ── delta rule (canonical) ────────────────────────────────────────────────────
 *  delta = after − before  (always signed)
 *  Positive = stock gained at this location
 *  Negative = stock lost at this location
 *  Zero     = non-qty events (status_change, product_update)
 *
 *  For 'transfer': two movements are NOT created — one movement is created from
 *  the source location's perspective (delta = −n). The destination gain is
 *  implicit. Future backend: create two rows (debit + credit) for a full ledger.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ── decrementStock gap ────────────────────────────────────────────────────────
 *  Sales currently decrement product.qty via useProducts.decrementStock()
 *  WITHOUT creating an InventoryMovement entry. This means sold stock reductions
 *  are invisible in the audit trail. Before backend migration, a 'sale' movement
 *  type should be created here for each finalized invoice.
 *  Target: Bloco E or F.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @typedef {Object} InventoryMovement
 * @property {number} id              Date.now() — local only; replace with UUID on backend
 * @property {string} timestamp       ISO string
 * @property {'sale'|'refund'|'adjustment'|'transfer'|'product_update'|'removal'|'count_set'|'status_change'} type
 * @property {number} productId
 * @property {string} productName     snapshot at movement time
 * @property {string} barcode         snapshot at movement time
 * @property {string} locationId      empty string '' for global/cross-location operations
 * @property {string} locationName    snapshot
 * @property {number} before          qty at this location before the movement
 * @property {number} after           qty at this location after the movement
 * @property {number} delta           after − before (see delta rule above)
 * @property {string} note
 * @property {string} [performedBy]   employee name snapshot
 *
 * Transfer-only extra fields (present when type === 'transfer'):
 * @property {string} [fromLocationId]
 * @property {string} [fromLocationName]
 * @property {string} [toLocationId]
 * @property {string} [toLocationName]
 */

export const INVENTORY_MOVEMENT_DEFAULTS = {
  locationId:   '',
  locationName: '',
  before:       0,
  after:        0,
  delta:        0,
  note:         '',
  performedBy:  '',
}
