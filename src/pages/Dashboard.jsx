/**
 * Dashboard — mobile-first owner dashboard at /dashboard.
 * PIN protected (VITE_DASHBOARD_PIN, default 1234). Auto-refresh 15s.
 *
 * Layout uses an internal flex-column scroll container so body overflow:hidden
 * (set by the POS global CSS) doesn't break scrolling here.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { fetchDashboardData, computeMetrics } from '../services/supabaseDashboard'
import InventoryTab  from './dashboard/InventoryTab'
import ForecastTab  from './dashboard/ForecastTab'
import ReorderTab   from './dashboard/ReorderTab'

// ── Auth ──────────────────────────────────────────────────────────────────────
const DASHBOARD_PIN = import.meta.env.VITE_DASHBOARD_PIN || '1234'
const AUTH_KEY      = 'fluxe-dash-auth'
const AUTH_TTL      = 24 * 60 * 60 * 1000

function isAuthed() {
  try {
    const { exp } = JSON.parse(sessionStorage.getItem(AUTH_KEY) || '{}')
    return Date.now() < (exp || 0)
  } catch { return false }
}
function saveAuth() {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ exp: Date.now() + AUTH_TTL }))
}

// ── Date range helpers ────────────────────────────────────────────────────────
function dayStart(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function dayEnd(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
}

const PRESETS = [
  { id: 'today',     label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d',        label: '7 Days' },
  { id: 'mtd',       label: 'This Month' },
  { id: 'custom',    label: 'Custom' },
]

function rangeForPreset(id) {
  const now = new Date()
  switch (id) {
    case 'today':     return { start: dayStart(),              end: dayEnd() }
    case 'yesterday': return { start: dayStart(new Date(now - 86400000)), end: dayStart() }
    case '7d':        return { start: dayStart(new Date(now - 6 * 86400000)), end: dayEnd() }
    case 'mtd':       return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: dayEnd() }
    default:          return null
  }
}

function presetLabel(id, custom) {
  if (id === 'custom' && custom.start && custom.end) {
    const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    return `${fmt(custom.start)} – ${fmt(custom.end)}`
  }
  return PRESETS.find(p => p.id === id)?.label || id
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$ = n => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt$(n)

function timeAgo(date) {
  if (!date) return ''
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 10)  return 'just now'
  if (s < 60)  return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

function fmtTime(ts)  { return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) }
function fmtHour(h)   { if (h === 0) return '12 AM'; if (h < 12) return `${h} AM`; if (h === 12) return '12 PM'; return `${h - 12} PM` }
function toInputDate(d) { return d.toISOString().slice(0, 10) }

function formatSaleText(sale) {
  const name     = sale.employee || sale.employeeName || (sale.employees?.[0]?.name) || '—'
  const location = sale.location || sale.locationName || 'Perfume Passage'
  const total    = sale.total || 0
  const tax      = sale.tax  || 0
  const subtotal = sale.subtotal != null ? sale.subtotal : (total - tax)
  const invoice  = sale.number || sale.id || '—'
  const items    = sale.items || []
  const divider  = '─'.repeat(24)

  let t = `${name} has just made a sale of ${fmt$(total)} in ${location}, Invoice#: ${invoice}\n`
  t += `Product x Qty = Price\n`
  t += `${divider}\n`
  for (const item of items) {
    const qty   = item.qty || 1
    const price = item.salePrice != null
      ? item.salePrice * qty
      : (item.subtotal || 0)
    t += `${item.name || 'Item'} x${qty} = ${fmt$(price)}\n`
  }
  t += `${divider}\n`
  t += `Subtotal: ${fmt$(subtotal)}\n`
  t += `Tax: ${fmt$(tax)}\n`
  t += `Total ${fmt$(total)}`
  return t
}

const METHOD_LABEL = { cash: 'Cash', card: 'Credit Card', external: 'External Credit', check: 'Check', split: 'Split', other: 'Other' }
const METHOD_COLOR = { cash: '#10B981', card: '#3B82F6', external: '#8B5CF6', check: '#F59E0B', split: '#6366F1', other: '#9CA3AF' }
const METHOD_ICON  = { cash: '💵', card: '💳', external: '📱', check: '🔖', split: '🔀', other: '💰' }

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', sub: '#374151', muted: '#6B7280', dim: '#9CA3AF',
  green: '#10B981', blue: '#3B82F6', purple: '#8B5CF6',
  amber: '#F59E0B', red: '#EF4444',
}

// ── PIN Login ─────────────────────────────────────────────────────────────────
function PinLogin({ onAuth }) {
  const [pin, setPin]     = useState('')
  const [shake, setShake] = useState(false)

  const press = k => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      if (next === DASHBOARD_PIN) { saveAuth(); onAuth() }
      else { setShake(true); setTimeout(() => { setPin(''); setShake(false) }, 700) }
    }
  }

  return (
    <div style={{
      height: '100dvh', overflow: 'hidden',
      background: C.bg, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24,
    }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60, borderRadius: 16,
          background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, margin: '0 auto 14px',
        }}>📊</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 4 }}>Fluxe Dashboard</h1>
        <p style={{ color: C.muted, fontSize: 14 }}>Enter your PIN to continue</p>
      </div>

      <div style={{
        display: 'flex', gap: 14, marginBottom: 32,
        transform: shake ? 'translateX(6px)' : 'none', transition: 'transform 0.07s',
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < pin.length ? (shake ? C.red : C.blue) : C.border,
            transition: 'background 0.15s',
          }} />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, width: 240 }}>
        {['7','8','9','4','5','6','1','2','3','','0','⌫'].map((k, i) => (
          <button key={i} onClick={() => k && press(k)} disabled={!k} style={{
            padding: '18px 0', borderRadius: 12,
            fontSize: k === '⌫' ? 18 : 22, fontWeight: 700,
            background: !k ? 'transparent' : C.card,
            border: !k ? 'none' : `1px solid ${C.border}`,
            color: k === '⌫' ? C.muted : C.text,
            cursor: !k ? 'default' : 'pointer', opacity: !k ? 0 : 1,
            boxShadow: !k ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
          }}>{k}</button>
        ))}
      </div>
    </div>
  )
}

// ── Date Filter Bar ───────────────────────────────────────────────────────────
function DateFilterBar({ preset, custom, onPreset, onCustom, locations = [], locationFilter = 'all', onLocationChange }) {
  const [showCustom,  setShowCustom]  = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [localStart,  setLocalStart]  = useState(custom.start ? toInputDate(custom.start) : '')
  const [localEnd,    setLocalEnd]    = useState(custom.end   ? toInputDate(custom.end)   : '')

  const applyCustom = () => {
    if (!localStart || !localEnd) return
    const s = new Date(localStart + 'T00:00:00')
    const e = new Date(localEnd   + 'T23:59:59')
    if (s > e) return
    onCustom(s, e)
    setShowCustom(false)
  }

  const hasLocFilter = locationFilter !== 'all'

  return (
    <div style={{ background: C.card, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
      {/* Preset chips + filter toggle */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {PRESETS.map(p => {
          const active = preset === p.id
          return (
            <button key={p.id}
              onClick={() => { if (p.id === 'custom') setShowCustom(v => !v); else onPreset(p.id) }}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
                background: active ? C.blue : C.bg,
                color: active ? '#fff' : C.muted,
                border: `1.5px solid ${active ? C.blue : C.border}`,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}
            >{p.id === 'custom' && preset === 'custom' ? presetLabel('custom', custom) : p.label}</button>
          )
        })}

        {/* Location toggle — only shown when locations exist */}
        {locations.length > 0 && (
          <button
            onClick={() => setShowFilters(v => !v)}
            style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600,
              background: hasLocFilter ? C.amber : (showFilters ? '#FEF3C7' : C.bg),
              color:      hasLocFilter ? '#fff'   : (showFilters ? C.amber   : C.muted),
              border:     `1.5px solid ${hasLocFilter || showFilters ? C.amber : C.border}`,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s', marginLeft: 4,
            }}
          >
            📍 {hasLocFilter ? locationFilter : 'Location'}
          </button>
        )}
      </div>

      {/* Custom date inputs */}
      {showCustom && (
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="date" value={localStart} onChange={e => setLocalStart(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: C.bg, outline: 'none' }} />
          <span style={{ color: C.muted, fontSize: 13 }}>–</span>
          <input type="date" value={localEnd} onChange={e => setLocalEnd(e.target.value)}
            style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, color: C.text, background: C.bg, outline: 'none' }} />
          <button onClick={applyCustom} style={{
            padding: '8px 14px', borderRadius: 8, background: C.blue,
            border: 'none', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Apply</button>
        </div>
      )}

      {/* Location filter chips — toggled by the 📍 button */}
      {showFilters && locations.length > 0 && (
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['all', ...locations].map(loc => {
            const active = locationFilter === loc
            return (
              <button key={loc} onClick={() => { onLocationChange(loc); if (loc !== 'all') setShowFilters(false) }} style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: active ? C.amber : C.bg,
                color:      active ? '#fff'   : C.muted,
                border:     `1.5px solid ${active ? C.amber : C.border}`,
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
              }}>{loc === 'all' ? 'All Locations' : loc}</button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Shared sub-components ─────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = C.blue, icon }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: '16px 18px',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1, marginBottom: 3 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>}
    </div>
  )
}

function SectionCard({ title, icon, children }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: '16px 18px',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 14, display: 'flex', gap: 6 }}>
        <span>{icon}</span><span>{title.toUpperCase()}</span>
      </div>
      {children}
    </div>
  )
}

function BarRow({ label, value, total, color, extra }) {
  const pct = total > 0 ? Math.min(100, value / total * 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>{label}</span>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt$(value)}</span>
          {extra && <span style={{ fontSize: 11, color: C.dim, marginLeft: 6 }}>{extra}</span>}
        </div>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color || C.blue, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  )
}

function InsightRow({ icon, label, value, sub, valueColor = C.text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 18, width: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: C.muted }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: valueColor }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>}
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[100, 70, 70, 90].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 14, background: '#F1F5F9', animation: 'pulse 1.5s infinite' }} />
      ))}
    </div>
  )
}

function Empty({ message, icon }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: C.muted }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{message}</div>
    </div>
  )
}

// ── Sale Detail Modal ─────────────────────────────────────────────────────────
function SaleDetailModal({ sale, onClose }) {
  const [copied, setCopied] = useState(false)
  const text = formatSaleText(sale)

  const handleCopy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }

  const handleShare = () => {
    if (navigator.share) navigator.share({ text })
  }

  const emp    = sale.employee || sale.employeeName || (sale.employees?.[0]?.name) || '—'
  const isHigh = (sale.total || 0) >= HIGH

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: '22px 22px 0 0',
          padding: '0 0 env(safe-area-inset-bottom, 16px)',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.18)',
        }}
      >
        {/* drag handle */}
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2 }} />
        </div>

        {/* header */}
        <div style={{
          padding: '14px 20px 12px', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>
              {isHigh && '🔥 '}{emp}
            </div>
            <div style={{ fontSize: 12, color: C.muted }}>
              Invoice #{sale.number || sale.id} · {fmtTime(sale.timestamp)}
            </div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: isHigh ? C.green : C.text }}>
            {fmt$(sale.total)}
          </div>
        </div>

        {/* scrollable text block */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{
            background: '#0F172A', borderRadius: 14, padding: '16px 18px',
            fontFamily: "'Courier New', monospace", fontSize: 13, lineHeight: 1.75,
            color: '#E2E8F0', whiteSpace: 'pre', overflowX: 'auto',
          }}>{text}</div>
        </div>

        {/* actions */}
        <div style={{ padding: '12px 20px 4px', display: 'flex', gap: 10 }}>
          <button onClick={handleCopy} style={{
            flex: 1, padding: '15px 0', borderRadius: 14, border: 'none',
            background: copied ? C.green : C.blue,
            color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
            transition: 'background 0.2s',
          }}>{copied ? '✓ Copied!' : '📋 Copy'}</button>

          {typeof navigator !== 'undefined' && 'share' in navigator && (
            <button onClick={handleShare} style={{
              flex: 1, padding: '15px 0', borderRadius: 14,
              border: `1.5px solid ${C.border}`,
              background: C.bg, color: C.text,
              fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}>📤 Share</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── LEADS MODAL ───────────────────────────────────────────────────────────────
function LeadsModal({ leads, onClose }) {
  const [locFilter, setLocFilter] = useState('all')

  const locations = useMemo(() => {
    const names = [...new Set(leads.map(l => l.locationName).filter(Boolean))].sort()
    return names
  }, [leads])

  const filtered = locFilter === 'all' ? leads : leads.filter(l => l.locationName === locFilter)

  const fmtDate = ts => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)', display: 'flex',
        flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.card, borderRadius: '22px 22px 0 0',
          padding: '0 0 env(safe-area-inset-bottom, 16px)',
          maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 30px rgba(0,0,0,0.18)',
        }}
      >
        {/* drag handle */}
        <div style={{ padding: '14px 0 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2 }} />
        </div>

        {/* header */}
        <div style={{
          padding: '12px 20px 12px',
          borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Leads Captured</div>
            <div style={{ fontSize: 12, color: C.muted }}>{leads.length} total · {filtered.length} shown</div>
          </div>
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: `${C.green}18`, fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>👤</div>
        </div>

        {/* location filter */}
        {locations.length > 1 && (
          <div style={{ padding: '10px 16px 0', display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {['all', ...locations].map(loc => {
              const active = locFilter === loc
              return (
                <button key={loc} onClick={() => setLocFilter(loc)} style={{
                  flexShrink: 0, padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 600,
                  background: active ? C.green : C.bg,
                  color: active ? '#fff' : C.muted,
                  border: `1.5px solid ${active ? C.green : C.border}`,
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{loc === 'all' ? 'All Locations' : loc}</button>
              )
            })}
          </div>
        )}

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {filtered.length === 0
            ? <div style={{ textAlign: 'center', padding: '50px 0', color: C.muted, fontSize: 14 }}>
                No leads captured in this period.
              </div>
            : filtered.map(lead => (
              <div key={lead.id} style={{
                background: C.bg, borderRadius: 12, padding: '12px 14px',
                marginBottom: 8, border: `1px solid ${C.border}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    {`${lead.firstName} ${lead.lastName}`.trim() || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: C.dim, flexShrink: 0, marginLeft: 8 }}>
                    {fmtDate(lead.capturedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px' }}>
                  {lead.phone && (
                    <span style={{ fontSize: 12, color: C.muted }}>📞 {lead.phone}</span>
                  )}
                  {lead.email && (
                    <span style={{ fontSize: 12, color: C.muted }}>✉ {lead.email}</span>
                  )}
                  {lead.capturedBy && (
                    <span style={{ fontSize: 12, color: C.muted }}>👤 {lead.capturedBy}</span>
                  )}
                  {lead.locationName && (
                    <span style={{ fontSize: 12, color: C.muted }}>📍 {lead.locationName}</span>
                  )}
                </div>
              </div>
            ))
          }
        </div>

        {/* close button */}
        <div style={{ padding: '4px 16px 8px' }}>
          <button onClick={onClose} style={{
            width: '100%', padding: '14px 0', borderRadius: 14,
            border: `1.5px solid ${C.border}`,
            background: C.bg, color: C.text,
            fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Location Filter Bar ───────────────────────────────────────────────────────
function LocationFilterBar({ locations, selected, onChange }) {
  if (!locations.length) return null
  return (
    <div style={{
      background: C.card, borderBottom: `1px solid ${C.border}`,
      display: 'flex', gap: 6, padding: '8px 16px',
      overflowX: 'auto', scrollbarWidth: 'none', flexShrink: 0,
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, alignSelf: 'center', flexShrink: 0 }}>LOCATION</span>
      {['all', ...locations].map(loc => {
        const active = selected === loc
        return (
          <button key={loc} onClick={() => onChange(loc)} style={{
            flexShrink: 0, padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: active ? C.amber : C.bg,
            color:      active ? '#fff'   : C.muted,
            border:     `1.5px solid ${active ? C.amber : C.border}`,
            cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s',
          }}>{loc === 'all' ? 'All' : loc}</button>
        )
      })}
    </div>
  )
}

// ── TODAY tab ─────────────────────────────────────────────────────────────────
function TodayTab({ current, comparison, leads, onLeadsClick }) {
  if (!current) return <Skeleton />

  const { total, subtotal, totalTax, count, avgTicket, byEmployee, byLocation, peakHour, topProduct } = current
  const compTotal = comparison?.total || 0
  const diff      = compTotal > 0 ? ((total - compTotal) / compTotal * 100) : null
  const topSeller = byEmployee[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #1D4ED8, #7C3AED)',
        borderRadius: 20, padding: '22px 20px',
        boxShadow: '0 4px 20px rgba(37,99,235,0.22)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.65)', letterSpacing: 1, marginBottom: 4 }}>TOTAL REVENUE</div>
        <div style={{ fontSize: 40, fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 10 }}>{fmt$(total)}</div>

        {/* Subtotal + Tax breakdown */}
        <div style={{
          display: 'flex', gap: 0,
          background: 'rgba(255,255,255,0.12)', borderRadius: 12,
          overflow: 'hidden', marginBottom: diff != null ? 10 : 0,
        }}>
          <div style={{ flex: 1, padding: '10px 14px', borderRight: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, marginBottom: 2 }}>SUBTOTAL</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>{fmt$(subtotal)}</div>
          </div>
          <div style={{ flex: 1, padding: '10px 14px' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 0.8, marginBottom: 2 }}>TAX</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.85)' }}>{fmt$(totalTax)}</div>
          </div>
        </div>

        {diff != null && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '3px 10px',
            fontSize: 12, fontWeight: 700,
            color: diff >= 0 ? '#6EE7B7' : '#FCA5A5',
          }}>{diff >= 0 ? '▲' : '▼'} {Math.abs(diff).toFixed(1)}% vs previous period</span>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard label="Transactions" value={count}          icon="🧾" accent={C.blue}   />
        <StatCard label="Avg Ticket"   value={fmt$(avgTicket)} icon="🎯" accent={C.purple} />
      </div>

      {/* Leads Captured card */}
      {leads != null && (
        <div
          onClick={onLeadsClick}
          style={{
            background: C.card, borderRadius: 16, padding: '14px 16px',
            border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', transition: 'border-color 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = C.green}
          onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
        >
          <div style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            background: `${C.green}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>👤</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8 }}>LEADS CAPTURED</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.green, lineHeight: 1.1 }}>{leads.length}</div>
          </div>
          <div style={{ fontSize: 16, color: C.dim }}>›</div>
        </div>
      )}

      {/* Top seller */}
      {topSeller && (
        <div style={{
          background: C.card, borderRadius: 16, padding: '14px 16px',
          border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
            background: 'linear-gradient(135deg, #FCD34D, #F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>🏆</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8 }}>TOP SELLER</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{topSeller.name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>{topSeller.count} sales</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.amber }}>{fmtK(topSeller.total)}</div>
        </div>
      )}

      {/* By location */}
      {byLocation.length > 1 && (
        <SectionCard title="By Location" icon="📍">
          {byLocation.map(l => (
            <BarRow key={l.name} label={l.name} value={l.total} total={total} extra={`${l.count} sales`} />
          ))}
        </SectionCard>
      )}

      {/* Quick insights */}
      <SectionCard title="Quick Insights" icon="⚡">
        {peakHour >= 0 && <InsightRow icon="⏰" label="Peak hour"    value={fmtHour(peakHour)} />}
        {topProduct    && <InsightRow icon="🧴" label="Top product"  value={topProduct.name}  sub={fmt$(topProduct.total)} />}
        {compTotal > 0 && <InsightRow icon="📅" label="Prev period"  value={fmt$(compTotal)} />}
        {diff != null  && <InsightRow icon={diff >= 0 ? '📈' : '📉'} label="Change" value={`${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`} valueColor={diff >= 0 ? C.green : C.red} />}
      </SectionCard>
    </div>
  )
}

// ── FEED tab ──────────────────────────────────────────────────────────────────
const HIGH = 200

function FeedTab({ feed, onSelect }) {
  if (!feed) return <Skeleton />
  if (!feed.length) return <Empty message="No sales in this period" icon="🧾" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {feed.map((sale, i) => {
        const isHigh  = (sale.total || 0) >= HIGH
        const emp     = sale.employee || sale.employeeName || (sale.employees?.[0]?.name) || '—'
        const items   = sale.items || []
        const topItem = items[0]?.name || null
        const method  = sale.paymentMethod || sale.payments?.[0]?.method
        const mNorm   = (method || '').toLowerCase().includes('card') ? 'card'
          : (method || '').toLowerCase().includes('cash') ? 'cash' : 'other'

        return (
          <div key={sale.number || i}
            onClick={() => onSelect(sale)}
            style={{
              background: C.card, borderRadius: 14, padding: '14px 16px',
              border: `1px solid ${isHigh ? 'rgba(16,185,129,0.3)' : C.border}`,
              boxShadow: isHigh ? '0 2px 12px rgba(16,185,129,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
              cursor: 'pointer', activeOpacity: 0.8,
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                {isHigh && <span>🔥</span>}
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{emp}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 900, color: isHigh ? C.green : C.text }}>{fmt$(sale.total)}</span>
                <span style={{ fontSize: 14, color: C.dim }}>›</span>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: C.muted }}>
                {topItem}{items.length > 1 ? ` +${items.length - 1}` : ''}
              </span>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, borderRadius: 6, padding: '2px 7px',
                  color: METHOD_COLOR[mNorm] || C.muted,
                  background: `${METHOD_COLOR[mNorm] || C.muted}18`,
                }}>
                  {mNorm === 'card' ? 'Card' : mNorm === 'cash' ? 'Cash' : 'Other'}
                </span>
                <span style={{ fontSize: 11, color: C.dim }}>{fmtTime(sale.timestamp)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── SELLERS tab ───────────────────────────────────────────────────────────────
function SellersTab({ current }) {
  if (!current) return <Skeleton />
  const { byEmployee, subtotal: totalSub } = current
  if (!byEmployee.length) return <Empty message="No sales data" icon="👥" />

  const medals = ['🥇', '🥈', '🥉']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {byEmployee.map((emp, i) => {
        const empSub = emp.subtotal || 0
        const pct    = totalSub > 0 ? empSub / totalSub * 100 : 0
        return (
          <div key={emp.name} style={{
            background: C.card, borderRadius: 14, padding: '16px 18px',
            border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.3)' : C.border}`,
            boxShadow: i === 0 ? '0 2px 12px rgba(245,158,11,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: i < 3 ? 22 : 15, width: 28, textAlign: 'center', flexShrink: 0, color: C.muted, fontWeight: 700 }}>
                {i < 3 ? medals[i] : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{emp.count} transactions · {pct.toFixed(0)}%</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: i === 0 ? C.amber : C.text }}>{fmt$(empSub)}</div>
                <div style={{ fontSize: 10, color: C.dim }}>subtotal</div>
              </div>
            </div>
            <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${pct}%`, transition: 'width 0.5s',
                background: i === 0 ? 'linear-gradient(90deg, #F59E0B, #FBBF24)' : C.blue,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── PAYMENTS tab ──────────────────────────────────────────────────────────────
function PaymentsTab({ current }) {
  if (!current) return <Skeleton />
  const { byPayment, total } = current
  if (!byPayment.length) return <Empty message="No payment data" icon="💳" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        background: C.card, borderRadius: 16, padding: '18px 20px',
        border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 6 }}>TOTAL COLLECTED</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: C.text }}>{fmt$(total)}</div>
      </div>

      {byPayment.map(p => {
        const pct   = total > 0 ? p.total / total * 100 : 0
        const color = METHOD_COLOR[p.method] || C.muted
        return (
          <div key={p.method} style={{
            background: C.card, borderRadius: 14, padding: '16px 18px',
            border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${color}18`, fontSize: 18,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{METHOD_ICON[p.method] || '💰'}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{METHOD_LABEL[p.method] || p.method}</div>
                  <div style={{ fontSize: 12, color: C.muted }}>{pct.toFixed(1)}% of total</div>
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 900, color }}>{fmtK(p.total)}</div>
            </div>
            <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── PRODUCTS tab ──────────────────────────────────────────────────────────────
function ProductsTab({ current }) {
  const [sortBy, setSortBy] = useState('revenue')
  if (!current) return <Skeleton />
  const { byProduct, total } = current
  if (!byProduct || !byProduct.length) return <Empty message="No products sold in this period" icon="🧴" />

  const sorted = sortBy === 'qty'
    ? [...byProduct].sort((a, b) => b.qty - a.qty)
    : byProduct

  const maxRevenue = sorted[0]?.total || 1
  const maxQty     = [...byProduct].sort((a, b) => b.qty - a.qty)[0]?.qty || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary card */}
      <div style={{
        background: C.card, borderRadius: 16, padding: '16px 18px',
        border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 2 }}>UNIQUE PRODUCTS</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: C.purple }}>{byProduct.length}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 2 }}>UNITS SOLD</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: C.blue }}>
            {byProduct.reduce((s, p) => s + p.qty, 0)}
          </div>
        </div>
      </div>

      {/* Sort toggle */}
      <div style={{ display: 'flex', gap: 6 }}>
        {[{ id: 'revenue', label: 'By Revenue' }, { id: 'qty', label: 'By Qty Sold' }].map(opt => (
          <button key={opt.id} onClick={() => setSortBy(opt.id)} style={{
            flex: 1, padding: '8px 0', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: sortBy === opt.id ? C.purple : C.bg,
            color: sortBy === opt.id ? '#fff' : C.muted,
            border: `1.5px solid ${sortBy === opt.id ? C.purple : C.border}`,
            cursor: 'pointer', transition: 'all 0.15s',
          }}>{opt.label}</button>
        ))}
      </div>

      {/* Product list */}
      {sorted.map((prod, i) => {
        const barValue = sortBy === 'qty' ? prod.qty : prod.total
        const barMax   = sortBy === 'qty' ? maxQty : maxRevenue
        const pct      = barMax > 0 ? Math.min(100, barValue / barMax * 100) : 0
        return (
          <div key={prod.name} style={{
            background: C.card, borderRadius: 14, padding: '14px 16px',
            border: `1px solid ${i === 0 ? 'rgba(139,92,246,0.3)' : C.border}`,
            boxShadow: i === 0 ? '0 2px 12px rgba(139,92,246,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: i < 3 ? 18 : 13, width: 26, textAlign: 'center',
                flexShrink: 0, color: C.muted, fontWeight: 700,
              }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prod.name}
                </div>
                <div style={{ fontSize: 11, color: C.muted }}>{prod.qty} unit{prod.qty !== 1 ? 's' : ''} sold</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 900, color: i === 0 ? C.purple : C.text }}>{fmt$(prod.total)}</div>
              </div>
            </div>
            <div style={{ height: 5, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, width: `${pct}%`, transition: 'width 0.5s',
                background: i === 0 ? C.purple : C.blue,
              }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Tab bar ───────────────────────────────────────────────────────────────────
const PRIMARY_TABS = [
  { id: 'today',     label: 'Today',     icon: '📊' },
  { id: 'feed',      label: 'Feed',      icon: '⚡' },
  { id: 'sellers',   label: 'Sellers',   icon: '👥' },
  { id: 'inventory', label: 'Inventory', icon: '📦' },
]

const MORE_TABS = [
  { id: 'payments', label: 'Payments', icon: '💳' },
  { id: 'products', label: 'Products', icon: '🧴' },
  { id: 'forecast', label: 'Forecast', icon: '🔮' },
  { id: 'reorder',  label: 'Reorder',  icon: '🛒' },
]

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [authed,         setAuthed]         = useState(isAuthed)
  const [tab,            setTab]            = useState('today')
  const [showMore,       setShowMore]       = useState(false)
  const [data,           setData]           = useState(null)
  const [loading,        setLoading]        = useState(false)
  const [fetchedAt,      setFetchedAt]      = useState(null)
  const [selectedSale,   setSelectedSale]   = useState(null)
  const [showLeads,      setShowLeads]      = useState(false)
  const [locationFilter, setLocationFilter] = useState('all')
  const [, setTick]                         = useState(0)

  const isMoreTab    = MORE_TABS.some(t => t.id === tab)
  const selectTab    = id => { setTab(id); setShowMore(false) }

  // Date range state
  const [preset, setPreset]       = useState('today')
  const [custom, setCustom]       = useState({ start: null, end: null })

  // Unique location names derived from fetched data (shown after first load)
  const locations = useMemo(() =>
    (data?.current?.byLocation || []).map(l => l.name),
  [data])

  // When a location is selected, recompute metrics from the full sales list (not just feed's 60)
  const filteredCurrent = useMemo(() => {
    if (!data) return null
    if (locationFilter === 'all') return data.current
    const filtered = (data.all || []).filter(s =>
      (s.location || s.locationName || '') === locationFilter
    )
    return computeMetrics(filtered)
  }, [data, locationFilter])

  // Filter leads by the active location — keeps lead count consistent with sales metrics
  const filteredLeads = useMemo(() => {
    if (!data?.leads) return null
    if (locationFilter === 'all') return data.leads
    return data.leads.filter(l => (l.locationName || '') === locationFilter)
  }, [data, locationFilter])

  const getRange = useCallback(() => {
    if (preset === 'custom' && custom.start && custom.end) return custom
    return rangeForPreset(preset) || rangeForPreset('today')
  }, [preset, custom])

  // "X sec ago" ticker
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    const { start, end } = getRange()
    setLoading(true)
    try {
      const result = await fetchDashboardData(start, end)
      if (result) { setData(result); setFetchedAt(result.fetchedAt) }
    } finally { setLoading(false) }
  }, [getRange])

  // Auto-refresh only for "today" preset (live data)
  useEffect(() => {
    if (!authed) return
    refresh()
    if (preset !== 'today') return
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [authed, refresh, preset])

  const handlePreset = id => { setPreset(id); }
  const handleCustom = (start, end) => { setCustom({ start, end }); setPreset('custom') }

  if (!authed) return <PinLogin onAuth={() => setAuthed(true)} />

  const content = (() => {
    switch (tab) {
      case 'today':    return <TodayTab    current={filteredCurrent} comparison={data?.comparison} leads={filteredLeads} onLeadsClick={() => setShowLeads(true)} />
      case 'feed':     return <FeedTab     feed={data?.feed} onSelect={setSelectedSale} />
      case 'sellers':  return <SellersTab  current={filteredCurrent} />
      case 'payments': return <PaymentsTab current={filteredCurrent} />
      case 'products':  return <ProductsTab current={filteredCurrent} />
      case 'inventory': return <InventoryTab />
      case 'forecast':  return <ForecastTab />
      case 'reorder':   return <ReorderTab />
      default:          return null
    }
  })()

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
        * { box-sizing: border-box; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.5; }
      `}</style>

      {selectedSale && (
        <SaleDetailModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}

      {showLeads && filteredLeads && (
        <LeadsModal leads={filteredLeads} onClose={() => setShowLeads(false)} />
      )}

      {/* More menu bottom-sheet */}
      {showMore && (
        <div
          onClick={() => setShowMore(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.4)',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, borderRadius: '20px 20px 0 0',
              padding: '8px 20px env(safe-area-inset-bottom, 20px)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.14)',
            }}
          >
            {/* drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, marginBottom: 14 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: C.border }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 14 }}>MORE</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              {MORE_TABS.map(t => {
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => selectTab(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', borderRadius: 14, cursor: 'pointer',
                      border: `1.5px solid ${active ? C.blue : C.border}`,
                      background: active ? `${C.blue}0F` : C.bg,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{t.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: active ? C.blue : C.text }}>
                      {t.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Full-height flex column — owns its own scroll so body overflow:hidden doesn't matter */}
      <div style={{
        height: '100dvh', display: 'flex', flexDirection: 'column',
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        background: C.bg, overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          background: C.card, borderBottom: `1px solid ${C.border}`,
          padding: '12px 18px', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Fluxe Dashboard</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {loading ? '⟳ Refreshing…' : fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : 'Loading…'}
            </div>
          </div>
          <button onClick={refresh} disabled={loading} style={{
            width: 38, height: 38, borderRadius: 10,
            background: `${C.blue}15`, border: `1px solid ${C.blue}30`,
            color: C.blue, fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: loading ? 0.5 : 1,
          }}>↻</button>
        </div>

        {/* Date + location filter */}
        <DateFilterBar
          preset={preset} custom={custom}
          onPreset={handlePreset} onCustom={handleCustom}
          locations={locations}
          locationFilter={locationFilter}
          onLocationChange={setLocationFilter}
        />

        {/* Scrollable content — this is the only thing that scrolls */}
        <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ padding: '14px 16px 24px' }}>
            {content}
          </div>
        </div>

        {/* Bottom tab bar — 4 primary + More */}
        <div style={{
          display: 'flex', background: C.card, flexShrink: 0,
          borderTop: `1px solid ${C.border}`,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          boxShadow: '0 -1px 8px rgba(0,0,0,0.06)',
        }}>
          {PRIMARY_TABS.map(t => {
            const active = tab === t.id
            return (
              <button key={t.id} onClick={() => selectTab(t.id)} style={{
                flex: 1, padding: '10px 4px 8px', background: 'none', border: 'none',
                borderTop: `2px solid ${active ? C.blue : 'transparent'}`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                cursor: 'pointer', transition: 'border-color 0.15s',
              }}>
                <span style={{ fontSize: 20 }}>{t.icon}</span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: active ? C.blue : C.dim }}>
                  {t.label.toUpperCase()}
                </span>
              </button>
            )
          })}

          {/* More button */}
          <button
            onClick={() => setShowMore(v => !v)}
            style={{
              flex: 1, padding: '10px 4px 8px', background: 'none', border: 'none',
              borderTop: `2px solid ${isMoreTab || showMore ? C.blue : 'transparent'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              cursor: 'pointer', transition: 'border-color 0.15s', position: 'relative',
            }}
          >
            <span style={{ fontSize: 20 }}>···</span>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: isMoreTab || showMore ? C.blue : C.dim }}>
              MORE
            </span>
            {isMoreTab && (
              <span style={{
                position: 'absolute', top: 8, right: 10,
                width: 7, height: 7, borderRadius: '50%', background: C.blue,
              }} />
            )}
          </button>
        </div>

      </div>
    </>
  )
}
