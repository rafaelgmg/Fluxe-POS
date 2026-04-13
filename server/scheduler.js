/**
 * scheduler.js — Automated SMS/WhatsApp message delivery
 * Runs every hour via node-cron, sends all messages whose sendAt has passed.
 */

const cron = require('node-cron')
const db   = require('./db')

let twilioClient = null
let isConfigured = false

function init(client) {
  twilioClient  = client
  isConfigured  = !!client
  console.log(`[Scheduler] Twilio ${isConfigured ? 'connected ✓' : 'NOT configured — SMS disabled'}`)
}

// ─── Send a single message via Twilio ────────────────────────────────────────

async function sendMessage(to, body, channel = 'sms') {
  if (!isConfigured) {
    console.log(`[Scheduler] (dry-run) Would send to ${to}: ${body.slice(0, 60)}...`)
    return { sid: 'dry-run', status: 'dry-run' }
  }

  const fromNumber = channel === 'whatsapp'
    ? process.env.TWILIO_WHATSAPP_NUMBER
    : process.env.TWILIO_PHONE_NUMBER

  const toFormatted = channel === 'whatsapp'
    ? `whatsapp:${to.replace(/\D/g, '').startsWith('1') ? '+' : '+1'}${to.replace(/\D/g, '')}`
    : `+1${to.replace(/\D/g, '').slice(-10)}`

  const msg = await twilioClient.messages.create({
    body,
    from: fromNumber,
    to:   toFormatted,
  })

  return { sid: msg.sid, status: msg.status }
}

// ─── Process pending messages ─────────────────────────────────────────────────

async function processPending() {
  const pending = db.getPendingMessages()
  if (pending.length === 0) return

  console.log(`[Scheduler] Processing ${pending.length} pending message(s)...`)

  for (const msg of pending) {
    const customer = db.findCustomerById(msg.customerId)
    if (!customer) {
      db.markMessageFailed(msg.id, 'Customer not found')
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
      })
      console.log(`[Scheduler] ✓ Sent ${msg.type} to ${customer.firstName} ${customer.lastName} (${customer.phone})`)
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
      console.error(`[Scheduler] ✗ Failed ${msg.type} to ${customer.phone}: ${err.message}`)
    }
  }
}

// ─── Schedule birthday reminders (run daily at 8am) ──────────────────────────
// Birthday messages are already scheduled at upsert time,
// so processPending() handles them automatically.
// This daily check re-schedules birthdays for returning customers each year.

async function refreshBirthdaySchedules() {
  const { buildBirthdayDate, buildBirthday } = require('./messages')
  const customers = db.getAllCustomers()
  const scheduled = db.getScheduledMessages()

  for (const customer of customers) {
    if (!customer.birthday || !customer.marketingConsent) continue

    const bday = buildBirthdayDate(customer.birthday)
    if (!bday) continue

    // Check if there's already a pending birthday msg for this year
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
      console.log(`[Scheduler] Scheduled birthday msg for ${customer.firstName} on ${bday.toDateString()}`)
    }
  }
}

// ─── Start cron jobs ──────────────────────────────────────────────────────────

function start() {
  // Run every hour at :05 past the hour
  cron.schedule('5 * * * *', async () => {
    console.log(`[Scheduler] Hourly run — ${new Date().toLocaleTimeString()}`)
    await processPending()
  })

  // Refresh birthday schedules every day at 8:00am
  cron.schedule('0 8 * * *', async () => {
    console.log('[Scheduler] Daily birthday refresh...')
    await refreshBirthdaySchedules()
  })

  console.log('[Scheduler] Cron jobs started — checking every hour')

  // Run immediately on start to catch anything missed
  setTimeout(processPending, 3000)
}

module.exports = { init, start, processPending, sendMessage }
