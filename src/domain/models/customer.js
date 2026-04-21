/**
 * Snapshot of purchased items stored inside a CustomerPurchase.
 *
 * @typedef {Object} PurchaseItem
 * @property {string} name
 * @property {string} barcode
 * @property {string} size
 * @property {number} qty
 * @property {number} subtotal
 */

/**
 * Compact purchase record stored inside Customer.purchases.
 * Duplicates key invoice fields so the CRM works without joining sales.
 *
 * @typedef {Object} CustomerPurchase
 * @property {number}         invoiceNumber
 * @property {string}         date            ISO string
 * @property {string}         location        name snapshot
 * @property {string}         seller          name snapshot
 * @property {number}         total
 * @property {string}         paymentMethod
 * @property {PurchaseItem[]} items
 */

/**
 * @typedef {Object} Customer
 * @property {string}            id                  'cust_' + timestamp
 * @property {string}            firstName
 * @property {string}            lastName
 * @property {string}            phone
 * @property {string}            email
 * @property {string}            [birthday]          YYYY-MM-DD
 * @property {string[]}          fragrancePreferences
 * @property {string}            notes
 * @property {boolean}           marketingConsent
 * @property {string|null}       capturedBy          seller name at first capture (snapshot)
 * @property {string}            capturedLocation    location name at first capture (snapshot)
 * @property {string}            capturedAt          ISO string
 * @property {string}            createdAt           ISO string
 * @property {string}            updatedAt           ISO string
 * @property {CustomerPurchase[]} purchases
 * @property {string[]}          tags
 * @property {number}            crmScore
 * @property {boolean}           archived
 * @property {string|null}       archivedAt          ISO string
 * @property {string|null}       lastInteraction     ISO string
 * @property {string}            preferredChannel    'SMS' | 'email' | 'whatsapp'
 */

export const CUSTOMER_DEFAULTS = {
  email:                '',
  birthday:             '',
  fragrancePreferences: [],
  notes:                '',
  marketingConsent:     false,
  capturedBy:           null,
  purchases:            [],
  tags:                 [],
  crmScore:             0,
  archived:             false,
  archivedAt:           null,
  lastInteraction:      null,
  preferredChannel:     'SMS',
}
