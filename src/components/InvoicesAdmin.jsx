import { useState, useMemo, useCallback } from 'react'
import { RETAIL_LOCATIONS as LOCATIONS_CFG } from '../config/branding'
import { printReceipt }   from '../utils/printReceipt'
import { RefundModal }    from './RefundModal'

// ── Semantic colors (theme-neutral, kept as constants) ────────────────────────
const BLUE  = '#3b82f6'
const GREEN = '#22c55e'
const AMBER = '#f59e0b'
const RED   = '#ef4444'

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt$ = n => '$' + (+(n || 0)).toFixed(2)

function fmtDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateTime(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function statusMeta(status) {
  if (status === 'voided')   return { label: 'Voided',    color: RED,   bg: `${RED}15`   }
  if (status === 'refunded') return { label: 'Refunded',  color: AMBER, bg: `${AMBER}15` }
  return                             { label: 'Completed', color: GREEN, bg: `${GREEN}15` }
}

function methodMeta(method) {
  if (!method) return { label: '—', color: 'var(--c-text-muted)' }
  const m = method.toLowerCase()
  if (m.includes('cash'))     return { label: 'Cash',   color: GREEN }
  if (m.includes('external')) return { label: 'Ext CC', color: AMBER }
  return                               { label: 'Credit', color: BLUE  }
}

function getCustomerName(customerId, customers) {
  if (!customerId) return '—'
  const c = customers.find(x => x.id === customerId || x.supabaseId === customerId)
  if (!c) return '—'
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || c.name || '—'
}

function Badge({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px', borderRadius: 4,
      background: bg || `${color}20`, color, fontSize: 10, fontWeight: 700,
      letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>{label}</span>
  )
}

// ── Invoice detail modal ─────────────────────────────────────────────────────
// Exported so RefundsAdmin can open it in read-only mode.
export function InvoiceModal({ invoice: init, customers = [], updateSale, refundSale, onClose, readOnly = false }) {
  const [invoice, setInvoice]   = useState(init)
  const [toast,   setToast]     = useState('')
  const [showRefund, setShowRefund] = useState(false)

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handlePrint = () => {
    printReceipt(invoice)
    showToast('Sent to printer')
  }

  const handleReview = () => {
    const reviewed = !invoice.reviewed
    updateSale(invoice.number, { reviewed })
    setInvoice(p => ({ ...p, reviewed }))
    showToast(reviewed ? 'Marked as reviewed ✓' : 'Review mark removed')
  }

  const handleRefundConfirm = useCallback((refundData) => {
    setShowRefund(false)
    if (refundSale) refundSale(invoice, refundData)
    if (refundData.type === 'full') {
      setInvoice(p => ({ ...p, status: 'refunded', refunds: [refundData] }))
      showToast(`Invoice #${invoice.number} refunded`)
    } else {
      setInvoice(p => ({ ...p, refunds: [...(p.refunds || []), refundData] }))
      showToast(`Partial refund — ${refundData.items.length} item${refundData.items.length !== 1 ? 's' : ''}`)
    }
  }, [invoice, refundSale])

  const status   = statusMeta(invoice.status)
  const method   = methodMeta(invoice.paymentMethod)
  const customer = getCustomerName(invoice.linkedCustomerId, customers)
  const items    = invoice.items || []
  const spare    = invoice.totalSpare ?? 0

  const row = (label, value, color, bold) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: '1px solid var(--c-border)',
    }}>
      <span style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>{label}</span>
      <span style={{ color: color || 'var(--c-text)', fontSize: 13, fontWeight: bold ? 700 : 500 }}>
        {value}
      </span>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1200, backdropFilter: 'blur(3px)', padding: 16,
    }}>
      <div style={{
        background: 'var(--c-bg-panel)', border: '1px solid var(--c-border)',
        borderRadius: 10, width: '100%', maxWidth: 860, maxHeight: '90vh',
        display: 'flex', flexDirection: 'column', boxShadow: 'var(--c-shadow-card)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px', background: 'var(--c-bg-card)',
          borderBottom: '1px solid var(--c-border)', borderRadius: '10px 10px 0 0',
          display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, background: `${BLUE}20`,
            border: `1px solid ${BLUE}40`, borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🧾</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={{ color: 'var(--c-text)', fontWeight: 800, fontSize: 16 }}>
                Invoice #{invoice.number}
              </p>
              <Badge {...status} />
              {invoice.reviewed && (
                <Badge label="Reviewed" color={BLUE} bg={`${BLUE}15`} />
              )}
            </div>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 2 }}>
              {fmtDateTime(invoice.timestamp)} · {invoice.location || '—'}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid var(--c-border-md)',
              borderRadius: 6, color: 'var(--c-text-muted)', fontSize: 11,
              padding: '6px 12px', cursor: 'pointer',
            }}
          >✕ Close</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', gap: 0 }}>

          {/* Left: items */}
          <div style={{ flex: 1, padding: '16px 20px', borderRight: '1px solid var(--c-border)' }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700,
              letterSpacing: 0.5, marginBottom: 10 }}>ITEMS</p>

            {items.length === 0 ? (
              <p style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>No items recorded</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--c-border)' }}>
                    {['Product', 'Qty', 'List', 'Disc', 'Final'].map(h => (
                      <th key={h} style={{
                        textAlign: h === 'Product' ? 'left' : 'right',
                        color: 'var(--c-text-muted)', fontWeight: 600, fontSize: 10,
                        paddingBottom: 6, letterSpacing: 0.3,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => {
                    const name      = it.product?.name        || it.name        || '—'
                    const qty       = it.qty       || 1
                    const salePrice = it.salePrice || 0
                    const discount  = it.discount  || 0
                    const subtotal  = it.subtotal  || (salePrice * qty)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid var(--c-border)' }}>
                        <td style={{ padding: '7px 0', color: 'var(--c-text)', maxWidth: 200 }}>
                          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden',
                            textOverflow: 'ellipsis' }}>{name}</div>
                          {it.size && (
                            <div style={{ color: 'var(--c-text-muted)', fontSize: 10 }}>{it.size}</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'right', padding: '7px 0 7px 8px',
                          color: 'var(--c-text-muted)' }}>{qty}</td>
                        <td style={{ textAlign: 'right', padding: '7px 0 7px 8px',
                          color: 'var(--c-text-muted)' }}>{fmt$(salePrice)}</td>
                        <td style={{ textAlign: 'right', padding: '7px 0 7px 8px',
                          color: discount > 0 ? RED : 'var(--c-text-muted)' }}>
                          {discount > 0 ? `-${fmt$(discount)}` : '—'}
                        </td>
                        <td style={{ textAlign: 'right', padding: '7px 0 7px 8px',
                          color: 'var(--c-text)', fontWeight: 600 }}>{fmt$(subtotal)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

            {/* Notes */}
            {invoice.notes && (
              <div style={{
                marginTop: 14, padding: 10, background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border)', borderRadius: 6,
              }}>
                <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700,
                  letterSpacing: 0.5, marginBottom: 4 }}>NOTES</p>
                <p style={{ color: 'var(--c-text)', fontSize: 12 }}>{invoice.notes}</p>
              </div>
            )}

            {/* Refund history */}
            {Array.isArray(invoice.refunds) && invoice.refunds.length > 0 && (
              <div style={{
                marginTop: 14, padding: 10, background: `${AMBER}08`,
                border: `1px solid ${AMBER}30`, borderRadius: 6,
              }}>
                <p style={{ color: AMBER, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
                  REFUND HISTORY ({invoice.refunds.length})
                </p>
                {invoice.refunds.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                    padding: '6px 0', borderBottom: i < invoice.refunds.length - 1 ? `1px solid ${AMBER}20` : 'none',
                  }}>
                    <div>
                      <p style={{ color: 'var(--c-text)', fontSize: 12, fontWeight: 600 }}>
                        {r.type === 'full' ? 'Full Refund' : `Partial — ${r.items?.length || 0} item${(r.items?.length || 0) !== 1 ? 's' : ''}`}
                        {r.refundMethod ? ` · ${r.refundMethod}` : ''}
                      </p>
                      <p style={{ color: 'var(--c-text-muted)', fontSize: 10, marginTop: 2 }}>
                        {r.timestamp ? new Date(r.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}
                        {r.authorizedBy ? ` · Auth: ${r.authorizedBy}` : ''}
                      </p>
                    </div>
                    <p style={{ color: AMBER, fontWeight: 700, fontSize: 13, flexShrink: 0, paddingLeft: 12 }}>
                      −${(+(r.total || 0)).toFixed(2)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: summary + actions */}
          <div style={{ width: 240, padding: '16px 20px', flexShrink: 0 }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700,
              letterSpacing: 0.5, marginBottom: 10 }}>SUMMARY</p>

            {row('Seller',   invoice.employee || '—')}
            {row('Customer', customer)}
            {row('Method',   <Badge {...method} />)}
            <div style={{ height: 8 }} />
            {row('Subtotal', fmt$(invoice.subtotal))}
            {row('Tax',      fmt$(invoice.tax), AMBER)}
            {(invoice.tip > 0) && row('Tip', fmt$(invoice.tip), BLUE)}
            {row('Total',    fmt$(invoice.total), GREEN, true)}
            {row('Spare',    fmt$(spare), spare > 0 ? BLUE : 'var(--c-text-muted)')}

            {/* Actions */}
            <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handlePrint}
                style={{
                  padding: '9px 14px', background: `${BLUE}20`,
                  border: `1px solid ${BLUE}50`, borderRadius: 6,
                  color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >🖨️ Reprint Receipt</button>

              <button
                onClick={handleReview}
                style={{
                  padding: '9px 14px',
                  background: invoice.reviewed ? `${GREEN}15` : 'var(--c-bg-card)',
                  border: `1px solid ${invoice.reviewed ? GREEN : 'var(--c-border-md)'}`,
                  borderRadius: 6,
                  color: invoice.reviewed ? GREEN : 'var(--c-text-muted)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >{invoice.reviewed ? '✓ Reviewed' : '○ Mark Reviewed'}</button>

              {invoice.status === 'completed' && !readOnly && (
                <button
                  onClick={() => setShowRefund(true)}
                  style={{
                    padding: '9px 14px', background: `${AMBER}15`,
                    border: `1px solid ${AMBER}50`, borderRadius: 6,
                    color: AMBER, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >↩️ Process Refund</button>
              )}
            </div>
          </div>
        </div>

        {/* Toast */}
        {toast && (
          <div style={{
            position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            background: '#1e293b', border: '1px solid var(--c-border)',
            borderRadius: 6, padding: '8px 18px', color: 'var(--c-text)',
            fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)', pointerEvents: 'none',
          }}>{toast}</div>
        )}
      </div>

      {showRefund && (
        <RefundModal
          invoice={invoice}
          onClose={() => setShowRefund(false)}
          onConfirm={handleRefundConfirm}
        />
      )}
    </div>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, color, icon }) {
  return (
    <div style={{
      flex: 1, minWidth: 110,
      background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{icon}</span>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>
          {label}
        </p>
      </div>
      <p style={{ color: color || 'var(--c-text)', fontSize: 18, fontWeight: 800 }}>{value}</p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const PAGE_SIZE = 50

export default function InvoicesAdmin({ sales = [], customers = [], posSession, onClose, updateSale, refundSale = null }) {
  const [fromDate,    setFromDate]    = useState('')
  const [toDate,      setToDate]      = useState('')
  const [locFilter,   setLocFilter]   = useState('all')
  const [sellerFilter,setSellerFilter]= useState('all')
  const [methodFilter,setMethodFilter]= useState('all')
  const [statusFilter,setStatusFilter]= useState('all')
  const [search,      setSearch]      = useState('')
  const [showFilters, setShowFilters] = useState(true)
  const [page,        setPage]        = useState(1)
  const [openInvoice, setOpenInvoice] = useState(null)

  // ── Filter options ──────────────────────────────────────────────────────────
  const sellers = useMemo(
    () => [...new Set(sales.map(s => s.employee).filter(Boolean))].sort(),
    [sales]
  )
  const methods = useMemo(
    () => [...new Set(sales.map(s => s.paymentMethod).filter(Boolean))].sort(),
    [sales]
  )

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return sales.filter(s => {
      const d = new Date(s.timestamp)
      if (fromDate && d < new Date(fromDate))                     return false
      if (toDate   && d > new Date(toDate + 'T23:59:59'))         return false
      if (locFilter    !== 'all' && s.location    !== locFilter)  return false
      if (sellerFilter !== 'all' && s.employee    !== sellerFilter) return false
      if (methodFilter !== 'all' && s.paymentMethod !== methodFilter) return false
      if (statusFilter !== 'all') {
        if (statusFilter === 'active'    && s.status === 'voided')    return false
        if (statusFilter === 'voided'    && s.status !== 'voided')    return false
        if (statusFilter === 'reviewed'  && !s.reviewed)             return false
        if (statusFilter === 'unreviewed'&& s.reviewed)              return false
      }
      if (q) {
        const num  = String(s.number || '')
        const emp  = (s.employee || '').toLowerCase()
        const cust = getCustomerName(s.linkedCustomerId, customers).toLowerCase()
        const loc  = (s.location || '').toLowerCase()
        if (!num.includes(q) && !emp.includes(q) && !cust.includes(q) && !loc.includes(q)) return false
      }
      return true
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
  }, [sales, fromDate, toDate, locFilter, sellerFilter, methodFilter, statusFilter, search, customers])

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = filtered.filter(s => s.status !== 'voided')
    return {
      net:     active.reduce((a, s) => a + (s.subtotal    || 0), 0),
      tax:     active.reduce((a, s) => a + (s.tax         || 0), 0),
      gross:   active.reduce((a, s) => a + (s.total       || 0), 0),
      spare:   active.reduce((a, s) => a + (s.totalSpare  || 0), 0),
      count:   filtered.length,
      voided:  filtered.filter(s => s.status === 'voided').length,
    }
  }, [filtered])

  // ── Pagination ──────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const resetPage = () => setPage(1)

  const handleFilter = (setter) => (val) => { setter(val); resetPage() }

  // ── Select style helper ─────────────────────────────────────────────────────
  const selStyle = {
    padding: '7px 10px', background: 'var(--c-bg-card)',
    border: '1px solid var(--c-border-md)', borderRadius: 6,
    color: 'var(--c-text)', fontSize: 12, outline: 'none', cursor: 'pointer',
    minWidth: 120,
  }

  const inputStyle = {
    padding: '7px 10px', background: 'var(--c-bg-card)',
    border: '1px solid var(--c-border-md)', borderRadius: 6,
    color: 'var(--c-text)', fontSize: 12, outline: 'none',
  }

  const thStyle = (align = 'left') => ({
    padding: '9px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
    color: 'var(--c-text-muted)', textAlign: align,
    borderBottom: '1px solid var(--c-border)', whiteSpace: 'nowrap',
    position: 'sticky', top: 0, background: 'var(--c-bg-card)', zIndex: 1,
  })

  const tdStyle = (align = 'left', bold) => ({
    padding: '9px 12px', fontSize: 12, textAlign: align,
    color: bold ? 'var(--c-text)' : 'var(--c-text-muted)',
    fontWeight: bold ? 700 : 400, borderBottom: '1px solid var(--c-border)',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--c-bg)', zIndex: 1000,
      display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 20px', height: 54, flexShrink: 0,
        background: 'var(--c-bg-panel)', borderBottom: '1px solid var(--c-border)',
        boxShadow: 'var(--c-shadow-bar)',
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'transparent', border: '1px solid var(--c-border-md)',
            borderRadius: 6, color: 'var(--c-text-muted)', fontSize: 12,
            padding: '5px 12px', cursor: 'pointer',
          }}
        >← Back</button>
        <div style={{
          width: 28, height: 28, background: '#1abc9c20',
          border: '1px solid #1abc9c40', borderRadius: 6,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
        }}>💰</div>
        <div>
          <p style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 14 }}>Invoices</p>
          <p style={{ color: 'var(--c-text-muted)', fontSize: 10 }}>
            {filtered.length} of {sales.length} invoices
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setShowFilters(f => !f)}
          style={{
            padding: '6px 12px', background: showFilters ? `${BLUE}20` : 'var(--c-bg-card)',
            border: `1px solid ${showFilters ? BLUE + '60' : 'var(--c-border-md)'}`,
            borderRadius: 6, color: showFilters ? BLUE : 'var(--c-text-muted)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
          }}
        >⚙ Filters</button>
      </div>

      {/* ── KPI cards ── */}
      <div style={{
        display: 'flex', gap: 10, padding: '12px 20px', flexShrink: 0,
        background: 'var(--c-bg-panel)', borderBottom: '1px solid var(--c-border)',
        overflowX: 'auto',
      }}>
        <KpiCard icon="💵" label="NET REVENUE"    value={fmt$(kpis.net)}   color={GREEN} />
        <KpiCard icon="🏛️" label="TAX COLLECTED"  value={fmt$(kpis.tax)}   color={AMBER} />
        <KpiCard icon="💰" label="GROSS REVENUE"  value={fmt$(kpis.gross)} color={GREEN} />
        <KpiCard icon="⭐" label="TOTAL SPARE"    value={fmt$(kpis.spare)} color={BLUE}  />
        <KpiCard icon="🧾" label="INVOICES"       value={kpis.count}       />
        <KpiCard icon="↩️" label="VOIDED"          value={kpis.voided}     color={kpis.voided > 0 ? RED : undefined} />
      </div>

      {/* ── Filters ── */}
      {showFilters && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 20px',
          background: 'var(--c-bg-panel)', borderBottom: '1px solid var(--c-border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>FROM</label>
            <input type="date" value={fromDate}
              onChange={e => { setFromDate(e.target.value); resetPage() }}
              style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>TO</label>
            <input type="date" value={toDate}
              onChange={e => { setToDate(e.target.value); resetPage() }}
              style={inputStyle} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>LOCATION</label>
            <select value={locFilter} onChange={e => handleFilter(setLocFilter)(e.target.value)} style={selStyle}>
              <option value="all">All Locations</option>
              {LOCATIONS_CFG.map(l => <option key={l.id} value={l.name}>{l.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>SELLER</label>
            <select value={sellerFilter} onChange={e => handleFilter(setSellerFilter)(e.target.value)} style={selStyle}>
              <option value="all">All Sellers</option>
              {sellers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>METHOD</label>
            <select value={methodFilter} onChange={e => handleFilter(setMethodFilter)(e.target.value)} style={selStyle}>
              <option value="all">All Methods</option>
              {methods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>STATUS</label>
            <select value={statusFilter} onChange={e => handleFilter(setStatusFilter)(e.target.value)} style={selStyle}>
              <option value="all">All</option>
              <option value="active">Completed</option>
              <option value="voided">Voided</option>
              <option value="reviewed">Reviewed</option>
              <option value="unreviewed">Not Reviewed</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 160 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>SEARCH</label>
            <input
              type="text" placeholder="#, seller, customer…"
              value={search} onChange={e => { setSearch(e.target.value); resetPage() }}
              style={{ ...inputStyle, width: '100%' }}
            />
          </div>
          {(fromDate || toDate || locFilter !== 'all' || sellerFilter !== 'all' ||
            methodFilter !== 'all' || statusFilter !== 'all' || search) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, justifyContent: 'flex-end' }}>
              <label style={{ color: 'transparent', fontSize: 10 }}>_</label>
              <button
                onClick={() => {
                  setFromDate(''); setToDate(''); setLocFilter('all')
                  setSellerFilter('all'); setMethodFilter('all')
                  setStatusFilter('all'); setSearch(''); resetPage()
                }}
                style={{
                  padding: '7px 12px', background: `${RED}15`,
                  border: `1px solid ${RED}40`, borderRadius: 6,
                  color: RED, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >✕ Clear</button>
            </div>
          )}
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', gap: 10,
          }}>
            <span style={{ fontSize: 40 }}>🧾</span>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 14 }}>No invoices match your filters</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                <th style={thStyle()}>Invoice #</th>
                <th style={thStyle()}>Date / Time</th>
                <th style={thStyle()}>Location</th>
                <th style={thStyle()}>Seller</th>
                <th style={thStyle()}>Customer</th>
                <th style={thStyle('right')}>Subtotal</th>
                <th style={thStyle('right')}>Tax</th>
                <th style={thStyle('right')}>Total</th>
                <th style={thStyle('right')}>Spare</th>
                <th style={thStyle('center')}>Method</th>
                <th style={thStyle('center')}>Status</th>
                <th style={thStyle('center')}>Rev.</th>
                <th style={thStyle('center')}>Open</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(s => {
                const st  = statusMeta(s.status)
                const mt  = methodMeta(s.paymentMethod)
                const cust = getCustomerName(s.linkedCustomerId, customers)
                return (
                  <tr
                    key={s.id || s.number}
                    style={{ cursor: 'default' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <td style={{ ...tdStyle(), color: BLUE, fontWeight: 700 }}>#{s.number}</td>
                    <td style={tdStyle()}>{fmtDateTime(s.timestamp)}</td>
                    <td style={tdStyle()}>{s.location || '—'}</td>
                    <td style={{ ...tdStyle(), color: 'var(--c-text)' }}>{s.employee || '—'}</td>
                    <td style={tdStyle()}>{cust}</td>
                    <td style={{ ...tdStyle('right'), color: 'var(--c-text)' }}>{fmt$(s.subtotal)}</td>
                    <td style={{ ...tdStyle('right'), color: AMBER }}>{fmt$(s.tax)}</td>
                    <td style={{ ...tdStyle('right'), color: GREEN, fontWeight: 700 }}>{fmt$(s.total)}</td>
                    <td style={{ ...tdStyle('right'), color: (s.totalSpare || 0) > 0 ? BLUE : 'var(--c-text-muted)' }}>
                      {fmt$(s.totalSpare)}
                    </td>
                    <td style={{ ...tdStyle('center') }}>
                      <Badge label={mt.label} color={mt.color} />
                    </td>
                    <td style={{ ...tdStyle('center') }}>
                      <Badge label={st.label} color={st.color} bg={st.bg} />
                    </td>
                    <td style={{ ...tdStyle('center') }}>
                      {s.reviewed
                        ? <span style={{ color: GREEN, fontSize: 14 }}>✓</span>
                        : <span style={{ color: 'var(--c-border-md)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td style={{ ...tdStyle('center') }}>
                      <button
                        onClick={() => setOpenInvoice(s)}
                        style={{
                          padding: '4px 10px', background: `${BLUE}15`,
                          border: `1px solid ${BLUE}40`, borderRadius: 4,
                          color: BLUE, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        }}
                      >View</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '10px 20px', flexShrink: 0,
          background: 'var(--c-bg-panel)', borderTop: '1px solid var(--c-border)',
        }}>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{
              padding: '5px 12px', background: 'var(--c-bg-card)',
              border: '1px solid var(--c-border-md)', borderRadius: 5,
              color: page === 1 ? 'var(--c-text-muted)' : 'var(--c-text)',
              fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer',
            }}
          >← Prev</button>
          <span style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
            Page {page} of {totalPages} · {filtered.length} invoices
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{
              padding: '5px 12px', background: 'var(--c-bg-card)',
              border: '1px solid var(--c-border-md)', borderRadius: 5,
              color: page === totalPages ? 'var(--c-text-muted)' : 'var(--c-text)',
              fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer',
            }}
          >Next →</button>
        </div>
      )}

      {/* ── Invoice modal ── */}
      {openInvoice && (
        <InvoiceModal
          invoice={openInvoice}
          customers={customers}
          updateSale={updateSale}
          refundSale={refundSale}
          onClose={() => setOpenInvoice(null)}
        />
      )}
    </div>
  )
}
