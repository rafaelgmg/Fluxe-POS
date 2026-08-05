import { useState, useMemo, useEffect } from 'react'
import { RETAIL_LOCATIONS as LOCATIONS_CFG } from '../config/branding'
import { loadAllProducts } from '../utils/productsStorage'
import { fetchProducts } from '../services/supabaseRead'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const AMBER  = '#f59e0b'
const MUTED  = 'var(--c-text-muted)'
const TEXT   = 'var(--c-text)'
const DIM    = 'var(--c-text-sub)'
const TEAL   = '#06b6d4'

const PAY_COLORS = {
  'Cash':            '#22c55e',
  'Credit Card':     '#3b82f6',
  'External Credit': '#f59e0b',
  'Check':           '#8b5cf6',
}
const PAY_COLOR_DEFAULT = 'var(--c-text-sub)'

// Normalize raw payment method strings (e.g. "cash", "card") → display labels
function normalizeMethodLabel(m) {
  if (!m) return 'Other'
  const l = m.toLowerCase()
  if (l === 'cash')                                 return 'Cash'
  if (l === 'card' || l.includes('card'))           return 'Credit Card'
  if (l === 'external' || l.includes('external'))   return 'External Credit'
  if (l.includes('check'))                          return 'Check'
  return m
}

const fmt$ = (n) => `$${(n || 0).toFixed(2)}`

function isoToday(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

// ─── SVG Line Chart ───────────────────────────────────────────────────────────
function LineChart({ data }) {
  if (!data.length) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12 }}>
        No sales in period
      </div>
    )
  }

  const W = 480, H = 160
  const pad = { t: 12, r: 16, b: 36, l: 54 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b

  const maxVal = Math.max(...data.map(d => d.total), 0.01)
  const xOf = (i) => pad.l + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW)
  const yOf = (v) => pad.t + innerH - (v / maxVal) * innerH

  const points = data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.total).toFixed(1)}`).join(' ')

  // fill area under curve
  const fillPoints = [
    `${xOf(0).toFixed(1)},${(pad.t + innerH).toFixed(1)}`,
    ...data.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.total).toFixed(1)}`),
    `${xOf(data.length - 1).toFixed(1)},${(pad.t + innerH).toFixed(1)}`,
  ].join(' ')

  const yTicks = [0, 0.25, 0.5, 0.75, 1]

  // show at most 8 x-axis labels to avoid crowding
  const step = Math.max(1, Math.ceil(data.length / 8))
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1)

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
      {/* Grid lines + Y labels */}
      {yTicks.map(t => {
        const y = pad.t + innerH * (1 - t)
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y}
              stroke={BORDER} strokeWidth={1} strokeDasharray={t === 0 ? 'none' : '4,3'} />
            <text x={pad.l - 6} y={y + 4} textAnchor="end" fill={MUTED} fontSize={9}>
              ${(maxVal * t).toFixed(0)}
            </text>
          </g>
        )
      })}

      {/* Fill */}
      <polygon points={fillPoints} fill={`${BLUE}14`} />

      {/* Line */}
      <polyline points={points} fill="none" stroke={BLUE} strokeWidth={2} strokeLinejoin="round" />

      {/* Dots */}
      {data.map((d, i) => (
        <circle key={i} cx={xOf(i)} cy={yOf(d.total)} r={3}
          fill={BLUE} stroke={PANEL} strokeWidth={1.5} />
      ))}

      {/* X labels */}
      {xLabels.map((d, i) => {
        const idx = data.indexOf(d)
        return (
          <text key={i} x={xOf(idx)} y={H - 6} textAnchor="middle" fill={MUTED} fontSize={8.5}>
            {d.label}
          </text>
        )
      })}
    </svg>
  )
}

// ─── SVG Donut / Pie Chart ─────────────────────────────────────────────────────
function DonutChart({ segments }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0)
  if (total === 0) {
    return (
      <div style={{ width: 160, height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12 }}>
        No data
      </div>
    )
  }

  const cx = 80, cy = 80, r = 65, ri = 35
  let angle = -Math.PI / 2
  const paths = []

  segments.forEach((seg, i) => {
    if (seg.value <= 0) return
    const sweep = (seg.value / total) * 2 * Math.PI
    const end = angle + sweep
    const large = sweep > Math.PI ? 1 : 0

    const cos1 = Math.cos(angle), sin1 = Math.sin(angle)
    const cos2 = Math.cos(end),   sin2 = Math.sin(end)

    const d = [
      `M ${cx + ri * cos1} ${cy + ri * sin1}`,
      `A ${ri} ${ri} 0 ${large} 1 ${cx + ri * cos2} ${cy + ri * sin2}`,
      `L ${cx + r * cos2} ${cy + r * sin2}`,
      `A ${r} ${r} 0 ${large} 0 ${cx + r * cos1} ${cy + r * sin1}`,
      'Z',
    ].join(' ')

    paths.push(
      <path key={i} d={d} fill={seg.color} stroke={BG} strokeWidth={2} />
    )
    angle = end
  })

  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      {paths}
      {/* Center label */}
      <text x={cx} y={cy - 4} textAnchor="middle" fill={DIM} fontSize={9} fontWeight={600}> TOTAL</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={TEXT} fontSize={12} fontWeight={700}>{fmt$(total)}</text>
    </svg>
  )
}

// ─── SVG Products Bar Chart ───────────────────────────────────────────────────
function ProductsBarChart({ data }) {
  if (!data.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12 }}>
      No products sold
    </div>
  )
  const visible = data.slice(0, 20)
  const W = 560, H = 240
  const pad = { t: 24, r: 120, b: 80, l: 40 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const maxQty = Math.max(...visible.map(d => d.qty), 1)
  const maxAvg = Math.max(...visible.map(d => d.avgNet), 0.01)
  const barW   = Math.max(8, (innerW / visible.length) * 0.55)
  const xOf    = (i) => pad.l + (i + 0.5) * (innerW / visible.length)
  const yOfAvg = (v) => pad.t + innerH - (v / maxAvg) * innerH
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {[0, 0.5, 1].map(t => {
        const y = pad.t + innerH * (1 - t)
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={BORDER} strokeWidth={1} strokeDasharray={t === 0 ? 'none' : '3,3'} />
            <text x={pad.l - 4} y={y + 4} textAnchor="end" fill={MUTED} fontSize={9}>{Math.round(maxQty * t)}</text>
          </g>
        )
      })}
      {visible.map((d, i) => {
        const x    = xOf(i)
        const barH = Math.max(2, (d.qty / maxQty) * innerH)
        return (
          <g key={i}>
            <rect x={x - barW / 2} y={pad.t + innerH - barH} width={barW} height={barH} fill={GREEN} fillOpacity={0.7} rx={2} />
            <text x={x} y={pad.t + innerH - barH - 4} textAnchor="middle" fill={GREEN} fontSize={8} fontWeight={700}>{d.qty}</text>
          </g>
        )
      })}
      {visible.map((d, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOfAvg(d.avgNet)} r={3.5} fill={RED} stroke={PANEL} strokeWidth={1.5} />
          <text x={xOf(i)} y={yOfAvg(d.avgNet) - 6} textAnchor="middle" fill={RED} fontSize={8}>${d.avgNet.toFixed(0)}</text>
        </g>
      ))}
      {visible.map((d, i) => {
        const x    = xOf(i)
        const name = d.name.length > 15 ? d.name.slice(0, 15) + '…' : d.name
        return (
          <text key={i} x={x} y={pad.t + innerH + 8} textAnchor="end" fill={MUTED} fontSize={8} transform={`rotate(-38,${x},${pad.t + innerH + 8})`}>{name}</text>
        )
      })}
      {/* Legend */}
      <rect x={W - pad.r + 10} y={pad.t} width={9} height={9} fill={GREEN} fillOpacity={0.7} rx={1} />
      <text x={W - pad.r + 23} y={pad.t + 8} fill={MUTED} fontSize={9}>Quantity</text>
      <circle cx={W - pad.r + 14} cy={pad.t + 22} r={3.5} fill={RED} />
      <text x={W - pad.r + 23} y={pad.t + 26} fill={MUTED} fontSize={9}>Average Price</text>
    </svg>
  )
}

// ─── SVG Employee Bar Chart ────────────────────────────────────────────────────
function EmployeesBarChart({ data }) {
  if (!data.length) return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 12 }}>
      No employee data
    </div>
  )
  const W = 520, H = 240
  const pad = { t: 28, r: 20, b: 44, l: 64 }
  const innerW = W - pad.l - pad.r
  const innerH = H - pad.t - pad.b
  const maxVal = Math.max(...data.map(d => d.totalNet), 0.01)
  const barW   = Math.max(28, Math.min(60, (innerW / data.length) * 0.6))
  const xOf    = (i) => pad.l + (i + 0.5) * (innerW / data.length)
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <linearGradient id="empBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map(t => {
        const y = pad.t + innerH * (1 - t)
        return (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={BORDER} strokeWidth={1} strokeDasharray={t === 0 ? 'none' : '3,3'} />
            <text x={pad.l - 5} y={y + 4} textAnchor="end" fill={MUTED} fontSize={9}>${(maxVal * t / 1000).toFixed(1)}k</text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const x    = xOf(i)
        const barH = Math.max(2, (d.totalNet / maxVal) * innerH)
        const lbl  = d.totalNet >= 1000 ? `$${(d.totalNet / 1000).toFixed(1)}k` : `$${d.totalNet.toFixed(0)}`
        return (
          <g key={i}>
            <rect x={x - barW / 2} y={pad.t + innerH - barH} width={barW} height={barH} fill="url(#empBarGrad)" rx={3} />
            <text x={x} y={pad.t + innerH - barH - 6} textAnchor="middle" fill={TEXT} fontSize={10} fontWeight={700}>{lbl}</text>
          </g>
        )
      })}
      {data.map((d, i) => {
        const x    = xOf(i)
        const name = d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name
        return (
          <text key={i} x={x} y={pad.t + innerH + 16} textAnchor="middle" fill={MUTED} fontSize={10}>{name}</text>
        )
      })}
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LocationReport({ onClose, sales = [] }) {
  const [products, setProducts] = useState(loadAllProducts)

  // Phase 5: hydrate products from Supabase (localStorage is already rendered above)
  useEffect(() => {
    fetchProducts().then(remote => { if (remote) setProducts(remote) })
  }, [])

  const [selectedLoc, setSelectedLoc] = useState(LOCATIONS_CFG[0]?.id || '')
  const [fromDate,    setFromDate]    = useState(isoToday(-6))
  const [toDate,      setToDate]      = useState(isoToday(0))

  // ── barcode → costPrice lookup map ─────────────────────────────────────────
  const costMap = useMemo(() => {
    const map = {}
    products.forEach(p => { if (p.barcode) map[p.barcode] = p.costPrice || 0 })
    return map
  }, [products])

  const locCfg = useMemo(
    () => LOCATIONS_CFG.find(l => l.id === selectedLoc) || LOCATIONS_CFG[0],
    [selectedLoc]
  )

  // ── Filter sales by location + date range ──────────────────────────────────
  // sales.location is a name string (e.g. "Miracle Mall 01")
  const locSales = useMemo(() => {
    const locName = locCfg?.name
    const from = fromDate ? new Date(fromDate + 'T00:00:00') : null
    const to   = toDate   ? new Date(toDate   + 'T23:59:59') : null
    return sales.filter(s => {
      if (s.status === 'voided') return false
      if (s.location !== locName) return false
      const d = new Date(s.timestamp)
      if (from && d < from) return false
      if (to   && d > to)   return false
      return true
    })
  }, [sales, locCfg, fromDate, toDate])

  // ── Top-level metrics ──────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    let gross = 0, tax = 0, spare = 0, invCost = 0

    locSales.forEach(s => {
      gross  += s.total    || 0
      tax    += s.tax      || 0
      spare  += s.totalSpare || 0

      // Inventory cost: qty * costPrice per item (look up by barcode)
      ;(s.items || []).forEach(item => {
        const cost = costMap[item.barcode] || 0
        invCost += cost * (item.qty || 1)
      })
    })

    const net    = gross - tax
    const profit = net - invCost
    const days   = locSales.length > 0
      ? [...new Set(locSales.map(s => new Date(s.timestamp).toDateString()))].length
      : 1
    const avgDaily = net / days

    return { gross, tax, net, profit, spare, invCost, avgDaily, txCount: locSales.length }
  }, [locSales, costMap])

  // ── Current inventory value for this location ──────────────────────────────
  const currentInvValue = useMemo(() => {
    if (!locCfg) return 0
    return products.reduce((s, p) => {
      const qty = p.qtyByLoc?.[locCfg.id] ?? 0
      return s + qty * (p.costPrice || 0)
    }, 0)
  }, [products, locCfg])

  // ── Daily sales breakdown ──────────────────────────────────────────────────
  const dailySales = useMemo(() => {
    const map = {}
    locSales.forEach(s => {
      const d     = new Date(s.timestamp)
      const key   = d.toISOString().slice(0, 10)           // YYYY-MM-DD for sorting
      const label = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' })
      if (!map[key]) map[key] = { key, label, subtotal: 0, tax: 0, total: 0 }
      map[key].subtotal += s.subtotal || s.total - s.tax || 0
      map[key].tax      += s.tax     || 0
      map[key].total    += s.total   || 0
    })
    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key))
  }, [locSales])

  // ── Payment method breakdown ───────────────────────────────────────────────
  // Expands split payments into components (cash + card) using s.payments array.
  // Falls back to s.paymentMethod for single-method sales.
  const payBreakdown = useMemo(() => {
    const map = {}
    locSales.forEach(s => {
      const payments = Array.isArray(s.payments) && s.payments.length > 0
        ? s.payments
        : [{ method: s.paymentMethod || 'other', amount: s.total || 0 }]
      for (const p of payments) {
        const method = (p.method || '').toLowerCase()
        if (method === 'split') continue // skip the split marker — components already listed
        const label = normalizeMethodLabel(p.method)
        map[label] = (map[label] || 0) + (p.amount || 0)
      }
    })
    return map
  }, [locSales])

  const paySegments = useMemo(() =>
    Object.entries(payBreakdown).map(([label, value]) => ({
      label, value, color: PAY_COLORS[label] || PAY_COLOR_DEFAULT,
    })).sort((a, b) => b.value - a.value),
    [payBreakdown]
  )

  // ── Products sold breakdown ────────────────────────────────────────────────
  const productsSold = useMemo(() => {
    const map = {}
    locSales.forEach(s => {
      ;(s.items || []).forEach(item => {
        const name = item.name || item.productName || 'Unknown'
        if (!map[name]) map[name] = { name, qty: 0, totalNet: 0 }
        map[name].qty      += item.qty || 1
        map[name].totalNet += (item.salePrice || 0) * (item.qty || 1)
      })
    })
    return Object.values(map)
      .map(p => ({ ...p, avgNet: p.qty > 0 ? p.totalNet / p.qty : 0 }))
      .sort((a, b) => b.qty - a.qty)
  }, [locSales])

  // ── Employee sales breakdown ───────────────────────────────────────────────
  const employeeSales = useMemo(() => {
    const map = {}
    locSales.forEach(s => {
      const name = s.employee || 'Unknown'
      if (!map[name]) map[name] = { name, totalNet: 0, count: 0 }
      map[name].totalNet += s.subtotal || 0
      map[name].count    += 1
    })
    return Object.values(map).sort((a, b) => b.totalNet - a.totalNet)
  }, [locSales])

  // ─────────────────────────────────────────────────────────────────────────────
  const inp = { padding: '5px 10px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none',  }

  const Stat = ({ label, value, color = TEXT, sub }) => (
    <div>
      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>{label}</p>
      <p style={{ color, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</p>
      {sub && <p style={{ color: MUTED, fontSize: 10, marginTop: 2 }}>{sub}</p>}
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ height: 48, background: PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer', padding: '4px 10px' }}>← Back</button>
        <span style={{ color: '#e74c3c', fontSize: 14 }}>📍</span>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Location Reports</span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
          <label style={{ color: MUTED, fontSize: 11 }}>Location</label>
          <select value={selectedLoc} onChange={e => setSelectedLoc(e.target.value)} style={{ ...inp, cursor: 'pointer', minWidth: 160 }}>
            {LOCATIONS_CFG.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ color: MUTED, fontSize: 11 }}>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={inp} />
          <label style={{ color: MUTED, fontSize: 11 }}>To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={inp} />
        </div>

        {/* Quick period shortcuts */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { label: 'Today',  from: isoToday(0),   to: isoToday(0)   },
            { label: '7d',     from: isoToday(-6),  to: isoToday(0)   },
            { label: '30d',    from: isoToday(-29), to: isoToday(0)   },
            { label: 'MTD',    from: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01` })(), to: isoToday(0) },
          ].map(({ label, from, to }) => {
            const isActive = fromDate === from && toDate === to
            return (
              <button key={label} onClick={() => { setFromDate(from); setToDate(to) }} style={{
                padding: '4px 10px', borderRadius: 4, border: `1px solid ${isActive ? BLUE : BORDER}`,
                background: isActive ? `${BLUE}20` : 'transparent',
                color: isActive ? BLUE : MUTED, fontSize: 11, fontWeight: isActive ? 700 : 400,
                cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {label}
              </button>
            )
          })}
        </div>

        <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 11 }}>
          {metrics.txCount} transaction{metrics.txCount !== 1 ? 's' : ''} · {locCfg?.name}
        </span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* ── Top metrics ──────────────────────────────────────────────────── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Row 1 — primary revenue */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            <Stat label="TOTAL NET"    value={fmt$(metrics.net)}    color={GREEN} sub="Gross minus tax" />
            <Stat label="TOTAL TAX"    value={fmt$(metrics.tax)}    color={AMBER} />
            <Stat label="TOTAL GROSS"  value={fmt$(metrics.gross)}  color={TEAL}  sub={`${metrics.txCount} transactions`} />
            <Stat label="TOTAL NET PROFIT" value={fmt$(metrics.profit)} color={metrics.profit >= 0 ? BLUE : RED} sub="Net minus inventory cost" />
          </div>

          {/* Divider */}
          <div style={{ borderTop: `1px solid ${BORDER}` }} />

          {/* Row 2 — secondary metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <div>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>AVG DAILY NET</p>
              <p style={{ color: DIM, fontSize: 15, fontWeight: 700 }}>{fmt$(metrics.avgDaily)}</p>
            </div>
            <div>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>TOTAL SPARE</p>
              <p style={{ color: DIM, fontSize: 15, fontWeight: 700 }}>{fmt$(metrics.spare)}</p>
              <p style={{ color: 'var(--c-text-dim)', fontSize: 9 }}>Sales above min price</p>
            </div>
            <div>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>INVENTORY LOSSES</p>
              <p style={{ color: DIM, fontSize: 15, fontWeight: 700 }}>$0.00</p>
              <p style={{ color: 'var(--c-text-dim)', fontSize: 9 }}>Damage / loss reports</p>
            </div>
            <div>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>INVENTORY COST</p>
              <p style={{ color: DIM, fontSize: 15, fontWeight: 700 }}>{fmt$(metrics.invCost)}</p>
              <p style={{ color: 'var(--c-text-dim)', fontSize: 9 }}>Cost of goods sold</p>
            </div>
            <div>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>CURRENT INV VALUE</p>
              <p style={{ color: DIM, fontSize: 15, fontWeight: 700 }}>{fmt$(currentInvValue)}</p>
              <p style={{ color: 'var(--c-text-dim)', fontSize: 9 }}>At cost · {locCfg?.name}</p>
            </div>
          </div>
        </div>

        {/* ── Daily Sales ──────────────────────────────────────────────────── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Location Daily Sales</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{locCfg?.name} · {fromDate} → {toDate}</p>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Table */}
            <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${BORDER}`, overflowY: 'auto', maxHeight: 260 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: 'var(--c-bg-stripe)' }}>
                    {['Date', 'Sub', 'Tax', 'Total'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: MUTED, fontWeight: 600, fontSize: 10, textAlign: h === 'Date' ? 'left' : 'right', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dailySales.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No sales in this period</td></tr>
                  )}
                  {dailySales.map((d, i) => (
                    <tr key={d.key} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)', borderBottom: `1px solid var(--c-border-row)` }}>
                      <td style={{ padding: '6px 10px', color: DIM }}>{d.label}</td>
                      <td style={{ padding: '6px 10px', color: DIM, textAlign: 'right' }}>{fmt$(d.subtotal)}</td>
                      <td style={{ padding: '6px 10px', color: MUTED, textAlign: 'right' }}>{fmt$(d.tax)}</td>
                      <td style={{ padding: '6px 10px', color: TEXT, fontWeight: 600, textAlign: 'right' }}>{fmt$(d.total)}</td>
                    </tr>
                  ))}
                  {/* Totals row */}
                  {dailySales.length > 0 && (
                    <tr style={{ background: 'rgba(37,99,235,0.06)', borderTop: `1px solid ${BORDER}` }}>
                      <td style={{ padding: '6px 10px', color: BLUE, fontWeight: 700, fontSize: 10 }}>TOTAL</td>
                      <td style={{ padding: '6px 10px', color: BLUE, fontWeight: 700, textAlign: 'right' }}>{fmt$(dailySales.reduce((s, d) => s + d.subtotal, 0))}</td>
                      <td style={{ padding: '6px 10px', color: AMBER, fontWeight: 700, textAlign: 'right' }}>{fmt$(metrics.tax)}</td>
                      <td style={{ padding: '6px 10px', color: GREEN, fontWeight: 700, textAlign: 'right' }}>{fmt$(metrics.gross)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* Chart */}
            <div style={{ flex: 1, padding: '16px 20px', display: 'flex', alignItems: 'center' }}>
              <LineChart data={dailySales} />
            </div>
          </div>
        </div>

        {/* ── Payment Methods ───────────────────────────────────────────────── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Location Payment Methods</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Breakdown by payment type · {locCfg?.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Left — breakdown list */}
            <div style={{ flex: 1, padding: '20px 24px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px 32px', alignContent: 'start' }}>
              {['Cash', 'Credit Card', 'External Credit', 'Check'].map(method => {
                const val = payBreakdown[method] || 0
                const color = PAY_COLORS[method] || PAY_COLOR_DEFAULT
                const pct = metrics.gross > 0 ? ((val / metrics.gross) * 100).toFixed(1) : '0.0'
                return (
                  <div key={method}>
                    <p style={{ color, fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Total {method}</p>
                    <p style={{ color: TEXT, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{fmt$(val)}</p>
                    <p style={{ color: MUTED, fontSize: 10, marginTop: 3 }}>{pct}% of gross</p>
                    {/* In/Out — simplified: all collected sales are "in", no out tracked at this level */}
                    <div style={{ marginTop: 4, display: 'flex', gap: 16 }}>
                      <span style={{ color: MUTED, fontSize: 10 }}>In: <span style={{ color: DIM }}>{fmt$(val)}</span></span>
                      <span style={{ color: MUTED, fontSize: 10 }}>Out: <span style={{ color: DIM }}>$0.00</span></span>
                    </div>
                  </div>
                )
              })}
              {/* Unknown payment methods */}
              {Object.keys(payBreakdown).filter(m => !['Cash', 'Credit Card', 'External Credit', 'Check'].includes(m)).map(method => {
                const val = payBreakdown[method]
                const pct = metrics.gross > 0 ? ((val / metrics.gross) * 100).toFixed(1) : '0.0'
                return (
                  <div key={method}>
                    <p style={{ color: DIM, fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{method}</p>
                    <p style={{ color: TEXT, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{fmt$(val)}</p>
                    <p style={{ color: MUTED, fontSize: 10, marginTop: 3 }}>{pct}% of gross</p>
                  </div>
                )
              })}
            </div>

            {/* Right — pie chart + legend */}
            <div style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${BORDER}`, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <DonutChart segments={paySegments} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {paySegments.map(seg => (
                  <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: seg.color, flexShrink: 0 }} />
                    <div>
                      <p style={{ color: DIM, fontSize: 11 }}>{seg.label}</p>
                      <p style={{ color: TEXT, fontSize: 12, fontWeight: 700 }}>{fmt$(seg.value)}</p>
                    </div>
                  </div>
                ))}
                {paySegments.length === 0 && (
                  <p style={{ color: MUTED, fontSize: 11 }}>No transactions</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Products Sold ─────────────────────────────────────────────── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Location Products Sold</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{productsSold.length} product{productsSold.length !== 1 ? 's' : ''} · {locCfg?.name}</p>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            <div style={{ width: 300, flexShrink: 0, borderRight: `1px solid ${BORDER}`, overflowY: 'auto', maxHeight: 280 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: 'var(--c-bg-stripe)' }}>
                    {['Product Name', 'Qty Sold', 'Avg Net Price'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: MUTED, fontWeight: 600, fontSize: 10, textAlign: h === 'Product Name' ? 'left' : 'right', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {productsSold.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No products in this period</td></tr>
                  )}
                  {productsSold.map((p, i) => (
                    <tr key={p.name} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)', borderBottom: `1px solid var(--c-border-row)` }}>
                      <td style={{ padding: '6px 10px', color: DIM, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</td>
                      <td style={{ padding: '6px 10px', color: GREEN, fontWeight: 700, textAlign: 'right' }}>{p.qty}</td>
                      <td style={{ padding: '6px 10px', color: TEXT, fontWeight: 600, textAlign: 'right' }}>{fmt$(p.avgNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, padding: '16px 20px', display: 'flex', alignItems: 'center', minWidth: 0, overflowX: 'auto' }}>
              <ProductsBarChart data={productsSold} />
            </div>
          </div>
        </div>

        {/* ── Employee Sales ────────────────────────────────────────────────── */}
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Location Employee Sales</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{locCfg?.name} · {fromDate} → {toDate}</p>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            <div style={{ width: 260, flexShrink: 0, borderRight: `1px solid ${BORDER}`, overflowY: 'auto', maxHeight: 280 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: 'var(--c-bg-stripe)' }}>
                    {['Employee Name', 'Total Net Sales'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', color: MUTED, fontWeight: 600, fontSize: 10, textAlign: h === 'Employee Name' ? 'left' : 'right', borderBottom: `1px solid ${BORDER}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {employeeSales.length === 0 && (
                    <tr><td colSpan={2} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No employee data in this period</td></tr>
                  )}
                  {employeeSales.map((e, i) => (
                    <tr key={e.name} style={{ background: i === 0 ? 'rgba(245,158,11,0.06)' : i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)', borderBottom: `1px solid var(--c-border-row)` }}>
                      <td style={{ padding: '6px 10px', color: i === 0 ? AMBER : DIM, fontWeight: i === 0 ? 700 : 400 }}>{e.name}</td>
                      <td style={{ padding: '6px 10px', color: i === 0 ? AMBER : TEXT, fontWeight: 700, textAlign: 'right' }}>{fmt$(e.totalNet)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ flex: 1, padding: '16px 20px', display: 'flex', alignItems: 'center', minWidth: 0 }}>
              <EmployeesBarChart data={employeeSales} />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
