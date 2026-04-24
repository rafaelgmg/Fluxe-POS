/**
 * @typedef {Object} Payment
 * @property {'cash'|'card'|'external'|'check'} method
 * @property {number}  amount
 * @property {number}  [amountReceived]      cash only
 * @property {number}  [changeDue]           cash only
 * @property {string}  [cardBrand]           card only
 * @property {string}  [cardLast4]           card only
 * @property {string}  [authorizationNumber] card only
 * @property {string}  [externalRef]         external only
 * @property {string}  [checkNumber]         check only
 */

/**
 * Persisted shape of a single line item inside a Sale.
 * All product fields are snapshots — they never change after the sale is saved.
 *
 * lineId provides stable identity within a sale for future refund operations.
 * Format: "<invoiceNumber>-<1-based position>" e.g. "60001-1", "60001-2".
 * Legacy items (before Bloco D) will have lineId = null — treat as non-refundable
 * or reconstruct as "<number>-<index+1>" on the fly when needed.
 *
 * @typedef {Object} SaleItem
 * @property {string|null}  lineId       stable line identity within this sale (refund key)
 * @property {number|null}  productId    stable FK to product
 * @property {string|null}  categoryId   stable FK to category at sale time
 * @property {string}       name
 * @property {string}       barcode
 * @property {string}       description
 * @property {string}       size
 * @property {string}       category     name snapshot
 * @property {number}       qty
 * @property {number}       salePrice    price charged
 * @property {number}       systemPrice  full ticket price snapshot
 * @property {number}       minPrice     hidden floor price snapshot
 * @property {number}       discount
 * @property {number}       subtotal     salePrice * qty
 * @property {number}       spare        salePrice - minPrice (per-unit * qty)
 */

/**
 * Self-contained audit record captured at sale time.
 * Used to recalculate historical commissions even if config changes later.
 *
 * @typedef {Object} CommissionSnapshot
 * @property {string}       configAt           ISO timestamp of snapshot
 * @property {number|null}  employeeId
 * @property {string}       employeeSnapshot   name at sale time
 * @property {Object[]}     tiers              full tier table as configured
 * @property {number}       spareRate          global spare commission %
 * @property {Object}       categoryRules      keyed by category name
 * @property {number}       daySubtotalAtSale  employee subtotal today incl. this invoice
 * @property {Object}       tierAtSale         { rate: decimal, label: string }
 * @property {number}       resolvedSpareRate  spare rate actually applied
 * @property {number}       commissionAtSale   commission for this invoice
 * @property {number}       spareTotal         spare generated in this invoice
 * @property {Object[]}     itemBreakdown
 */

/**
 * @typedef {Object} Sale
 * @property {number}                  number
 * @property {string}                  timestamp       ISO string
 * @property {string}                  location        name snapshot
 * @property {string|null}             locationId      stable FK
 * @property {string}                  employee        name snapshot
 * @property {number|null}             employeeId      stable FK
 * @property {SaleItem[]}              items
 * @property {number}                  subtotal
 * @property {number}                  tax
 * @property {number}                  total
 * @property {number}                  tip
 * @property {'normal'|'deleted'}      status
 * @property {string}                  paymentMethod   primary method or 'split'
 * @property {Payment[]}               payments
 * @property {number}                  totalSpare
 * @property {CommissionSnapshot|null} commissionSnapshot
 * @property {string|null}             linkedCustomerId
 * @property {string}                  [notes]
 */

export const SALE_DEFAULTS = {
  tip:                0,
  status:             'normal',
  payments:           [],
  totalSpare:         0,
  commissionSnapshot: null,
  linkedCustomerId:   null,
  notes:              '',
  locationId:         null,
  employeeId:         null,
}

export const SALE_ITEM_DEFAULTS = {
  lineId:      null,
  productId:   null,
  categoryId:  null,
  description: '',
  size:        '',
  discount:    0,
  spare:       0,
  minPrice:    0,
  costPrice:   0,
  systemPrice: 0,
}
