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
const sbClient  = require('./supabaseClient')
const { buildScheduledMessages, buildManualMessage, loadTemplates, saveTemplates } = require('./messages')

const { createApiGuard, createTwilioGuard } = require('./security')
const app  = express()
app.disable('x-powered-by')
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '127.0.0.1'

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

// ─── Resend setup ─────────────────────────────────────────────────────────────

let resendClient = null
const RESEND_FROM = process.env.RESEND_FROM_EMAIL || 'Perfume Passage <onboarding@resend.dev>'

if (process.env.RESEND_API_KEY) {
  try {
    const { Resend } = require('resend')
    resendClient = new Resend(process.env.RESEND_API_KEY)
    console.log('[Resend] Client initialized ✓')
  } catch (err) {
    console.warn('[Resend] Package not installed — run: npm install resend in server/', err.message)
  }
} else {
  console.warn('[Resend] RESEND_API_KEY not set — email sending disabled.')
}

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
// Public liveness contains no customer counts, phone numbers or sender details.
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

// Existing CORS policy still applies. Only a loopback-bound kiosk gets hardware access.
require('./localDrawer').registerLocalDrawer(app, HOST)

const apiGuard = createApiGuard({ getClient: sbClient.getClient, getOrgId: () => process.env.ORG_ID })
app.use('/api', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/webhooks/twilio/sms') return next()
  return apiGuard(req, res, next)
})

app.post('/api/receipts/authorize', require('./receiptAuthorization').createReceiptAuthorization({ getClient: sbClient.getClient }))
app.get('/api/receipts/requests/:saleId', require('./receiptQueue').createReceiptStatus({ getClient: sbClient.getClient }))
app.post('/api/receipts/requests', require('./receiptQueue').createReceiptQueue({
  getClient: sbClient.getClient,
  isEnabled: () => process.env.RECEIPT_QUEUE_ENABLED === 'true',
}))

app.get('/api/status', (_req, res) => {
  res.json({
    status:            'ok',
    twilio:            !!twilioClient,
    twilioMode:        !twilioClient ? 'dry_run' : (process.env.SMS_TEST_NUMBER ? 'test' : 'live'),
    testNumber:        process.env.SMS_TEST_NUMBER || null,
    automationEnabled: process.env.SMS_AUTOMATION_ENABLED === 'true',
    rateLimitPerDay:   parseInt(process.env.SMS_RATE_LIMIT_PER_DAY) || 3,
    resend:            !!resendClient,
    resendFrom:        resendClient ? RESEND_FROM : null,
    customers:         db.getAllCustomers().length,
    scheduledPending:  db.getScheduledMessages().filter(m => m.status === 'pending').length,
    timestamp:         new Date().toISOString(),
  })
})

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
// Body: {
//   phone, firstName, message, channel,
//   supabaseId,   — Supabase customer UUID (for consent check + log)
//   orgId,        — organization UUID
//   locationId,   — optional
//   // legacy fallback: customerId (looks up from JSON db)
// }
app.post('/api/sms/send', async (req, res) => {
  const {
    phone, firstName, message, channel = 'sms',
    supabaseId, orgId, locationId,
    customerId,  // legacy
    dryRun,      // if true: skip Twilio, log as 'dry_run'
    raw,         // if true: send message body as-is (no buildManualMessage wrapping)
  } = req.body

  // Resolve phone + firstName — prefer direct params, fall back to JSON db
  let resolvedPhone     = phone
  let resolvedFirstName = firstName
  let resolvedLocalId   = customerId || supabaseId

  if ((!resolvedPhone || !resolvedFirstName) && customerId) {
    const legacy = db.findCustomerById(customerId)
    if (!legacy) return res.status(404).json({ error: 'Customer not found' })
    resolvedPhone     = resolvedPhone     || legacy.phone
    resolvedFirstName = resolvedFirstName || legacy.firstName
  }

  if (!resolvedPhone || !message) {
    return res.status(400).json({ error: 'phone and message are required' })
  }

  // Rate limit check — per customer, per 24h window (skip in dry-run and test modes)
  if (!dryRun && resolvedLocalId) {
    const limit   = parseInt(process.env.SMS_RATE_LIMIT_PER_DAY) || 3
    const recent  = db.sentCountInWindow(resolvedLocalId, 24)
    if (recent >= limit) {
      console.warn(`[SMS] Rate limit hit for ${resolvedLocalId} — ${recent}/${limit} sends in last 24h`)
      return res.status(429).json({
        error:       'rate_limit',
        message:     `Rate limit: ${recent} messages already sent to this customer in the last 24 hours (limit: ${limit})`,
        sentToday:   recent,
        limit,
      })
    }
  }

  // Consent check — only when Supabase is configured and supabaseId known
  if (supabaseId) {
    const consent = await sbClient.getConsentStatus(supabaseId)
    if (consent?.sms_consent_status === 'opted_out') {
      return res.status(403).json({
        error:         'opted_out',
        message:       `${resolvedFirstName} has opted out of SMS (replied STOP). Cannot send.`,
        consentStatus: 'opted_out',
      })
    }
  }

  const body = raw ? message : buildManualMessage(resolvedFirstName, message)

  // Dry-run: log but skip Twilio
  if (dryRun) {
    db.logSMS({ type: 'campaign_dry_run', customerId: resolvedLocalId, phone: resolvedPhone, body, status: 'dry_run', channel })
    if (supabaseId && orgId) {
      sbClient.logMessage({
        organizationId: orgId, locationId: locationId || null,
        customerId: supabaseId, direction: 'outbound', channel, body,
        status: 'dry_run', twilioSid: null,
      }).catch(() => {})
    }
    return res.json({ success: true, sid: 'dry-run', status: 'dry_run', dryRun: true, body })
  }

  try {
    const result = await scheduler.sendMessage(resolvedPhone, body, channel)

    // Log to JSON (legacy, always)
    db.logSMS({
      type: 'manual', customerId: resolvedLocalId,
      phone: resolvedPhone, body,
      twilioSid: result.sid, status: result.status, channel,
    })

    // Log to Supabase (when credentials available)
    if (supabaseId && orgId) {
      sbClient.logMessage({
        organizationId: orgId,
        locationId:     locationId || null,
        customerId:     supabaseId,
        direction:      'outbound',
        channel,
        body,
        status:         result.sid === 'dry-run' ? 'sent' : result.status || 'sent',
        twilioSid:      result.sid === 'dry-run' ? null : result.sid,
      }).catch(() => {}) // fire-and-forget
    }

    res.json({ success: true, sid: result.sid, status: result.status, body })
  } catch (err) {
    db.logSMS({
      type: 'manual', customerId: resolvedLocalId,
      phone: resolvedPhone, body, status: 'error', error: err.message, channel,
    })
    if (supabaseId && orgId) {
      sbClient.logMessage({
        organizationId: orgId, locationId: locationId || null,
        customerId: supabaseId, direction: 'outbound', channel, body,
        status: 'failed', errorMessage: err.message,
      }).catch(() => {})
    }
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

// ─── Email (Resend) ───────────────────────────────────────────────────────────

function buildEmailHtml(bodyText, storeName) {
  const escaped = bodyText
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#030e1e;padding:24px 32px;border-radius:10px 10px 0 0">
    <h1 style="margin:0;color:#f1f5f9;font-size:22px;font-weight:800">${storeName}</h1>
    <p style="margin:4px 0 0;color:#94a3b8;font-size:13px">Las Vegas, Nevada</p>
  </td></tr>
  <tr><td style="background:#ffffff;padding:32px;color:#1e293b;font-size:15px;line-height:1.7">
    ${escaped}
  </td></tr>
  <tr><td style="background:#f8fafc;padding:20px 32px;border-radius:0 0 10px 10px;border-top:1px solid #e2e8f0">
    <p style="margin:0;font-size:12px;color:#94a3b8">
      ${storeName} · 3663 Las Vegas Blvd, Las Vegas NV 89109<br>
      <a href="mailto:unsubscribe@perfumepassage.com?subject=Unsubscribe" style="color:#94a3b8">Unsubscribe</a>
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`
}

// POST /api/email/send
app.post('/api/email/send', async (req, res) => {
  const { to, firstName, subject, body, dryRun } = req.body || {}

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body are required' })
  }

  const storeName = process.env.BUSINESS_NAME || 'Perfume Passage'
  const html      = buildEmailHtml(body, storeName)

  if (dryRun) {
    return res.json({ success: true, id: 'dry-run', dryRun: true })
  }

  if (!resendClient) {
    return res.status(503).json({ error: 'Resend not configured. Add RESEND_API_KEY to server/.env and run: npm install resend' })
  }

  try {
    const result = await resendClient.emails.send({
      from:    RESEND_FROM,
      to:      [to],
      subject,
      html,
      text:    body,
    })
    if (result.error) {
      return res.status(400).json({ error: result.error.message || 'Resend error' })
    }
    res.json({ success: true, id: result.data?.id })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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

// ─── Twilio Webhook — inbound SMS ────────────────────────────────────────────
//
// Configure in Twilio console:
//   Phone Numbers → your number → Messaging → "A message comes in"
//   → Webhook → POST → https://your-server.com/api/webhooks/twilio/sms
//
// For local dev with ngrok:
//   npx ngrok http 3001
//   Then set the ngrok URL in Twilio console as webhook

app.post('/api/webhooks/twilio/sms', express.urlencoded({ extended: false }), createTwilioGuard({
  getConfig: () => ({ token: process.env.TWILIO_AUTH_TOKEN, url: process.env.TWILIO_SMS_WEBHOOK_URL }),
  validateRequest: require('twilio').validateRequest,
}), async (req, res) => {
  // Respond with empty TwiML immediately — Twilio requires fast response
  res.set('Content-Type', 'text/xml')
  res.send('<Response></Response>')

  const from = req.body?.From || ''
  const body = (req.body?.Body || '').trim().toUpperCase()

  if (!from) return

  const STOP_KEYWORDS   = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
  const OPTIN_KEYWORDS  = ['START', 'UNSTOP', 'YES']

  const phoneNorm = from.replace(/\D/g, '').slice(-10)
  const orgId     = process.env.ORG_ID

  if (!orgId) {
    console.warn('[Webhook] ORG_ID not set — cannot update consent status')
    return
  }

  // Log inbound message to Supabase regardless of keyword
  const customer = await sbClient.findCustomerByPhone(orgId, phoneNorm)

  if (customer) {
    // Log the inbound message
    sbClient.logMessage({
      organizationId: orgId,
      customerId:     customer.id,
      direction:      'inbound',
      channel:        'sms',
      body:           req.body?.Body || '',
      status:         'delivered',
    }).catch(() => {})

    if (STOP_KEYWORDS.includes(body)) {
      await sbClient.updateSmsConsent(customer.id, 'opted_out', 'reply')
      console.log(`[Webhook] STOP from ${from} — marked opted_out for customer ${customer.id} (${customer.first_name})`)
    } else if (OPTIN_KEYWORDS.includes(body)) {
      await sbClient.updateSmsConsent(customer.id, 'opted_in', 'reply')
      console.log(`[Webhook] START from ${from} — marked opted_in for customer ${customer.id}`)
    } else {
      console.log(`[Webhook] Inbound from ${from}: "${req.body?.Body?.slice(0, 60)}"`)
    }
  } else {
    console.log(`[Webhook] Inbound from ${from} — customer not found in org`)
  }
})

// ─── SMS Templates ────────────────────────────────────────────────────────────

// GET /api/sms/templates — returns current auto-message templates
app.get('/api/sms/templates', (_req, res) => {
  res.json(loadTemplates())
})

// PUT /api/sms/templates — saves template overrides
app.put('/api/sms/templates', (req, res) => {
  const { thank_you, tip, comeback, birthday } = req.body || {}
  const update = {}
  if (thank_you !== undefined) update.thank_you = thank_you
  if (tip       !== undefined) update.tip       = tip
  if (comeback  !== undefined) update.comeback  = comeback
  if (birthday  !== undefined) update.birthday  = birthday
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No template fields provided' })
  }
  try {
    const saved = saveTemplates(update)
    res.json(saved)
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

// ─── Cash Drawer kick ─────────────────────────────────────────────────────────
// Sends raw ESC/POS drawer-kick bytes (ESC p 0 25 250) directly to the Star
// printer via the Windows Spooler API (P/Invoke). This bypasses the driver's
// "Open before printing" setting — no slip printed, no dialog, no paper.
//
// Falls back to an error response if:
//   - not running on Windows
//   - no Star/TSP printer found
//   - PowerShell spawns an error

app.post('/api/drawer/kick', (_req, res) => res.status(410).json({ error: 'Use the local drawer server' }))

app.listen(PORT, HOST, () => {
  const automationEnabled = process.env.SMS_AUTOMATION_ENABLED === 'true'
  const testNumber        = process.env.SMS_TEST_NUMBER
  const rateLimit         = parseInt(process.env.SMS_RATE_LIMIT_PER_DAY) || 3
  const pendingCount      = db.getScheduledMessages().filter(m => m.status === 'pending').length

  let twilioStatus
  if (!twilioClient)  twilioStatus = 'DRY-RUN  (no credentials — nothing sends)'
  else if (testNumber) twilioStatus = `TEST MODE (all SMS → ${testNumber})`
  else                 twilioStatus = 'LIVE      (sends to real customers)'

  console.log('\n──────────────────────────────────────────────────────')
  console.log('  🧴  Perfume Passage CRM Server')
  console.log('──────────────────────────────────────────────────────')
  console.log(`  Port        : ${PORT}`)
  console.log(`  Twilio      : ${twilioStatus}`)
  console.log(`  Automation  : ${automationEnabled ? 'ENABLED  (auto-scheduler active)' : 'DISABLED (SMS_AUTOMATION_ENABLED=false)'}`)
  console.log(`  Rate limit  : ${rateLimit} SMS per customer per 24h`)
  console.log(`  Customers   : ${db.getAllCustomers().length}`)
  console.log(`  Pending SMS : ${pendingCount}`)
  console.log('──────────────────────────────────────────────────────\n')

  if (twilioClient && !testNumber && !automationEnabled) {
    console.warn('[Server] Twilio is LIVE but SMS_TEST_NUMBER is not set.')
    console.warn('[Server] Manual sends from the CRM will go to real customers.')
    console.warn('[Server] To test safely, set SMS_TEST_NUMBER=+1XXXXXXXXXX in .env\n')
  }

  scheduler.start()
})
