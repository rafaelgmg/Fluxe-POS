/**
 * Dashboard — mobile-first owner dashboard accessible at /dashboard.
 * Protected by a PIN stored in VITE_DASHBOARD_PIN (default: 1234).
 * Auto-refreshes every 15 seconds from Supabase.
 */

import { useState, useEffect, useCallback } from 'react'
import { fetchDashboardData } from '../services/supabaseDashboard'

// ── Auth ──────────────────────────────────────────────────────────────────────
const DASHBOARD_PIN = import.meta.env.VITE_DASHBOARD_PIN || '1234'
const AUTH_KEY      = 'fluxe-dash-auth'
const AUTH_TTL      = 24 * 60 * 60 * 1000 // 24h

function isAuthed() {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY)
    if (!raw) return false
    const { exp } = JSON.parse(raw)
    return Date.now() < exp
  } catch { return false }
}
function setAuthed() {
  sessionStorage.setItem(AUTH_KEY, JSON.stringify({ exp: Date.now() + AUTH_TTL }))
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = n => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtK = n => n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : fmt$(n)

function timeAgo(date) {
  if (!date) return ''
  const s = Math.floor((Date.now() - date.getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ago`
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function fmtHour(h) {
  if (h === 0)  return '12 AM'
  if (h < 12)  return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

const METHOD_LABEL = { cash: 'Cash', card: 'Credit Card', external: 'External Credit', check: 'Check', split: 'Split', other: 'Other' }
const METHOD_COLOR = { cash: '#10B981', card: '#3B82F6', external: '#8B5CF6', check: '#F59E0B', split: '#6366F1', other: '#9CA3AF' }

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:      '#F8FAFC',
  card:    '#FFFFFF',
  border:  '#E5E7EB',
  text:    '#111827',
  sub:     '#374151',
  muted:   '#6B7280',
  dim:     '#9CA3AF',
  green:   '#10B981',
  blue:    '#3B82F6',
  purple:  '#8B5CF6',
  amber:   '#F59E0B',
  red:     '#EF4444',
}

// ── PIN Login ─────────────────────────────────────────────────────────────────
function PinLogin({ onAuth }) {
  const [pin,   setPin]   = useState('')
  const [shake, setShake] = useState(false)

  const press = (k) => {
    if (k === '⌫') { setPin(p => p.slice(0, -1)); return }
    if (pin.length >= 4) return
    const next = pin + k
    setPin(next)
    if (next.length === 4) {
      if (next === DASHBOARD_PIN) { setAuthed(); onAuth() }
      else {
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: C.bg,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Segoe UI', system-ui, sans-serif", padding: 24,
    }}>
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 26, margin: '0 auto 16px',
        }}>📊</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6 }}>Fluxe Dashboard</h1>
        <p style={{ color: C.muted, fontSize: 14 }}>Enter your PIN to continue</p>
      </div>

      {/* Dots */}
      <div style={{
        display: 'flex', gap: 14, marginBottom: 32,
        transform: shake ? 'translateX(6px)' : 'none',
        transition: 'transform 0.07s',
      }}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{
            width: 16, height: 16, borderRadius: '50%',
            background: i < pin.length ? (shake ? C.red : C.blue) : C.border,
            border: `2px solid ${i < pin.length ? (shake ? C.red : C.blue) : C.border}`,
            transition: 'background 0.15s',
          }} />
        ))}
      </div>

      {/* Numpad */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, width: 240 }}>
        {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
          <button key={i} onClick={() => k && press(k)} disabled={!k} style={{
            padding: '18px 0', borderRadius: 12, fontSize: k === '⌫' ? 18 : 22, fontWeight: 700,
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

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent = C.blue, icon }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: '18px 20px',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase' }}>{label}</span>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1, marginBottom: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── TODAY tab ─────────────────────────────────────────────────────────────────
function TodayTab({ today, yesterday }) {
  if (!today) return <Skeleton />

  const { total, count, avgTicket, byEmployee, byLocation, byPayment, peakHour, topProduct } = today
  const topSeller  = byEmployee[0]
  const yTotal     = yesterday?.total || 0
  const diff       = yTotal > 0 ? ((total - yTotal) / yTotal * 100) : null
  const diffLabel  = diff == null ? null : `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff).toFixed(0)}% vs yesterday`
  const diffColor  = diff == null ? C.muted : diff >= 0 ? C.green : C.red

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Hero revenue */}
      <div style={{
        background: 'linear-gradient(135deg, #1D4ED8 0%, #7C3AED 100%)',
        borderRadius: 20, padding: '24px 22px',
        boxShadow: '0 4px 20px rgba(37,99,235,0.25)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, marginBottom: 8 }}>TODAY'S REVENUE</div>
        <div style={{ fontSize: 42, fontWeight: 900, color: '#fff', lineHeight: 1, marginBottom: 6 }}>{fmt$(total)}</div>
        {diffLabel && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(255,255,255,0.15)', borderRadius: 20,
            padding: '4px 10px', fontSize: 12, fontWeight: 700,
            color: diff >= 0 ? '#6EE7B7' : '#FCA5A5',
          }}>{diffLabel}</div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <StatCard label="Transactions" value={count} icon="🧾" accent={C.blue} />
        <StatCard label="Avg Ticket"   value={fmt$(avgTicket)} icon="🎯" accent={C.purple} />
      </div>

      {/* Top seller */}
      {topSeller && (
        <div style={{
          background: C.card, borderRadius: 16, padding: '16px 18px',
          border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: 'linear-gradient(135deg, #FCD34D, #F59E0B)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0,
          }}>🏆</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 2 }}>TOP SELLER TODAY</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>{topSeller.name}</div>
            <div style={{ fontSize: 13, color: C.muted }}>{fmt$(topSeller.total)} · {topSeller.count} sales</div>
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.amber }}>{fmtK(topSeller.total)}</div>
        </div>
      )}

      {/* By location */}
      {byLocation.length > 1 && (
        <SectionCard title="By Location" icon="📍">
          {byLocation.map(l => (
            <LocationRow key={l.name} loc={l} total={total} />
          ))}
        </SectionCard>
      )}

      {/* Quick Insights */}
      <SectionCard title="Quick Insights" icon="⚡">
        {peakHour >= 0 && (
          <InsightRow icon="⏰" label="Peak hour" value={fmtHour(peakHour)} />
        )}
        {topProduct && (
          <InsightRow icon="🧴" label="Top product" value={topProduct.name} sub={fmt$(topProduct.total)} />
        )}
        {diff != null && (
          <InsightRow
            icon={diff >= 0 ? '📈' : '📉'}
            label="vs Yesterday"
            value={`${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`}
            valueColor={diff >= 0 ? C.green : C.red}
          />
        )}
        {yesterday && yesterday.count > 0 && (
          <InsightRow icon="💰" label="Yesterday total" value={fmt$(yesterday.total)} />
        )}
      </SectionCard>
    </div>
  )
}

function LocationRow({ loc, total }) {
  const pct = total > 0 ? (loc.total / total * 100) : 0
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.sub }}>{loc.name}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{fmt$(loc.total)}</span>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: C.blue, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
      <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{pct.toFixed(0)}% · {loc.count} transactions</div>
    </div>
  )
}

function InsightRow({ icon, label, value, sub, valueColor = C.text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: C.muted }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: valueColor }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.dim }}>{sub}</div>}
      </div>
    </div>
  )
}

// ── FEED tab ──────────────────────────────────────────────────────────────────
const HIGHLIGHT_THRESHOLD = 200

function FeedTab({ feed }) {
  if (!feed) return <Skeleton />
  if (!feed.length) return <Empty message="No sales today yet" icon="🧾" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {feed.map((sale, i) => {
        const isHigh = (sale.total || 0) >= HIGHLIGHT_THRESHOLD
        const emp    = sale.employee || sale.employeeName || (sale.employees?.[0]?.name) || '—'
        const items  = sale.items || []
        const topItem = items[0]?.name || null

        return (
          <div key={sale.number || i} style={{
            background: C.card, borderRadius: 14, padding: '14px 16px',
            border: `1px solid ${isHigh ? 'rgba(16,185,129,0.3)' : C.border}`,
            boxShadow: isHigh ? '0 2px 12px rgba(16,185,129,0.1)' : '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isHigh && <span style={{ fontSize: 14 }}>🔥</span>}
                <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{emp}</span>
              </div>
              <span style={{
                fontSize: 18, fontWeight: 900,
                color: isHigh ? C.green : C.text,
              }}>{fmt$(sale.total)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                {topItem && <span style={{ fontSize: 12, color: C.muted }}>{topItem}{items.length > 1 ? ` +${items.length - 1}` : ''}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PayBadge method={sale.paymentMethod || (sale.payments?.[0]?.method)} />
                <span style={{ fontSize: 11, color: C.dim }}>{fmtTime(sale.timestamp)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PayBadge({ method }) {
  const m     = method?.toLowerCase() || 'other'
  const label = m.includes('cash') ? 'Cash' : m.includes('card') ? 'Card' : m.includes('ext') ? 'Ext' : 'Other'
  const color = m.includes('cash') ? C.green : m.includes('card') ? C.blue : C.muted
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, color,
      background: `${color}18`, borderRadius: 6, padding: '2px 6px',
      letterSpacing: 0.3,
    }}>{label}</span>
  )
}

// ── SELLERS tab ───────────────────────────────────────────────────────────────
function SellersTab({ today }) {
  if (!today) return <Skeleton />
  const { byEmployee, total } = today
  if (!byEmployee.length) return <Empty message="No sales data" icon="👥" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {byEmployee.map((emp, i) => {
        const pct    = total > 0 ? (emp.total / total * 100) : 0
        const medals = ['🥇','🥈','🥉']
        return (
          <div key={emp.name} style={{
            background: C.card, borderRadius: 14, padding: '16px 18px',
            border: `1px solid ${i === 0 ? 'rgba(245,158,11,0.3)' : C.border}`,
            boxShadow: i === 0 ? '0 2px 12px rgba(245,158,11,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ fontSize: i < 3 ? 22 : 16, width: 28, textAlign: 'center' }}>
                {i < 3 ? medals[i] : `${i + 1}.`}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{emp.name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{emp.count} transactions · {pct.toFixed(0)}%</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: i === 0 ? C.amber : C.text }}>{fmtK(emp.total)}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{fmt$(emp.total)}</div>
              </div>
            </div>
            <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 0.5s',
                width: `${pct}%`,
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
function PaymentsTab({ today }) {
  if (!today) return <Skeleton />
  const { byPayment, total } = today
  if (!byPayment.length) return <Empty message="No payment data" icon="💳" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Summary */}
      <div style={{
        background: C.card, borderRadius: 16, padding: '18px 20px',
        border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 8 }}>TOTAL COLLECTED</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: C.text }}>{fmt$(total)}</div>
      </div>

      {/* Breakdown */}
      {byPayment.map(p => {
        const pct   = total > 0 ? (p.total / total * 100) : 0
        const color = METHOD_COLOR[p.method] || C.muted
        const label = METHOD_LABEL[p.method] || p.method
        return (
          <div key={p.method} style={{
            background: C.card, borderRadius: 14, padding: '16px 18px',
            border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `${color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18,
                }}>
                  {p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : p.method === 'external' ? '📱' : '🔖'}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</div>
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

// ── Shared ────────────────────────────────────────────────────────────────────
function SectionCard({ title, icon, children }) {
  return (
    <div style={{
      background: C.card, borderRadius: 16, padding: '16px 18px',
      border: `1px solid ${C.border}`, boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>{icon}</span><span>{title.toUpperCase()}</span>
      </div>
      {children}
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[80, 60, 60, 80].map((h, i) => (
        <div key={i} style={{
          height: h, borderRadius: 14, background: C.border,
          animation: 'pulse 1.5s infinite',
        }} />
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

// ── Tab bar ───────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'today',    label: 'Today',   icon: '📊' },
  { id: 'feed',     label: 'Feed',    icon: '⚡' },
  { id: 'sellers',  label: 'Sellers', icon: '👥' },
  { id: 'payments', label: 'Payments',icon: '💳' },
]

function TabBar({ tab, onTab }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: C.card, borderTop: `1px solid ${C.border}`,
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
      zIndex: 100, boxShadow: '0 -2px 12px rgba(0,0,0,0.06)',
    }}>
      {TABS.map(t => (
        <button key={t.id} onClick={() => onTab(t.id)} style={{
          flex: 1, padding: '10px 4px 8px', background: 'none', border: 'none',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          cursor: 'pointer',
        }}>
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
            color: tab === t.id ? C.blue : C.dim,
            borderBottom: tab === t.id ? `2px solid ${C.blue}` : '2px solid transparent',
            paddingBottom: 1,
          }}>{t.label.toUpperCase()}</span>
        </button>
      ))}
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [authed,      setAuthed]      = useState(isAuthed)
  const [tab,         setTab]         = useState('today')
  const [data,        setData]        = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [fetchedAt,   setFetchedAt]   = useState(null)
  const [tick,        setTick]        = useState(0)

  // "X sec ago" ticker
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(id)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const result = await fetchDashboardData()
      if (result) { setData(result); setFetchedAt(result.fetchedAt) }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authed) return
    refresh()
    const id = setInterval(refresh, 15_000)
    return () => clearInterval(id)
  }, [authed, refresh])

  if (!authed) return <PinLogin onAuth={() => setAuthed(true)} />

  const content = (() => {
    switch (tab) {
      case 'today':    return <TodayTab    today={data?.today}    yesterday={data?.yesterday} />
      case 'feed':     return <FeedTab     feed={data?.feed} />
      case 'sellers':  return <SellersTab  today={data?.today} />
      case 'payments': return <PaymentsTab today={data?.today} />
      default:         return null
    }
  })()

  return (
    <>
      {/* Pulse animation */}
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>

      <div style={{
        minHeight: '100dvh', background: C.bg,
        fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        paddingBottom: 80,
      }}>
        {/* Header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 50,
          background: C.card, borderBottom: `1px solid ${C.border}`,
          padding: '12px 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, letterSpacing: -0.3 }}>Fluxe Dashboard</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {loading ? '⟳ Refreshing…' : fetchedAt ? `Updated ${timeAgo(fetchedAt)}` : 'Loading…'}
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            style={{
              width: 38, height: 38, borderRadius: 10,
              background: loading ? C.border : `${C.blue}15`,
              border: `1px solid ${loading ? C.border : `${C.blue}30`}`,
              color: C.blue, fontSize: 16, cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
            }}
          >↻</button>
        </div>

        {/* Date badge */}
        <div style={{ padding: '12px 18px 4px' }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8,
            background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '4px 10px',
          }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}
          </span>
        </div>

        {/* Content */}
        <div style={{ padding: '12px 18px 0' }}>
          {content}
        </div>
      </div>

      <TabBar tab={tab} onTab={setTab} />
    </>
  )
}
