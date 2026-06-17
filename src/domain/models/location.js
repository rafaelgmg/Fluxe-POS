/**
 * Persisted location configuration.
 *
 * @typedef {Object} Location
 * @property {string}              id
 * @property {string}              name
 * @property {string}              region             'US' | 'INTL'
 * @property {number}              taxRate            percentage (e.g. 8.5)
 * @property {string}              taxDisplayAs       'TAX' | 'GST' | 'VAT'
 * @property {boolean}             blockSaleOutOfStock
 * @property {boolean}             acceptCash
 * @property {boolean}             acceptCard
 * @property {boolean}             acceptExtCredit
 * @property {boolean}             acceptCheck
 * @property {number}              spareCommissionRate  percent (e.g. 30)
 * @property {'fixed'|'tiered'}    spareCommissionMode
 * @property {SpareCommissionTier[]} spareTiers
 * @property {'active'|'inactive'}      status
 * @property {'retail'|'warehouse'}     location_type  retail=POS/sales; warehouse=inventory/transfers only
 */

/**
 * @typedef {Object} SpareCommissionTier
 * @property {number} threshold  subtotal threshold in $
 * @property {number} rate       percent (e.g. 30)
 */

/**
 * Runtime-only session object — created at login, not persisted to backend.
 *
 * @typedef {Object} PosSession
 * @property {string}      account     account/business name
 * @property {string}      region
 * @property {string}      location    location name (used for config lookups)
 * @property {string|null} locationId  stable FK; null if not found in LOCATIONS_CFG
 */

export const LOCATION_DEFAULTS = {
  region:                 'US',
  taxRate:                8.5,
  taxDisplayAs:           'TAX',
  blockSaleOutOfStock:    false,
  acceptCash:             true,
  acceptCard:             true,
  acceptExtCredit:        true,
  acceptCheck:            false,
  spareCommissionRate:    30,
  spareCommissionMode:    'fixed',
  spareTiers:             [],
  status:                 'active',
  location_type:          'retail',
}
