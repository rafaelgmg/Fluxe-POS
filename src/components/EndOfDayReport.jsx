import { useState, useMemo } from 'react'
import { DEFAULT_LOCATION } from '../config/branding'
import { loadLocationConfig } from '../utils/locationConfig'

// ── Design tokens (match system) ───────────────────────────────────────────────
const BG     = '#020817'
const PANEL  = '#0a0f1e'
const CARD   = '#0f172a'
const BORDER = '#1e293b'
const BLUE   = '#2563eb'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'
const MUTED  = '#475569'
const DIM    = '#94a3b8'
const TEXT   = '#f1f5f9'

const fmt$ = (n) => `$${(n || 0).toFixed(2)}`

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

// ── Minimal SVG donut chart ────────────────────────────────────────────────────
function DonutChart({ slices, size = 100 }) {
  const total = slices.reduce((s, x) => s + x.value, 0)
  if (total === 0) return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: CARD, border: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ color: MUTED, fontSize: 10 }}>—</span>
    </div>
  )
  const r = 40, cx = 50, cy = 50, stroke = 18
  let angle = -Math.PI / 2
  const paths = slices.filter(s => s.value > 0).map(s => {
    const sweep = (s.value / total) * 2 * Math.PI
    const x1 = cx + r * Math.cos(angle)
    const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle)
    const y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, color: s.color, label: s.label, value: s.value }
  })
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={CARD} strokeWidth={stroke} />
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="butt" />
      ))}
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill={PANEL} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill={TEXT} fontSize="11" fontWeight="700">
        {slices.length}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle" fill={MUTED} fontSize="7">
        methods
      </text>
    </svg>
  )
}

export default function EndOfDayReport({ onClose, sales = [], posSession }) {
  const [notes, setNotes]     = useState('')
  const [saved, setSaved]     = useState(false)
  const [section, setSection] = useState('overview') // 'overview' | 'invoices'

  const location  = posSession?.location || DEFAULT_LOCATION
  const locCfg    = loadLocationConfig(location)
  const taxRatePct = locCfg?.taxRate ?? 8.5
  const taxLabel  = locCfg?.taxDisplayAs || 'TAX'

  const today = new Date()
  const todaySales = useMemo(() => sales.filter(s => {
    const d = new Date(s.timestamp)
    return (
      d.getFullYear() === today.getFullYear() &&
      d.getMonth()    === today.getMonth()    &&
      d.getDate()     === today.getDate()     &&
      s.status !== 'deleted'
    )
  }), [sales]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Metrics ────────────────────────────────────────────────────────────────
  const netRevenue   = todaySales.reduce((s, x) => s + (x.subtotal || 0), 0)
  const taxRevenue   = todaySales.reduce((s, x) => s + (x.tax || 0), 0)
  const grossRevenue = todaySales.reduce((s, x) => s + (x.total || 0), 0)
  const totalSpare   = todaySales.reduce((s, x) => s + (x.totalSpare || 0), 0)

  // ── Payment breakdown ──────────────────────────────────────────────────────
  const payMethods = useMemo(() => {
    const map = {}
    todaySales.forEach(s => {
      const m = s.paymentMethod || 'Other'
      map[m] = (map[m] || 0) + s.total
    })
    const colors = ['#22c55e', '#2563eb', '#8b5cf6', '#f59e0b', '#06b6d4']
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({ label, value, color: colors[i % colors.length] }))
  }, [todaySales])

  // ── Sales by employee ──────────────────────────────────────────────────────
  const byEmployee = useMemo(() => {
    const map = {}
    todaySales.forEach(s => {
      if (!map[s.employee]) map[s.employee] = { name: s.employee, subtotal: 0, count: 0 }
      map[s.employee].subtotal += s.subtotal || 0
      map[s.employee].count    += 1
    })
    return Object.values(map).sort((a, b) => b.subtotal - a.subtotal)
  }, [todaySales])

  const maxEmp = Math.max(...byEmployee.map(e => e.subtotal), 1)

  // ── Products sold ──────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map = {}
    todaySales.flatMap(s => s.items || []).forEach(item => {
      const name = item.product?.name || item.name || 'Unknown'
      map[name] = (map[name] || 0) + Math.max(0, item.qty || 1)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [todaySales])

  const todayLabel = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const printedAt  = today.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const hasData    = todaySales.length > 0

  const statCard = (label, value, color, sub) => (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '14px 18px', borderLeft: `3px solid ${color}`,
    }}>
      <p style={{ color: MUTED, fontSize: 11, marginBottom: 6 }}>{label}</p>
      <p style={{ color, fontSize: 24, fontWeight: 800 }}>{value}</p>
      {sub && <p style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>{sub}</p>}
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: `linear-gradient(160deg, #0d1829 0%, ${PANEL} 100%)`,
        border: `1px solid ${BORDER}`, borderRadius: 10,
        width: '100%', maxWidth: 860, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '14px 22px', background: CARD, borderRadius: '10px 10px 0 0',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(37,99,235,0.12)',
            border: '1px solid rgba(37,99,235,0.25)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>📊</div>
          <div>
            <p style={{ color: TEXT, fontWeight: 800, fontSize: 15 }}>End of Day Report</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>{location} · {todayLabel}</p>
          </div>

          {/* Section toggle */}
          <div style={{
            marginLeft: 'auto', display: 'flex', gap: 6,
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3,
          }}>
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'invoices', label: 'Invoices' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setSection(key)} style={{
                padding: '5px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
                background: section === key ? BLUE : 'transparent',
                color: section === key ? '#fff' : MUTED,
                fontSize: 12, fontWeight: section === key ? 700 : 400,
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
            color: MUTED, fontSize: 20, cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Printed at */}
          <p style={{ color: '#334155', fontSize: 11 }}>Printed at {printedAt}</p>

          {/* ── OVERVIEW SECTION ── */}
          {section === 'overview' && (
            <>
              {/* Revenue cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {statCard('Net Revenue',    fmt$(netRevenue),   GREEN,  `${todaySales.length} transactions`)}
                {statCard(`${taxLabel} Collected`, fmt$(taxRevenue), AMBER, `${taxRatePct}%`)}
                {statCard('Gross Revenue',  fmt$(grossRevenue), BLUE,   'Net + Tax')}
                {statCard('Total Spare',    fmt$(totalSpare),   PURPLE, 'Above min price')}
              </div>

              {!hasData && (
                <div style={{
                  padding: 40, textAlign: 'center',
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                }}>
                  <p style={{ color: MUTED, fontSize: 13 }}>No sales recorded today yet</p>
                </div>
              )}

              {hasData && (
                <>
                  {/* Payment methods + employees */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                    {/* Payment methods */}
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>PAYMENT METHODS</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                        <DonutChart slices={payMethods} size={90} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {payMethods.map(m => (
                            <div key={m.label}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: m.color }} />
                                  <span style={{ color: DIM, fontSize: 12 }}>{m.label}</span>
                                </div>
                                <span style={{ color: m.color, fontSize: 12, fontWeight: 700 }}>{fmt$(m.value)}</span>
                              </div>
                              <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                                <div style={{ height: '100%', borderRadius: 2, background: m.color, width: `${(m.value / grossRevenue) * 100}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sales by employee */}
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 16 }}>SALES BY EMPLOYEE</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {byEmployee.map(emp => (
                          <div key={emp.name}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ color: DIM, fontSize: 13 }}>{emp.name}</span>
                              <div style={{ display: 'flex', gap: 12 }}>
                                <span style={{ color: MUTED, fontSize: 11 }}>{emp.count} sales</span>
                                <span style={{ color: GREEN, fontSize: 13, fontWeight: 700 }}>{fmt$(emp.subtotal)}</span>
                              </div>
                            </div>
                            <div style={{ height: 5, background: BORDER, borderRadius: 2 }}>
                              <div style={{ height: '100%', borderRadius: 2, background: GREEN, width: `${(emp.subtotal / maxEmp) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Products sold */}
                  {topProducts.length > 0 && (
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>TOP PRODUCTS TODAY</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
                        {topProducts.map(([name, qty]) => (
                          <div key={name} style={{
                            background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6,
                            padding: '10px 12px', borderBottom: `3px solid ${GREEN}`,
                          }}>
                            <p style={{ color: MUTED, fontSize: 11, lineHeight: 1.3, marginBottom: 6 }}>{name}</p>
                            <p style={{ color: GREEN, fontSize: 20, fontWeight: 800 }}>{qty}×</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                    <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>ADDITIONAL NOTES</p>
                    <textarea
                      value={notes}
                      onChange={e => { setNotes(e.target.value); setSaved(false) }}
                      placeholder="Enter end of day notes here..."
                      style={{
                        width: '100%', height: 72, background: PANEL,
                        border: `1px solid ${BORDER}`, borderRadius: 6,
                        color: TEXT, fontSize: 13, padding: '10px 12px',
                        resize: 'vertical', fontFamily: 'inherit',
                        boxSizing: 'border-box', outline: 'none',
                      }}
                      onFocus={e => { e.target.style.borderColor = BLUE }}
                      onBlur={e => { e.target.style.borderColor = BORDER }}
                    />
                    <button
                      onClick={() => setSaved(true)}
                      style={{
                        marginTop: 8, padding: '7px 18px',
                        background: saved ? 'rgba(34,197,94,0.1)' : BLUE,
                        border: saved ? `1px solid rgba(34,197,94,0.3)` : 'none',
                        borderRadius: 6, color: saved ? GREEN : '#fff',
                        fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                      }}
                    >
                      {saved ? '✓ Saved' : 'Save Notes'}
                    </button>
                  </div>

                  {/* Refund policy */}
                  <p style={{ color: '#334155', fontSize: 11, textAlign: 'center' }}>
                    No Refunds. Exchanges within 14 days.
                  </p>
                </>
              )}
            </>
          )}

          {/* ── INVOICES SECTION ── */}
          {section === 'invoices' && (
            <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Invoice #', 'Time', 'Employee', 'Payment', 'Subtotal', 'Tax', 'Total'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px',
                        textAlign: ['Subtotal','Tax','Total'].includes(h) ? 'right' : 'left',
                        color: MUTED, fontWeight: 600, fontSize: 10,
                        background: CARD, borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {todaySales.length === 0 && (
                    <tr>
                      <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#334155', fontSize: 13 }}>
                        No sales today
                      </td>
                    </tr>
                  )}
                  {[...todaySales].reverse().map((s, i) => (
                    <tr key={s.number} style={{
                      borderBottom: `1px solid rgba(30,41,59,0.4)`,
                      background: i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.4)',
                    }}>
                      <td style={{ padding: '8px 12px', color: BLUE, fontWeight: 700, fontSize: 13 }}>{s.number}</td>
                      <td style={{ padding: '8px 12px', color: DIM, fontSize: 12 }}>{fmtTime(s.timestamp)}</td>
                      <td style={{ padding: '8px 12px', color: DIM, fontSize: 12 }}>{s.employee}</td>
                      <td style={{ padding: '8px 12px', color: MUTED, fontSize: 12, textTransform: 'capitalize' }}>{s.paymentMethod}</td>
                      <td style={{ padding: '8px 12px', color: DIM, fontSize: 12, textAlign: 'right' }}>{fmt$(s.subtotal)}</td>
                      <td style={{ padding: '8px 12px', color: MUTED, fontSize: 12, textAlign: 'right' }}>{fmt$(s.tax)}</td>
                      <td style={{ padding: '8px 12px', color: GREEN, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{fmt$(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
