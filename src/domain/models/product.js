/**
 * @typedef {Object} Product
 * @property {number}                id
 * @property {string}                barcode       display barcode (clean)
 * @property {string}                [rawBarcode]  internal — encodes minPrice as "SKU.minPrice"
 * @property {number}                minPrice      extracted from rawBarcode; hidden from seller
 * @property {string}                name
 * @property {string}                description
 * @property {string}                size
 * @property {string}                category      category name
 * @property {number}                systemPrice   full ticket price
 * @property {number}                costPrice
 * @property {number}                qty           total stock across all locations
 * @property {Object.<string,number>} qtyByLoc     per-location stock { locationId: qty }
 * @property {'active'|'inactive'}   status
 * @property {string}                supplierName
 * @property {string|null}           updatedAt     ISO string
 * @property {string|null}           photoUrl      Supabase Storage public URL
 * @property {'reorderable'|'do_not_reorder'|'seasonal'|'discontinued'|'test_product'} reorderStatus
 * @property {boolean}               coreProduct   always keep in stock
 * @property {number|null}           minStockTarget
 * @property {number|null}           reorderPoint
 * @property {number}                targetDaysOfStock  default 14
 * @property {number}                leadTimeDays       default 7
 */

export const PRODUCT_DEFAULTS = {
  description:       '',
  costPrice:         0,
  qty:               0,
  qtyByLoc:          {},
  status:            'active',
  supplierName:      '',
  updatedAt:         null,
  minPrice:          0,
  reorderStatus:     'reorderable',
  coreProduct:       false,
  minStockTarget:    null,
  reorderPoint:      null,
  targetDaysOfStock: 14,
  leadTimeDays:      7,
  photoUrl:          null,
}
