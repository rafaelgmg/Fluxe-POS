/**
 * db.js — Simple JSON file database
 * Stores customers + scheduled messages in server/data/
 * Can be replaced with PostgreSQL/MySQL later with no changes to server.js
 */

const fs   = require('fs')
const path = require('path')

const DATA_DIR       = path.join(__dirname, 'data')
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json')
const MESSAGES_FILE  = path.join(DATA_DIR, 'scheduled_messages.json')
const LOG_FILE       = path.join(DATA_DIR, 'sms_log.json')
const SALES_FILE     = path.join(DATA_DIR, 'sales.json')

// Ensure data directory and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

function initFile(filePath) {
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]', 'utf8')
}
initFile(CUSTOMERS_FILE)
initFile(MESSAGES_FILE)
initFile(LOG_FILE)
initFile(SALES_FILE)

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return []
  }
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Customers ────────────────────────────────────────────────────────────────

function getAllCustomers() {
  return readJSON(CUSTOMERS_FILE)
}

function findCustomerByPhone(phone) {
  const digits = phone.replace(/\D/g, '')
  return getAllCustomers().find(c => c.phone.replace(/\D/g, '') === digits) || null
}

function findCustomerById(id) {
  return getAllCustomers().find(c => c.id === id) || null
}

function saveCustomer(customer) {
  const all = getAllCustomers()
  const idx = all.findIndex(c => c.id === customer.id)
  if (idx >= 0) {
    all[idx] = customer
  } else {
    all.push(customer)
  }
  writeJSON(CUSTOMERS_FILE, all)
  return customer
}

function upsertCustomer(formData, invoice) {
  const digits = formData.phone?.replace(/\D/g, '')
  let customer = digits ? findCustomerByPhone(formData.phone) : null

  const purchase = {
    invoiceNumber: invoice.number,
    date:          invoice.timestamp,
    location:      invoice.location,
    seller:        invoice.employee,
    total:         invoice.total,
    paymentMethod: invoice.paymentMethod,
    items: (invoice.items || []).map(i => ({
      name:     i.product?.name || i.name,
      barcode:  i.product?.barcode || i.barcode,
      size:     i.product?.size || i.size,
      qty:      i.qty,
      subtotal: i.subtotal,
    })),
  }

  if (customer) {
    // Update existing
    customer.firstName           = formData.firstName           || customer.firstName
    customer.lastName            = formData.lastName            || customer.lastName
    customer.email               = formData.email               || customer.email
    customer.birthday            = formData.birthday            || customer.birthday
    customer.fragrancePreference = formData.fragrancePreference || customer.fragrancePreference
    if (formData.notes) {
      customer.notes = customer.notes
        ? customer.notes + '\n---\n' + formData.notes
        : formData.notes
    }
    if (formData.marketingConsent !== undefined) {
      customer.marketingConsent = formData.marketingConsent
    }
    customer.updatedAt = new Date().toISOString()
    customer.purchases = [...(customer.purchases || []), purchase]
  } else {
    customer = {
      id:                  'cust_' + Date.now(),
      firstName:           formData.firstName,
      lastName:            formData.lastName            || '',
      phone:               formData.phone,
      email:               formData.email              || '',
      birthday:            formData.birthday            || '',
      fragrancePreference: formData.fragrancePreference || '',
      notes:               formData.notes              || '',
      marketingConsent:    formData.marketingConsent   || false,
      createdAt:           new Date().toISOString(),
      updatedAt:           new Date().toISOString(),
      purchases:           [purchase],
    }
  }

  saveCustomer(customer)
  return customer
}

// ─── Scheduled Messages ───────────────────────────────────────────────────────

function getScheduledMessages() {
  return readJSON(MESSAGES_FILE)
}

function addScheduledMessage(msg) {
  const all = getScheduledMessages()
  all.push(msg)
  writeJSON(MESSAGES_FILE, all)
}

function markMessageSent(id) {
  const all = getScheduledMessages()
  const idx = all.findIndex(m => m.id === id)
  if (idx >= 0) {
    all[idx].sentAt = new Date().toISOString()
    all[idx].status = 'sent'
    writeJSON(MESSAGES_FILE, all)
  }
}

function markMessageFailed(id, error) {
  const all = getScheduledMessages()
  const idx = all.findIndex(m => m.id === id)
  if (idx >= 0) {
    all[idx].status = 'failed'
    all[idx].error  = error
    writeJSON(MESSAGES_FILE, all)
  }
}

function getPendingMessages() {
  const now = new Date()
  return getScheduledMessages().filter(m =>
    m.status === 'pending' && new Date(m.sendAt) <= now
  )
}

// ─── SMS Log ──────────────────────────────────────────────────────────────────

function logSMS(entry) {
  const all = readJSON(LOG_FILE)
  all.unshift({ ...entry, loggedAt: new Date().toISOString() })
  // Keep last 1000 entries
  writeJSON(LOG_FILE, all.slice(0, 1000))
}

function getSMSLog() {
  return readJSON(LOG_FILE)
}

/**
 * Returns true if a successful SMS of the given type was already sent to
 * this customer within the last `windowHours` hours.
 * Used to prevent duplicate automated messages (e.g. two thank_you sends).
 */
function wasSentRecently(customerId, type, windowHours = 48) {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000)
  return getSMSLog().some(e =>
    e.customerId === customerId &&
    e.type       === type       &&
    e.status     !== 'error'    &&
    e.status     !== 'dry_run'  &&
    new Date(e.loggedAt) > cutoff
  )
}

/**
 * Returns the number of successful SMS sent to a customer in the last `windowHours`.
 * Used for per-customer rate limiting across manual + auto sends.
 */
function sentCountInWindow(customerId, windowHours = 24) {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000)
  return getSMSLog().filter(e =>
    e.customerId === customerId &&
    e.status     !== 'error'   &&
    e.status     !== 'dry_run' &&
    new Date(e.loggedAt) > cutoff
  ).length
}

// ─── Sales ────────────────────────────────────────────────────────────────────

function getAllSales() {
  return readJSON(SALES_FILE)
}

function saveSale(invoice) {
  const all = getAllSales()
  all.push(invoice)
  writeJSON(SALES_FILE, all)
  return invoice
}

module.exports = {
  getAllCustomers,
  findCustomerByPhone,
  findCustomerById,
  saveCustomer,
  upsertCustomer,
  getScheduledMessages,
  addScheduledMessage,
  markMessageSent,
  markMessageFailed,
  getPendingMessages,
  logSMS,
  getSMSLog,
  wasSentRecently,
  sentCountInWindow,
  getAllSales,
  saveSale,
}
