/**
 * messages.js — SMS/WhatsApp message templates
 * All automated sequences for Perfume Passage CRM
 */

const BUSINESS = process.env.BUSINESS_NAME || 'Perfume Passage'
const LOCATION = process.env.LOCATION_NAME || 'Miracle Mall 01'

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

// ─── Template builders ────────────────────────────────────────────────────────

function buildThankYou(name, product) {
  return (
    `Hi ${name}! 🧴 Thank you for visiting ${BUSINESS} at ${LOCATION}. ` +
    `We hope you're loving your ${product}! ` +
    `Any questions about your fragrance, just reply here. ` +
    `Reply STOP to unsubscribe.`
  )
}

function buildTip(name, product, pref) {
  const tips = {
    'Floral':             'Try layering it with an unscented lotion to make it last all day!',
    'Fresh / Aquatic':    'Apply right after a shower for the freshest effect — it will last longer.',
    'Woody':              'Spray on your wrists and neck — woody notes bloom beautifully with body heat.',
    'Oriental / Oud':     'A little goes a long way with oud — 2 sprays is perfect for all day wear.',
    'Citrus':             'Citrus notes are great for mornings — try it before your next event!',
    'Sweet / Gourmand':   'Layer your scent with a matching body wash for an even sweeter effect.',
    'Spicy':              'Spicy fragrances last longest on skin — pulse points are your best friend.',
    'Unisex / Niche':     'Niche fragrances are meant to be personal — wear it your way!',
  }
  const tip = pref && tips[pref] ? tips[pref] : 'Apply to pulse points (wrists, neck) for the best scent experience!'

  return (
    `Hi ${name}! 💡 Quick tip for your ${product}: ${tip} ` +
    `Visit us at ${BUSINESS} anytime for more personalized recommendations. ` +
    `Reply STOP to unsubscribe.`
  )
}

function buildComeback(name, pref) {
  const prefLine = pref
    ? `We have new arrivals in ${pref} that we think you'll love. `
    : `We have exciting new arrivals you need to check out. `

  return (
    `Hi ${name}! 🌟 It's been a month since your last visit to ${BUSINESS}. ` +
    prefLine +
    `Come see us at ${LOCATION} — mention this text for a special surprise! ` +
    `Reply STOP to unsubscribe.`
  )
}

function buildBirthday(name) {
  return (
    `Happy Birthday ${name}! 🎂🧴 ` +
    `The whole team at ${BUSINESS} wishes you an amazing day. ` +
    `Come visit us and we'll have a special birthday treat for you! ` +
    `Reply STOP to unsubscribe.`
  )
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
}
