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
 */

export const PRODUCT_DEFAULTS = {
  description:  '',
  costPrice:    0,
  qty:          0,
  qtyByLoc:     {},
  status:       'active',
  supplierName: '',
  updatedAt:    null,
  minPrice:     0,
}
