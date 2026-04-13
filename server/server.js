/**
 * server.js — Perfume Passage POS Backend
 * Express API: CRM customers + Twilio SMS/WhatsApp automation
 *
 * Endpoints:
 *   POST /api/customers/upsert       — create or update customer + schedule messages
 *   GET  /api/customers              — list all customers
 *   GET  /api/customers/:id          — get one customer
 *   POST /api/sms/send               — send a manual SMS/WhatsApp immediately
 *   GET  /api/sms/log                — SMS send log
 *   GET  /api/sms/scheduled          — all scheduled messages
 *   POST /api/scheduler/run          — trigger scheduler manually (admin)
 *   GET  /api/health                 — server status
 */

require('dotenv').config()

const express   = require('express')
const cors      = require('cors')
const db        = require('./db')
const scheduler = require('./scheduler')
const { buildScheduledMessages, buildManualMessage } = require('./messages')

const app  = express()
const PORT = process.env.PORT || 3001

// ─── Twilio setup ─────────────────────────────────────────────────────────────

let twilioClient = null

if (
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN  &&
  process.env.TWILIO_ACCOUNT_SID.startsWith('AC')
) {
  try {
    const twilio  = require('twilio')
    twilioClient  = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    console.log('[Twilio] Client initialized ✓')
  } catch (err) {
    console.warn('[Twilio] Failed to initialize:', err.message)
  }
} else {
  console.warn('[Twilio] Credentials not set — running in dry-run mode. Messages will be logged but not sent.')
}

scheduler.init(twilioClient)

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: (origin, cb) => {
    // Allow any localhost origin in development
    if (!origin || /^http:\/\/localhost:\d+$/.test(origin)) return cb(null, true)
    const allowed = process.env.FRONTEND_URL
    if (allowed && origin === allowed) return cb(null, true)
    cb(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}))

app.use(express.json())

// Request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path}`)
  next()
})

// ─── Account login ───────────────────────────────────────────────────────────
// Mock credentials — move to environment variables in production.
// In production: hash passwords with bcrypt, issue real JWTs.
const ACCOUNT_USERS = [
  {
    email:     process.env.ACCOUNT_EMAIL    || 'admin@maisonparfum.com',
    password:  process.env.ACCOUNT_PASSWORD || 'admin123',
    role:      'admin',
    accountId: 'Delmondes_Retailing_NV_Inc',
  },
]

app.post('/api/account-login', (req, res) => {
  const { email, password } = req.body || {}
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' })
  }
  const user = ACCOUNT_USERS.find(
    u => u.email.toLowerCase() === email.toLowerCase() && u.password === password
  )
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }
  res.json({
    email:     user.email,
    accountId: user.accountId,
    role:      user.role,
    token:     `tok_${Date.now()}`,
  })
})

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({
    status:          'ok',
    twilio:          !!twilioClient,
    customers:       db.getAllCustomers().length,
    scheduledPending: db.getScheduledMessages().filter(m => m.status === 'pending').length,
    timestamp:       new Date().toISOString(),
  })
})

// ─── Customers ────────────────────────────────────────────────────────────────

// GET /api/customers
app.get('/api/customers', (_req, res) => {
  res.json(db.getAllCustomers())
})

// GET /api/customers/:id
app.get('/api/customers/:id', (req, res) => {
  const customer = db.findCustomerById(req.params.id)
  if (!customer) return res.status(404).json({ error: 'Customer not found' })
  res.json(customer)
})

// POST /api/customers/upsert
// Body: { formData: {...}, invoice: {...} }
app.post('/api/customers/upsert', async (req, res) => {
  const { formData, invoice } = req.body

  if (!formData?.firstName || !formData?.phone) {
    return res.status(400).json({ error: 'firstName and phone are required' })
  }

  try {
    // Save/update customer
    const customer = db.upsertCustomer(formData, invoice)

    // Schedule automated messages (only for marketing-consented customers)
    let scheduled = 0
    if (customer.marketingConsent) {
      const messages = buildScheduledMessages(customer, invoice)
      for (const msg of messages) {
        const id = `msg_${customer.id}_${msg.type}_${Date.now()}`
        db.addScheduledMessage({
          id,
          customerId: customer.id,
          type:       msg.type,
          channel:    'sms',
          sendAt:     msg.sendAt,
          body:       msg.body,
          status:     'pending',
          createdAt:  new Date().toISOString(),
        })
        scheduled++
      }
      console.log(`[CRM] ${customer.firstName} ${customer.lastName} — ${scheduled} messages scheduled`)
    }

    res.json({ customer, scheduledMessages: scheduled })
  } catch (err) {
    console.error('[CRM] upsert error:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── SMS / WhatsApp ───────────────────────────────────────────────────────────

// POST /api/sms/send
// Body: { customerId, message, channel: 'sms'|'whatsapp' }
app.post('/api/sms/send', async (req, res) => {
  const { customerId, message, channel = 'sms' } = req.body

  if (!customerId || !message) {
    return res.status(400).json({ error: 'customerId and message are required' })
  }

  const customer = db.findCustomerById(customerId)
  if (!customer) return res.status(404).json({ error: 'Customer not found' })

  const body = buildManualMessage(customer.firstName, message)

  try {
    const result = await scheduler.sendMessage(customer.phone, body, channel)
    db.logSMS({
      type:       'manual',
      customerId: customer.id,
      phone:      customer.phone,
      body,
      twilioSid:  result.sid,
      status:     result.status,
      channel,
    })
    res.json({ success: true, sid: result.sid, status: result.status, body })
  } catch (err) {
    db.logSMS({
      type:       'manual',
      customerId: customer.id,
      phone:      customer.phone,
      body,
      status:     'error',
      error:      err.message,
      channel,
    })
    res.status(500).json({ error: err.message })
  }
})

// GET /api/sms/log
app.get('/api/sms/log', (_req, res) => {
  res.json(db.getSMSLog())
})

// GET /api/sms/scheduled
app.get('/api/sms/scheduled', (_req, res) => {
  res.json(db.getScheduledMessages())
})

// ─── Sales ────────────────────────────────────────────────────────────────────

// GET /api/sales
app.get('/api/sales', (_req, res) => {
  res.json(db.getAllSales())
})

// POST /api/sales
app.post('/api/sales', (req, res) => {
  const invoice = req.body
  if (!invoice || !invoice.number || invoice.total === undefined) {
    return res.status(400).json({ error: 'Invalid invoice — number and total are required' })
  }
  try {
    db.saveSale(invoice)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Admin / Scheduler ────────────────────────────────────────────────────────

// POST /api/scheduler/run — trigger manually
app.post('/api/scheduler/run', async (_req, res) => {
  try {
    await scheduler.processPending()
    res.json({ success: true, message: 'Scheduler ran' })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🧴 Perfume Passage CRM Server`)
  console.log(`   Running on http://localhost:${PORT}`)
  console.log(`   Twilio: ${twilioClient ? '✓ connected' : '⚠ dry-run mode'}`)
  console.log(`   Customers: ${db.getAllCustomers().length}`)
  console.log(`   Pending SMS: ${db.getScheduledMessages().filter(m => m.status === 'pending').length}\n`)

  scheduler.start()
})
