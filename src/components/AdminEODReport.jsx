import { useState, useMemo, useEffect } from 'react'
import { LOCATIONS_CFG } from '../config/branding'
import { fetchSalesByLocationAndDate, fetchClockRecordsByDate } from '../services/supabaseRead'
import { byPaymentMethod } from '../services/dashboardService'

// ── Tokens ─────────────────────────────────────────────────────────────────────
const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'
const MUTED  = '#94a3b8'
const TEXT   = '#f1f5f9'
const DIM    = '#cbd0e0'

const fmt$  = (n) => `$${(n || 0).toFixed(2)}`
const fmtDT = (ts) => ts ? new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

function dateToInput(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function inputToDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const NOTES_KEY = (loc, date) => `fluxe-eod-notes-${loc}-${date}`

// ── Section heading ────────────────────────────────────────────────────────────
function SectionHead({ icon, title }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ color: DIM, fontWeight: 700, fontSize: 14 }}>{title}</span>
      <div style={{ flex: 1, height: 1, background: BORDER, marginLeft: 4 }} />
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, color, sub }) {
  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
      padding: '14px 18px', borderLeft: `3px solid ${color}`, flex: 1, minWidth: 130,
    }}>
      <p style={{ color: MUTED, fontSize: 11, marginBottom: 6 }}>{label}</p>
      <p style={{ color, fontSize: 20, fontWeight: 800 }}>{value}</p>
      {sub && <p style={{ color: MUTED, fontSize: 10, marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

// ── Table helpers ──────────────────────────────────────────────────────────────
const TH = ({ children, right }) => (
  <th style={{
    padding: '8px 12px', background: '#0d1526', color: '#b8c8da',
    fontSize: 11, fontWeight: 700, textAlign: right ? 'right' : 'left',
    borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap',
  }}>{children}</th>
)
const TD = ({ children, right, muted, mono }) => (
  <td style={{
    padding: '9px 12px', color: muted ? MUTED : DIM, fontSize: 12,
    textAlign: right ? 'right' : 'left',
    fontFamily: mono ? 'monospace' : 'inherit',
    borderBottom: `1px solid rgba(37,51,73,0.5)`,
  }}>{children}</td>
)

// ── Main component ─────────────────────────────────────────────────────────────
export default function AdminEODReport({ onClose }) {
  const locationNames = LOCATIONS_CFG.map(l => l.name)

  const [selectedLoc,  setSelectedLoc]  = useState(locationNames[0] || '')
  const [selectedDate, setSelectedDate] = useState(() => dateToInput(new Date()))
  const [loading,      setLoading]      = useState(false)
  const [sales,        setSales]        = useState(null)
  const [clockRecs,    setClockRecs]    = useState(null)
  const [openInvoice,  setOpenInvoice]  = useState(null) // sale object
  const [notes,        setNotes]        = useState('')
  const [notesSaved,   setNotesSaved]   = useState(false)

  // Load notes from localStorage on loc/date change
  useEffect(() => {
    setNotes(localStorage.getItem(NOTES_KEY(selectedLoc, selectedDate)) || '')
    setNotesSaved(false)
  }, [selectedLoc, selectedDate])

  const load = async () => {
    setLoading(true)
    setSales(null)
    setClockRecs(null)
    const date = inputToDate(selectedDate)
    const [s, c] = await Promise.all([
      fetchSalesByLocationAndDate({ locationName: selectedLoc, date }),
      fetchClockRecordsByDate({ locationName: selectedLoc, date }),
    ])
    setSales(s || [])
    setClockRecs(c || [])
    setLoading(false)
  }

  // Auto-load on mount and when filters change
  useEffect(() => { load() }, [selectedLoc, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const activeSales = useMemo(() => (sales || []).filter(s => s.status !== 'voided' && s.status !== 'deleted'), [sales])
  const voidedSales = useMemo(() => (sales || []).filter(s => s.status === 'voided' || s.status === 'deleted'), [sales])

  // KPIs
  const netRevenue   = activeSales.reduce((s, x) => s + (x.subtotal || 0), 0)
  const taxRevenue   = activeSales.reduce((s, x) => s + (x.tax || 0), 0)
  const grossRevenue = activeSales.reduce((s, x) => s + (x.total || 0), 0)
  const totalSpare   = activeSales.reduce((s, x) => s + (x.totalSpare || 0), 0)
  const invCost      = activeSales.reduce((s, x) => s + (x.items || []).reduce((si, i) => si + (i.qty || 0) * (i.costPrice || 0), 0), 0)
  const voidedTotal  = voidedSales.reduce((s, x) => s + (x.total || 0), 0)

  // Payment methods
  const payMethods = useMemo(() => {
    const COLORS = { cash: GREEN, card: BLUE, external: PURPLE, check: AMBER }
    return byPaymentMethod(activeSales).map((m, i) => ({
      ...m,
      color: COLORS[m.label] || [GREEN, BLUE, PURPLE, AMBER][i % 4],
    }))
  }, [activeSales])

  // Products sold
  const productRows = useMemo(() => {
    const map = {}
    activeSales.flatMap(s => s.items || []).forEach(item => {
      const key = item.barcode || item.name
      if (!map[key]) map[key] = { barcode: item.barcode || '—', name: item.product?.name || item.name || '—', desc: item.description || item.product?.description || '—', qty: 0, totalNet: 0 }
      map[key].qty      += Math.max(0, item.qty || 1)
      map[key].totalNet += (item.salePrice || 0) * (item.qty || 1)
    })
    return Object.values(map).sort((a, b) => b.qty - a.qty)
  }, [activeSales])

  // Employee sales
  const employeeSales = useMemo(() =>
    activeSales.flatMap(s =>
      s.employee ? [{ ...s, _emp: s.employee }] : []
    ).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  , [activeSales])

  // Hours
  const isToday = selectedDate === dateToInput(new Date())
  const clockHoursMap = useMemo(() => {
    if (!clockRecs) return {}
    const map = {}
    clockRecs.forEach(r => {
      if (!map[r.employee]) map[r.employee] = 0
      const end = r.clockOut ? new Date(r.clockOut) : (isToday ? new Date() : null)
      if (!end) return
      map[r.employee] += Math.max(0, (end - new Date(r.clockIn)) / 3_600_000)
    })
    return map
  }, [clockRecs, isToday])

  const dateLabel = inputToDate(selectedDate).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const saveNotes = () => {
    localStorage.setItem(NOTES_KEY(selectedLoc, selectedDate), notes)
    setNotesSaved(true)
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
  const sel = { background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, padding: '7px 10px', outline: 'none', cursor: 'pointer', colorScheme: 'dark' }

  // ── Invoice detail modal ──────────────────────────────────────────────────────
  if (openInvoice) {
    const s = openInvoice
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100 }}>
        <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, width: 520, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Invoice #{s.number}</span>
            <span style={{ marginLeft: 'auto', color: MUTED, fontSize: 12 }}>{fmtDT(s.timestamp)}</span>
            <button onClick={() => setOpenInvoice(null)} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          <div style={{ overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 16 }}>
              <div><p style={{ color: MUTED, fontSize: 11 }}>Employee</p><p style={{ color: DIM, fontSize: 13, fontWeight: 600 }}>{s.employee}</p></div>
              <div><p style={{ color: MUTED, fontSize: 11 }}>Location</p><p style={{ color: DIM, fontSize: 13, fontWeight: 600 }}>{s.location}</p></div>
              <div><p style={{ color: MUTED, fontSize: 11 }}>Status</p><p style={{ color: s.status === 'voided' ? RED : GREEN, fontSize: 13, fontWeight: 600 }}>{s.status}</p></div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><TH>Product</TH><TH right>Qty</TH><TH right>Price</TH><TH right>Subtotal</TH></tr></thead>
              <tbody>
                {(s.items || []).map((item, i) => (
                  <tr key={i}>
                    <TD><span style={{ fontWeight: 600 }}>{item.product?.name || item.name}</span>{item.barcode && <span style={{ color: MUTED, fontSize: 10, display: 'block' }}>{item.barcode}</span>}</TD>
                    <TD right>{item.qty}</TD>
                    <TD right>{fmt$(item.salePrice)}</TD>
                    <TD right>{fmt$(item.subtotal)}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', gap: 32 }}><span style={{ color: MUTED, fontSize: 12 }}>Subtotal</span><span style={{ color: DIM, fontSize: 12 }}>{fmt$(s.subtotal)}</span></div>
              <div style={{ display: 'flex', gap: 32 }}><span style={{ color: MUTED, fontSize: 12 }}>Tax</span><span style={{ color: DIM, fontSize: 12 }}>{fmt$(s.tax)}</span></div>
              <div style={{ display: 'flex', gap: 32 }}><span style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>Total</span><span style={{ color: TEXT, fontSize: 15, fontWeight: 700 }}>{fmt$(s.total)}</span></div>
            </div>
            {(s.payments || []).length > 0 && (
              <div>
                <p style={{ color: MUTED, fontSize: 11, marginBottom: 8 }}>PAYMENTS</p>
                {s.payments.map((p, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: DIM, fontSize: 12, textTransform: 'capitalize' }}>{p.method}{p.cardBrand ? ` · ${p.cardBrand}` : ''}</span>
                    <span style={{ color: DIM, fontSize: 12 }}>{fmt$(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: PANEL, borderBottom: `1px solid ${BORDER}`, padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 12, padding: '5px 12px', cursor: 'pointer' }}>← Back</button>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>End-Of-Day Reports</span>
        <span style={{ color: MUTED, fontSize: 12, marginRight: 'auto' }}>— historical admin view</span>

        {/* Filters */}
        <select value={selectedLoc} onChange={e => setSelectedLoc(e.target.value)} style={sel}>
          {locationNames.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <input
          type="date"
          value={selectedDate}
          max={dateToInput(new Date())}
          onChange={e => e.target.value && setSelectedDate(e.target.value)}
          style={sel}
        />
        <button onClick={load} disabled={loading} style={{ background: BLUE, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '7px 16px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Date label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>{selectedLoc}</span>
          <span style={{ color: MUTED, fontSize: 13 }}>·</span>
          <span style={{ color: MUTED, fontSize: 13 }}>{dateLabel}</span>
          {sales !== null && (
            <span style={{ marginLeft: 'auto', padding: '3px 10px', borderRadius: 20, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', color: GREEN, fontSize: 11, fontWeight: 600 }}>
              ● Live · Supabase
            </span>
          )}
          {loading && (
            <span style={{ marginLeft: 'auto', color: AMBER, fontSize: 12 }}>Fetching…</span>
          )}
        </div>

        {/* Voided alert */}
        {voidedSales.length > 0 && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: RED, fontSize: 13, fontWeight: 700 }}>⚠ {voidedSales.length} voided sale{voidedSales.length > 1 ? 's' : ''}</span>
            <span style={{ color: MUTED, fontSize: 12 }}>Total voided: {fmt$(voidedTotal)}</span>
          </div>
        )}

        {/* ── KPIs ── */}
        <div>
          <SectionHead icon="💰" title="Revenue Summary" />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <KPICard label="NET REVENUE"     value={fmt$(netRevenue)}   color={GREEN}  sub={`${activeSales.length} transaction${activeSales.length !== 1 ? 's' : ''}`} />
            <KPICard label="TAX REVENUE"     value={fmt$(taxRevenue)}   color={BLUE}   />
            <KPICard label="GROSS REVENUE"   value={fmt$(grossRevenue)} color={PURPLE} />
            <KPICard label="SPARE"           value={fmt$(totalSpare)}   color={AMBER}  sub="above min price" />
            <KPICard label="INVENTORY COST"  value={fmt$(invCost)}      color={MUTED}  />
          </div>
        </div>

        {/* ── Payment Methods ── */}
        <div>
          <SectionHead icon="💳" title="Location Payment Methods" />
          {payMethods.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13 }}>No payment data for this day.</p>
          ) : (
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {payMethods.map(m => (
                <div key={m.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 20px', minWidth: 140, borderTop: `3px solid ${m.color}` }}>
                  <p style={{ color: MUTED, fontSize: 11, marginBottom: 4, textTransform: 'capitalize' }}>{m.label}</p>
                  <p style={{ color: m.color, fontSize: 20, fontWeight: 800 }}>{fmt$(m.total)}</p>
                  <p style={{ color: MUTED, fontSize: 11, marginTop: 4 }}>{m.count} transaction{m.count !== 1 ? 's' : ''}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Products Sold ── */}
        <div>
          <SectionHead icon="🧴" title="Location Products Sold" />
          {productRows.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13 }}>No products sold.</p>
          ) : (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <TH>Barcode</TH>
                    <TH>Product Name</TH>
                    <TH>Description</TH>
                    <TH right>Qty</TH>
                    <TH right>Avg Net Price</TH>
                  </tr>
                </thead>
                <tbody>
                  {productRows.map((p, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                      <TD mono muted>{p.barcode}</TD>
                      <TD><span style={{ fontWeight: 600, color: TEXT }}>{p.name}</span></TD>
                      <TD muted>{p.desc}</TD>
                      <TD right><span style={{ fontWeight: 700, color: BLUE }}>{p.qty}</span></TD>
                      <TD right>{p.qty > 0 ? fmt$(p.totalNet / p.qty) : '—'}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Employee Sales ── */}
        <div>
          <SectionHead icon="👤" title="Location Employee Sales" />
          {employeeSales.length === 0 ? (
            <p style={{ color: MUTED, fontSize: 13 }}>No sales recorded.</p>
          ) : (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <TH>Employee</TH>
                    <TH>Invoice ID</TH>
                    <TH>Timestamp</TH>
                    <TH right>Subtotal</TH>
                    <TH right>Commission</TH>
                    <TH right>Spare</TH>
                    <TH right>Hours</TH>
                    <TH>Action</TH>
                  </tr>
                </thead>
                <tbody>
                  {employeeSales.map((s, i) => {
                    const hrs = clockHoursMap[s.employee]
                    const hrsLabel = hrs != null ? `${Math.floor(hrs)}h ${String(Math.round((hrs % 1) * 60)).padStart(2, '0')}m` : '—'
                    return (
                      <tr key={s.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)' }}>
                        <TD><span style={{ fontWeight: 600, color: TEXT }}>{s.employee}</span></TD>
                        <TD mono muted>#{s.number}</TD>
                        <TD muted>{fmtDT(s.timestamp)}</TD>
                        <TD right>{fmt$(s.subtotal)}</TD>
                        <TD right><span style={{ color: GREEN }}>{fmt$(s.commissionSnapshot?.commissionAtSale || 0)}</span></TD>
                        <TD right><span style={{ color: AMBER }}>{fmt$(s.totalSpare)}</span></TD>
                        <TD right muted>{hrsLabel}</TD>
                        <TD>
                          <button
                            onClick={() => setOpenInvoice(s)}
                            style={{ background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 4, color: BLUE, fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
                          >
                            Open
                          </button>
                        </TD>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Credit Card Transactions ── */}
        <div>
          <SectionHead icon="💳" title="Credit Card Transactions" />
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔌</span>
            <div>
              <p style={{ color: MUTED, fontWeight: 600, fontSize: 13 }}>Card processor API not connected yet</p>
              <p style={{ color: MUTED, fontSize: 11, marginTop: 3 }}>Real-time card transaction details will appear here once a payment processor integration is configured.</p>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        <div>
          <SectionHead icon="📝" title="End of Day Notes" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setNotesSaved(false) }}
              placeholder="Add notes for this day…"
              rows={4}
              style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 13, padding: '10px 14px', resize: 'vertical', outline: 'none', fontFamily: 'inherit', colorScheme: 'dark' }}
            />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={saveNotes}
                style={{ background: BLUE, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 600, padding: '7px 18px', cursor: 'pointer' }}
              >
                Save Notes
              </button>
              {notesSaved && <span style={{ color: GREEN, fontSize: 12 }}>✓ Saved</span>}
              <span style={{ color: MUTED, fontSize: 11, marginLeft: 'auto' }}>Notes saved locally (device only)</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
