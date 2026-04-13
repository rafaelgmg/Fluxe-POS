/**
 * Receipts.jsx
 * Locate, view, and reprint any stored invoice.
 * Mirrors Nova POS "Receipts" module: search by number, Print Latest, Open Latest.
 */

import { useState, useMemo } from 'react'
import { printReceipt } from '../utils/printReceipt'

const SALES_KEY = 'fluxe-sales-v1'

function loadSales() {
  try {
    const raw = localStorage.getItem(SALES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function fmt$(n) {
  return '$' + (n || 0).toFixed(2)
}

function fmtDateTime(ts) {
  const d = new Date(ts)
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const min  = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd}/${yyyy}  ${hh}:${min}`
}

function resolveItem(item) {
  return {
    name:      item.product?.name      || item.name      || '(no name)',
    size:      item.product?.size      || item.size      || '',
    qty:       item.qty  || 1,
    salePrice: item.salePrice || 0,
    discount:  item.discount  || 0,
    subtotal:  item.subtotal  || (item.salePrice || 0) * (item.qty || 1),
  }
}

// ── Invoice detail panel ───────────────────────────────────────────────────────
function InvoiceDetail({ invoice, onClose, onPrint }) {
  const tip      = invoice.tip ?? 0
  const subtotal = invoice.subtotal ?? 0
  const tax      = invoice.tax      ?? 0
  const total    = invoice.total    ?? 0

  const statusColor = {
    normal:  '#22c55e',
    refund:  '#ef4444',
    deleted: '#64748b',
  }[invoice.status] || '#94a3b8'

  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#020817',
      display: 'flex', flexDirection: 'column', zIndex: 10,
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{
            background: 'rgba(30,41,59,0.6)', border: '1px solid #1e293b',
            borderRadius: 6, color: '#94a3b8', padding: '6px 12px',
            cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >← Back</button>

        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>
            Receipt #{invoice.number}
            <span style={{
              marginLeft: 10, fontSize: 11, fontWeight: 600,
              color: statusColor, background: statusColor + '22',
              padding: '2px 8px', borderRadius: 10,
            }}>
              {(invoice.status || 'normal').toUpperCase()}
            </span>
          </div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
            {fmtDateTime(invoice.timestamp)}
            {invoice.location && <span> · {invoice.location}</span>}
          </div>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button
            onClick={() => onPrint(invoice)}
            style={{
              background: '#2563eb', border: 'none', borderRadius: 6,
              color: '#fff', padding: '8px 18px', cursor: 'pointer',
              fontSize: 13, fontWeight: 700,
            }}
          >
            🖨 Print Receipt
          </button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        <div style={{
          maxWidth: 680, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>

          {/* Meta row */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 12,
          }}>
            {[
              { label: 'Employee', value: invoice.employee || '—' },
              { label: 'Payment', value: invoice.paymentMethod || '—' },
              { label: 'Location', value: invoice.location || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{
                background: '#0f172a', border: '1px solid #1e293b',
                borderRadius: 8, padding: '12px 16px',
              }}>
                <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 600 }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Items */}
          <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px',
              padding: '8px 16px', background: '#0a0f1e',
              fontSize: 10, color: '#475569', fontWeight: 600, letterSpacing: 0.6,
              textTransform: 'uppercase',
            }}>
              <span>Product</span>
              <span style={{ textAlign: 'center' }}>Qty</span>
              <span style={{ textAlign: 'right' }}>Price</span>
              <span style={{ textAlign: 'right' }}>Subtotal</span>
            </div>

            {(invoice.items || []).map((raw, i) => {
              const item = resolveItem(raw)
              return (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px',
                  padding: '10px 16px',
                  borderTop: '1px solid #1e293b',
                  alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 13, color: '#f1f5f9' }}>{item.name}</div>
                    {item.size && <div style={{ fontSize: 11, color: '#64748b' }}>{item.size}</div>}
                    {item.discount > 0 && (
                      <div style={{ fontSize: 11, color: '#f59e0b' }}>
                        -{fmt$(item.discount * item.qty)} discount
                      </div>
                    )}
                  </div>
                  <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>{item.qty}</div>
                  <div style={{ textAlign: 'right', color: '#94a3b8', fontSize: 13 }}>{fmt$(item.salePrice)}</div>
                  <div style={{ textAlign: 'right', color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{fmt$(item.subtotal)}</div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
          <div style={{
            background: '#0f172a', border: '1px solid #1e293b',
            borderRadius: 8, padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 8, alignSelf: 'flex-end', minWidth: 260,
          }}>
            {[
              { label: 'Subtotal', value: subtotal },
              { label: 'Tax',      value: tax      },
              ...(tip > 0 ? [{ label: 'Tip', value: tip }] : []),
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#94a3b8' }}>
                <span>{label}</span>
                <span>{fmt$(value)}</span>
              </div>
            ))}

            <div style={{
              display: 'flex', justifyContent: 'space-between',
              borderTop: '1px solid #334155', paddingTop: 8, marginTop: 4,
              fontSize: 16, fontWeight: 700, color: '#f1f5f9',
            }}>
              <span>TOTAL</span>
              <span>{fmt$(total)}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Main Receipts module ───────────────────────────────────────────────────────
export default function Receipts({ onClose, posSession }) {
  const currentLocation = posSession?.location || null

  const [searchInput, setSearchInput]   = useState('')
  const [searchResult, setSearchResult] = useState(null)   // { found: bool, invoice?: {} }
  const [openInvoice, setOpenInvoice]   = useState(null)
  // 'current' = filter by posSession.location | 'all' = no filter
  const [locScope, setLocScope]         = useState('current')

  const allSales = useMemo(() => loadSales(), [])

  // Sales filtered by location scope
  const sales = useMemo(() => {
    if (locScope === 'all' || !currentLocation) return allSales
    return allSales.filter(s => s.location === currentLocation)
  }, [allSales, locScope, currentLocation])

  // Latest sale in current scope
  const latestSale = useMemo(() => {
    if (!sales.length) return null
    return sales.reduce((a, b) => (Number(b.number) > Number(a.number) ? b : a))
  }, [sales])

  // Last 10 receipts sorted newest first (by invoice number)
  const recentSales = useMemo(() => {
    return [...sales]
      .sort((a, b) => Number(b.number) - Number(a.number))
      .slice(0, 10)
  }, [sales])

  const handleSearch = () => {
    const q = searchInput.trim()
    if (!q) return
    // Search in allSales so an invoice from another location can still be found by number
    const found = allSales.find(s => String(s.number) === q)
    setSearchResult(found ? { found: true, invoice: found } : { found: false })
    if (found) setOpenInvoice(null)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch()
  }

  const handlePrint = (invoice) => {
    printReceipt(invoice)
  }

  // ── If an invoice is open, show detail view ───────────────────────────────
  if (openInvoice) {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}>
        <div style={{
          width: '90%', maxWidth: 800, height: '88vh',
          background: '#020817', borderRadius: 12,
          border: '1px solid #1e293b', boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
          position: 'relative', overflow: 'hidden',
        }}>
          <InvoiceDetail
            invoice={openInvoice}
            onClose={() => setOpenInvoice(null)}
            onPrint={handlePrint}
          />
        </div>
      </div>
    )
  }

  // ── Shared button styles ──────────────────────────────────────────────────
  const quickBtn = (color = '#2563eb') => ({
    background: color === 'ghost'
      ? 'rgba(37,99,235,0.1)'
      : color,
    border: color === 'ghost' ? '1px solid rgba(37,99,235,0.3)' : 'none',
    borderRadius: 6, color: '#fff', padding: '5px 12px',
    cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0,
    whiteSpace: 'nowrap',
  })

  // ── Main search view ──────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        width: 560, maxHeight: '88vh',
        background: '#0a0f1e', borderRadius: 12,
        border: '1px solid #1e293b', boxShadow: '0 24px 64px rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          padding: '16px 22px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🧾</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Locate Receipt</div>
              <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>Search for invoice</div>
            </div>
          </div>

          {/* Location scope toggle */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {currentLocation && (
              <div style={{
                display: 'flex', background: '#0f172a',
                border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden',
              }}>
                {[
                  { key: 'current', label: currentLocation },
                  { key: 'all',     label: 'All Locations'  },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { setLocScope(key); setSearchResult(null) }}
                    style={{
                      padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 11,
                      fontWeight: locScope === key ? 700 : 400,
                      background: locScope === key ? '#2563eb' : 'transparent',
                      color: locScope === key ? '#fff' : '#64748b',
                      transition: 'all 0.15s',
                    }}
                  >{label}</button>
                ))}
              </div>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'none', border: '1px solid #1e293b', borderRadius: 6,
                color: '#64748b', width: 28, height: 28, cursor: 'pointer',
                fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >×</button>
          </div>
        </div>

        {/* ── Scrollable body ── */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* Search area */}
          <div style={{ padding: '18px 22px 14px' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={searchInput}
                onChange={e => { setSearchInput(e.target.value); setSearchResult(null) }}
                onKeyDown={handleKeyDown}
                placeholder="Invoice number..."
                autoFocus
                style={{
                  flex: 1, padding: '9px 14px',
                  background: '#0f172a', border: '1px solid #1e293b',
                  borderRadius: 8, color: '#f1f5f9', fontSize: 14, outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = '#2563eb' }}
                onBlur={e => { e.target.style.borderColor = '#1e293b' }}
              />
              <button
                onClick={handleSearch}
                style={{
                  background: '#2563eb', border: 'none', borderRadius: 8,
                  color: '#fff', padding: '9px 20px', cursor: 'pointer',
                  fontSize: 14, fontWeight: 700, flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#2563eb' }}
              >Search</button>
            </div>

            {/* Not found */}
            {searchResult && !searchResult.found && (
              <div style={{
                marginTop: 10, padding: '9px 14px',
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                borderRadius: 8, color: '#ef4444', fontSize: 13,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span>⚠</span> Receipt not found
              </div>
            )}

            {/* Found */}
            {searchResult?.found && (
              <div style={{
                marginTop: 10, padding: '11px 16px',
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>
                    Receipt #{searchResult.invoice.number}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {fmtDateTime(searchResult.invoice.timestamp)}
                    {' · '}{searchResult.invoice.employee}
                    {' · '}{fmt$(searchResult.invoice.total)}
                    {searchResult.invoice.location && locScope === 'all'
                      ? ` · ${searchResult.invoice.location}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => setOpenInvoice(searchResult.invoice)}
                    style={quickBtn('ghost')}
                  >Open</button>
                  <button
                    onClick={() => handlePrint(searchResult.invoice)}
                    style={quickBtn()}
                  >🖨 Print</button>
                </div>
              </div>
            )}
          </div>

          {/* ── Latest + quick actions ── */}
          {latestSale && (
            <div style={{ padding: '0 22px 14px' }}>
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 }}>
                  Latest Receipt {locScope === 'current' && currentLocation ? `· ${currentLocation}` : '· All Locations'}
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px', background: '#0f172a',
                  border: '1px solid #1e293b', borderRadius: 8, gap: 12,
                }}>
                  <div style={{ fontSize: 12, color: '#94a3b8', minWidth: 0 }}>
                    <span style={{ fontWeight: 700, color: '#f1f5f9' }}>#{latestSale.number}</span>
                    {' · '}{fmtDateTime(latestSale.timestamp)}
                    {' · '}{latestSale.employee}
                    {' · '}<span style={{ color: '#22c55e', fontWeight: 600 }}>{fmt$(latestSale.total)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => handlePrint(latestSale)} style={quickBtn()}>🖨 Print</button>
                    <button onClick={() => setOpenInvoice(latestSale)} style={quickBtn('ghost')}>Open</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Recent receipts list ── */}
          <div style={{ padding: '0 22px 22px' }}>
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14 }}>
              <div style={{ fontSize: 10, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 8 }}>
                Recent Receipts ({recentSales.length})
              </div>

              {recentSales.length === 0 && (
                <div style={{ color: '#475569', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
                  No receipts found
                </div>
              )}

              {recentSales.map((inv, idx) => {
                const isLatest = idx === 0
                return (
                  <div
                    key={inv.number}
                    style={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: 'space-between', gap: 12,
                      padding: '9px 12px',
                      background: isLatest ? 'rgba(37,99,235,0.06)' : 'transparent',
                      borderBottom: '1px solid #1e293b',
                      borderLeft: isLatest ? '2px solid #2563eb' : '2px solid transparent',
                    }}
                  >
                    {/* Info */}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#f1f5f9' }}>
                          #{inv.number}
                        </span>
                        {isLatest && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: '#2563eb',
                            background: 'rgba(37,99,235,0.15)', padding: '1px 6px', borderRadius: 6,
                            textTransform: 'uppercase', letterSpacing: 0.5,
                          }}>Latest</span>
                        )}
                        {locScope === 'all' && inv.location && (
                          <span style={{
                            fontSize: 9, color: '#64748b',
                            background: '#0f172a', border: '1px solid #1e293b',
                            padding: '1px 6px', borderRadius: 6,
                          }}>{inv.location}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                        {fmtDateTime(inv.timestamp)} · {inv.employee}
                        {' · '}
                        <span style={{ color: '#94a3b8' }}>{fmt$(inv.total)}</span>
                        {' · '}
                        <span style={{ color: '#475569' }}>{inv.paymentMethod}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button
                        onClick={() => handlePrint(inv)}
                        title="Print receipt"
                        style={{
                          background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)',
                          borderRadius: 6, color: '#93c5fd', padding: '4px 10px',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        }}
                      >🖨</button>
                      <button
                        onClick={() => setOpenInvoice(inv)}
                        title="Open invoice"
                        style={{
                          background: 'rgba(30,41,59,0.6)', border: '1px solid #1e293b',
                          borderRadius: 6, color: '#94a3b8', padding: '4px 10px',
                          cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        }}
                      >Open</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
