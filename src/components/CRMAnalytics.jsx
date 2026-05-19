/**
 * CRMAnalytics — read-only analytics for leads captured in a date range.
 * Data source: Supabase via fetchLeadsForAnalytics (organization_id scoped).
 * Entry point: Admin > Customers > CRM Analytics
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchLeadsForAnalytics } from '../services/supabaseDashboard'
import { isSupabaseConfigured } from '../services/supabaseRead'

// ── Design tokens — CSS custom properties (dark/light theme aware) ─────────────
const BG     = 'var(--c-bg)'
const CARD   = 'var(--c-bg-card)'
const PANEL  = 'var(--c-bg-panel)'
const BORDER = 'var(--c-border)'
const MUTED  = 'var(--c-text-muted)'
const TEXT   = 'var(--c-text)'
const GREEN  = '#22c55e'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'
const TEAL   = '#14b8a6'

// ── Date presets ──────────────────────────────────────────────────────────────
const PRESETS = [
  { id: 'today',     label: 'Today'      },
  { id: 'yesterday', label: 'Yesterday'  },
  { id: '7d',        label: 'Last 7d'    },
  { id: 'mtd',       label: 'This Month' },
  { id: 'custom',    label: 'Custom'     },
]

function rangeFor(id) {
  const now = new Date()
  const tod = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eod = new Date(tod.getTime() + 86_400_000)
  switch (id) {
    case 'today':     return { start: tod, end: eod }
    case 'yesterday': return { start: new Date(tod.getTime() - 86_400_000), end: tod }
    case '7d':        return { start: new Date(tod.getTime() - 6 * 86_400_000), end: eod }
    case 'mtd':       return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: eod }
    default:          return null
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmtPct = n  => `${Number(n || 0).toFixed(1)}%`
const fmtN   = n  => Number(n || 0).toLocaleString()
const fmt$   = n  => `$${Number(n || 0).toFixed(2)}`
const hasPhone = l => l.phone && l.phone.replace(/\D/g, '').length >= 7
const hasEmail = l => l.email && l.email.includes('@')

// ── Pure analytics computation ────────────────────────────────────────────────
function computeAnalytics(leads, start, end) {
  const total = leads.length
  if (total === 0) return null

  // Contact quality
  const withPhone = leads.filter(hasPhone).length
  const withEmail = leads.filter(hasEmail).length
  const withBoth  = leads.filter(l => hasPhone(l) && hasEmail(l)).length
  const noContact = leads.filter(l => !hasPhone(l) && !hasEmail(l)).length

  // SMS Consent
  const consent = { opted_in: 0, unknown: 0, opted_out: 0 }
  leads.forEach(l => {
    const k = l.smsConsent || 'unknown'
    consent[k] = (consent[k] || 0) + 1
  })

  // By seller
  const sellerMap = {}
  leads.forEach(l => {
    const k = l.capturedBy || 'Unknown'
    sellerMap[k] = (sellerMap[k] || 0) + 1
  })

  // By location
  const locMap = {}
  leads.forEach(l => {
    const k = l.locationName || 'Unknown'
    locMap[k] = (locMap[k] || 0) + 1
  })

  // Conversion: lead has any purchase ever
  const converted = leads.filter(l => l.purchases.length > 0).length
  const convRate  = total > 0 ? converted / total * 100 : 0

  // Revenue + transactions from purchases in the selected period
  let periodRevenue = 0
  let periodTxCount = 0
  leads.forEach(l => {
    l.purchases.forEach(p => {
      if (!p.date) return
      const d = new Date(p.date)
      if (d >= start && d < end) {
        periodRevenue += p.total || 0
        periodTxCount++
      }
    })
  })
  const avgTicket = periodTxCount > 0 ? periodRevenue / periodTxCount : 0

  // Repeat customers: leads with 2+ purchases
  const repeat     = leads.filter(l => l.purchases.length > 1).length
  const firstTime  = total - repeat

  return {
    total, withPhone, withEmail, withBoth, noContact,
    consent,
    bySeller:   Object.entries(sellerMap).sort(([, a], [, b]) => b - a),
    byLocation: Object.entries(locMap).sort(([, a], [, b]) => b - a),
    converted, convRate, periodRevenue, periodTxCount, avgTicket,
    repeat, firstTime,
  }
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, icon, color = GREEN }) {
  return (
    <div style={{
      flex: '1 1 130px', minWidth: 110,
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 5,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
        {icon && <span style={{ fontSize: 16, lineHeight: 1 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: MUTED }}>{sub}</div>}
    </div>
  )
}

function SectionTitle({ title, icon }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
      {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
      <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.6, textTransform: 'uppercase' }}>{title}</span>
    </div>
  )
}

function Panel({ title, icon, children, style = {} }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px', ...style }}>
      <SectionTitle title={title} icon={icon} />
      {children}
    </div>
  )
}

function BarRow({ label, count, total, color = BLUE }) {
  const pct = total > 0 ? Math.min(100, count / total * 100) : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{
          fontSize: 13, color: TEXT, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%',
        }}>{label}</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 13, color, fontWeight: 700 }}>{count}</span>
          <span style={{ fontSize: 11, color: MUTED, minWidth: 36, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function ConsentPill({ label, count, total, color, icon }) {
  const pct = total > 0 ? count / total * 100 : 0
  return (
    <div style={{
      flex: '1 1 120px',
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 10, color: MUTED, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1, marginBottom: 4 }}>{count}</div>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>{fmtPct(pct)} of leads</div>
      <div style={{ height: 4, background: BORDER, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[70, 110, 110, 160].map((h, i) => (
        <div key={i} style={{ height: h, borderRadius: 10, background: CARD, border: `1px solid ${BORDER}` }} />
      ))}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function CRMAnalytics() {
  const [preset,        setPreset]        = useState('today')
  const [customStart,   setCustomStart]   = useState('')
  const [customEnd,     setCustomEnd]     = useState('')
  const [showCustom,    setShowCustom]    = useState(false)
  const [locFilter,     setLocFilter]     = useState('all')
  const [sellerFilter,  setSellerFilter]  = useState('all')
  const [consentFilter, setConsentFilter] = useState('all')
  const [rawLeads,      setRawLeads]      = useState([])
  const [loading,       setLoading]       = useState(false)
  const [fetchedAt,     setFetchedAt]     = useState(null)
  const [fetchError,    setFetchError]    = useState(null)

  // ── Date range ────────────────────────────────────────────────────────────
  const { start, end } = useMemo(() => {
    if (preset === 'custom') {
      if (customStart && customEnd)
        return {
          start: new Date(customStart + 'T00:00:00'),
          end:   new Date(customEnd   + 'T23:59:59.999'),
        }
      return { start: null, end: null }
    }
    return rangeFor(preset) || rangeFor('today')
  }, [preset, customStart, customEnd])

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!start || !end) return
    setLoading(true)
    setFetchError(null)
    try {
      // +1ms makes upper bound inclusive
      const data = await fetchLeadsForAnalytics(start, new Date(end.getTime() + 1))
      setRawLeads(Array.isArray(data) ? data : [])
      setFetchedAt(new Date())
    } catch (e) {
      setFetchError(e.message)
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => { load() }, [load])

  // ── Client-side filtering ─────────────────────────────────────────────────
  const leads = useMemo(() => {
    let list = rawLeads
    if (locFilter     !== 'all') list = list.filter(l => (l.locationName || 'Unknown') === locFilter)
    if (sellerFilter  !== 'all') list = list.filter(l => (l.capturedBy   || 'Unknown') === sellerFilter)
    if (consentFilter !== 'all') list = list.filter(l => (l.smsConsent   || 'unknown') === consentFilter)
    return list
  }, [rawLeads, locFilter, sellerFilter, consentFilter])

  // Filter options derived from raw data (before client filters)
  const allLocations = useMemo(
    () => [...new Set(rawLeads.map(l => l.locationName || 'Unknown'))].sort(),
    [rawLeads]
  )
  const allSellers = useMemo(
    () => [...new Set(rawLeads.map(l => l.capturedBy || 'Unknown').filter(Boolean))].sort(),
    [rawLeads]
  )

  // ── Analytics ─────────────────────────────────────────────────────────────
  const stats = useMemo(
    () => (start && end ? computeAnalytics(leads, start, end) : null),
    [leads, start, end]
  )

  const presetLabel = preset === 'custom' && customStart && customEnd
    ? `${customStart} – ${customEnd}`
    : PRESETS.find(p => p.id === preset)?.label || ''

  const isFiltered = locFilter !== 'all' || sellerFilter !== 'all' || consentFilter !== 'all'

  // ── Early guard ───────────────────────────────────────────────────────────
  if (!isSupabaseConfigured()) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: BG, padding: 32 }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <p style={{ color: MUTED, fontSize: 14, fontWeight: 600 }}>Supabase not configured</p>
          <p style={{ color: 'var(--c-text-dim)', fontSize: 12, marginTop: 6 }}>
            CRM Analytics requires a live Supabase connection. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: BG }}>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div style={{
        background: PANEL, borderBottom: `1px solid ${BORDER}`,
        padding: '10px 20px', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center',
        flexShrink: 0,
      }}>
        {/* Date presets */}
        {PRESETS.map(p => (
          <button key={p.id} onClick={() => {
            setPreset(p.id)
            if (p.id === 'custom') setShowCustom(v => !v)
            else setShowCustom(false)
          }} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${preset === p.id ? BLUE : BORDER}`,
            background: preset === p.id ? `${BLUE}18` : 'transparent',
            color: preset === p.id ? '#93c5fd' : MUTED,
            transition: 'all 0.15s',
          }}>{p.label}</button>
        ))}

        {/* Custom date inputs */}
        {showCustom && (
          <>
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
              style={{ padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
            <span style={{ color: MUTED, fontSize: 12 }}>→</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
              style={{ padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12 }} />
          </>
        )}

        {/* Right-side filters */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {allLocations.length > 1 && (
            <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{
              padding: '5px 10px', background: CARD, border: `1px solid ${locFilter !== 'all' ? AMBER : BORDER}`,
              borderRadius: 6, color: locFilter !== 'all' ? AMBER : MUTED, fontSize: 12, cursor: 'pointer',
            }}>
              <option value="all">📍 All Locations</option>
              {allLocations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}

          {allSellers.length > 1 && (
            <select value={sellerFilter} onChange={e => setSellerFilter(e.target.value)} style={{
              padding: '5px 10px', background: CARD, border: `1px solid ${sellerFilter !== 'all' ? PURPLE : BORDER}`,
              borderRadius: 6, color: sellerFilter !== 'all' ? PURPLE : MUTED, fontSize: 12, cursor: 'pointer',
            }}>
              <option value="all">👤 All Sellers</option>
              {allSellers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          <select value={consentFilter} onChange={e => setConsentFilter(e.target.value)} style={{
            padding: '5px 10px', background: CARD, border: `1px solid ${consentFilter !== 'all' ? GREEN : BORDER}`,
            borderRadius: 6, color: consentFilter !== 'all' ? GREEN : MUTED, fontSize: 12, cursor: 'pointer',
          }}>
            <option value="all">📱 All Consent</option>
            <option value="opted_in">✅ Opted In</option>
            <option value="unknown">❓ Unknown</option>
            <option value="opted_out">🚫 Opted Out</option>
          </select>

          {isFiltered && (
            <button onClick={() => { setLocFilter('all'); setSellerFilter('all'); setConsentFilter('all') }} style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              border: `1px solid ${RED}44`, background: `${RED}12`, color: RED, cursor: 'pointer',
            }}>✕ Clear filters</button>
          )}

          <button onClick={load} disabled={loading} style={{
            padding: '5px 12px', borderRadius: 6, border: `1px solid ${BORDER}`,
            background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer',
            opacity: loading ? 0.5 : 1, transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = '#93c5fd' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >⟳ Refresh</button>
        </div>
      </div>

      {/* ── Status bar ───────────────────────────────────────────────────── */}
      <div style={{
        background: PANEL, borderBottom: `1px solid ${BORDER}`,
        padding: '5px 20px', display: 'flex', gap: 16, alignItems: 'center',
        fontSize: 11, color: MUTED, flexShrink: 0,
      }}>
        <span>{loading ? '⟳ Loading…' : fetchedAt ? `Updated ${fetchedAt.toLocaleTimeString()}` : ''}</span>
        {fetchError && <span style={{ color: RED }}>⚠ {fetchError}</span>}
        {!loading && !fetchError && rawLeads.length > 0 && (
          <span>
            {leads.length !== rawLeads.length
              ? `${leads.length} of ${rawLeads.length} leads shown`
              : `${rawLeads.length} leads`
            }
            {' · '}{presetLabel}
            {' · '}
            <span style={{ color: '#60a5fa' }}>Supabase ✓</span>
          </span>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Loading */}
        {loading && <Skeleton />}

        {/* Empty */}
        {!loading && !fetchError && !stats && (
          <div style={{ textAlign: 'center', padding: '80px 20px' }}>
            <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.35 }}>👤</div>
            <p style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>No leads in this period</p>
            <p style={{ color: 'var(--c-text-dim)', fontSize: 12, marginTop: 6 }}>
              Try a wider date range or check your location / seller filters.
            </p>
          </div>
        )}

        {/* Error */}
        {!loading && fetchError && (
          <div style={{ background: `${RED}10`, border: `1px solid ${RED}44`, borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ color: RED, fontSize: 13, fontWeight: 600 }}>Failed to load analytics</p>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>{fetchError}</p>
          </div>
        )}

        {/* ── Analytics content ─────────────────────────────────────────── */}
        {!loading && stats && (
          <>

            {/* ── KPI Row: Volume + Revenue ──────────────────────────────── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <KpiCard label="Leads Captured"   value={fmtN(stats.total)}     icon="👤" color={BLUE}   />
              <KpiCard label="Converted"         value={fmtN(stats.converted)} icon="✅" color={GREEN}
                sub={`${fmtPct(stats.convRate)} conversion rate`} />
              <KpiCard label="Revenue (CRM)"     value={fmt$(stats.periodRevenue)} icon="💵" color={GREEN}
                sub={`${stats.periodTxCount} transaction${stats.periodTxCount !== 1 ? 's' : ''} in period`} />
              <KpiCard label="Avg Ticket (CRM)"  value={stats.avgTicket > 0 ? fmt$(stats.avgTicket) : '—'} icon="🎯" color={AMBER} />
              <KpiCard label="Repeat Customers"  value={fmtN(stats.repeat)}    icon="🔄" color={PURPLE}
                sub="2+ purchases" />
            </div>

            {/* ── Contact Quality ───────────────────────────────────────── */}
            <Panel title="Contact Quality" icon="📋">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KpiCard label="Has Phone"     value={stats.withPhone} icon="📞" color={GREEN}
                  sub={fmtPct(stats.total > 0 ? stats.withPhone / stats.total * 100 : 0)} />
                <KpiCard label="Has Email"     value={stats.withEmail} icon="✉️"  color={BLUE}
                  sub={fmtPct(stats.total > 0 ? stats.withEmail / stats.total * 100 : 0)} />
                <KpiCard label="Phone + Email" value={stats.withBoth}  icon="⭐" color={AMBER}
                  sub={fmtPct(stats.total > 0 ? stats.withBoth  / stats.total * 100 : 0)} />
                <KpiCard label="No Contact"    value={stats.noContact} icon="❌" color={RED}
                  sub={fmtPct(stats.total > 0 ? stats.noContact / stats.total * 100 : 0)} />
              </div>
            </Panel>

            {/* ── SMS Consent ────────────────────────────────────────────── */}
            <Panel title="SMS Consent" icon="📱">
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <ConsentPill label="Opted In"  count={stats.consent.opted_in  || 0} total={stats.total} color={GREEN} icon="✅" />
                <ConsentPill label="Unknown"   count={stats.consent.unknown   || 0} total={stats.total} color={MUTED} icon="❓" />
                <ConsentPill label="Opted Out" count={stats.consent.opted_out || 0} total={stats.total} color={RED}   icon="🚫" />
              </div>
            </Panel>

            {/* ── Leads by Seller + Location ─────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <Panel title="Leads by Seller" icon="👤">
                {stats.bySeller.length === 0
                  ? <p style={{ color: MUTED, fontSize: 12 }}>No seller data</p>
                  : stats.bySeller.map(([name, count]) => (
                      <BarRow key={name} label={name} count={count} total={stats.total} color={BLUE} />
                    ))
                }
              </Panel>
              <Panel title="Leads by Location" icon="📍">
                {stats.byLocation.length === 0
                  ? <p style={{ color: MUTED, fontSize: 12 }}>No location data</p>
                  : stats.byLocation.map(([name, count]) => (
                      <BarRow key={name} label={name} count={count} total={stats.total} color={AMBER} />
                    ))
                }
              </Panel>
            </div>

            {/* ── Conversion Detail ──────────────────────────────────────── */}
            <Panel title="Conversion Details" icon="🔁">
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <BarRow label={`Converted (${stats.converted})`}             count={stats.converted}             total={stats.total} color={GREEN} />
                  <BarRow label={`Not yet (${stats.total - stats.converted})`} count={stats.total - stats.converted} total={stats.total} color={MUTED} />
                  <div style={{ marginTop: 12 }}>
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      background: `${GREEN}12`, border: `1px solid ${GREEN}33`, borderRadius: 20,
                      padding: '5px 12px', fontSize: 13, fontWeight: 700, color: GREEN,
                    }}>
                      {fmtPct(stats.convRate)} Conversion Rate
                    </div>
                  </div>
                </div>
                <div style={{
                  flex: '1 1 220px', padding: '12px 16px',
                  background: BG, borderRadius: 8, border: `1px solid ${BORDER}`,
                  fontSize: 12, color: MUTED, lineHeight: 1.8,
                }}>
                  <p style={{ color: TEXT, fontWeight: 600, marginBottom: 6, fontSize: 12 }}>How conversion is counted</p>
                  <p>A lead is "converted" when their CRM profile has at least one purchase recorded.</p>
                  <p>Revenue counts purchases with a date falling inside the selected range.</p>
                  <p style={{ marginTop: 6, color: AMBER }}>
                    ⚠ Walk-in sales without CRM capture are not reflected here.
                  </p>
                </div>
              </div>
            </Panel>

            {/* ── Repeat Customers ──────────────────────────────────────── */}
            <Panel title="Repeat vs First-time" icon="🔄">
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <BarRow label={`Returning (${stats.repeat})`}    count={stats.repeat}    total={stats.total} color={PURPLE} />
                  <BarRow label={`First-time (${stats.firstTime})`} count={stats.firstTime} total={stats.total} color={TEAL}   />
                </div>
                <div style={{ display: 'flex', gap: 12, flex: '1 1 220px' }}>
                  <div style={{
                    flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '14px 16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: PURPLE }}>{stats.repeat}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Returning</div>
                  </div>
                  <div style={{
                    flex: 1, background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                    padding: '14px 16px', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: 28, fontWeight: 800, color: TEAL }}>{stats.firstTime}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>First-time</div>
                  </div>
                </div>
              </div>
            </Panel>

          </>
        )}

        {/* Footer note */}
        {!loading && (
          <div style={{ fontSize: 11, color: 'var(--c-text-dim)', textAlign: 'center', paddingTop: 4, paddingBottom: 8 }}>
            Data pulled from Supabase · organization-scoped · pendingSync local leads excluded
          </div>
        )}
      </div>
    </div>
  )
}
