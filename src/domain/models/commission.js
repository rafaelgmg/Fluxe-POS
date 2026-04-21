/**
 * A single tier in the daily commission ladder.
 * Rate is stored as an integer percent — divide by 100 before multiplication.
 *
 * @typedef {Object} CommissionTier
 * @property {number} id
 * @property {number} threshold  daily subtotal threshold in $ (e.g. 600, 1000, 1500)
 * @property {number} rate       integer percent (e.g. 20 means 20%) — NOT 0.20
 */

/**
 * A single threshold in a daily bonus ladder.
 *
 * @typedef {Object} BonusTier
 * @property {number} threshold   daily subtotal threshold in $
 * @property {number} bonusAmount fixed cash bonus in $
 */

/**
 * A day-level bonus rule for a specific location.
 *
 * @typedef {Object} BonusRule
 * @property {number}      id
 * @property {string}      date      YYYY-MM-DD
 * @property {string}      location  location name
 * @property {BonusTier[]} tiers
 */

/**
 * A manual +/− pay adjustment for a single employee on a single day.
 * Entry is preserved even when zeroed (for audit trail).
 *
 * @typedef {Object} ManualBonus
 * @property {number} id
 * @property {string} employee    name snapshot
 * @property {string} date        YYYY-MM-DD
 * @property {number} adjustment  in $ (positive = bonus, negative = deduction)
 * @property {string} note
 * @property {string} updatedAt   ISO string
 */
