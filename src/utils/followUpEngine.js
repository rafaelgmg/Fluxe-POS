/**
 * followUpEngine.js — Fluxe Service Mode
 *
 * Derives the follow-up list from existing appointment + service + client data.
 * No separate "follow-up" records to manage — everything is computed on demand.
 *
 * Also exports `generateFollowUpMessage` for local message template generation.
 */

import { loadAppointments } from './appointmentsStorage'
import { loadServices }     from './serviceStorage'
import { loadServiceClients } from './serviceClientsStorage'

// ── Date helpers ──────────────────────────────────────────────────────────────

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + n)
  return date.toISOString().slice(0, 10)
}

/** Positive = toStr is in the future relative to fromStr */
export function dateDiffDays(fromStr, toStr) {
  const a = new Date(fromStr + 'T00:00:00')
  const b = new Date(toStr  + 'T00:00:00')
  return Math.round((b - a) / 86_400_000)
}

// ── Status derivation ─────────────────────────────────────────────────────────

function deriveStatus(apptStatus, nextReturnDate) {
  if (apptStatus === 'no_show') return 'no_show'
  if (!nextReturnDate) return null // no return interval — excluded from list

  const today = new Date().toISOString().slice(0, 10)
  if (nextReturnDate < today)  return 'overdue'
  if (nextReturnDate === today) return 'due_today'
  return 'upcoming'
}

// ── Main derivation ───────────────────────────────────────────────────────────

/**
 * Returns an array of follow-up items derived from completed + no_show appointments.
 *
 * Rules:
 *  - Completed appointments: only included if the linked service has return_interval_days > 0
 *  - No-show appointments: always included (recovery logic)
 *  - One item per client — the most recent qualifying appointment
 */
export function deriveFollowUpList() {
  const today     = new Date().toISOString().slice(0, 10)
  const appts     = loadAppointments().filter(a => a.type === 'service')
  const svcMap    = Object.fromEntries(loadServices().map(s => [s.id, s]))
  const clientMap = Object.fromEntries(loadServiceClients().map(c => [c.id, c]))

  // Candidates: completed (with return interval) or no_show
  const candidates = appts.filter(a => {
    if (a.status === 'no_show') return true
    if (a.status !== 'completed') return false
    const svc = svcMap[a.serviceId]
    return (svc?.return_interval_days ?? 0) > 0
  })

  // Group by clientId — keep only the most recent appointment per client
  const byClient = {}
  candidates
    .slice()
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')))
    .forEach(appt => {
      if (!byClient[appt.clientId]) byClient[appt.clientId] = appt
    })

  // Map to follow-up items
  return Object.values(byClient).map(appt => {
    const client = clientMap[appt.clientId] || {}
    const svc    = svcMap[appt.serviceId]   || {}

    // next_return_date: stored on appointment (set when status → completed)
    // or computed dynamically as fallback
    let nextReturnDate = appt.nextReturnDate
    if (!nextReturnDate && appt.status === 'completed' && svc.return_interval_days && appt.date) {
      nextReturnDate = addDays(appt.date, svc.return_interval_days)
    }

    const status = deriveStatus(appt.status, nextReturnDate)
    if (status === null) return null  // no interval — skip

    const daysSince = appt.date ? dateDiffDays(appt.date, today) : null
    const daysUntil = nextReturnDate ? dateDiffDays(today, nextReturnDate) : null // negative = overdue

    return {
      clientId:      appt.clientId,
      clientName:    appt.clientName  || client.name  || '—',
      phone:         client.phone     || '',
      instagram:     client.instagram || '',
      notes:         client.notes     || '',
      serviceName:   appt.serviceName || svc.name     || '—',
      serviceId:     appt.serviceId,
      lastVisit:     appt.date,
      nextReturnDate,
      status,
      daysSince,   // how many days since last visit (always >= 0)
      daysUntil,   // positive = future, negative = overdue by that many days
      apptId:        appt.id,
    }
  }).filter(Boolean)
}

// ── Message generation ────────────────────────────────────────────────────────

/**
 * Generates a natural, friendly follow-up message using local templates.
 * No external API — reads status + timing to pick the right tone.
 */
export function generateFollowUpMessage({ clientName, serviceName, status, daysSince, daysUntil }) {
  const first = (clientName || 'there').trim().split(' ')[0]
  const svc   = serviceName || 'your last service'

  if (status === 'no_show') {
    return (
      `Hey ${first}! We noticed you weren't able to make it to your ${svc} appointment — ` +
      `no worries at all, life happens! We'd love to reschedule whenever you're ready. ` +
      `Just reach out and we'll get you taken care of 💛`
    )
  }

  if (status === 'overdue') {
    const n = Math.abs(daysUntil ?? 0)
    const timeDesc =
      n >= 60 ? 'a couple of months' :
      n >= 30 ? 'about a month'      :
      n >= 14 ? 'a couple of weeks'  :
      n >= 7  ? 'about a week'       :
      `${n} day${n !== 1 ? 's' : ''}`

    return (
      `Hey ${first}! It's been ${timeDesc} since your ${svc} was due for a refresh. ` +
      `Whenever you're ready, we'd love to get you back in — just send a message or give us a call 🌟`
    )
  }

  if (status === 'due_today') {
    return (
      `Hi ${first}! Your ${svc} is due for a fresh touch-up today — perfect timing! ` +
      `Give us a call or shoot us a message and we'll get you booked right away 💫`
    )
  }

  // upcoming
  const n = daysUntil ?? 7
  if (n <= 5) {
    return (
      `Hi ${first}, your ${svc} is coming up in just ${n} day${n !== 1 ? 's' : ''}! ` +
      `Let's lock in your appointment before your favorite time slot gets taken 😊`
    )
  }
  return (
    `Hey ${first}! Hope you've been loving your ${svc}. ` +
    `When you're ready for a refresh, we're here — feel free to book anytime ✨`
  )
}
