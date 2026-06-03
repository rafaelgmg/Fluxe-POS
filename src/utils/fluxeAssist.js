/**
 * fluxeAssist.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Fluxe Assist — command interpreter for the POS assistant panel.
 *
 * Pure functions only — no React, no side-effects, no data writes.
 * All data is passed in as arguments; this module only reads.
 *
 * ── V1 Commands ───────────────────────────────────────────────────────────────
 *
 *  sales today         → employee's subtotal today
 *  spare today         → employee's spare generated today
 *  commission today    → commission earned today
 *  next tier           → current tier + how far to next threshold
 *  my rank             → employee rank by sales at this location today
 *  bonus               → auto + manual bonus for today
 *  competition bonus   → placement bonus across Sales/Spare/Hybrid tabs
 *  customers today     → CRM captures by this employee today
 *
 * ── Alias normalization ───────────────────────────────────────────────────────
 *
 *  "my bonus" / "bonus today" / "today bonus" → bonus
 *  "today sales" / "my sales"                → sales today
 *  "spare" / "today spare" / "my spare"      → spare today
 *  "rank" / "my ranking" / "rank today"      → my rank
 *  "tier" / "my tier" / "tier progress"      → next tier
 *  "comp bonus" / "placement bonus"          → competition bonus
 *  "leads today" / "my leads" / "captured"   → customers today
 *  "commission" / "my commission"            → commission today
 *
 * ────────────────────────────────────────────────────────────────────────────
 */

import { loadCommissionTiers } from './commissionTiersStorage'
import { getDayBonusResult } from './bonusEngine'
import { findBonusRule } from './bonusStorage'
import { calcDayCompetitionBonus } from './competitionBonusEngine'
import { calcPeriodCommissionFresh } from './commissionEngine'
import { localDateKey } from './dateUtils'
import { loadLocationConfig } from './locationConfig'

// ── Internal helpers ───────────────────────────────────────────────────────────

const fmt$ = (n) => `$${Number(n || 0).toFixed(2)}`

// ── Alias map: canonical → list of accepted variations ─────────────────────────

const ALIASES = {
  'sales today':        ['today sales', 'my sales', 'my sales today', 'daily sales', 'sales'],
  'spare today':        ['today spare', 'my spare', 'my spare today', 'daily spare', 'spare'],
  'commission today':   ['my commission', 'commission', 'today commission', 'my commission today'],
  'next tier':          ['tier', 'my tier', 'tier progress', 'commission tier', 'tiers'],
  'my rank':            ['rank', 'my ranking', 'ranking', 'rank today', 'my rank today'],
  'bonus':              ['my bonus', 'bonus today', 'today bonus', 'my bonus today', 'bonuses'],
  'competition bonus':  ['comp bonus', 'placement bonus', 'placement', 'comp ranking bonus', 'competition bonuses'],
  'customers today':    ['leads today', 'my leads', 'my customers', 'captured today', 'leads captured', 'customers', 'new clients', 'clients today'],
}

// ── Command parser ─────────────────────────────────────────────────────────────

/**
 * Normalize raw input to a canonical command key, or null if unrecognized.
 * @param {string} raw
 * @returns {string|null}
 */
export function parseCommand(raw) {
  if (!raw) return null
  const clean = raw.toLowerCase().trim().replace(/[?.!,]/g, '').replace(/\s+/g, ' ')

  for (const [canonical, aliases] of Object.entries(ALIASES)) {
    if (clean === canonical) return canonical
    if (aliases.includes(clean)) return canonical
  }
  // Contains fallback — catch partial phrases
  for (const [canonical] of Object.entries(ALIASES)) {
    if (clean.includes(canonical)) return canonical
  }
  return null
}

// ── Quick suggestions list ─────────────────────────────────────────────────────

/**
 * Return ordered list of quick-command chips for the UI.
 * @returns {{ cmd: string, label: string, emoji: string }[]}
 */
export function getCommandSuggestions() {
  return [
    { cmd: 'sales today',      label: 'Sales Today',    emoji: '💵' },
    { cmd: 'spare today',      label: 'Spare Today',    emoji: '💰' },
    { cmd: 'bonus',            label: 'Bonus',          emoji: '🎁' },
    { cmd: 'my rank',          label: 'My Rank',        emoji: '📊' },
    { cmd: 'next tier',        label: 'Next Tier',      emoji: '⚡' },
    { cmd: 'commission today', label: 'Commission',     emoji: '💎' },
    { cmd: 'competition bonus',label: 'Comp Bonus',     emoji: '🏆' },
    { cmd: 'customers today',  label: 'Customers',      emoji: '👥' },
  ]
}

// ── Command executor ───────────────────────────────────────────────────────────

/**
 * Run a canonical command and return a response object.
 *
 * @param {string|null} cmd     - canonical command key from parseCommand()
 * @param {object}      context
 * @param {object[]}    context.sales      - all sales (full array from useSales)
 * @param {object[]}    context.customers  - all customers (from useCRM)
 * @param {string}      context.empName    - logged-in employee full name
 * @param {string}      context.location   - current POS location name
 * @returns {{ lines: string[], type: 'ok'|'warn'|'info'|'error' }}
 */
export function runCommand(cmd, { sales = [], customers = [], empName, location }) {
  if (!cmd) {
    return {
      lines: ['Command not recognized.', 'Try: sales today, spare today, bonus, my rank, next tier'],
      type: 'error',
    }
  }

  if (!empName) {
    return { lines: ['No employee logged in.'], type: 'warn' }
  }

  const today = localDateKey()

  // ── Employee's valid sales today ──────────────────────────────────────────
  const myTodaySales = sales.filter(s => {
    if (s.status === 'deleted' || s.status === 'voided' || s.status === 'refunded') return false
    return s.employee === empName && localDateKey(s.timestamp) === today
  })

  // ── All valid sales today at this location (for ranking) ──────────────────
  const allTodayAtLoc = sales.filter(s => {
    if (s.status === 'deleted' || s.status === 'voided' || s.status === 'refunded') return false
    return s.location === location && localDateKey(s.timestamp) === today
  })

  // ─────────────────────────────────────────────────────────────────────────

  switch (cmd) {

    // ── Sales Today ──────────────────────────────────────────────────────────
    case 'sales today': {
      const total = myTodaySales.reduce((s, inv) => s + (inv.subtotal || 0), 0)
      const count = myTodaySales.length
      const avg   = count > 0 ? total / count : 0
      return {
        lines: [
          `Sales Today: ${fmt$(total)}`,
          `Transactions: ${count}${count > 0 ? `  ·  Avg ${fmt$(avg)}` : ''}`,
        ],
        type: total > 0 ? 'ok' : 'warn',
      }
    }

    // ── Spare Today ──────────────────────────────────────────────────────────
    case 'spare today': {
      const total = myTodaySales.reduce((s, inv) => s + (inv.totalSpare || 0), 0)
      const count = myTodaySales.filter(inv => (inv.totalSpare || 0) > 0).length
      return {
        lines: [
          `Spare Today: ${fmt$(total)}`,
          count > 0 ? `From ${count} sale${count !== 1 ? 's' : ''}` : 'No spare generated yet.',
        ],
        type: total > 0 ? 'ok' : 'warn',
      }
    }

    // ── Commission Today ─────────────────────────────────────────────────────
    case 'commission today': {
      try {
        const { totalCommission, dayTierMap } = calcPeriodCommissionFresh(myTodaySales)
        const tierInfo = Object.values(dayTierMap)[0]
        const tierLabel = tierInfo?.label || 'Below threshold'
        return {
          lines: [
            `Commission Today: ${fmt$(totalCommission)}`,
            `Tier: ${tierLabel}`,
          ],
          type: totalCommission > 0 ? 'ok' : 'info',
        }
      } catch {
        return { lines: ['Commission data unavailable.'], type: 'warn' }
      }
    }

    // ── Next Tier ────────────────────────────────────────────────────────────
    case 'next tier': {
      const subtotal = myTodaySales.reduce((s, inv) => s + (inv.subtotal || 0), 0)
      try {
        const tiers      = loadCommissionTiers()                                   // sorted highest-first
        const ascending  = [...tiers].sort((a, b) => a.threshold - b.threshold)
        const current    = tiers.find(t => subtotal >= t.threshold)               // highest matched
        const next       = ascending.find(t => t.threshold > subtotal)            // lowest unmet

        const lines = []
        if (current) {
          lines.push(`Current Tier: ${current.rate}%`)
          lines.push(`Today: ${fmt$(subtotal)} / ${fmt$(current.threshold)}+`)
        } else {
          lines.push(`No tier reached yet.  Today: ${fmt$(subtotal)}`)
        }
        if (next) {
          const remaining = next.threshold - subtotal
          lines.push(`Next: ${next.rate}% → ${fmt$(remaining)} remaining`)
        } else if (current) {
          lines.push('Maximum tier reached! 🎉')
        }
        return { lines, type: current ? 'ok' : 'info' }
      } catch {
        return { lines: ['Tier data unavailable.'], type: 'warn' }
      }
    }

    // ── My Rank ──────────────────────────────────────────────────────────────
    case 'my rank': {
      const empTotals = {}
      for (const s of allTodayAtLoc) {
        if (!empTotals[s.employee]) empTotals[s.employee] = 0
        empTotals[s.employee] += s.subtotal || 0
      }

      const ranked = Object.entries(empTotals).sort(([, a], [, b]) => b - a)
      const idx    = ranked.findIndex(([n]) => n === empName)

      if (idx === -1) {
        return { lines: ['No sales at this location today.'], type: 'warn' }
      }

      const rank    = idx + 1
      const myTotal = empTotals[empName] || 0
      const medal   = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`

      const lines = [
        `Sales Rank: ${medal}  (${rank} of ${ranked.length})`,
        `Your Sales: ${fmt$(myTotal)}`,
      ]
      if (rank > 1) {
        const above = ranked[idx - 1]
        lines.push(`${fmt$(above[1] - myTotal)} behind ${above[0].split(' ')[0]}`)
      }

      return { lines, type: rank <= 3 ? 'ok' : 'info' }
    }

    // ── Bonus ────────────────────────────────────────────────────────────────
    case 'bonus': {
      const subtotal  = myTodaySales.reduce((s, inv) => s + (inv.subtotal || 0), 0)
      try {
        const result    = getDayBonusResult(subtotal, today, location, empName)
        const bonusRule = findBonusRule(today, location)
        const lines     = []

        if (!bonusRule || !bonusRule.tiers || bonusRule.tiers.length === 0) {
          lines.push(`Total Bonus: ${fmt$(result.finalBonus)}`)
          lines.push('No bonus rule configured for today.')
          return { lines, type: 'info' }
        }

        // All tiers sorted ascending so they display lowest → highest
        const tiers = [...bonusRule.tiers].sort((a, b) => a.threshold - b.threshold)

        // Primary line — total earned so far
        lines.push(`Total Bonus: ${fmt$(result.finalBonus)}`)
        lines.push(`Today: ${fmt$(subtotal)}`)

        // One line per tier — checkmark if reached, circle + distance if not
        for (const t of tiers) {
          if (subtotal >= t.threshold) {
            lines.push(`✓ Sell ${fmt$(t.threshold)}+ → +${fmt$(t.bonusAmount)}`)
          } else {
            const away = t.threshold - subtotal
            lines.push(`○ Sell ${fmt$(t.threshold)}+ → +${fmt$(t.bonusAmount)}  (${fmt$(away)} away)`)
          }
        }

        // Manual adjustment at the bottom if present
        if (result.manualBonus !== 0) {
          const note = result.manualNote ? `  (${result.manualNote})` : ''
          lines.push(`Manual Adj.: ${fmt$(result.manualBonus)}${note}`)
        }

        return { lines, type: result.finalBonus > 0 ? 'ok' : 'info' }
      } catch {
        return { lines: ['Bonus data unavailable.'], type: 'warn' }
      }
    }

    // ── Competition Bonus ────────────────────────────────────────────────────
    case 'competition bonus': {
      try {
        let hybridMult = 1.0
        try {
          const cfg  = loadLocationConfig(location)
          hybridMult = Number(cfg?.competitionHybridMultiplier ?? 1.0)
        } catch {}

        const result = calcDayCompetitionBonus(empName, today, location, allTodayAtLoc, hybridMult)
        const lines  = []
        if (result.salesRank)  lines.push(`📊 Sales Rank #${result.salesRank}  →  ${fmt$(result.salesBonus)}`)
        if (result.spareRank)  lines.push(`💰 Spare Rank #${result.spareRank}  →  ${fmt$(result.spareBonus)}`)
        if (result.hybridRank) lines.push(`⚡ Hybrid Rank #${result.hybridRank}  →  ${fmt$(result.hybridBonus)}`)
        lines.push(`Competition Bonus: ${fmt$(result.totalCompBonus)}`)
        if (result.totalCompBonus === 0) lines.push('No competition bonus configured or not ranked.')
        return { lines, type: result.totalCompBonus > 0 ? 'ok' : 'info' }
      } catch {
        return { lines: ['Competition bonus data unavailable.'], type: 'warn' }
      }
    }

    // ── Customers Today ──────────────────────────────────────────────────────
    case 'customers today': {
      const captured = customers.filter(c => {
        if (c.archived) return false
        const capturedBy = c.capturedBy || c.purchases?.[0]?.seller
        if (capturedBy !== empName) return false
        const ts = c.capturedAt || c.createdAt
        return ts ? localDateKey(ts) === today : false
      })

      const names = captured.slice(0, 3).map(c =>
        [c.firstName, c.lastName].filter(Boolean).join(' ') || c.phone || '(no name)'
      )

      return {
        lines: [
          `Customers Captured Today: ${captured.length}`,
          ...names.map(n => `  · ${n}`),
          ...(captured.length > 3 ? [`  … and ${captured.length - 3} more`] : []),
          ...(captured.length === 0 ? ['No captures logged today.'] : []),
        ],
        type: captured.length > 0 ? 'ok' : 'info',
      }
    }

    default:
      return {
        lines: ['Command not recognized.', 'Try: sales today, spare today, bonus, my rank, next tier'],
        type: 'error',
      }
  }
}
