import { useState, useMemo } from 'react'
import { InvoiceModal } from './InvoicesAdmin'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BLUE  = '#3b82f6'
const GREEN = '#22c55e'
const AMBER = '#f59e0b'
const RED   = '#ef4444'
const TEAL  = '#14b8a6'

const fmt$ = n => '$' + (+(n || 0)).toFixed(2)

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

// ── Extract refund rows from the sales array ───────────────────────────────────
// Each entry in sale.refunds[] becomes one row in the table.
function extractRefunds(sales) {
  const rows = []
  ;(sales || []).forEach(sale => {
    if (!Array.isArray(sale.refunds) || sale.refunds.length === 0) return
    sale.refunds.forEach((ref, idx) => {
      rows.push({
        refundId:      ref.refundId      || `${sale.number}-R${idx}`,
        invoiceNumber: sale.number,
        saleDate:      sale.timestamp,
        refundDate:    ref.timestamp     || sale.timestamp,
        location:      sale.location     || '—',
        locationId:    sale.locationId   || '',
        employee:      sale.employee     || '—',
        authorizedBy:  ref.authorizedBy  || null,
        refundType:    ref.type          || 'full',
        refundMethod:  ref.refundMethod  || '—',
        subtotal:      +(ref.subtotal    || 0),
        tax:           +(ref.tax         || 0),
        total:         +(ref.total       || 0),
        items:         ref.items         || [],
        sale,
      })
    })
  })
  return rows.sort((a, b) => new Date(b.refundDate) - new Date(a.refundDate))
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color, icon }) {
  return (
    <div style={{
      flex: 1, minWidth: 120, padding: '14px 16px',
      background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>{label}</p>
      </div>
      <p style={{ color: color || 'var(--c-text)', fontSize: 20, fontWeight: 800 }}>{value}</p>
      {sub && <p style={{ color: 'var(--c-text-muted)', fontSize: 10, marginTop: 3 }}>{sub}</p>}
    </div>
  )
}

// ── Type badge ────────────────────────────────────────────────────────────────
function TypeBadge({ type }) {
  const isPartial = type === 'partial'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: isPartial ? `${BLUE}18` : `${AMBER}18`,
      border: `1px solid ${isPartial ? BLUE : AMBER}40`,
      color: isPartial ? BLUE : AMBER,
      whiteSpace: 'nowrap',
    }}>{isPartial ? 'Partial' : 'Full'}</span>
  )
}

// ── Refund detail modal ────────────────────────────────────────────────────────
function RefundDetailModal({ refund, onClose, onOpenInvoice }) {
  const row = (label, value, color) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid var(--c-border)',
    }}>
      <span style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: color || 'var(--c-text)', fontSize: 13, fontWeight: 600 }}>{value}</span>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1400, backdropFilter: 'blur(4px)', padding: 20,
    }}>
      <div style={{
        background: 'var(--c-bg-panel)', border: '1px solid var(--c-border)',
        borderRadius: 12, width: '100%', maxWidth: 680, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', background: 'var(--c-bg-card)',
          borderBottom: '1px solid var(--c-border)', borderRadius: '12px 12px 0 0',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, background: `${AMBER}18`,
            border: `1px solid ${AMBER}40`, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>↩️</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ color: 'var(--c-text)', fontWeight: 800, fontSize: 15 }}>
                Refund {refund.refundId}
              </p>
              <TypeBadge type={refund.refundType} />
            </div>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 2 }}>
              Invoice #{refund.invoiceNumber} · {refund.location}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid var(--c-border-md)',
            borderRadius: 6, color: 'var(--c-text-muted)', fontSize: 11,
            padding: '6px 12px', cursor: 'pointer',
          }}>✕ Close</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', gap: 20 }}>
          {/* Left: items */}
          <div style={{ flex: 1, borderRight: '1px solid var(--c-border)', paddingRight: 20 }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
              ITEMS REFUNDED
            </p>
            {refund.items.length === 0 ? (
              <p style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
                {refund.refundType === 'full' ? 'Full invoice refunded' : 'No item details recorded'}
              </p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    {['Product', 'Qty', 'Unit', 'Amount'].map(h => (
                      <th key={h} style={{
                        textAlign: h === 'Product' ? 'left' : 'right',
                        color: 'var(--c-text-muted)', fontWeight: 600, fontSize: 10,
                        paddingBottom: 6, letterSpacing: 0.3,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {refund.items.map((item, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                      <td style={{ padding: '7px 0', color: 'var(--c-text)', fontWeight: 600 }}>
                        {item.name || '—'}
                      </td>
                      <td style={{ textAlign: 'right', padding: '7px 0 7px 8px', color: 'var(--c-text-muted)' }}>
                        {item.qty || 1}
                      </td>
                      <td style={{ textAlign: 'right', padding: '7px 0 7px 8px', color: 'var(--c-text-muted)' }}>
                        {fmt$(item.salePrice)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '7px 0', color: AMBER, fontWeight: 700 }}>
                        {fmt$((item.salePrice || 0) * (item.qty || 1))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Right: summary */}
          <div style={{ width: 200, flexShrink: 0 }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
              REFUND DETAILS
            </p>
            {row('Invoice #',    `#${refund.invoiceNumber}`)}
            {row('Sale Date',    fmtDate(refund.saleDate))}
            {row('Refund Date',  fmtDate(refund.refundDate))}
            {row('Location',     refund.location)}
            {row('Employee',     refund.employee)}
            {row('Authorized',   refund.authorizedBy || 'Not required')}
            {row('Method',       refund.refundMethod)}
            <div style={{ height: 8 }} />
            {row('Subtotal',     fmt$(refund.subtotal))}
            {row('Tax',          fmt$(refund.tax), AMBER)}
            {row('Total Refund', fmt$(refund.total), RED, true)}

            <button
              onClick={onOpenInvoice}
              style={{
                width: '100%', marginTop: 16, padding: '9px 14px',
                background: `${BLUE}15`, border: `1px solid ${BLUE}40`,
                borderRadius: 6, color: BLUE, fontSize: 12, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'center', gap: 6,
              }}
            >🧾 View Full Invoice</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
const PAGE_SIZE = 50

export default function RefundsAdmin({ sales = [], customers = [], onClose }) {
  const allRefunds = useMemo(() => extractRefunds(sales), [sales])

  // ── Filters ─────────────────────────────────────────────────────────────────
  const [fromDate,   setFromDate]   = useState('')
  const [toDate,     setToDate]     = useState('')
  const [locFilter,  setLocFilter]  = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search,     setSearch]     = useState('')
  const [page,       setPage]       = useState(1)

  const [openDetail,  setOpenDetail]  = useState(null) // refund row
  const [openInvoice, setOpenInvoice] = useState(null) // sale object

  const resetPage = () => setPage(1)

  // ── Unique locations from data ────────────────────────────────────────────
  const locations = useMemo(
    () => [...new Set(allRefunds.map(r => r.location).filter(l => l && l !== '—'))].sort(),
    [allRefunds]
  )

  // ── Filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRefunds.filter(r => {
      const d = new Date(r.refundDate)
      if (fromDate && d < new Date(fromDate))              return false
      if (toDate   && d > new Date(toDate + 'T23:59:59')) return false
      if (locFilter  !== 'all' && r.location    !== locFilter)  return false
      if (typeFilter !== 'all' && r.refundType  !== typeFilter) return false
      if (q) {
        const haystack = [
          String(r.invoiceNumber),
          r.refundId,
          r.employee,
          r.location,
          r.authorizedBy || '',
          ...r.items.map(i => i.name || ''),
        ].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [allRefunds, fromDate, toDate, locFilter, typeFilter, search])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const net   = filtered.reduce((s, r) => s + r.subtotal, 0)
    const tax   = filtered.reduce((s, r) => s + r.tax,      0)
    const gross = filtered.reduce((s, r) => s + r.total,    0)
    const count = filtered.length
    const full  = filtered.filter(r => r.refundType === 'full').length
    const part  = filtered.filter(r => r.refundType === 'partial').length
    const avg   = count > 0 ? gross / count : 0
    return { net, tax, gross, count, full, part, avg }
  }, [filtered])

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const hasFilters = fromDate || toDate || locFilter !== 'all' || typeFilter !== 'all' || search

  const clearFilters = () => {
    setFromDate(''); setToDate(''); setLocFilter('all'); setTypeFilter('all'); setSearch(''); resetPage()
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const inp = {
    padding: '7px 10px', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
    borderRadius: 6, color: 'var(--c-text)', fontSize: 12, outline: 'none',
  }
  const sel = { ...inp, cursor: 'pointer' }

  const thStyle = {
    padding: '8px 12px', textAlign: 'left', color: 'var(--c-text-muted)', fontWeight: 600,
    fontSize: 10, background: 'var(--c-bg-stripe)', borderBottom: '1px solid var(--c-border)',
    whiteSpace: 'nowrap', letterSpacing: 0.4, userSelect: 'none',
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-bg)',
      zIndex: 1000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 50, background: 'var(--c-bg-panel)',
        borderBottom: `2px solid ${TEAL}`, display: 'flex', alignItems: 'center',
        gap: 14, flexShrink: 0,
      }}>
        <div style={{
          background: `${TEAL}20`, border: `1px solid ${TEAL}40`,
          borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 700,
          color: TEAL, letterSpacing: 1.5,
        }}>ACCOUNTING</div>
        <p style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 14 }}>Refunds</p>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
          {kpis.count} refund{kpis.count !== 1 ? 's' : ''} · {fmt$(kpis.gross)} gross
        </p>
        <button onClick={onClose} style={{
          marginLeft: 'auto', padding: '6px 14px', background: 'transparent',
          border: '1px solid var(--c-border)', borderRadius: 6,
          color: 'var(--c-text-muted)', fontSize: 12, cursor: 'pointer',
        }}>← Back</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>

        {/* ── KPI cards ─────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <KpiCard icon="↩️" label="NET REFUNDS"   value={fmt$(kpis.net)}   color={RED}   sub="Subtotal returned" />
          <KpiCard icon="🏛️" label="TAX REFUNDS"   value={fmt$(kpis.tax)}   color={AMBER} sub="Tax returned" />
          <KpiCard icon="💸" label="GROSS REFUNDS"  value={fmt$(kpis.gross)} color={RED}   sub="Net + Tax" />
          <KpiCard icon="#"  label="# REFUNDS"      value={kpis.count}       color="var(--c-text)" sub={`${kpis.full} full · ${kpis.part} partial`} />
          <KpiCard icon="∅"  label="AVG REFUND"     value={fmt$(kpis.avg)}   color={AMBER} sub="Per operation" />
        </div>

        {/* ── Filters ───────────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px', background: 'var(--c-bg-card)',
          border: '1px solid var(--c-border)', borderRadius: 10, marginBottom: 16,
          display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end',
        }}>
          <div>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>FROM</p>
            <input type="date" value={fromDate}
              onChange={e => { setFromDate(e.target.value); resetPage() }}
              style={inp} />
          </div>
          <div>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>TO</p>
            <input type="date" value={toDate}
              onChange={e => { setToDate(e.target.value); resetPage() }}
              style={inp} />
          </div>
          <div>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>LOCATION</p>
            <select value={locFilter} onChange={e => { setLocFilter(e.target.value); resetPage() }} style={sel}>
              <option value="all">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
          <div>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>TYPE</p>
            <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); resetPage() }} style={sel}>
              <option value="all">All Types</option>
              <option value="full">Full Refund</option>
              <option value="partial">Partial Refund</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, marginBottom: 4 }}>SEARCH</p>
            <input
              type="text" value={search} placeholder="Invoice #, refund ID, employee, product…"
              onChange={e => { setSearch(e.target.value); resetPage() }}
              style={{ ...inp, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} style={{
              padding: '7px 14px', background: 'transparent',
              border: '1px solid var(--c-border)', borderRadius: 6,
              color: 'var(--c-text-muted)', fontSize: 12, cursor: 'pointer',
              alignSelf: 'flex-end',
            }}>✕ Clear</button>
          )}
        </div>

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {allRefunds.length === 0 && (
          <div style={{
            padding: '60px 24px', textAlign: 'center',
            background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 10,
          }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.35 }}>↩️</div>
            <p style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
              No refunds recorded
            </p>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 13 }}>
              Refunds processed through the POS will appear here.
            </p>
          </div>
        )}

        {allRefunds.length > 0 && filtered.length === 0 && (
          <div style={{
            padding: '40px 24px', textAlign: 'center',
            background: 'var(--c-bg-card)', border: '1px solid var(--c-border)', borderRadius: 10,
          }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 14 }}>No refunds match the current filters.</p>
          </div>
        )}

        {/* ── Table ─────────────────────────────────────────────────────── */}
        {filtered.length > 0 && (
          <div style={{
            background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
            borderRadius: 10, overflow: 'hidden', marginBottom: 20,
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['Refund #', 'Invoice #', 'Sale Date', 'Refund Date', 'Location', 'Employee', 'Auth By', 'Type', 'Subtotal', 'Tax', 'Total', 'Method', ''].map(h => (
                      <th key={h} style={{
                        ...thStyle,
                        textAlign: ['Subtotal', 'Tax', 'Total'].includes(h) ? 'right' : 'left',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((r, i) => (
                    <tr
                      key={r.refundId}
                      onClick={() => setOpenDetail(r)}
                      style={{
                        borderBottom: '1px solid var(--c-border)',
                        background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                        cursor: 'pointer', transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--c-bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)'}
                    >
                      <td style={{ padding: '9px 12px', color: AMBER, fontWeight: 700, whiteSpace: 'nowrap' }}>
                        {r.refundId}
                      </td>
                      <td style={{ padding: '9px 12px', color: BLUE, fontWeight: 600 }}>
                        #{r.invoiceNumber}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(r.saleDate)}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--c-text)', whiteSpace: 'nowrap' }}>
                        {fmtDateTime(r.refundDate)}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--c-text-muted)' }}>
                        {r.location}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--c-text)' }}>
                        {r.employee}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--c-text-muted)', fontSize: 11 }}>
                        {r.authorizedBy || '—'}
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        <TypeBadge type={r.refundType} />
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--c-text)', fontWeight: 600 }}>
                        {fmt$(r.subtotal)}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: AMBER }}>
                        {fmt$(r.tax)}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: RED, fontWeight: 700 }}>
                        {fmt$(r.total)}
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--c-text-muted)', whiteSpace: 'nowrap' }}>
                        {r.refundMethod}
                      </td>
                      <td style={{ padding: '9px 12px' }} onClick={e => { e.stopPropagation(); setOpenInvoice(r.sale) }}>
                        <button style={{
                          padding: '4px 10px', background: `${BLUE}15`,
                          border: `1px solid ${BLUE}40`, borderRadius: 4,
                          color: BLUE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          whiteSpace: 'nowrap',
                        }}>🧾 Invoice</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                padding: '10px 16px', borderTop: '1px solid var(--c-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: 'var(--c-bg-card)',
              }}>
                <span style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
                  {filtered.length} refunds · page {page} of {totalPages}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{
                    padding: '5px 12px', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                    borderRadius: 5, color: page === 1 ? 'var(--c-text-muted)' : 'var(--c-text)',
                    fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer',
                  }}>← Prev</button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{
                    padding: '5px 12px', background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                    borderRadius: 5, color: page === totalPages ? 'var(--c-text-muted)' : 'var(--c-text)',
                    fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer',
                  }}>Next →</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Refund detail modal ─────────────────────────────────────────── */}
      {openDetail && (
        <RefundDetailModal
          refund={openDetail}
          onClose={() => setOpenDetail(null)}
          onOpenInvoice={() => { setOpenInvoice(openDetail.sale); setOpenDetail(null) }}
        />
      )}

      {/* ── Full invoice modal (read-only) ──────────────────────────────── */}
      {openInvoice && (
        <InvoiceModal
          invoice={openInvoice}
          customers={customers}
          updateSale={() => {}}
          refundSale={null}
          readOnly={true}
          onClose={() => setOpenInvoice(null)}
        />
      )}
    </div>
  )
}
