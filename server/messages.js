/**
 * messages.js — SMS/WhatsApp message templates
 * All automated sequences for Perfume Passage CRM
 */

const fs   = require('fs')
const path = require('path')

const BUSINESS = process.env.BUSINESS_NAME || 'Perfume Passage'
const LOCATION = process.env.LOCATION_NAME || 'Miracle Mall 01'

const TEMPLATE_PATH = path.join(__dirname, 'data', 'sms_templates.json')

const DEFAULT_TEMPLATES = {
  thank_you: `Hi {first_name}! 🧴 Thank you for visiting {store} at {location}. We hope you're loving your {product}! Any questions about your fragrance, just reply here. Reply STOP to unsubscribe.`,
  tip:       `Hi {first_name}! 💡 Quick tip for your {product}: {fragrance_tip} Visit us at {store} anytime for more personalized recommendations. Reply STOP to unsubscribe.`,
  comeback:  `Hi {first_name}! 🌟 It's been a month since your last visit to {store}. {pref_line}Come see us at {location} — mention this text for a special surprise! Reply STOP to unsubscribe.`,
  birthday:  `Happy Birthday {first_name}! 🎂🧴 The whole team at {store} wishes you an amazing day. Come visit us and we'll have a special birthday treat for you! Reply STOP to unsubscribe.`,
}

function loadTemplates() {
  try {
    const raw    = fs.readFileSync(TEMPLATE_PATH, 'utf8')
    const stored = JSON.parse(raw)
    return { ...DEFAULT_TEMPLATES, ...stored }
  } catch {
    return { ...DEFAULT_TEMPLATES }
  }
}

function saveTemplates(templates) {
  const merged = { ...DEFAULT_TEMPLATES, ...templates }
  fs.writeFileSync(TEMPLATE_PATH, JSON.stringify(merged, null, 2), 'utf8')
  return merged
}

/**
 * Build the list of scheduled messages for a new customer/purchase.
 * Returns array of { type, sendAt, body } objects.
 */
function buildScheduledMessages(customer, invoice) {
  const firstName = customer.firstName
  const pref      = customer.fragrancePreference
  const products  = (invoice.items || [])
    .filter(i => i.qty > 0)
    .map(i => i.product?.name || i.name)
    .filter(Boolean)
  const mainProduct = products[0] || 'your new fragrance'

  const now = new Date(invoice.timestamp || Date.now())
  const messages = []

  // Only send if marketing consent given
  if (!customer.marketingConsent) return messages

  // ── D+1: Thank you ───────────────────────────────────────────────────────
  const d1 = new Date(now)
  d1.setDate(d1.getDate() + 1)
  d1.setHours(11, 0, 0, 0) // 11am

  messages.push({
    type:   'thank_you',
    sendAt: d1.toISOString(),
    body:   buildThankYou(firstName, mainProduct),
  })

  // ── D+7: Fragrance tip / recommendation ──────────────────────────────────
  const d7 = new Date(now)
  d7.setDate(d7.getDate() + 7)
  d7.setHours(11, 0, 0, 0)

  messages.push({
    type:   'tip',
    sendAt: d7.toISOString(),
    body:   buildTip(firstName, mainProduct, pref),
  })

  // ── D+30: Come back offer ────────────────────────────────────────────────
  const d30 = new Date(now)
  d30.setDate(d30.getDate() + 30)
  d30.setHours(11, 0, 0, 0)

  messages.push({
    type:   'comeback',
    sendAt: d30.toISOString(),
    body:   buildComeback(firstName, pref),
  })

  // ── Birthday (if provided) ───────────────────────────────────────────────
  if (customer.birthday) {
    const bday = buildBirthdayDate(customer.birthday)
    if (bday) {
      messages.push({
        type:   'birthday',
        sendAt: bday.toISOString(),
        body:   buildBirthday(firstName),
      })
    }
  }

  return messages
}

// ─── Fragrance-specific tip texts (not user-editable, used as {fragrance_tip}) ─

const FRAGRANCE_TIPS = {
  'Floral':           'Try layering it with an unscented lotion to make it last all day!',
  'Fresh / Aquatic':  'Apply right after a shower for the freshest effect — it will last longer.',
  'Woody':            'Spray on your wrists and neck — woody notes bloom beautifully with body heat.',
  'Oriental / Oud':   'A little goes a long way with oud — 2 sprays is perfect for all day wear.',
  'Citrus':           'Citrus notes are great for mornings — try it before your next event!',
  'Sweet / Gourmand': 'Layer your scent with a matching body wash for an even sweeter effect.',
  'Spicy':            'Spicy fragrances last longest on skin — pulse points are your best friend.',
  'Unisex / Niche':   'Niche fragrances are meant to be personal — wear it your way!',
}

// ─── Template builders ────────────────────────────────────────────────────────

function buildThankYou(name, product) {
  const tpl = loadTemplates().thank_you
  return tpl
    .replace(/{first_name}/g, name)
    .replace(/{product}/g,    product || 'your new fragrance')
    .replace(/{store}/g,      BUSINESS)
    .replace(/{location}/g,   LOCATION)
}

function buildTip(name, product, pref) {
  const fragranceTip = (pref && FRAGRANCE_TIPS[pref]) || 'Apply to pulse points (wrists, neck) for the best scent experience!'
  const tpl = loadTemplates().tip
  return tpl
    .replace(/{first_name}/g,    name)
    .replace(/{product}/g,       product || 'your fragrance')
    .replace(/{fragrance_tip}/g, fragranceTip)
    .replace(/{store}/g,         BUSINESS)
    .replace(/{location}/g,      LOCATION)
}

function buildComeback(name, pref) {
  const prefLine = pref
    ? `We have new arrivals in ${pref} that we think you'll love. `
    : `We have exciting new arrivals you need to check out. `
  const tpl = loadTemplates().comeback
  return tpl
    .replace(/{first_name}/g, name)
    .replace(/{pref_line}/g,  prefLine)
    .replace(/{store}/g,      BUSINESS)
    .replace(/{location}/g,   LOCATION)
}

function buildBirthday(name) {
  const tpl = loadTemplates().birthday
  return tpl
    .replace(/{first_name}/g, name)
    .replace(/{store}/g,      BUSINESS)
    .replace(/{location}/g,   LOCATION)
}

/**
 * Calculates next birthday date (this year or next year).
 * Returns a Date set to 9am on the birthday, or null if invalid.
 */
function buildBirthdayDate(birthdayStr) {
  try {
    const [, month, day] = birthdayStr.split('-').map(Number)
    const now  = new Date()
    let year   = now.getFullYear()
    let bday   = new Date(year, month - 1, day, 9, 0, 0, 0)
    // If birthday already passed this year, schedule for next year
    if (bday <= now) {
      year += 1
      bday = new Date(year, month - 1, day, 9, 0, 0, 0)
    }
    return bday
  } catch {
    return null
  }
}

/**
 * One-off immediate message body (used by manual "Send SMS" button in CRM)
 */
function buildManualMessage(name, customText) {
  return `Hi ${name}! ${customText}\n\n— ${BUSINESS} | Reply STOP to unsubscribe.`
}

module.exports = {
  buildScheduledMessages,
  buildManualMessage,
  buildThankYou,
  buildTip,
  buildComeback,
  buildBirthday,
  loadTemplates,
  saveTemplates,
  DEFAULT_TEMPLATES,
}
