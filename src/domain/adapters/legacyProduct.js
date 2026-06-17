import { PRODUCT_DEFAULTS } from '../models/product'
import { parseBarcode } from '../../utils/parseBarcode'

/**
 * Normalizes a raw product (from localStorage or mockData) to the canonical
 * Product shape. Safe to call on already-normalized objects.
 *
 * Guarantees: qtyByLoc, status, supplierName, updatedAt, minPrice, costPrice all exist.
 *
 * minPrice resolution order:
 *  1. raw.minPrice (already explicit — normal path for all products since mockData processes them)
 *  2. extracted from raw.rawBarcode via parseBarcode (safety net for truly unprocessed records)
 *  3. 0 (last-resort default — should not occur in normal operation)
 *
 * In the Supabase schema, minPrice MUST be an explicit column — rawBarcode encoding
 * is a localStorage/offline artifact. rawBarcode is kept for audit but not trusted as source.
 *
 * @param {object} raw
 * @returns {import('../models/product').Product}
 */
export function normalizeProduct(raw) {
  if (!raw) return raw

  let minPrice = raw.minPrice
  if ((minPrice == null || minPrice === 0) && raw.rawBarcode) {
    const parsed = parseBarcode(raw.rawBarcode)
    if (parsed.minPrice != null) minPrice = parsed.minPrice
  }
  minPrice = minPrice ?? 0

  return {
    ...PRODUCT_DEFAULTS,
    ...raw,
    qtyByLoc:          raw.qtyByLoc          ?? {},
    status:            raw.status            ?? 'active',
    supplierName:      raw.supplierName      ?? '',
    updatedAt:         raw.updatedAt         ?? null,
    minPrice,
    costPrice:         raw.costPrice         ?? 0,
    description:       raw.description       ?? '',
    qty:               raw.qty               ?? 0,
    reorderStatus:     raw.reorderStatus     ?? 'reorderable',
    coreProduct:       raw.coreProduct       ?? false,
    minStockTarget:    raw.minStockTarget     ?? null,
    reorderPoint:      raw.reorderPoint      ?? null,
    targetDaysOfStock: raw.targetDaysOfStock  ?? 14,
    leadTimeDays:      raw.leadTimeDays       ?? 7,
  }
}
