import { useState, useMemo, useCallback, useEffect } from 'react'
import { LOCATIONS_CFG } from '../config/branding'
import { fetchTodayClockRecords } from '../services/supabaseRead'
import {
  buildPreset, filterSales, calcKPIs,
  byLocation, byEmployee, byProduct, byPaymentMethod,
  whoIsAtWork,
} from '../services/dashboardService'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const MUTED  = '#64748b'
const TEXT   = '#f1f5f9'

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt  = (n) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtN = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

const METHOD_COLOR = { cash: '#22c55e', card: '#3b82f6', external: '#8b5cf6', check: '#f59e0b' }
function methodColor(m) { return METHOD_COLOR[(m || '').toLowerCase()] || '#64748b' }

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, color = TEXT, sub = null, negative = false }) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: 0.4 }}>{label}</span>
      </div>
      <p style={{ fontSize: 22, fontWeight: 800, color: negative ? '#ef4444' : color, lineHeight: 1 }}>
        {negative && value > 0 ? '-' : ''}{fmt(value)}
      </p>
      {sub && <p style={{ fontSize: 11, color: MUTED }}>{sub}</p>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <p style={{ fontSize: 11, color: MUTED, fontWeight: 700, letterSpacing: 0.6, marginBottom: 10 }}>
      {children}
    </p>
  )
}

function BreakdownTable({ rows, maxRows = 8, showSpare = false }) {
  const top     = rows.slice(0, maxRows)
  const maxVal  = top[0]?.total || 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {top.length === 0 && <p style={{ color: MUTED, fontSize: 12 }}>No data</p>}
      {top.map((r, i) => (
        <div key={r.label + i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#415569', width: 16, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: TEXT, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.label}
              </span>
              <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>
                {fmt(r.total)}
              </span>
            </div>
            <div style={{ height: 3, background: '#253349', borderRadius: 2 }}>
              <div style={{
                height: '100%', borderRadius: 2, background: '#3b82f6',
                width: `${Math.max(2, (r.total / maxVal) * 100)}%`,
                transition: 'width 0.4s ease',
              }} />
            </div>
            {showSpare && r.spare > 0 && (
              <span style={{ fontSize: 10, color: MUTED }}>Spare: {fmt(r.spare)}</span>
            )}
          </div>
          {r.count !== undefined && (
            <span style={{ fontSize: 11, color: MUTED, flexShrink: 0, minWidth: 40, textAlign: 'right' }}>
              {r.count} sale{r.count !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function Panel({ title, children, style = {} }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '16px 18px', ...style,
    }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </div>
  )
}

// ── Date preset button label ──────────────────────────────────────────────────

const PRESETS = [
  { key: 'today',     label: 'Today'     },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week',      label: 'Last 7d'   },
  { key: 'month',     label: 'This Month'},
  { key: 'custom',    label: 'Custom'    },
]

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function Dashboard({ onClose, sales = [] }) {
  // ── Filter state ────────────────────────────────────────────────────────────
  const [preset,        setPreset]        = useState('today')
  const [customFrom,    setCustomFrom]    = useState('')
  const [customTo,      setCustomTo]      = useState('')
  const [locationId,    setLocationId]    = useState('all')
  const [refreshKey,    setRefreshKey]    = useState(0)
  const [clockRecords,  setClockRecords]  = useState([])

  // ── Derived date range ──────────────────────────────────────────────────────
  const { from, to } = useMemo(() => {
    if (preset === 'custom') {
      return {
        from: customFrom ? new Date(customFrom + 'T00:00:00') : null,
        to:   customTo   ? new Date(customTo   + 'T23:59:59') : null,
      }
    }
    return buildPreset(preset)
  }, [preset, customFrom, customTo, refreshKey])

  // ── Filtered + aggregated data ──────────────────────────────────────────────
  const filtered = useMemo(
    () => filterSales(sales, { from, to, locationId }),
    [sales, from, to, locationId, refreshKey]
  )

  const kpis        = useMemo(() => calcKPIs(filtered),              [filtered])
  const locRows     = useMemo(() => byLocation(filtered),            [filtered])
  const empRows     = useMemo(() => byEmployee(filtered),            [filtered])
  const prodRows    = useMemo(() => byProduct(filtered),             [filtered])
  const methodRows  = useMemo(() => byPaymentMethod(filtered),       [filtered])
  const atWork      = useMemo(
    () => whoIsAtWork(clockRecords, locationId !== 'all' ? locationId : null),
    [clockRecords, locationId]
  )

  const recentSales = useMemo(
    () => [...filtered].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 50),
    [filtered]
  )

  // Fetch clock records from Supabase on mount and on every manual refresh
  useEffect(() => {
    fetchTodayClockRecords().then(records => { if (records) setClockRecords(records) })
  }, [refreshKey])

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  // ── Location options ────────────────────────────────────────────────────────
  const locationOptions = [
    { id: 'all', name: 'All Locations' },
    ...LOCATIONS_CFG.map(l => ({ id: l.name, name: l.name })),
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG, zIndex: 1000,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={{
        background: PANEL, borderBottom: `1px solid ${BORDER}`,
        padding: '0 20px', height: 52, display: 'flex', alignItems: 'center', gap: 14,
        flexShrink: 0, boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📈</span>
          <span style={{ color: TEXT, fontWeight: 800, fontSize: 16 }}>Dashboard</span>
        </div>

        {/* Date presets */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
          {PRESETS.map(p => (
            <button key={p.key} onClick={() => setPreset(p.key)} style={{
              padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              borderRadius: 6, border: '1px solid',
              borderColor: preset === p.key ? '#3b82f6' : BORDER,
              background:  preset === p.key ? 'rgba(37,99,235,0.15)' : 'transparent',
              color:       preset === p.key ? '#93c5fd' : MUTED,
              transition:  'all 0.15s',
            }}>{p.label}</button>
          ))}
        </div>

        {/* Custom date pickers */}
        {preset === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              style={{ padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
            <span style={{ color: MUTED, fontSize: 12 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              style={{ padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
          </div>
        )}

        {/* Location filter */}
        <select value={locationId} onChange={e => setLocationId(e.target.value)} style={{
          padding: '5px 10px', background: CARD, border: `1px solid ${BORDER}`,
          borderRadius: 6, color: TEXT, fontSize: 12, cursor: 'pointer', outline: 'none',
        }}>
          {locationOptions.map(l => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: MUTED, fontSize: 11 }}>
            {filtered.length} sale{filtered.length !== 1 ? 's' : ''}
          </span>

          {/* Refresh */}
          <button onClick={handleRefresh} style={{
            padding: '6px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 6, color: MUTED, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#93c5fd' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >⟳ Refresh</button>

          {/* Close */}
          <button onClick={onClose} style={{
            padding: '6px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 6, color: MUTED, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >✕ Close</button>
        </div>
      </div>

      {/* ── Scrollable body ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <KpiCard icon="💵" label="NET REVENUE"     value={kpis.netRevenue}    color="#22c55e" sub={`${kpis.saleCount} sale${kpis.saleCount !== 1 ? 's' : ''}`} />
          <KpiCard icon="💰" label="GROSS REVENUE"   value={kpis.grossRevenue}  color="#60a5fa" />
          <KpiCard icon="🏛️"  label="TAX COLLECTED"  value={kpis.taxRevenue}    color="#f59e0b" />
          <KpiCard icon="📦" label="INVENTORY COST"  value={kpis.inventoryCost} color="#a8b8cc" />
          <KpiCard
            icon={kpis.netProfit >= 0 ? '📈' : '📉'}
            label="NET PROFIT"
            value={kpis.netProfit}
            color={kpis.netProfit >= 0 ? '#22c55e' : '#ef4444'}
            sub="Revenue − Inventory Cost"
            negative={kpis.netProfit < 0}
          />
        </div>

        {/* ── Breakdowns row ──────────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <Panel title="SALES BY LOCATION">
            <BreakdownTable rows={locRows} />
          </Panel>

          <Panel title="SALES BY EMPLOYEE">
            <BreakdownTable rows={empRows} showSpare />
          </Panel>

          <Panel title="TOP PRODUCTS">
            <BreakdownTable rows={prodRows} maxRows={10} />
          </Panel>

          <Panel title="PAYMENT METHODS">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {methodRows.length === 0 && <p style={{ color: MUTED, fontSize: 12 }}>No data</p>}
              {methodRows.map(r => (
                <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: methodColor(r.label), flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, color: TEXT, textTransform: 'capitalize' }}>{r.label}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>{r.count}×</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{fmt(r.total)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Recent Invoices ─────────────────────────────────────────────────── */}
        <Panel title={`INVOICES (${recentSales.length}${filtered.length > 50 ? ' of ' + filtered.length : ''})`}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ color: MUTED, borderBottom: `1px solid ${BORDER}` }}>
                  {['#', 'Date & Time', 'Employee', 'Location', 'Method', 'Subtotal', 'Tax', 'Total'].map(h => (
                    <th key={h} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, letterSpacing: 0.3 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentSales.length === 0 && (
                  <tr><td colSpan={8} style={{ padding: '16px 10px', color: MUTED, textAlign: 'center' }}>No sales in this period</td></tr>
                )}
                {recentSales.map(s => {
                  const tax = (s.total || 0) - (s.subtotal || 0)
                  return (
                    <tr key={s.number} style={{ borderBottom: `1px solid rgba(30,41,59,0.5)` }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.04)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ padding: '7px 10px', color: '#60a5fa', fontWeight: 700 }}>#{s.number}</td>
                      <td style={{ padding: '7px 10px', color: MUTED }}>{fmtDateTime(s.timestamp)}</td>
                      <td style={{ padding: '7px 10px', color: TEXT }}>{s.employee || '—'}</td>
                      <td style={{ padding: '7px 10px', color: MUTED }}>{s.location || '—'}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: methodColor(s.paymentMethod) + '22',
                          color: methodColor(s.paymentMethod),
                          textTransform: 'capitalize',
                        }}>
                          {s.paymentMethod || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '7px 10px', color: TEXT, textAlign: 'right' }}>{fmt(s.subtotal || 0)}</td>
                      <td style={{ padding: '7px 10px', color: MUTED, textAlign: 'right' }}>{fmt(tax)}</td>
                      <td style={{ padding: '7px 10px', color: '#22c55e', fontWeight: 700, textAlign: 'right' }}>{fmt(s.total || 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* ── Who is at Work ──────────────────────────────────────────────────── */}
        <Panel title="WHO IS AT WORK TODAY" style={{ marginBottom: 4 }}>
          {atWork.length === 0
            ? <p style={{ color: MUTED, fontSize: 12 }}>Nobody clocked in yet today.</p>
            : (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {atWork.map(w => (
                  <div key={w.employee} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                    borderRadius: 8, padding: '8px 14px',
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                    <div>
                      <p style={{ fontSize: 13, color: TEXT, fontWeight: 600 }}>{w.employee}</p>
                      <p style={{ fontSize: 11, color: MUTED }}>
                        {w.location ? `${w.location} · ` : ''}Since {fmtTime(w.clockIn)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
          <p style={{ fontSize: 10, color: '#415569', marginTop: 10 }}>
            ℹ️ Data refreshed from Supabase — click Refresh to update.
          </p>
        </Panel>

      </div>
    </div>
  )
}
