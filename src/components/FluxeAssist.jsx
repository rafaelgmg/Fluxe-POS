/**
 * FluxeAssist.jsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Fluxe Assist — lightweight command panel for seller quick-queries.
 *
 * Props:
 *  onClose    {function}  — close the panel
 *  sales      {object[]}  — all sales from useSales
 *  customers  {object[]}  — all customers from useCRM
 *  empName    {string}    — current logged-in employee name
 *  location   {string}    — current POS location name
 *
 * ── V1 UX improvements ───────────────────────────────────────────────────────
 *
 *  - formatLines()   — adds time context to response strings ("so far", etc.)
 *  - splitPrimary()  — splits "Label: $Value" for visual hierarchy
 *  - CMD_ACCENT      — per-command accent color
 *  - CMD_CONTEXT     — per-command context badge text
 *
 *  ⚠  No logic changes — parseCommand / runCommand / handlers are untouched.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useState, useRef, useEffect } from 'react'
import { parseCommand, runCommand, getCommandSuggestions } from '../utils/fluxeAssist'
import { fetchBonusRules } from '../services/supabaseBonusRules'

// ── Design tokens ──────────────────────────────────────────────────────────────
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const TEXT   = '#f1f5f9'
const MUTED  = '#94a3b8'
const DIM    = '#cbd0e0'
const GREEN  = '#22c55e'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'

// ── Per-command accent colors ──────────────────────────────────────────────────
const CMD_ACCENT = {
  'sales today':        '#60a5fa',  // blue
  'spare today':        '#f59e0b',  // amber
  'commission today':   '#a78bfa',  // purple
  'next tier':          '#facc15',  // yellow
  'my rank':            '#c084fc',  // violet
  'bonus':              '#22c55e',  // green
  'competition bonus':  '#f97316',  // orange
  'customers today':    '#06b6d4',  // cyan
}

// ── Context badges shown below command echo ────────────────────────────────────
const CMD_CONTEXT = {
  'sales today':        'Current shift · today',
  'spare today':        'Current shift · today',
  'commission today':   'Earnings so far today',
  'next tier':          'Commission tier progress',
  'my rank':            'Live ranking · this location',
  'bonus':              'Bonus accumulated so far',
  'competition bonus':  'Placement bonus · today',
  'customers today':    'CRM captures · today',
}

// ── Type fallback colors (when canonicalCmd has no accent) ─────────────────────
const TYPE_COLOR = { ok: GREEN, info: BLUE, warn: AMBER, error: RED }

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Add time-context to known first-line strings without touching runCommand.
 * Only the first line of each response receives context additions.
 */
function formatLines(lines, canonicalCmd) {
  if (!lines || !canonicalCmd) return lines
  return lines.map((line, i) => {
    if (i !== 0) return line
    switch (canonicalCmd) {
      case 'sales today':
        return line.replace('Sales Today:', 'Sales Today (current shift):')
      case 'spare today':
        return line.replace('Spare Today:', 'Spare Today (current shift):')
      case 'commission today':
        return line.replace('Commission Today:', 'Commission Today (so far):')
      case 'bonus':
        return line.replace('Total Bonus:', 'Total Bonus (so far):')
      case 'next tier':
        // "No tier reached yet. Today: $X" → "No tier reached yet (today): $X"
        return line.replace('No tier reached yet.  Today:', 'No tier reached yet · today:')
      default:
        return line
    }
  })
}

/**
 * Split "Label: $Value" → { label, value } for big-value rendering.
 * Falls back to { label: null, value: line } when pattern doesn't match.
 */
function splitPrimary(line) {
  const idx = line.indexOf(': ')
  if (idx === -1) return { label: null, value: line }
  const label = line.slice(0, idx)
  const value = line.slice(idx + 2).trim()
  // Treat as splittable if value is a dollar amount, rank symbol, or number
  if (/^[\$#🥇🥈🥉\d]/.test(value)) return { label, value }
  return { label: null, value: line }
}

// ── Suggestions (chips) ────────────────────────────────────────────────────────
const SUGGESTIONS = getCommandSuggestions()

// ─────────────────────────────────────────────────────────────────────────────
export default function FluxeAssist({ onClose, sales, customers, empName, location }) {
  const [input,   setInput]   = useState('')
  const [result,  setResult]  = useState(null)   // { lines, type, cmd, canonicalCmd } | null
  const [history, setHistory] = useState([])
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  // Sync bonus rules from Supabase whenever Assist opens so findBonusRule() has fresh data
  useEffect(() => { fetchBonusRules() }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // ── execute ──────────────────────────────────────────────────────────────────
  // Stores canonicalCmd alongside the response for formatting & coloring.
  // parseCommand / runCommand are called unchanged.
  const execute = (rawInput) => {
    const text = (rawInput || input).trim()
    if (!text) return

    const canonicalCmd = parseCommand(text)
    const res = runCommand(canonicalCmd, { sales, customers, empName, location })

    setResult({ ...res, cmd: text, canonicalCmd })
    setInput('')

    setHistory(prev => {
      const filtered = prev.filter(h => h !== text)
      return [text, ...filtered].slice(0, 5)
    })
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter') execute() }

  // ── Derived display values ────────────────────────────────────────────────────
  const accent  = result ? (CMD_ACCENT[result.canonicalCmd] || TYPE_COLOR[result.type] || BLUE) : BLUE
  const context = result ? CMD_CONTEXT[result.canonicalCmd] : null
  const fmtLines = result ? formatLines(result.lines, result.canonicalCmd) : []

  // Split first line into label + primary value for hierarchy rendering
  const primary = fmtLines.length > 0 ? splitPrimary(fmtLines[0]) : null
  const restLines = fmtLines.slice(1)

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Invisible backdrop — click anywhere to close */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1050 }} />

      {/* Panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 58, right: 16,
          width: 384,
          zIndex: 1051,
          background: `linear-gradient(160deg, #0d1829 0%, ${PANEL} 100%)`,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.75), 0 0 0 1px rgba(37,99,235,0.07) inset',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 14px',
          background: CARD,
          borderBottom: `1px solid ${BORDER}`,
        }}>
          <div style={{
            width: 26, height: 26,
            background: 'linear-gradient(135deg, rgba(37,99,235,0.22), rgba(139,92,246,0.22))',
            border: '1px solid rgba(37,99,235,0.28)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
          }}>✨</div>
          <div style={{ flex: 1 }}>
            <span style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>Fluxe Assist</span>
            {empName && (
              <span style={{ color: MUTED, fontSize: 10, marginLeft: 8 }}>· {empName}</span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5,
              color: MUTED, fontSize: 15, cursor: 'pointer',
              width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s', lineHeight: 1,
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >×</button>
        </div>

        {/* ── Quick chips — per-command accent color on hover ── */}
        <div style={{
          display: 'flex', gap: 5, flexWrap: 'wrap',
          padding: '9px 12px 7px',
          borderBottom: `1px solid ${BORDER}`,
        }}>
          {SUGGESTIONS.map(s => {
            const chipAccent = CMD_ACCENT[s.cmd] || '#60a5fa'
            const isActive   = result?.canonicalCmd === s.cmd
            return (
              <button
                key={s.cmd}
                onClick={() => execute(s.cmd)}
                style={{
                  padding: '4px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600,
                  background: isActive ? `${chipAccent}18` : 'transparent',
                  border: `1px solid ${isActive ? chipAccent + '60' : BORDER}`,
                  color: isActive ? chipAccent : DIM,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = chipAccent + '70'
                  e.currentTarget.style.background  = chipAccent + '14'
                  e.currentTarget.style.color = chipAccent
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = isActive ? chipAccent + '60' : BORDER
                  e.currentTarget.style.background  = isActive ? chipAccent + '18' : 'transparent'
                  e.currentTarget.style.color = isActive ? chipAccent : DIM
                }}
              >
                <span>{s.emoji}</span>
                {s.label}
              </button>
            )
          })}
        </div>

        {/* ── Result area ── */}
        <div style={{ minHeight: 110, padding: '12px 14px' }}>
          {result ? (
            <div style={{
              background: `${accent}09`,
              border: `1px solid ${accent}28`,
              borderLeft: `3px solid ${accent}`,
              borderRadius: '0 8px 8px 0',
              padding: '12px 14px',
            }}>
              {/* Command echo + context badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  color: MUTED, fontSize: 9, fontWeight: 700,
                  letterSpacing: 0.6, textTransform: 'uppercase',
                }}>
                  {result.cmd}
                </span>
                {context && (
                  <span style={{
                    padding: '1px 7px', borderRadius: 20, fontSize: 9, fontWeight: 600,
                    background: `${accent}18`,
                    border: `1px solid ${accent}35`,
                    color: accent,
                  }}>{context}</span>
                )}
              </div>

              {/* Primary line — split into label + big value */}
              {primary && (
                <div style={{ marginBottom: restLines.length > 0 ? 8 : 0 }}>
                  {primary.label && (
                    <p style={{
                      color: MUTED, fontSize: 10, fontWeight: 600,
                      letterSpacing: 0.2, marginBottom: 2,
                    }}>{primary.label}</p>
                  )}
                  <p style={{
                    color: accent,
                    fontSize: primary.label ? 22 : 15,
                    fontWeight: 800,
                    lineHeight: 1.2,
                    letterSpacing: primary.value.startsWith('$') ? -0.5 : 0,
                  }}>{primary.value}</p>
                </div>
              )}

              {/* Secondary lines */}
              {restLines.length > 0 && (
                <div style={{
                  borderTop: `1px solid ${accent}20`,
                  paddingTop: 8,
                  display: 'flex', flexDirection: 'column', gap: 3,
                }}>
                  {restLines.map((line, i) => {
                    const isIndented = line.startsWith('  ·')
                    const sub = splitPrimary(line)
                    // Sub-line with its own label:value split
                    if (sub.label && !isIndented) {
                      return (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ color: MUTED, fontSize: 11 }}>{sub.label}</span>
                          <span style={{ color: DIM, fontSize: 12, fontWeight: 600 }}>{sub.value}</span>
                        </div>
                      )
                    }
                    return (
                      <p key={i} style={{
                        color: isIndented ? DIM : MUTED,
                        fontSize: 11, lineHeight: 1.5,
                        fontFamily: isIndented ? 'monospace' : 'inherit',
                        paddingLeft: isIndented ? 4 : 0,
                      }}>{line}</p>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: 90, gap: 5,
            }}>
              <span style={{ fontSize: 24, opacity: 0.15 }}>✨</span>
              <p style={{ color: MUTED, fontSize: 11 }}>Tap a shortcut above or type a command</p>
            </div>
          )}
        </div>

        {/* ── History pills ── */}
        {history.length > 0 && (
          <div style={{
            padding: '5px 14px 7px',
            borderTop: `1px solid ${BORDER}`,
            display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center',
          }}>
            <span style={{ color: '#253349', fontSize: 9, fontWeight: 700, letterSpacing: 0.4, flexShrink: 0 }}>RECENT</span>
            {history.map(h => (
              <button
                key={h}
                onClick={() => execute(h)}
                style={{
                  padding: '2px 8px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                  background: 'transparent', border: `1px solid #253349`,
                  color: '#415569', cursor: 'pointer', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#415569' }}
              >{h}</button>
            ))}
          </div>
        )}

        {/* ── Input ── */}
        <div style={{
          padding: '9px 12px',
          borderTop: `1px solid ${BORDER}`,
          background: CARD,
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <span style={{ color: '#253349', fontSize: 13, fontFamily: 'monospace', userSelect: 'none' }}>›</span>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command…  (Esc to close)"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: TEXT, fontSize: 13, fontFamily: 'inherit',
            }}
          />
          {input.trim() && (
            <button
              onClick={() => execute()}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                background: 'rgba(37,99,235,0.15)',
                border: '1px solid rgba(37,99,235,0.3)',
                color: '#60a5fa', cursor: 'pointer', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.25)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.15)' }}
            >Run</button>
          )}
        </div>

      </div>
    </>
  )
}
