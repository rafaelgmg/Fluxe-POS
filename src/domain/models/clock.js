/**
 * A single clock-in / clock-out record for an employee.
 * clockOut === null means the employee is currently clocked in.
 *
 * @typedef {Object} ClockRecord
 * @property {number}      id        Date.now()
 * @property {string}      employee  name snapshot
 * @property {string}      clockIn   ISO string
 * @property {string|null} clockOut  ISO string — null = active shift
 */

/**
 * A temporarily frozen (held) cart.
 * Operational state only — not intended for backend persistence.
 * items contains live cart objects (with product references, not serialized).
 *
 * @typedef {Object} FrozenSale
 * @property {number}      id       Date.now()
 * @property {string|null} user     seller name at freeze time
 * @property {Array}       items    cart items (live shape with product reference)
 * @property {string}      time     ISO string
 * @property {number}      subtotal
 */
