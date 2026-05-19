/**
 * scheduler.js — Automated SMS/WhatsApp message delivery
 *
 * Safety controls (all via .env):
 *   SMS_TEST_NUMBER       — when set, ALL sends go here instead of the real recipient
 *   SMS_AUTOMATION_ENABLED — must be 'true' for the hourly cron to auto-fire pending messages
 *                            Manual sends via /api/sms/send are NOT gated by this flag
 *
 * Runs every hour via node-cron when automation is enabled.
 */

const cron = require('node-cron')
const db   = require('./db')

let twilioClient  = null
let isConfigured  = false

function init(client) {
  twilioClient = client
  isConfigured = !!client
  console.log(`[Scheduler] Twilio ${isConfigured ? 'connected ✓' : 'NOT configured — SMS disabled (dry-run)'}`)
}

// ─── Test mode helper ─────────────────────────────────────────────────────────

/**
 * When SMS_TEST_NUMBER is set, returns that number and logs a warning.
 * Otherwise returns the real recipient number.
 */
function resolveRecipient(realPhone, channel = 'sms') {
  const testNum = process.env.SMS_TEST_NUMBER
  if (!testNum) return { phone: realPhone, isTest: false }
  const normalized = testNum.replace(/\D/g, '').slice(-10)
  console.warn(`[Scheduler] ⚠ TEST MODE — redirecting ${realPhone} → +1${normalized}`)
  return { phone: normalized, isTest: true }
}

// ─── Send a single message via Twilio ────────────────────────────────────────

/**
 * Send one SMS/WhatsApp via Twilio.
 * Respects SMS_TEST_NUMBER — in test mode all messages go to the test number.
 * Returns { sid, status, testMode } on success.
 * Throws on Twilio error — caller handles retry/logging.
 */
async function sendMessage(to, body, channel = 'sms') {
  if (!isConfigured) {
    console.log(`[Scheduler] (dry-run) Would send to ${to}: ${body.slice(0, 80)}...`)
    return { sid: 'dry-run', status: 'dry-run', testMode: false }
  }

  const { phone: effectivePhone, isTest } = resolveRecipient(to, channel)

  const fromNumber = channel === 'whatsapp'
    ? process.env.TWILIO_WHATSAPP_NUMBER
    : process.env.TWILIO_PHONE_NUMBER

  const digits = effectivePhone.replace(/\D/g, '').slice(-10)

  const toFormatted = channel === 'whatsapp'
    ? `whatsapp:+1${digits}`
    : `+1${digits}`

  const msg = await twilioClient.messages.create({ body, from: fromNumber, to: toFormatted })

  console.log(`[Scheduler] ✓ Sent${isTest ? ' (TEST)' : ''} → ${toFormatted} | SID: ${msg.sid}`)
  return { sid: msg.sid, status: msg.status, testMode: isTest }
}

// ─── Process pending messages ─────────────────────────────────────────────────

/**
 * Pick up all pending scheduled messages whose sendAt has passed and send them.
 * Gated by SMS_AUTOMATION_ENABLED — safe to call manually regardless.
 * Skips: customers not found, opted-out, already sent same type in last 48h.
 */
async function processPending(options = {}) {
  const automationEnabled = process.env.SMS_AUTOMATION_ENABLED === 'true'

  if (!options.force && !automationEnabled) {
    console.log('[Scheduler] Automation disabled (SMS_AUTOMATION_ENABLED != true) — skipping scheduled run')
    return { skipped: 0, sent: 0, failed: 0, reason: 'automation_disabled' }
  }

  const pending = db.getPendingMessages()
  if (pending.length === 0) return { skipped: 0, sent: 0, failed: 0 }

  console.log(`[Scheduler] Processing ${pending.length} pending message(s)...`)

  let sent = 0, failed = 0, skipped = 0

  for (const msg of pending) {
    const customer = db.findCustomerById(msg.customerId)

    if (!customer) {
      db.markMessageFailed(msg.id, 'Customer not found')
      failed++
      continue
    }

    // Duplicate guard — skip if same type already sent to this customer in last 48h
    if (db.wasSentRecently(msg.customerId, msg.type, 48)) {
      console.log(`[Scheduler] Skip duplicate ${msg.type} for ${customer.firstName} (already sent in last 48h)`)
      db.markMessageFailed(msg.id, 'duplicate_skip')
      skipped++
      continue
    }

    try {
      const result = await sendMessage(customer.phone, msg.body, msg.channel || 'sms')
      db.markMessageSent(msg.id)
      db.logSMS({
        type:       msg.type,
        customerId: msg.customerId,
        phone:      customer.phone,
        body:       msg.body,
        twilioSid:  result.sid,
        status:     result.status,
        channel:    msg.channel || 'sms',
        testMode:   result.testMode || false,
      })
      console.log(`[Scheduler] ✓ ${msg.type} → ${customer.firstName} ${customer.lastName}`)
      sent++
    } catch (err) {
      db.markMessageFailed(msg.id, err.message)
      db.logSMS({
        type:       msg.type,
        customerId: msg.customerId,
        phone:      customer.phone,
        body:       msg.body,
        status:     'error',
        error:      err.message,
        channel:    msg.channel || 'sms',
      })
      console.error(`[Scheduler] ✗ ${msg.type} → ${customer.phone}: ${err.message}`)
      failed++
    }
  }

  console.log(`[Scheduler] Done — sent: ${sent} | failed: ${failed} | skipped: ${skipped}`)
  return { sent, failed, skipped }
}

// ─── Schedule birthday reminders (run daily at 8am) ──────────────────────────

async function refreshBirthdaySchedules() {
  const { buildBirthdayDate, buildBirthday } = require('./messages')
  const customers = db.getAllCustomers()
  const scheduled = db.getScheduledMessages()

  for (const customer of customers) {
    if (!customer.birthday || !customer.marketingConsent) continue

    const bday = buildBirthdayDate(customer.birthday)
    if (!bday) continue

    const alreadyScheduled = scheduled.some(m =>
      m.customerId === customer.id &&
      m.type       === 'birthday'  &&
      m.status     === 'pending'   &&
      new Date(m.sendAt).getFullYear() === bday.getFullYear()
    )

    if (!alreadyScheduled) {
      const id = `msg_bday_${customer.id}_${bday.getFullYear()}`
      db.addScheduledMessage({
        id,
        customerId: customer.id,
        type:       'birthday',
        channel:    'sms',
        sendAt:     bday.toISOString(),
        body:       buildBirthday(customer.firstName),
        status:     'pending',
        createdAt:  new Date().toISOString(),
      })
      console.log(`[Scheduler] Scheduled birthday for ${customer.firstName} on ${bday.toDateString()}`)
    }
  }
}

// ─── Start cron jobs ──────────────────────────────────────────────────────────

function start() {
  const automationEnabled = process.env.SMS_AUTOMATION_ENABLED === 'true'

  // Run every hour at :05 — processPending() checks SMS_AUTOMATION_ENABLED internally
  cron.schedule('5 * * * *', async () => {
    console.log(`[Scheduler] Hourly tick — ${new Date().toLocaleTimeString()}`)
    await processPending()
  })

  // Refresh birthday schedules every day at 8:00am
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Daily birthday refresh...')
    await refreshBirthdaySchedules()
  })

  console.log(`[Scheduler] Cron started | Automation: ${automationEnabled ? '✓ ENABLED' : '⚠ DISABLED'}`)

  // Startup catch-up ONLY when automation is explicitly enabled
  // (prevents accidental mass send on first run with live Twilio credentials)
  if (automationEnabled) {
    setTimeout(() => processPending(), 5000)
    console.log('[Scheduler] Startup catch-up scheduled in 5s')
  }
}

module.exports = { init, start, processPending, sendMessage }
