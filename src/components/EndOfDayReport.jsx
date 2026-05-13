import { useState, useMemo, useEffect } from 'react'
import { DEFAULT_LOCATION } from '../config/branding'
import { loadLocationConfig } from '../utils/locationConfig'
import { loadCRM } from '../utils/crmStorage'
import { fetchSalesByLocationAndDate, fetchClockRecordsByDate, fetchEODNotes } from '../services/supabaseRead'
import { upsertEODNotes, patchClockOut } from '../services/supabaseWrite'
import { byPaymentMethod } from '../services/dashboardService'
import { printEODReceipt } from '../utils/printEODReceipt'
import { loadClockRecords, saveClockRecords } from '../utils/clockStorage'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'
const MUTED  = 'var(--c-text-muted)'
const DIM    = 'var(--c-text-sub)'
const TEXT   = 'var(--c-text)'
const ORANGE = '#f97316'
const CYAN   = '#06b6d4'

const fmt$    = (n) => `$${(n || 0).toFixed(2)}`
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
const fmtHrs  = (h) => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  return `${hh}h ${String(mm).padStart(2, '0')}m`
}

function dateToInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inputToDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// ── Minimal SVG donut chart ───────────────────────────────────────────────────
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
    const x1 = cx + r * Math.cos(angle); const y1 = cy + r * Math.sin(angle)
    angle += sweep
    const x2 = cx + r * Math.cos(angle); const y2 = cy + r * Math.sin(angle)
    const large = sweep > Math.PI ? 1 : 0
    return { d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`, color: s.color }
  })
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={CARD} strokeWidth={stroke} />
      {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={p.color} strokeWidth={stroke} strokeLinecap="butt" />)}
      <circle cx={cx} cy={cy} r={r - stroke / 2} fill={PANEL} />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fill={TEXT} fontSize="11" fontWeight="700">
        {slices.filter(s => s.value > 0).length}
      </text>
      <text x={cx} y={cy + 11} textAnchor="middle" dominantBaseline="middle" fill={MUTED} fontSize="7">methods</text>
    </svg>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function EndOfDayReport({ onClose, sales = [], posSession, adminMode = false }) {
  const [notes,       setNotes]       = useState('')
  const [saved,       setSaved]       = useState(false)  // false | 'saving' | 'ok' | 'error'
  const [notesDirty,  setNotesDirty]  = useState(false)
  const [printStatus, setPrintStatus] = useState('idle') // 'idle' | 'printing' | 'done' | 'error'
  const [autoClocked, setAutoClocked] = useState(0)     // # employees auto-clocked out on this print
  const [section, setSection]           = useState('overview')
  const [selectedDate, setSelectedDate] = useState(() => dateToInput(new Date()))
  const [rawSales, setRawSales]         = useState(null)    // null = not yet fetched
  const [clockRecords, setClockRecords] = useState(null)
  const [dataSource, setDataSource]     = useState('loading') // 'loading' | 'supabase' | 'local'

  const location   = posSession?.location || DEFAULT_LOCATION
  const locCfg     = loadLocationConfig(location)
  const taxRatePct = locCfg?.taxRate ?? 8.5
  const taxLabel   = locCfg?.taxDisplayAs || 'TAX'
  const isToday    = selectedDate === dateToInput(new Date())

  // ── POS mode: always lock to today regardless of any prop manipulation ────────
  useEffect(() => {
    if (!adminMode) setSelectedDate(dateToInput(new Date()))
  }, [adminMode])

  // ── Fetch fresh data from Supabase on open and on date change ────────────────
  // Immediately shows local-prop data while fetching (no blank loading screen).
  // On success: replaces with Supabase data (accurate, location-filtered).
  // On failure: silently stays on local data.
  useEffect(() => {
    setDataSource('loading')
    setRawSales(null)
    setClockRecords(null)
    const date = inputToDate(selectedDate)
    Promise.all([
      fetchSalesByLocationAndDate({ locationName: location, date }),
      fetchClockRecordsByDate({ locationName: location, date }),
    ]).then(([salesRows, clockRows]) => {
      setRawSales(salesRows)
      setClockRecords(clockRows)
      setDataSource(salesRows !== null ? 'supabase' : 'local')
    })
  }, [location, selectedDate])

  // ── Load EOD notes from Supabase on location/date change ─────────────────────
  useEffect(() => {
    setNotes('')
    setNotesDirty(false)
    setSaved(false)
    fetchEODNotes({ locationName: location, date: inputToDate(selectedDate) })
      .then(n => { if (n !== null) setNotes(n) })
  }, [location, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset print status after 3s ──────────────────────────────────────────────
  useEffect(() => {
    if (printStatus === 'done' || printStatus === 'error') {
      const t = setTimeout(() => setPrintStatus('idle'), 3000)
      return () => clearTimeout(t)
    }
  }, [printStatus])

  // ── Auto clock-out notification fades after 6s ────────────────────────────────
  useEffect(() => {
    if (autoClocked > 0) {
      const t = setTimeout(() => setAutoClocked(0), 6000)
      return () => clearTimeout(t)
    }
  }, [autoClocked])

  // ── Data source resolution ────────────────────────────────────────────────────
  // While rawSales is null (Supabase not yet answered), use local prop as preview.
  const allDaySales = useMemo(() => {
    if (rawSales !== null) return rawSales
    const dateObj = inputToDate(selectedDate)
    return (sales || []).filter(s => {
      const d = new Date(s.timestamp)
      return (
        d.getFullYear() === dateObj.getFullYear() &&
        d.getMonth()    === dateObj.getMonth()    &&
        d.getDate()     === dateObj.getDate()     &&
        (!location || s.location === location)
      )
    })
  }, [rawSales, sales, selectedDate, location])

  const activeSales = useMemo(
    () => allDaySales.filter(s => s.status !== 'voided' && s.status !== 'deleted'),
    [allDaySales]
  )
  const voidedSales = useMemo(
    () => allDaySales.filter(s => s.status === 'voided' || s.status === 'deleted'),
    [allDaySales]
  )

  // ── KPI metrics ──────────────────────────────────────────────────────────────
  const netRevenue      = activeSales.reduce((s, x) => s + (x.subtotal || 0), 0)
  const taxRevenue      = activeSales.reduce((s, x) => s + (x.tax || 0), 0)
  const grossRevenue    = activeSales.reduce((s, x) => s + (x.total || 0), 0)
  const totalSpare      = activeSales.reduce((s, x) => s + (x.totalSpare || 0), 0)
  const totalCommission = activeSales.reduce(
    (s, x) => s + (x.commissionSnapshot?.commissionAtSale || 0), 0
  )
  const inventoryCost   = activeSales.reduce(
    (s, x) => s + (x.items || []).reduce((si, item) => si + (item.qty || 0) * (item.costPrice || 0), 0), 0
  )
  const refundAmount    = voidedSales.reduce((s, x) => s + (x.total || 0), 0)

  // ── Payment breakdown ─────────────────────────────────────────────────────────
  // Uses the payments[] array so split-payment sales are counted correctly.
  const payMethods = useMemo(() => {
    const PAY_COLORS = { cash: GREEN, card: BLUE, external: PURPLE, check: AMBER }
    return byPaymentMethod(activeSales).map((m, i) => ({
      label: m.label,
      value: m.total,
      color: PAY_COLORS[m.label] || [GREEN, BLUE, PURPLE, AMBER, CYAN][i % 5],
    }))
  }, [activeSales])

  const payMethodsDetailed = useMemo(() => {
    const STANDARD_KEYS = ['cash', 'external', 'card', 'check', 'storecredit']
    const inMap = {}, outMap = {}
    byPaymentMethod(activeSales).forEach(m => { inMap[m.label] = m.total })
    byPaymentMethod(voidedSales).forEach(m => { outMap[m.label] = m.total })
    const allKeys = [...new Set([...STANDARD_KEYS, ...Object.keys(inMap), ...Object.keys(outMap)])]
    return allKeys.map(label => ({ label, in: inMap[label] || 0, out: outMap[label] || 0 }))
  }, [activeSales, voidedSales])

  // ── By employee (sales + spare + commission) ──────────────────────────────────
  const byEmployeeData = useMemo(() => {
    const map = {}
    activeSales.forEach(s => {
      const name = s.employee || 'Unknown'
      if (!map[name]) map[name] = { name, subtotal: 0, count: 0, spare: 0, commission: 0 }
      map[name].subtotal   += s.subtotal || 0
      map[name].count      += 1
      map[name].spare      += s.totalSpare || 0
      map[name].commission += s.commissionSnapshot?.commissionAtSale || 0
    })
    return Object.values(map).sort((a, b) => b.subtotal - a.subtotal)
  }, [activeSales])

  // ── Clock hours per employee ──────────────────────────────────────────────────
  // For today: open clock-ins count up to now.
  // For past dates: open clock-ins (no clockOut) are excluded — shift wasn't closed.
  const clockHoursMap = useMemo(() => {
    if (!clockRecords) return null
    const map = {}
    clockRecords.forEach(r => {
      if (!map[r.employee]) map[r.employee] = 0
      const end = r.clockOut ? new Date(r.clockOut) : (isToday ? new Date() : null)
      if (!end) return
      map[r.employee] += Math.max(0, (end - new Date(r.clockIn)) / 3_600_000)
    })
    return map
  }, [clockRecords, isToday])

  // Merged employee rows: sales employees + clock-only employees
  const employeeRows = useMemo(() => {
    const rows = byEmployeeData.map(e => ({ ...e }))
    if (clockHoursMap) {
      Object.keys(clockHoursMap).forEach(name => {
        if (!rows.find(r => r.name === name)) {
          rows.push({ name, subtotal: 0, count: 0, spare: 0, commission: 0 })
        }
      })
    }
    return rows.sort((a, b) => b.subtotal - a.subtotal)
  }, [byEmployeeData, clockHoursMap])

  // ── Top products ──────────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map = {}
    activeSales.flatMap(s => s.items || []).forEach(item => {
      const name = item.product?.name || item.name || 'Unknown'
      map[name] = (map[name] || 0) + Math.max(0, item.qty || 1)
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [activeSales])

  // ── CRM: new customers for the selected date at this location ─────────────────
  const todayNewCustomers = useMemo(() => {
    const dateObj = inputToDate(selectedDate)
    return loadCRM().filter(c => {
      const d = new Date(c.createdAt || c.capturedAt || 0)
      return (
        d.getFullYear() === dateObj.getFullYear() &&
        d.getMonth()    === dateObj.getMonth()    &&
        d.getDate()     === dateObj.getDate()     &&
        (!c.capturedLocation || c.capturedLocation === location)
      )
    })
  }, [selectedDate, location])

  const leadsByEmployee = useMemo(() => {
    const map = {}
    todayNewCustomers.forEach(c => {
      const name = c.capturedBy || '(unattributed)'
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [todayNewCustomers])

  const maxLeads = Math.max(...leadsByEmployee.map(([, n]) => n), 1)

  const dateLabel = inputToDate(selectedDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const printedAt = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  const hasData   = activeSales.length > 0

  const statCard = (label, value, color, sub) => (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '14px 18px', borderLeft: `3px solid ${color}`,
    }}>
      <p style={{ color: MUTED, fontSize: 11, marginBottom: 6 }}>{label}</p>
      <p style={{ color, fontSize: 22, fontWeight: 800 }}>{value}</p>
      {sub && <p style={{ color: MUTED, fontSize: 10, marginTop: 4 }}>{sub}</p>}
    </div>
  )

  const sourceBadge = dataSource === 'loading'
    ? { dot: AMBER, text: 'Fetching…' }
    : dataSource === 'supabase'
    ? { dot: GREEN, text: 'Live · Supabase' }
    : { dot: AMBER, text: 'Offline · Local' }

  // ── Print handler: auto clock-out open shifts before printing today's EOD ────
  const handlePrint = () => {
    if (isToday && clockRecords) {
      const openRecords = clockRecords.filter(r => !r.clockOut)
      if (openRecords.length > 0) {
        const ts = new Date().toISOString()
        // 1. Update component state so employee hours immediately reflect clock-out
        setClockRecords(prev => prev.map(r => r.clockOut ? r : { ...r, clockOut: ts }))
        // 2. Persist to localStorage (offline-first)
        const stored  = loadClockRecords()
        const updated = stored.map(r => {
          if (r.clockOut) return r
          const isOpen = openRecords.some(o =>
            (r.supabaseId && o.id === r.supabaseId) ||
            (!r.supabaseId && o.employee === r.employee)
          )
          return isOpen ? { ...r, clockOut: ts } : r
        })
        saveClockRecords(updated)
        // 3. Sync to Supabase (fire-and-forget)
        openRecords.forEach(r => patchClockOut(r.id, ts))
        setAutoClocked(openRecords.length)
      }
    }

    printEODReceipt({
      location,
      dateLabel,
      printedAt,
      printedBy: posSession?.currentUser?.name || '',
      netRevenue,
      taxRevenue,
      grossRevenue,
      transactionCount: activeSales.length,
      taxRatePct,
      payMethodsDetailed,
      employeeSummary: byEmployeeData,
      productsSummary: topProducts.map(([name, qty]) => ({ name, qty })),
      voidedCount: voidedSales.length,
      refundAmount,
      notes,
      locCfg,
      printMode: locCfg?.printMode || 'browser',
      onStatus: setPrintStatus,
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: 20, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 10,
        width: '100%', maxWidth: 880, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '14px 22px', background: CARD, borderRadius: '10px 10px 0 0',
          borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(37,99,235,0.12)',
            border: '1px solid rgba(37,99,235,0.25)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0,
          }}>📊</div>

          <div style={{ minWidth: 0 }}>
            <p style={{ color: TEXT, fontWeight: 800, fontSize: 15 }}>End of Day Report</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>{location}</p>
          </div>

          {/* Date picker — only visible in adminMode; employees locked to today */}
          {adminMode ? (
            <input
              type="date"
              value={selectedDate}
              max={dateToInput(new Date())}
              onChange={e => { if (e.target.value) { setSelectedDate(e.target.value); setSaved(false) } }}
              style={{
                background: BG, border: `1px solid ${BORDER}`, borderRadius: 6,
                color: TEXT, fontSize: 12, padding: '5px 10px', cursor: 'pointer', outline: 'none',
                              }}
            />
          ) : (
            <span style={{ color: MUTED, fontSize: 12, padding: '5px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 6 }}>
              {inputToDate(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          )}

          {/* Data source badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', background: 'var(--c-bg)',
            border: `1px solid ${BORDER}`, borderRadius: 20,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: sourceBadge.dot }} />
            <span style={{ color: MUTED, fontSize: 10 }}>{sourceBadge.text}</span>
          </div>

          {/* Section toggle */}
          <div style={{
            marginLeft: 'auto', display: 'flex', gap: 6,
            background: BG, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 3,
          }}>
            {[{ key: 'overview', label: 'Overview' }, { key: 'invoices', label: 'Invoices' }].map(({ key, label }) => (
              <button key={key} onClick={() => setSection(key)} style={{
                padding: '5px 14px', border: 'none', borderRadius: 6, cursor: 'pointer',
                background: section === key ? BLUE : 'transparent',
                color: section === key ? '#fff' : MUTED,
                fontSize: 12, fontWeight: section === key ? 700 : 400, transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {autoClocked > 0 && (
            <span style={{
              fontSize: 11, color: AMBER, background: 'rgba(245,158,11,0.12)',
              border: '1px solid rgba(245,158,11,0.3)', borderRadius: 5,
              padding: '3px 8px', flexShrink: 0,
            }}>
              {autoClocked === 1 ? '1 employee auto-clocked out' : `${autoClocked} employees auto-clocked out`}
            </span>
          )}

          <button
            disabled={printStatus === 'printing'}
            onClick={handlePrint}
            style={{
              background: printStatus === 'done'  ? 'rgba(34,197,94,0.1)'
                        : printStatus === 'error' ? 'rgba(239,68,68,0.1)'
                        : 'rgba(59,130,246,0.1)',
              border: printStatus === 'done'  ? '1px solid rgba(34,197,94,0.3)'
                    : printStatus === 'error' ? '1px solid rgba(239,68,68,0.3)'
                    : `1px solid rgba(59,130,246,0.3)`,
              borderRadius: 6,
              color: printStatus === 'done'  ? GREEN
                   : printStatus === 'error' ? RED
                   : BLUE,
              fontSize: 12, fontWeight: 600,
              cursor: printStatus === 'printing' ? 'wait' : 'pointer',
              padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 5,
              transition: 'all 0.2s', flexShrink: 0,
            }}
          >
            {printStatus === 'printing' ? '⏳ Printing…'
           : printStatus === 'done'     ? '✓ Sent'
           : printStatus === 'error'    ? '⚠ Error'
           : '🖨 Print'}
          </button>

          <button onClick={onClose} style={{
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6,
            color: MUTED, fontSize: 20, cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s', flexShrink: 0,
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >×</button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 18 }}>

          <p style={{ color: 'var(--c-text-dim)', fontSize: 11 }}>{dateLabel} · Printed at {printedAt}</p>

          {/* ══ OVERVIEW ══ */}
          {section === 'overview' && (
            <>
              {/* Row 1 — Revenue */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 10 }}>
                {statCard('Net Revenue',     fmt$(netRevenue),   GREEN,  `${activeSales.length} transactions`)}
                {statCard(taxLabel,          fmt$(taxRevenue),   AMBER,  `${taxRatePct}%`)}
                {statCard('Gross Revenue',   fmt$(grossRevenue), BLUE,   'Net + Tax')}
                {statCard('Total Spare',     fmt$(totalSpare),   PURPLE, 'Above min price')}
                {statCard('Commission',      fmt$(totalCommission), CYAN, totalCommission > 0 ? 'All employees' : 'No data yet')}
                {adminMode && statCard('Inventory Cost', fmt$(inventoryCost), ORANGE, inventoryCost > 0 ? 'COGS at sale' : 'No cost data')}
              </div>

              {/* Refunds banner */}
              {voidedSales.length > 0 && (
                <div style={{
                  padding: '10px 16px', borderRadius: 8,
                  background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.25)`,
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <span style={{ color: RED, fontSize: 13, fontWeight: 700 }}>
                    {voidedSales.length} voided sale{voidedSales.length !== 1 ? 's' : ''}
                  </span>
                  <span style={{ color: MUTED, fontSize: 12 }}>·</span>
                  <span style={{ color: DIM, fontSize: 12 }}>{fmt$(refundAmount)} removed from totals</span>
                </div>
              )}

              {!hasData && (
                <div style={{ padding: 40, textAlign: 'center', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
                  <p style={{ color: MUTED, fontSize: 13 }}>No sales recorded{isToday ? ' today' : ' on this date'}</p>
                </div>
              )}

              {hasData && (
                <>
                  {/* Payment methods */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
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
                                  <span style={{ color: DIM, fontSize: 12, textTransform: 'capitalize' }}>{m.label}</span>
                                </div>
                                <span style={{ color: m.color, fontSize: 12, fontWeight: 700 }}>{fmt$(m.value)}</span>
                              </div>
                              <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                                <div style={{ height: '100%', borderRadius: 2, background: m.color, width: `${grossRevenue > 0 ? (m.value / grossRevenue) * 100 : 0}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* New customers */}
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>LEADS CAPTURED</p>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '3px 10px',
                          background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                          borderRadius: 20, color: CYAN,
                        }}>{todayNewCustomers.length} new</span>
                      </div>
                      {leadsByEmployee.length === 0 ? (
                        <p style={{ color: 'var(--c-text-dim)', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>None captured</p>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          {leadsByEmployee.map(([name, count], i) => (
                            <div key={name}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                                <span style={{ color: i === 0 ? TEXT : DIM, fontSize: 12, fontWeight: i === 0 ? 700 : 400 }}>
                                  {i === 0 && '🏆 '}{name}
                                </span>
                                <span style={{ color: CYAN, fontSize: 12, fontWeight: 700 }}>{count} lead{count !== 1 ? 's' : ''}</span>
                              </div>
                              <div style={{ height: 4, background: BORDER, borderRadius: 2 }}>
                                <div style={{ height: '100%', borderRadius: 2, background: i === 0 ? CYAN : 'var(--c-text-dim)', width: `${(count / maxLeads) * 100}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Employee performance table */}
                  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ padding: '14px 18px 10px', borderBottom: `1px solid ${BORDER}` }}>
                      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>EMPLOYEE PERFORMANCE</p>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Employee', 'Sales', 'Net Rev', 'Spare', 'Commission', 'Hours'].map(h => (
                            <th key={h} style={{
                              padding: '8px 14px', textAlign: h === 'Employee' ? 'left' : 'right',
                              color: MUTED, fontWeight: 600, fontSize: 10,
                              background: 'var(--c-bg)', borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {employeeRows.map((emp, i) => {
                          const hrs = clockHoursMap?.[emp.name]
                          return (
                            <tr key={emp.name} style={{
                              borderBottom: `1px solid var(--c-border-row)`,
                              background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                            }}>
                              <td style={{ padding: '9px 14px', color: TEXT, fontSize: 13, fontWeight: 600 }}>{emp.name}</td>
                              <td style={{ padding: '9px 14px', color: MUTED, fontSize: 12, textAlign: 'right' }}>{emp.count}</td>
                              <td style={{ padding: '9px 14px', color: GREEN, fontSize: 13, fontWeight: 700, textAlign: 'right' }}>{fmt$(emp.subtotal)}</td>
                              <td style={{ padding: '9px 14px', color: PURPLE, fontSize: 12, textAlign: 'right' }}>{fmt$(emp.spare)}</td>
                              <td style={{ padding: '9px 14px', color: CYAN, fontSize: 12, textAlign: 'right' }}>
                                {emp.commission > 0 ? fmt$(emp.commission) : <span style={{ color: 'var(--c-text-dim)' }}>—</span>}
                              </td>
                              <td style={{ padding: '9px 14px', color: AMBER, fontSize: 12, textAlign: 'right' }}>
                                {hrs != null ? fmtHrs(hrs) : <span style={{ color: 'var(--c-text-dim)' }}>—</span>}
                              </td>
                            </tr>
                          )
                        })}
                        {/* Totals row */}
                        <tr style={{ borderTop: `1px solid ${BORDER}`, background: 'var(--c-bg)' }}>
                          <td style={{ padding: '9px 14px', color: MUTED, fontSize: 11, fontWeight: 700 }}>TOTAL</td>
                          <td style={{ padding: '9px 14px', color: MUTED, fontSize: 11, textAlign: 'right' }}>{activeSales.length}</td>
                          <td style={{ padding: '9px 14px', color: GREEN, fontSize: 13, fontWeight: 800, textAlign: 'right' }}>{fmt$(netRevenue)}</td>
                          <td style={{ padding: '9px 14px', color: PURPLE, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt$(totalSpare)}</td>
                          <td style={{ padding: '9px 14px', color: CYAN, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>
                            {totalCommission > 0 ? fmt$(totalCommission) : <span style={{ color: 'var(--c-text-dim)' }}>—</span>}
                          </td>
                          <td style={{ padding: '9px 14px', color: 'var(--c-text-dim)', fontSize: 11, textAlign: 'right' }}>—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Top products */}
                  {topProducts.length > 0 && (
                    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>TOP PRODUCTS</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
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

                  <p style={{ color: 'var(--c-text-dim)', fontSize: 11, textAlign: 'center' }}>
                    No Refunds. Exchanges within 14 days.
                  </p>
                </>
              )}

              {/* Notes — always visible regardless of sales data */}
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: 18 }}>
                <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>ADDITIONAL NOTES</p>
                <textarea
                  value={notes}
                  onChange={e => { setNotes(e.target.value); setNotesDirty(true); setSaved(false) }}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                  <button
                    disabled={saved === 'saving'}
                    onClick={async () => {
                      setSaved('saving')
                      const ok = await upsertEODNotes({
                        locationName: location,
                        date: inputToDate(selectedDate),
                        notes,
                      })
                      setSaved(ok ? 'ok' : 'error')
                      setNotesDirty(false)
                    }}
                    style={{
                      padding: '7px 18px',
                      background: saved === 'ok' ? 'rgba(34,197,94,0.1)' : saved === 'error' ? 'rgba(239,68,68,0.1)' : BLUE,
                      border: saved === 'ok' ? `1px solid rgba(34,197,94,0.3)` : saved === 'error' ? `1px solid rgba(239,68,68,0.3)` : 'none',
                      borderRadius: 6, color: saved === 'ok' ? GREEN : saved === 'error' ? RED : '#fff',
                      fontSize: 12, fontWeight: 700, cursor: saved === 'saving' ? 'wait' : 'pointer', transition: 'all 0.2s',
                    }}
                  >
                    {saved === 'saving' ? 'Saving…' : saved === 'ok' ? '✓ Saved' : saved === 'error' ? '⚠ Error' : 'Save Notes'}
                  </button>
                  {saved === 'ok' && <span style={{ color: MUTED, fontSize: 11 }}>Synced to Supabase</span>}
                  {saved === 'error' && <span style={{ color: RED, fontSize: 11 }}>Could not save — check connection</span>}
                </div>
              </div>
            </>
          )}

          {/* ══ INVOICES ══ */}
          {section === 'invoices' && (
            <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Invoice #', 'Time', 'Employee', 'Payment', 'Subtotal', 'Tax', 'Total', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '8px 12px',
                        textAlign: ['Subtotal','Tax','Total'].includes(h) ? 'right' : 'left',
                        color: MUTED, fontWeight: 600, fontSize: 10,
                        background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allDaySales.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 13 }}>
                        No sales{isToday ? ' today' : ' on this date'}
                      </td>
                    </tr>
                  )}
                  {allDaySales.map((s, i) => {
                    const voided = s.status === 'voided' || s.status === 'deleted'
                    return (
                      <tr key={s.number ?? i} style={{
                        borderBottom: `1px solid var(--c-border-row)`,
                        background: voided
                          ? 'rgba(239,68,68,0.04)'
                          : i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                        opacity: voided ? 0.6 : 1,
                      }}>
                        <td style={{ padding: '8px 12px', color: voided ? RED : BLUE, fontWeight: 700, fontSize: 13, textDecoration: voided ? 'line-through' : 'none' }}>
                          {s.number}
                        </td>
                        <td style={{ padding: '8px 12px', color: DIM, fontSize: 12 }}>{fmtTime(s.timestamp)}</td>
                        <td style={{ padding: '8px 12px', color: DIM, fontSize: 12 }}>{s.employee}</td>
                        <td style={{ padding: '8px 12px', color: MUTED, fontSize: 12, textTransform: 'capitalize' }}>{s.paymentMethod}</td>
                        <td style={{ padding: '8px 12px', color: DIM, fontSize: 12, textAlign: 'right' }}>{fmt$(s.subtotal)}</td>
                        <td style={{ padding: '8px 12px', color: MUTED, fontSize: 12, textAlign: 'right' }}>{fmt$(s.tax)}</td>
                        <td style={{ padding: '8px 12px', color: voided ? RED : GREEN, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{fmt$(s.total)}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'left' }}>
                          {voided
                            ? <span style={{ color: RED, fontSize: 10, fontWeight: 700, padding: '2px 7px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10 }}>VOIDED</span>
                            : <span style={{ color: GREEN, fontSize: 10, fontWeight: 700, padding: '2px 7px', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10 }}>OK</span>
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {activeSales.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--c-bg)', borderTop: `1px solid ${BORDER}` }}>
                      <td colSpan={4} style={{ padding: '9px 12px', color: MUTED, fontSize: 11, fontWeight: 700 }}>
                        TOTAL ({activeSales.length} active{voidedSales.length > 0 ? ` · ${voidedSales.length} voided` : ''})
                      </td>
                      <td style={{ padding: '9px 12px', color: DIM, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt$(netRevenue)}</td>
                      <td style={{ padding: '9px 12px', color: MUTED, fontSize: 12, fontWeight: 700, textAlign: 'right' }}>{fmt$(taxRevenue)}</td>
                      <td style={{ padding: '9px 12px', color: GREEN, fontSize: 14, fontWeight: 800, textAlign: 'right' }}>{fmt$(grossRevenue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
