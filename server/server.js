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

app.post('/api/webhooks/twilio/sms', express.urlencoded({ extended: false }), async (req, res) => {
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

app.post('/api/drawer/kick', (req, res) => {
  const { location = 'unknown' } = req.body || {}
  const TAG = '[CashDrawer]'

  if (process.platform !== 'win32') {
    console.log(`${TAG} Location: ${location} → non-Windows — skipping`)
    return res.json({ ok: false, error: 'non-Windows platform' })
  }

  const { spawn }  = require('child_process')
  const fs         = require('fs')
  const os         = require('os')
  const path       = require('path')

  // PowerShell: find Star/TSP printer → send raw ESC/POS via Win32 Spooler API
  const psScript = `
$ErrorActionPreference = 'Stop'

# Find first Star/TSP printer installed on this machine
$printerName = (Get-Printer | Where-Object { $_.Name -match 'Star|TSP' } | Select-Object -First 1).Name
if (-not $printerName) {
  Write-Error "No Star/TSP printer found"
  exit 2
}

# Win32 Spooler API via inline C# (P/Invoke)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrint {
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA",    CharSet=CharSet.Ansi)] public static extern bool   OpenPrinter   (string n, ref IntPtr h, IntPtr d);
    [DllImport("winspool.drv", EntryPoint="ClosePrinter")]                          public static extern bool   ClosePrinter  (IntPtr h);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA",CharSet=CharSet.Ansi)] public static extern int    StartDocPrinter(IntPtr h, int l, ref DOC di);
    [DllImport("winspool.drv", EntryPoint="EndDocPrinter")]                         public static extern bool   EndDocPrinter (IntPtr h);
    [DllImport("winspool.drv", EntryPoint="StartPagePrinter")]                      public static extern bool   StartPagePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint="EndPagePrinter")]                        public static extern bool   EndPagePrinter(IntPtr h);
    [DllImport("winspool.drv", EntryPoint="WritePrinter")]                          public static extern bool   WritePrinter  (IntPtr h, IntPtr p, int c, ref int w);
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public struct DOC {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDatatype;
    }
}
"@ -PassThru | Out-Null

# ESC p 0 25 250 — standard cash drawer kick (drawer 1)
$bytes = [byte[]](0x1b, 0x70, 0x00, 0x19, 0xfa)

$handle = [IntPtr]::Zero
if (-not [RawPrint]::OpenPrinter($printerName, [ref]$handle, [IntPtr]::Zero)) {
  Write-Error "OpenPrinter failed: $printerName"
  exit 3
}

$doc           = New-Object RawPrint+DOC
$doc.pDocName  = "fluxe-drawer-kick"
$doc.pDatatype = "RAW"

$docId = [RawPrint]::StartDocPrinter($handle, 1, [ref]$doc)
if ($docId -le 0) {
  [RawPrint]::ClosePrinter($handle) | Out-Null
  Write-Error "StartDocPrinter failed"
  exit 4
}

[RawPrint]::StartPagePrinter($handle) | Out-Null
$ptr     = [System.Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
[System.Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
$written = 0
[RawPrint]::WritePrinter($handle, $ptr, $bytes.Length, [ref]$written) | Out-Null
[System.Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
[RawPrint]::EndPagePrinter($handle)  | Out-Null
[RawPrint]::EndDocPrinter($handle)   | Out-Null
[RawPrint]::ClosePrinter($handle)    | Out-Null

Write-Output "OK:$printerName:$written"
`

  const tmpFile = path.join(os.tmpdir(), `fluxe_drawer_${Date.now()}.ps1`)

  try {
    fs.writeFileSync(tmpFile, psScript, 'utf8')
  } catch (e) {
    console.error(`${TAG} Failed to write PS script:`, e.message)
    return res.json({ ok: false, error: e.message })
  }

  let responded = false
  const safeReply = (payload) => {
    if (responded) return
    responded = true
    try { fs.unlinkSync(tmpFile) } catch {}
    res.json(payload)
  }

  const proc = spawn('powershell', [
    '-ExecutionPolicy', 'Bypass',
    '-NoProfile',
    '-NonInteractive',
    '-File', tmpFile,
  ])

  let stdout = '', stderr = ''
  proc.stdout.on('data', d => { stdout += d.toString() })
  proc.stderr.on('data', d => { stderr += d.toString() })

  proc.on('close', code => {
    const out = stdout.trim()
    if (code === 0 && out.startsWith('OK:')) {
      const parts      = out.split(':')
      const printer    = parts[1] || 'unknown'
      const bytesWrote = parts[2] || '?'
      console.log(`${TAG} Location: ${location} → ESC/POS raw sent → printer: "${printer}" → bytes: ${bytesWrote}`)
      safeReply({ ok: true, printer, bytes: Number(bytesWrote) })
    } else {
      const errMsg = stderr.trim() || `exit ${code}`
      console.error(`${TAG} Location: ${location} → raw kick FAILED → ${errMsg}`)
      safeReply({ ok: false, error: errMsg, code })
    }
  })

  proc.on('error', e => {
    console.error(`${TAG} spawn error:`, e.message)
    safeReply({ ok: false, error: e.message })
  })

  // 10-second failsafe
  setTimeout(() => {
    if (!responded) { proc.kill(); safeReply({ ok: false, error: 'timeout' }) }
  }, 10_000)
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
