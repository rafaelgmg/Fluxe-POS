/**
 * spareUtils.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Central definitions for the "spare" concept in Fluxe POS.
 *
 * Spare = the amount sold ABOVE the minimum price for a product.
 * It is tracked per seller and used for:
 *  - Commission splits (tier_nc, pct_subtotal w/ spareCommissionEnabled)
 *  - Competition bonus rankings (spare group, hybrid group)
 *  - Daily/periodic seller performance reports
 *
 * All spare calculations across the codebase must use these helpers so that
 * a single rule change propagates everywhere without divergence.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * Spare commission base for one unit sold — clamped to 0.
 * Returns 0 when salePrice < minPrice (no negative commission on spare).
 *
 * NOTE: this clamped value is for commission calculations only.
 * For the true economic spare on a cart/invoice line (which CAN be negative
 * when the item is discounted below minPrice), use:
 *   lineSpare = (salePrice - minPrice) * qty
 * That unclamped value is stored on cart items so cartTotalSpare reflects
 * the real economic impact of every line, including fully-discounted ones.
 *
 * @param {number} salePrice  - price the item was actually sold for
 * @param {number} minPrice   - floor price for that product
 * @returns {number}  always >= 0
 */
export function calcSpare(salePrice, minPrice) {
  return Math.max(0, (salePrice ?? 0) - (minPrice ?? 0))
}

/**
 * Sum spare across a list of cart or serialized invoice items.
 * Handles both cart-shape { spare } and serialized-shape { spare }.
 * Safe against null / undefined items or missing spare field.
 *
 * @param {object[]} items
 * @returns {number}
 */
export function sumItemSpare(items) {
  return (items || []).reduce((sum, i) => sum + (i.spare ?? 0), 0)
}

/**
 * Product value for commission split calculations.
 * productValue = subtotal - spare  (always >= 0)
 *
 * Used in tier_nc and pct_subtotal (spareCommissionEnabled) to split the
 * line-item subtotal into: product portion (earns tier %) + spare portion
 * (earns spare rate %).
 *
 * @param {number} subtotal
 * @param {number} spare
 * @returns {number}
 */
export function calcProductValue(subtotal, spare) {
  return Math.max(0, (subtotal ?? 0) - (spare ?? 0))
}
