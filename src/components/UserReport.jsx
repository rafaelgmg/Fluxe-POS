import { useState, useMemo, useEffect } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { loadCRM } from '../utils/crmStorage'
import { LOCATIONS_CFG } from '../config/branding'
import { printReceipt } from '../utils/printReceipt'
import { calcPeriodCommissionFresh, calcInvoiceCommission } from '../utils/commissionEngine'
import { buildCategoryMap } from '../utils/categoriesStorage'
import { getDayBonusResult, calcFinalDailyPay } from '../utils/bonusEngine'
import { setManualBonus } from '../utils/bonusStorage'
import { loadUsers } from '../utils/usersStorage'
import { calcDayCompetitionBonus } from '../utils/competitionBonusEngine'
import { localDateKey } from '../utils/dateUtils'
import { fetchClockRecordsByEmployee } from '../services/supabaseRead'
import { loadLocationConfig } from '../utils/locationConfig'
import { verifyEmployeePin } from '../services/supabaseAuth'

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const AMBER  = '#f59e0b'
const PURPLE = '#8b5cf6'
const MUTED  = 'var(--c-text-muted)'
const TEXT   = 'var(--c-text)'
const DIM    = 'var(--c-text-sub)'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmt$ = (n) => `$${(n || 0).toFixed(2)}`

const fmtDateTime = (ts) =>
  new Date(ts).toLocaleString('en-US', {
    month: 'numeric', day: 'numeric', year: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: true,
  })

const fmtDateOnly = (ts) =>
  new Date(ts).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })

const toLocalInputVal = (ts) => {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// localDateKey imported from dateUtils — see src/utils/dateUtils.js
function localDateStr(d = new Date()) {
  return localDateKey(d)
}

/**
 * Parseia "YYYY-MM-DD" como meia-noite LOCAL (não UTC).
 * new Date("2026-04-08") parseia como UTC midnight = April 7, 5PM PDT.
 * new Date(2026, 3, 8) parseia como LOCAL midnight = April 8, 12AM PDT. ✓
 */
function parseLocalDate(str) {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, m - 1, d)
}


// ─── PIN Gate ─────────────────────────────────────────────────────────────────
function ReportPinGate({ onUnlock, onClose }) {
  const employees = loadActiveEmployees()
  const [selectedId, setSelectedId] = useState(employees[0]?.id ?? null)
  const [pin, setPin]   = useState('')
  const [shake, setShake] = useState(false)

  const press = async (digit) => {
    if (pin.length >= 6) return
    const next = pin + digit
    setPin(next)
    if (next.length >= 4) {
      const emp = employees.find(e => e.id === selectedId)
      const result = await verifyEmployeePin(emp?.name, next)
      if (result) {
        onUnlock(result)
      } else {
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 700)
      }
    }
  }

  // Physical keyboard / numpad support
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'SELECT') return
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setPin(p => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 10,
        width: 380, padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(139,92,246,0.15)',
            border: '1px solid rgba(139,92,246,0.3)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>📊</div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: TEXT }}>User Report</h2>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>Select your profile and enter PIN</p>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: MUTED, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            SELECT EMPLOYEE
          </label>
          <select
            value={selectedId ?? ''}
            onChange={e => { const v = e.target.value; const n = Number(v); setSelectedId(Number.isNaN(n) ? v : n); setPin('') }}
            style={{
              width: '100%', padding: '9px 12px', background: CARD,
              border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
              fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ color: MUTED, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 8, letterSpacing: 0.5 }}>
            PIN
          </label>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 6,
            transform: shake ? 'translateX(4px)' : 'none',
            transition: shake ? 'transform 0.07s' : 'none',
          }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 13, height: 13, borderRadius: '50%',
                background: i < pin.length ? (shake ? RED : BLUE) : CARD,
                border: `2px solid ${i < pin.length ? (shake ? RED : BLUE) : BORDER}`,
                transition: 'background 0.12s',
              }} />
            ))}
          </div>
          {shake && <p style={{ color: RED, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Incorrect PIN</p>}
          <div style={{ height: shake ? 0 : 18 }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 18 }}>
          {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
            <button key={i}
              onClick={() => {
                if (!k) return
                if (k === '⌫') setPin(p => p.slice(0, -1))
                else press(k)
              }}
              disabled={!k}
              style={{
                padding: '13px 0', background: !k ? 'transparent' : CARD,
                border: !k ? 'none' : `1px solid ${BORDER}`, borderRadius: 7,
                color: TEXT, fontSize: k === '⌫' ? 15 : 18,
                fontWeight: 600, cursor: !k ? 'default' : 'pointer', opacity: !k ? 0 : 1,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (k) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
              onMouseLeave={e => { if (k) { e.currentTarget.style.background = CARD; e.currentTarget.style.borderColor = BORDER } }}
            >{k}</button>
          ))}
        </div>

        <button onClick={onClose} style={{
          width: '100%', padding: '12px', background: 'transparent',
          border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED,
          fontSize: 14, cursor: 'pointer', transition: 'all 0.2s ease',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
        >Cancel</button>
      </div>
    </div>
  )
}

// ─── Invoice Products Table ───────────────────────────────────────────────────
function InvoiceProductsTable({ items = [], invoiceTax, invoiceSubtotal }) {
  const taxFraction = invoiceSubtotal > 0 ? invoiceTax / invoiceSubtotal : 0
  const thStyle = {
    padding: '7px 10px', textAlign: 'left', color: MUTED, fontWeight: 600,
    fontSize: 10, background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`,
    whiteSpace: 'nowrap', letterSpacing: 0.4,
  }
  const tdStyle = (extra = {}) => ({
    padding: '8px 10px', fontSize: 12, color: DIM,
    borderBottom: `1px solid var(--c-border-row)`, ...extra,
  })

  return (
    <div style={{ overflowX: 'auto', borderRadius: 6, border: `1px solid ${BORDER}` }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr>
            {['Barcode','Product','Description','Size','Qty','Price','Tax','Subtotal','Total'].map(h => (
              <th key={h} style={{ ...thStyle, textAlign: ['Qty','Price','Tax','Subtotal','Total'].includes(h) ? 'right' : 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No items</td></tr>
          )}
          {items.map((item, i) => {
            const lineTax   = (item.subtotal || 0) * taxFraction
            const lineTotal = (item.subtotal || 0) + lineTax
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)' }}>
                <td style={tdStyle({ fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-dim)' })}>{item.barcode || item.product?.barcode || '—'}</td>
                <td style={tdStyle({ color: TEXT, fontWeight: 500 })}>{item.product?.name || item.name}</td>
                <td style={tdStyle({ color: MUTED })}>{item.product?.description || item.description || '—'}</td>
                <td style={tdStyle()}>{item.product?.size || item.size || '—'}</td>
                <td style={tdStyle({ textAlign: 'right', color: TEXT })}>{item.qty}</td>
                <td style={tdStyle({ textAlign: 'right' })}>{fmt$(item.salePrice)}</td>
                <td style={tdStyle({ textAlign: 'right', color: MUTED })}>{fmt$(lineTax)}</td>
                <td style={tdStyle({ textAlign: 'right' })}>{fmt$(item.subtotal)}</td>
                <td style={tdStyle({ textAlign: 'right', color: GREEN, fontWeight: 700 })}>{fmt$(lineTotal)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Invoice Payments Section ─────────────────────────────────────────────────
function InvoicePaymentsSection({ invoice }) {
  // Build display rows — prefer new payments[] array, fall back to legacy flat fields
  const payments = (() => {
    if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
      return invoice.payments.map(p => {
        const method = p.method || '—'
        let details = ''
        if (method === 'cash') {
          const parts = []
          if (p.amountReceived != null) parts.push(`Received: ${fmt$(p.amountReceived)}`)
          if (p.changeDue      != null) parts.push(`Change: ${fmt$(p.changeDue)}`)
          details = parts.join('  ·  ') || 'Cash payment'
        } else if (method === 'card') {
          const brand = p.cardBrand ? p.cardBrand.charAt(0).toUpperCase() + p.cardBrand.slice(1) : ''
          const last4 = p.cardLast4 ? ` ****${p.cardLast4}` : ''
          const auth  = p.authorizationNumber ? `  Auth: ${p.authorizationNumber}` : ''
          details = `${brand}${last4}${auth}`.trim() || 'Card transaction'
        } else if (method === 'external') {
          details = p.externalRef || 'External payment'
        } else if (method === 'check') {
          details = p.checkNumber ? `Check #${p.checkNumber}` : 'Check payment'
        }
        return { timestamp: invoice.timestamp, method, details, amount: p.amount ?? invoice.total, tip: 0 }
      })
    }
    // Legacy single-payment fallback
    const method = invoice.paymentMethod || '—'
    let details = ''
    if (method === 'cash') {
      const parts = []
      if (invoice.amountReceived != null) parts.push(`Received: ${fmt$(invoice.amountReceived)}`)
      if (invoice.changeDue      != null) parts.push(`Change: ${fmt$(invoice.changeDue)}`)
      details = parts.join('  ·  ') || 'Cash payment'
    } else if (method === 'card' && invoice.cardBrand) {
      const brand = invoice.cardBrand.charAt(0).toUpperCase() + invoice.cardBrand.slice(1)
      const last4 = invoice.cardLast4 ? ` ****${invoice.cardLast4}` : ''
      details = `${brand}${last4}`
    } else if (method === 'external') {
      details = invoice.externalRef || 'External payment'
    } else if (method === 'check') {
      details = invoice.checkNumber ? `Check #${invoice.checkNumber}` : 'Check payment'
    } else {
      details = `${method} transaction`
    }
    return [{ timestamp: invoice.timestamp, method, details, amount: invoice.total, tip: invoice.tip || 0 }]
  })()

  return (
    <div>
      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>PAYMENTS</p>
      <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Timestamp','Method','Details','Amount','Tip'].map(h => (
                <th key={h} style={{
                  padding: '7px 10px', textAlign: 'left', color: MUTED,
                  fontWeight: 600, fontSize: 10, background: CARD,
                  borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((p, i) => (
              <tr key={i}>
                <td style={{ padding: '8px 10px', fontSize: 11, color: DIM }}>{fmtDateTime(p.timestamp)}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: TEXT, fontWeight: 600 }}>{p.method}</td>
                <td style={{ padding: '8px 10px', fontSize: 11, color: MUTED }}>{p.details}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: GREEN, fontWeight: 700 }}>{fmt$(p.amount)}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: MUTED }}>{fmt$(p.tip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Invoice Commission Section ───────────────────────────────────────────────
function InvoiceCommissionSection({ invoice }) {
  const commission = [{
    timestamp: invoice.timestamp,
    employee:  invoice.employee,
    amount:    invoice.subtotal,
    tip:       invoice.tip || 0,
  }]

  return (
    <div>
      <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>SALES COMMISSION</p>
      <div style={{ borderRadius: 6, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Timestamp','Employee','Amount','Tip'].map(h => (
                <th key={h} style={{
                  padding: '7px 10px', textAlign: 'left', color: MUTED,
                  fontWeight: 600, fontSize: 10, background: CARD,
                  borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {commission.map((c, i) => (
              <tr key={i}>
                <td style={{ padding: '8px 10px', fontSize: 11, color: DIM }}>{fmtDateTime(c.timestamp)}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: TEXT, fontWeight: 600 }}>{c.employee}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: GREEN, fontWeight: 700 }}>{fmt$(c.amount)}</td>
                <td style={{ padding: '8px 10px', fontSize: 12, color: MUTED }}>{fmt$(c.tip)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Invoice Detail Modal ─────────────────────────────────────────────────────
function InvoiceDetailModal({ invoice: initialInvoice, onClose, updateSale, voidSale }) {
  const [invoice, setInvoice]       = useState(initialInvoice)
  const [confirmAction, setConfirm] = useState(null) // 'delete' | 'refund'
  const [changingDate, setChangingDate] = useState(false)
  const [newDate, setNewDate]           = useState(toLocalInputVal(initialInvoice.timestamp))
  const [emailMode, setEmailMode]       = useState(false)
  const [emailAddr, setEmailAddr]       = useState('')
  const [toast, setToast]               = useState('')

  const isRefunded = invoice.status === 'refunded'
  const isDeleted  = invoice.status === 'voided'

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const applyPatch = (patch) => {
    updateSale(invoice.number, patch)
    setInvoice(prev => ({ ...prev, ...patch }))
  }

  const handlePrint = () => {
    printReceipt(invoice)
  }

  const handleEmail = () => {
    if (!emailMode) { setEmailMode(true); return }
    if (!emailAddr.includes('@')) { showToast('Enter a valid email address'); return }
    setEmailMode(false)
    setEmailAddr('')
    showToast(`Invoice #${invoice.number} queued to ${emailAddr}`)
  }

  const handleDelete = () => {
    // Update local UI immediately
    setInvoice(prev => ({ ...prev, status: 'voided' }))
    // Local localStorage + Supabase void + inventory restore
    if (voidSale) voidSale(invoice)
    else updateSale(invoice.number, { status: 'voided' })
    setConfirm(null)
    showToast(`Invoice #${invoice.number} deleted`)
    setTimeout(onClose, 1200)
  }

  const handleRefund = () => {
    // Supabase only has 'voided' — unify both actions to voided.
    // UI shows 'refunded' label but backend stores 'voided'.
    setInvoice(prev => ({ ...prev, status: 'voided' }))
    if (voidSale) voidSale(invoice)
    else updateSale(invoice.number, { status: 'voided' })
    setConfirm(null)
    showToast(`Invoice #${invoice.number} marked as refunded`)
  }

  const handleChangeDate = () => {
    const ts = new Date(newDate).toISOString()
    applyPatch({ timestamp: ts })
    setChangingDate(false)
    showToast('Date updated')
  }

  const locCfg = LOCATIONS_CFG.find(l => l.name === invoice.location)
  const totalSpareVal = invoice.totalSpare ?? 0   // pode ser negativo

  const actionBtn = (label, icon, color, onClick, disabled) => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '8px 12px', background: 'transparent',
        border: `1px solid ${BORDER}`, borderRadius: 6,
        color: disabled ? 'var(--c-text-dim)' : (color || DIM), fontSize: 10, fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.2s ease',
        letterSpacing: 0.3,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.borderColor = color || BLUE; e.currentTarget.style.background = `${color || BLUE}12` } }}
      onMouseLeave={e => { if (!disabled) { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = 'transparent' } }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      {label}
    </button>
  )

  const summaryItem = (label, value, color, size = 15) => (
    <div>
      <p style={{ color: MUTED, fontSize: 10, marginBottom: 2 }}>{label}</p>
      <p style={{ color: color || TEXT, fontSize: size, fontWeight: size >= 18 ? 800 : 700 }}>{value}</p>
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(3px)', padding: 20,
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 10,
        width: '100%', maxWidth: 920, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.8)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 20px', background: CARD, borderRadius: '10px 10px 0 0',
          borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, background: 'rgba(37,99,235,0.15)',
            border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🧾</div>
          <div>
            <p style={{ color: TEXT, fontWeight: 800, fontSize: 16 }}>Invoice #{invoice.number}</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>@ {invoice.location}</p>
          </div>
          {isRefunded && (
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: AMBER,
            }}>REFUNDED</span>
          )}
          {isDeleted && (
            <span style={{
              padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700,
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: RED,
            }}>DELETED</span>
          )}
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: `1px solid ${BORDER}`,
            borderRadius: 6, color: MUTED, fontSize: 20, cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Actions bar */}
          <div style={{
            display: 'flex', gap: 8, padding: '12px 14px',
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, flexWrap: 'wrap',
          }}>
            {actionBtn('Print',       '🖨️', BLUE,   handlePrint,       false)}
            {actionBtn('Email',       '📧', BLUE,   () => setEmailMode(m => !m), false)}
            {actionBtn('Location',    '📍', DIM,    () => showToast(`${invoice.location}${locCfg?.address ? ` — ${locCfg.address}` : ''}`), false)}
            {actionBtn('Change Date', '📅', AMBER,  () => { setChangingDate(m => !m); setConfirm(null) }, isDeleted)}
            {actionBtn('Refund',      '↩️', AMBER,  () => { setConfirm('refund'); setChangingDate(false) }, isRefunded || isDeleted)}
            {actionBtn('Delete',      '🗑️', RED,    () => { setConfirm('delete'); setChangingDate(false) }, isDeleted)}
          </div>

          {/* Email input */}
          {emailMode && (
            <div style={{
              background: 'rgba(37,99,235,0.07)', border: `1px solid rgba(37,99,235,0.2)`,
              borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center',
            }}>
              <span style={{ color: DIM, fontSize: 12 }}>Send invoice to:</span>
              <input
                value={emailAddr} onChange={e => setEmailAddr(e.target.value)}
                placeholder="customer@email.com" type="email"
                style={{
                  flex: 1, padding: '7px 10px', background: BG, border: `1px solid ${BORDER}`,
                  borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none',
                }}
                onFocus={e => { e.target.style.borderColor = BLUE }}
                onBlur={e => { e.target.style.borderColor = BORDER }}
              />
              <button onClick={handleEmail} style={{
                padding: '7px 16px', background: BLUE, border: 'none', borderRadius: 4,
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Send</button>
              <button onClick={() => setEmailMode(false)} style={{
                padding: '7px 12px', background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          )}

          {/* Change date form */}
          {changingDate && (
            <div style={{
              background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)',
              borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'center',
            }}>
              <span style={{ color: AMBER, fontSize: 12, fontWeight: 600 }}>📅 New date/time:</span>
              <input
                type="datetime-local" value={newDate} onChange={e => setNewDate(e.target.value)}
                style={{
                  padding: '7px 10px', background: BG, border: `1px solid ${BORDER}`,
                  borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none',
                }}
              />
              <button onClick={handleChangeDate} style={{
                padding: '7px 16px', background: AMBER, border: 'none', borderRadius: 4,
                color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>Confirm</button>
              <button onClick={() => setChangingDate(false)} style={{
                padding: '7px 12px', background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          )}

          {/* Confirm delete / refund */}
          {confirmAction && (
            <div style={{
              background: confirmAction === 'delete' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
              border: `1px solid ${confirmAction === 'delete' ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}`,
              borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 12, alignItems: 'center',
            }}>
              <span style={{ color: confirmAction === 'delete' ? '#fca5a5' : AMBER, fontSize: 12, flex: 1 }}>
                {confirmAction === 'delete'
                  ? '⚠️ This will permanently mark the invoice as deleted. Continue?'
                  : '↩️ This will mark the invoice as refunded. Continue?'}
              </span>
              <button
                onClick={confirmAction === 'delete' ? handleDelete : handleRefund}
                style={{
                  padding: '7px 18px',
                  background: confirmAction === 'delete' ? RED : AMBER,
                  border: 'none', borderRadius: 4,
                  color: confirmAction === 'delete' ? '#fff' : '#000',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {confirmAction === 'delete' ? 'Yes, Delete' : 'Yes, Refund'}
              </button>
              <button onClick={() => setConfirm(null)} style={{
                padding: '7px 12px', background: 'transparent', border: `1px solid ${BORDER}`,
                borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          )}

          {/* Summary */}
          <div style={{
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 18px',
          }}>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>SUMMARY</p>
            <p style={{ color: DIM, fontSize: 11, marginBottom: 12 }}>
              {fmtDateTime(invoice.timestamp)} · {invoice.employee}
            </p>
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
              {summaryItem('Subtotal', fmt$(invoice.subtotal), TEXT, 20)}
              {summaryItem('Tax',      fmt$(invoice.tax),      DIM,      12)}
              {summaryItem('Total',    fmt$(invoice.total),    MUTED,    13)}
              {summaryItem(
                'Spare',
                totalSpareVal >= 0 ? fmt$(totalSpareVal) : `-${fmt$(Math.abs(totalSpareVal))}`,
                totalSpareVal > 0 ? AMBER : totalSpareVal < 0 ? RED : MUTED,
              )}
              {summaryItem('Tip',     fmt$(invoice.tip || 0), MUTED)}
              {summaryItem('Payment',
                Array.isArray(invoice.payments) && invoice.payments.length > 1
                  ? `Split (${invoice.payments.map(p => p.method).join(' + ')})`
                  : invoice.paymentMethod || '—',
                DIM,
              )}
            </div>
          </div>

          {/* Products */}
          <div>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>PRODUCTS</p>
            <InvoiceProductsTable
              items={invoice.items || []}
              invoiceTax={invoice.tax}
              invoiceSubtotal={invoice.subtotal}
            />
          </div>

          {/* Payments + Commission side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <InvoicePaymentsSection  invoice={invoice} />
            <InvoiceCommissionSection invoice={invoice} />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
          padding: '10px 20px', color: TEXT, fontSize: 13, fontWeight: 500,
          zIndex: 1200, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'none',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Invoice Table ─────────────────────────────────────────────────────────────
function InvoiceTable({ invoices, onOpenInvoice }) {
  const thStyle = {
    padding: '8px 12px', textAlign: 'left', color: MUTED, fontWeight: 600,
    fontSize: 10, background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`,
    whiteSpace: 'nowrap', letterSpacing: 0.4,
  }

  const totalSales = invoices.reduce((s, i) => s + (i.status !== 'voided' ? i.total : 0), 0)
  const avgDaily   = (() => {
    const days = [...new Set(invoices.filter(i => i.status !== 'voided').map(i => fmtDateOnly(i.timestamp)))]
    return days.length > 0 ? totalSales / days.length : 0
  })()

  return (
    <div>
      {/* Mini stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        {[
          { label: 'Total Sales',       value: fmt$(totalSales),         color: GREEN },
          { label: 'Average Daily',     value: fmt$(avgDaily),           color: BLUE  },
          { label: 'Transactions',      value: invoices.filter(i => i.status !== 'voided').length, color: DIM, isCount: true },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6,
            padding: '10px 14px',
          }}>
            <p style={{ color: MUTED, fontSize: 10, marginBottom: 4 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 20, fontWeight: 800 }}>
              {s.isCount ? s.value : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Invoice #','Date / Time','Location','Subtotal','Tax','Total','Tip','Status',''].map(h => (
                <th key={h} style={{ ...thStyle, textAlign: ['Subtotal','Tax','Total','Tip'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr>
                <td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 13 }}>
                  No invoices in this period
                </td>
              </tr>
            )}
            {[...invoices].reverse().map((inv, i) => {
              const isRef = inv.status === 'refunded'
              const isDel = inv.status === 'voided'
              return (
                <tr key={inv.number}
                  style={{
                    borderBottom: `1px solid var(--c-border-row)`,
                    background: isDel ? 'rgba(239,68,68,0.04)' : isRef ? 'rgba(245,158,11,0.04)' : i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!isDel) e.currentTarget.style.background = 'rgba(37,99,235,0.05)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isDel ? 'rgba(239,68,68,0.04)' : isRef ? 'rgba(245,158,11,0.04)' : i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)' }}
                >
                  <td style={{ padding: '8px 12px', color: BLUE, fontWeight: 700, fontSize: 13 }}>{inv.number}</td>
                  <td style={{ padding: '8px 12px', color: DIM, fontSize: 12 }}>{fmtDateTime(inv.timestamp)}</td>
                  <td style={{ padding: '8px 12px', color: DIM, fontSize: 12 }}>{inv.location}</td>
                  <td style={{ padding: '8px 12px', color: TEXT, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{fmt$(inv.subtotal)}</td>
                  <td style={{ padding: '8px 12px', color: DIM,     fontWeight: 400, fontSize: 11, textAlign: 'right' }}>{fmt$(inv.tax)}</td>
                  <td style={{ padding: '8px 12px', color: MUTED,   fontWeight: 400, fontSize: 12, textAlign: 'right' }}>{fmt$(inv.total)}</td>
                  <td style={{ padding: '8px 12px', color: MUTED, fontSize: 12, textAlign: 'right' }}>{fmt$(inv.tip)}</td>
                  <td style={{ padding: '8px 12px' }}>
                    {isRef && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: AMBER, fontWeight: 700 }}>REFUNDED</span>}
                    {isDel && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: RED, fontWeight: 700 }}>DELETED</span>}
                    {!isRef && !isDel && <span style={{ fontSize: 10, color: GREEN }}>● Normal</span>}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <button
                      onClick={() => onOpenInvoice(inv)}
                      style={{
                        padding: '5px 12px', background: 'transparent',
                        border: `1px solid ${BLUE}`, borderRadius: 4,
                        color: BLUE, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                        opacity: isDel ? 0.4 : 1,
                      }}
                      onMouseEnter={e => { if (!isDel) { e.currentTarget.style.background = 'rgba(37,99,235,0.12)' } }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >Open Invoice</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
const TABS = ['Summary', 'Invoices', 'Product Commission', 'Products Sold', 'Hours', 'Spare', 'Deductions', 'Reimbursements', 'My Clients']

export default function UserReport({ onClose, sales = [], updateSale, voidSale, mode = 'self' }) {
  const employees = loadActiveEmployees()

  const [unlockedEmployee, setUnlockedEmployee] = useState(
    () => mode === 'admin' ? (employees[0] ?? null) : null
  )
  const [selectedName, setSelectedName] = useState(
    () => mode === 'admin' ? (employees[0]?.name ?? '') : ''
  )
  const [activeTab,        setActiveTab]         = useState('Invoices')
  const [openedInvoice,    setOpenedInvoice]     = useState(null)
  // Manual bonus editing (Summary tab)
  const [editingBonusDay,  setEditingBonusDay]   = useState(null)  // dateKey being edited
  const [bonusEditVal,     setBonusEditVal]       = useState('')
  const [bonusEditNote,    setBonusEditNote]      = useState('')
  const [bonusEditErr,     setBonusEditErr]       = useState('')
  const [bonusVersion,     setBonusVersion]       = useState(0)     // triggers dailySales recalc
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1)
    return localDateStr(d)          // primeiro dia do mês em horário local
  })
  const [toDate, setToDate] = useState(() => localDateStr()) // hoje em horário local

  // Hooks must always be called — never after a conditional return
  const employeeSales = useMemo(() => {
    if (!unlockedEmployee) return []
    const from = parseLocalDate(fromDate)                          // meia-noite local do dia inicial
    const to   = parseLocalDate(toDate); to.setHours(23, 59, 59, 999) // 23:59:59 local do dia final
    const name = selectedName || unlockedEmployee.name
    return sales.filter(s => {
      const d = new Date(s.timestamp)
      return s.employee === name && d >= from && d <= to
    })
  }, [sales, selectedName, unlockedEmployee, fromDate, toDate])

  // ── Clock records — Supabase (deve ficar ANTES de dailySales que o consome) ─
  const [clockRecords, setClockRecords] = useState([])

  useEffect(() => {
    const empName = selectedName || unlockedEmployee?.name
    if (!empName) { setClockRecords([]); return }
    const from = parseLocalDate(fromDate)
    const to   = parseLocalDate(toDate); to.setHours(23, 59, 59, 999)
    fetchClockRecordsByEmployee({ employeeName: empName, from, to })
      .then(records => { if (records !== null) setClockRecords(records) })
  }, [selectedName, unlockedEmployee, fromDate, toDate]) // eslint-disable-line react-hooks/exhaustive-deps

  const dailySales = useMemo(() => {
    const empName = selectedName || unlockedEmployee?.name

    // ── Employee hourly rate ──────────────────────────────────────────────────
    let hourlyRate = 0
    try {
      const allUsers = loadUsers()
      const match    = allUsers.find(u => {
        const full = `${u.firstName} ${u.lastName}`.replace(/\s+/g, ' ').trim()
        return full === empName
      })
      hourlyRate = match?.hourlyRate ?? 0
    } catch {}

    // ── Commission per invoice ────────────────────────────────────────────────
    const valid = employeeSales.filter(s => s.status !== 'voided')
    const commMap = {}
    try {
      const { byInvoice } = calcPeriodCommissionFresh(valid)
      byInvoice.forEach(inv => { commMap[inv.number] = inv.commission || 0 })
    } catch {}

    // ── Clock hours grouped by local date ISO key ─────────────────────────────
    const hoursMap = {}
    clockRecords.filter(r => r.clockOut).forEach(r => {
      const key = localDateStr(new Date(r.clockIn))
      hoursMap[key] = (hoursMap[key] || 0) + (new Date(r.clockOut) - new Date(r.clockIn))
    })

    // ── Location per day (first sale's location for that day) ─────────────────
    const locationMap = {}
    employeeSales.forEach(s => {
      if (s.status !== 'voided' && s.location) {
        const key = localDateStr(new Date(s.timestamp))
        if (!locationMap[key]) locationMap[key] = s.location
      }
    })

    // ── Aggregate per day ─────────────────────────────────────────────────────
    const map = {}

    const ensureDay = (key, ts) => {
      if (!map[key]) map[key] = {
        dateKey:       key,
        displayDate:   new Date(ts).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' }),
        location:      locationMap[key] || '',
        salesTotal:    0, salesCount: 0, salesComm: 0,
        refundsTotal:  0, refundsCount: 0,
        spare:         0, tips: 0,
        hoursMs:       hoursMap[key] || 0,
        deductions:    0, reimbursements: 0,
      }
      return map[key]
    }

    employeeSales.forEach(s => {
      if (s.status === 'voided') return
      const key = localDateStr(new Date(s.timestamp))
      const d   = ensureDay(key, s.timestamp)
      if (s.status === 'refunded') {
        d.refundsTotal  += s.subtotal || 0
        d.refundsCount  += 1
      } else {
        d.salesTotal    += s.subtotal || 0
        d.salesCount    += 1
        d.salesComm     += commMap[s.number] || 0
        d.spare         += s.totalSpare || 0
        d.tips          += s.tip || 0
      }
    })

    // Include days that have clock records but no sales within the period
    Object.keys(hoursMap).forEach(key => {
      if (!map[key]) {
        const ts = new Date(key + 'T12:00:00').toISOString()
        ensureDay(key, ts)
      }
    })

    // ── Bonus + finalDailyPay per day ─────────────────────────────────────────
    const days = Object.values(map).sort((a, b) => a.dateKey.localeCompare(b.dateKey))
    days.forEach(d => {
      const bonus = getDayBonusResult(d.salesTotal, d.dateKey, d.location, empName)
      const pay   = calcFinalDailyPay(d.hoursMs, hourlyRate, d.salesComm, bonus.finalBonus)
      d.autoBonus    = bonus.autoBonus
      d.manualBonus  = bonus.manualBonus
      d.manualNote   = bonus.manualNote
      d.finalBonus   = bonus.finalBonus
      d.hourlyPay    = pay.hourlyPay
      d.basePay      = pay.basePay

      // ── Competition placement bonus ───────────────────────────────────────
      // Requires all sales at this location on this day (not just this employee)
      const allSalesForDay = sales.filter(s =>
        s.status !== 'voided' &&
        s.location === d.location &&
        localDateStr(new Date(s.timestamp)) === d.dateKey
      )
      const locCfg         = loadLocationConfig(d.location)
      const hybridMult     = Number(locCfg?.competitionHybridMultiplier ?? 1.0)
      const compBonus      = calcDayCompetitionBonus(empName, d.dateKey, d.location, allSalesForDay, hybridMult)
      d.compBonusSales     = compBonus.salesBonus
      d.compBonusSpare     = compBonus.spareBonus
      d.compBonusHybrid    = compBonus.hybridBonus
      d.totalCompBonus     = compBonus.totalCompBonus
      d.compSalesRank      = compBonus.salesRank
      d.compSpareRank      = compBonus.spareRank
      d.compHybridRank     = compBonus.hybridRank

      d.finalDailyPay = Math.round((pay.finalDailyPay + compBonus.totalCompBonus) * 100) / 100
    })

    return days
  }, [employeeSales, clockRecords, selectedName, unlockedEmployee, bonusVersion, sales])  // eslint-disable-line react-hooks/exhaustive-deps

  const validSales    = employeeSales.filter(s => s.status !== 'voided')

  // Derived period totals — pulled from the rich dailySales structure
  const totalSales    = dailySales.reduce((s, d) => s + d.salesTotal, 0)
  const totalSpare    = dailySales.reduce((s, d) => s + d.spare, 0)
  const totalComm     = dailySales.reduce((s, d) => s + d.salesComm, 0)
  const totalTips     = dailySales.reduce((s, d) => s + d.tips, 0)
  const totalHoursMs2 = dailySales.reduce((s, d) => s + d.hoursMs, 0)
  const txCount       = dailySales.reduce((s, d) => s + d.salesCount, 0)
  const avgDaily      = dailySales.length > 0 ? totalSales / dailySales.length : 0
  const maxSale       = Math.max(...dailySales.map(d => d.salesTotal), 1)

  // ── Products Sold ──────────────────────────────────────────────────────────
  const productsSold = useMemo(() => {
    const map = {}
    validSales.flatMap(s => s.items || []).forEach(item => {
      const name = item.product?.name || item.name || '(no name)'
      const size = item.product?.size || item.size || ''
      const key  = name + '||' + size
      if (!map[key]) map[key] = { name, size, qty: 0, revenue: 0, invoices: 0 }
      map[key].qty     += Math.max(0, item.qty || 1)
      map[key].revenue += item.subtotal || 0
      map[key].invoices += 1
    })
    return Object.values(map).sort((a, b) => b.qty - a.qty)
  }, [validSales])


  // ── Day tier map: { [YYYY-MM-DD]: { subtotal, rate, label } } ────────────────
  // Calculated once and shared between dailySales (commission) and productCommissionLines.
  const dayTierMap = useMemo(() => {
    try {
      const { dayTierMap: map } = calcPeriodCommissionFresh(validSales)
      return map
    } catch { return {} }
  }, [validSales])  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Product Commission lines — one row per item sold ──────────────────────────
  const productCommissionLines = useMemo(() => {
    const categoryMap = buildCategoryMap()
    const lines = []
    for (const sale of validSales) {
      const dayKey   = localDateStr(new Date(sale.timestamp))
      const tierRate = dayTierMap[dayKey]?.rate ?? 0
      const tierLabel = dayTierMap[dayKey]?.label ?? 'Below $600'
      const { breakdown } = calcInvoiceCommission(sale, categoryMap, tierRate)
      ;(sale.items || []).forEach((raw, idx) => {
        const bd = breakdown[idx] || {}
        lines.push({
          invoiceNumber:     sale.number,
          timestamp:         sale.timestamp,
          commission:        bd.commission ?? 0,
          productCommission: bd.productCommission ?? null,
          spareCommission:   bd.spareCommission   ?? null,
          commType:          bd.commissionType ?? 'none',
          tierRate,
          tierLabel,
          barcode:           raw.product?.barcode      || raw.barcode      || '—',
          name:              raw.product?.name         || raw.name         || '—',
          description:       raw.product?.description  || raw.description  || '—',
          size:              raw.product?.size         || raw.size         || '—',
          qty:               raw.qty || 1,
          subtotal:          raw.subtotal || 0,
          spare:             raw.spare ?? 0,
          minPrice:          raw.product?.minPrice     ?? raw.minPrice     ?? null,
          _sale:             sale,
        })
      })
    }
    return lines
  }, [validSales, dayTierMap])  // eslint-disable-line react-hooks/exhaustive-deps

  const totalHoursMs = clockRecords
    .filter(r => r.clockOut)
    .reduce((s, r) => s + (new Date(r.clockOut) - new Date(r.clockIn)), 0)

  const fmtHours = (ms) => {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return `${h}h ${m}m`
  }

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

  // ── Spare per invoice ──────────────────────────────────────────────────────
  const spareInvoices = useMemo(() =>
    validSales
      .filter(s => (s.totalSpare || 0) > 0)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [validSales]
  )

  // ── My Clients — clientes vinculados a este vendedor ────────────────────────
  const myClients = useMemo(() => {
    const empName = selectedName || unlockedEmployee?.name
    if (!empName) return []

    const from = parseLocalDate(fromDate)
    const to   = parseLocalDate(toDate); to.setHours(23, 59, 59, 999)

    const allCustomers = loadCRM().filter(c => !c.archived)

    const result = []
    const seen   = new Set()

    for (const cust of allCustomers) {
      if (seen.has(cust.id)) continue

      const purchases = cust.purchases || []

      // Purchases by this seller (all time)
      const sellerPurchases = purchases.filter(p => p.seller === empName)

      // Effective capturedBy:
      // 1. cust.capturedBy (explicit field — new clients)
      // 2. first purchase's seller (backward compat with existing data)
      const effectiveCapturedBy = cust.capturedBy || purchases[0]?.seller || null

      // Include if: capturedBy this seller OR has any purchase with this seller
      const linkedByCapturedBy = effectiveCapturedBy === empName
      const linkedByPurchase   = sellerPurchases.length > 0

      if (!linkedByCapturedBy && !linkedByPurchase) continue
      seen.add(cust.id)

      const noPurchase = sellerPurchases.length === 0  // captado mas nunca comprou

      // Sort seller purchases by date
      const sorted = [...sellerPurchases].sort((a, b) => new Date(a.date) - new Date(b.date))

      const firstDate = sorted[0]?.date ?? null
      const lastDate  = sorted[sorted.length - 1]?.date ?? null
      const lastLoc   = sorted[sorted.length - 1]?.location || '—'

      // Period activity
      const periodPurchases = sellerPurchases.filter(p => {
        const d = new Date(p.date)
        return d >= from && d <= to
      })

      const totalSpentAllTime = sellerPurchases.reduce((s, p) => s + (p.total || 0), 0)
      const totalSpentPeriod  = periodPurchases.reduce((s, p) => s + (p.total || 0), 0)

      // "Captured in period":
      // - with purchase: first purchase by this seller in period
      // - without purchase: capturedAt (or createdAt) in period
      const captureDate = noPurchase
        ? (cust.capturedAt || cust.createdAt)
        : firstDate
      const capturedInPeriod = captureDate
        ? new Date(captureDate) >= from && new Date(captureDate) <= to
        : false

      result.push({
        id:               cust.id,
        name:             [cust.firstName, cust.lastName].filter(Boolean).join(' ') || '(no name)',
        phone:            cust.phone || '—',
        email:            cust.email || '',
        capturedAt:       cust.capturedAt || cust.createdAt,
        firstPurchase:    firstDate,
        lastPurchase:     lastDate,
        location:         noPurchase ? (cust.capturedLocation || '—') : lastLoc,
        noPurchase,
        totalSpent:       totalSpentAllTime,
        purchaseCount:    sellerPurchases.length,
        periodPurchases:  periodPurchases.length,
        periodSpent:      totalSpentPeriod,
        capturedInPeriod,
        // Base para ranking e bônus futuros
        _crmScore: noPurchase
          ? 5   // captura sem venda vale menos
          : sellerPurchases.length * 10 + Math.round(totalSpentAllTime / 10),
      })
    }

    // Sort: sem compra vai ao final; dentro de cada grupo, mais recente primeiro
    return result.sort((a, b) => {
      if (a.noPurchase !== b.noPurchase) return a.noPurchase ? 1 : -1
      return new Date(b.lastPurchase || b.capturedAt || 0) -
             new Date(a.lastPurchase || a.capturedAt || 0)
    })
  }, [selectedName, unlockedEmployee, fromDate, toDate])

  // Conditional return AFTER all hooks — safe
  if (!unlockedEmployee) {
    return (
      <ReportPinGate
        onUnlock={(emp) => { setUnlockedEmployee(emp); setSelectedName(emp.name) }}
        onClose={onClose}
      />
    )
  }

  const tabStyle = (tab) => {
    const active = activeTab === tab
    return {
      padding: '7px 14px',
      border: `1px solid ${active ? 'transparent' : BORDER}`,
      borderRadius: 8,
      background: active
        ? 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)'
        : 'transparent',
      color: active ? '#fff' : DIM,
      fontSize: 12,
      fontWeight: active ? 700 : 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      letterSpacing: 0.2,
      boxShadow: active ? '0 0 16px rgba(37,99,235,0.40)' : 'none',
      transition: 'all 0.2s ease',
      flexShrink: 0,
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)', padding: 20,
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 16,
        width: '100%', maxWidth: 1060, maxHeight: '94vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.75), 0 0 0 1px rgba(37,99,235,0.05) inset',
      }}>

        {/* Header */}
        <div style={{
          padding: '12px 20px', background: CARD, borderRadius: '10px 10px 0 0',
          borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <div style={{
            width: 32, height: 32, background: `rgba(139,92,246,0.15)`,
            border: '1px solid rgba(139,92,246,0.3)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>📊</div>
          <span style={{ color: TEXT, fontWeight: 800, fontSize: 15 }}>User Report</span>

          {/* User selector */}
          <select
            value={selectedName}
            onChange={e => setSelectedName(e.target.value)}
            style={{
              padding: '6px 10px', background: BG, border: `1px solid ${BORDER}`,
              borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>

          <span style={{ color: MUTED, fontSize: 11 }}>From</span>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '5px 8px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12 }} />
          <span style={{ color: MUTED, fontSize: 11 }}>To</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ padding: '5px 8px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12 }} />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '6px 14px', background: 'transparent', border: `1px solid ${BORDER}`,
              borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
            >✕ Close</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {[
              { label: 'Total Sales',     value: fmt$(totalSales),  color: GREEN  },
              { label: 'Commission',      value: fmt$(totalComm),   color: BLUE   },
              { label: 'Total Spare',     value: fmt$(totalSpare),  color: AMBER  },
              { label: 'Tips',            value: fmt$(totalTips),   color: PURPLE },
              { label: 'Hours Worked',    value: fmtHours(totalHoursMs2), color: DIM },
              { label: 'Transactions',    value: String(txCount),   color: MUTED  },
            ].map(c => (
              <div key={c.label} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '12px 14px', borderLeft: `3px solid ${c.color}`,
              }}>
                <p style={{ color: MUTED, fontSize: 10, marginBottom: 5, letterSpacing: 0.3 }}>{c.label}</p>
                <p style={{ color: c.color, fontSize: 18, fontWeight: 800 }}>{c.value}</p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          {dailySales.length > 0 && (
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>DAILY SALES</p>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
                {dailySales.map(d => (
                  <div key={d.dateKey} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: GREEN, fontSize: 9, fontWeight: 700 }}>{fmt$(d.salesTotal)}</span>
                    <div style={{
                      width: '100%', borderRadius: '2px 2px 0 0',
                      background: `linear-gradient(to top, ${GREEN}, rgba(34,197,94,0.5))`,
                      height: `${(d.salesTotal / maxSale) * 76}px`, minHeight: 3,
                      transition: 'height 0.3s ease',
                    }} />
                    <span style={{ color: MUTED, fontSize: 8, whiteSpace: 'nowrap' }}>{d.displayDate}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabs */}
          <div>
            <div style={{
              display: 'flex', gap: 6, padding: '10px 16px',
              borderBottom: `1px solid ${BORDER}`,
              background: 'var(--c-bg-card)',
              overflowX: 'auto', flexWrap: 'nowrap',
            }}>
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={tabStyle(tab)}
                  onMouseEnter={e => { if (activeTab !== tab) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.color = TEXT } }}
                  onMouseLeave={e => { if (activeTab !== tab) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = DIM } }}
                >{tab}</button>
              ))}
            </div>

            <div style={{ paddingTop: 16 }}>
              {/* ── SUMMARY TAB ── */}
              {activeTab === 'Summary' && (() => {
                const empName = selectedName || unlockedEmployee?.name

                const openBonusEdit = (d) => {
                  setEditingBonusDay(d.dateKey)
                  setBonusEditVal(d.manualBonus !== 0 ? String(d.manualBonus) : '')
                  setBonusEditNote(d.manualNote || '')
                  setBonusEditErr('')
                }

                const saveBonusEdit = (dateKey) => {
                  const val = bonusEditVal === '' ? 0 : parseFloat(bonusEditVal)
                  if (isNaN(val)) { setBonusEditErr('Enter a valid number (can be negative)'); return }
                  setManualBonus(empName, dateKey, val, bonusEditNote)
                  setEditingBonusDay(null)
                  setBonusVersion(v => v + 1)
                }

                // Show comp-bonus columns only when at least one day has a rank
                const hasCompBonus = dailySales.some(d => d.totalCompBonus > 0 || d.compSalesRank || d.compSpareRank || d.compHybridRank)

                // Rank label helper: "🥇 1st" / "🥈 2nd" / "🥉 3rd" / "—"
                const rankLabel = (rank) =>
                  rank === 1 ? '🥇 1st' :
                  rank === 2 ? '🥈 2nd' :
                  rank === 3 ? '🥉 3rd' :
                  rank ? `#${rank}` : '—'

                const cols = [
                  { key: 'displayDate',    label: 'Date',           color: DIM,    fmt: v => v },
                  { key: 'salesTotal',     label: 'Sales Total',    color: GREEN,  fmt: fmt$ },
                  { key: 'salesCount',     label: 'Txns',           color: DIM,    fmt: v => v },
                  { key: 'salesComm',      label: 'Commission',     color: BLUE,   fmt: fmt$ },
                  { key: 'refundsTotal',   label: 'Refunds',        color: RED,    fmt: v => v > 0 ? fmt$(v) : '—' },
                  { key: 'spare',          label: 'Spare',          color: AMBER,  fmt: fmt$ },
                  { key: 'tips',           label: 'Tips',           color: PURPLE, fmt: v => v > 0 ? fmt$(v) : '—' },
                  { key: 'hoursMs',        label: 'Hours',          color: DIM,    fmt: fmtHours },
                  { key: '_avgHr',         label: 'Avg $/hr',       color: MUTED,  fmt: v => v > 0 ? fmt$(v) : '—' },
                  { key: 'deductions',     label: 'Deductions',     color: RED,    fmt: v => v > 0 ? fmt$(v) : '—' },
                  { key: 'reimbursements', label: 'Reimb.',         color: GREEN,  fmt: v => v > 0 ? fmt$(v) : '—' },
                  { key: 'autoBonus',      label: 'Auto Bonus',     color: AMBER,  fmt: v => v > 0 ? fmt$(v) : '—' },
                  { key: 'manualBonus',    label: 'Manual Adj.',    color: AMBER,  fmt: v => v !== 0 ? fmt$(v) : '—' },
                  { key: 'finalBonus',     label: 'Final Bonus',    color: AMBER,  fmt: v => v !== 0 ? fmt$(v) : '—' },
                  // Competition placement columns (visible when any comp bonus earned)
                  ...(hasCompBonus ? [
                    { key: 'compSalesRank',  label: '📊 Rank',  color: '#60a5fa', fmt: rankLabel },
                    { key: 'compSpareRank',  label: '💰 Rank',  color: '#f59e0b', fmt: rankLabel },
                    { key: 'compHybridRank', label: '⚡ Rank',  color: '#a78bfa', fmt: rankLabel },
                    { key: 'totalCompBonus', label: 'Comp Bonus', color: GREEN, fmt: v => v > 0 ? fmt$(v) : '—' },
                  ] : []),
                  { key: 'finalDailyPay',  label: 'Final Daily Pay',color: GREEN,  fmt: fmt$ },
                ]

                const rows = dailySales.map(d => ({
                  ...d,
                  _avgHr:   d.hoursMs > 0 ? d.salesTotal / (d.hoursMs / 3600000) : 0,
                }))

                const totals = {
                  displayDate:    'TOTAL',
                  salesTotal:     rows.reduce((s, d) => s + d.salesTotal, 0),
                  salesCount:     rows.reduce((s, d) => s + d.salesCount, 0),
                  salesComm:      rows.reduce((s, d) => s + d.salesComm, 0),
                  refundsTotal:   rows.reduce((s, d) => s + d.refundsTotal, 0),
                  spare:          rows.reduce((s, d) => s + d.spare, 0),
                  tips:           rows.reduce((s, d) => s + d.tips, 0),
                  hoursMs:        rows.reduce((s, d) => s + d.hoursMs, 0),
                  deductions:     rows.reduce((s, d) => s + d.deductions, 0),
                  reimbursements: rows.reduce((s, d) => s + d.reimbursements, 0),
                  autoBonus:      rows.reduce((s, d) => s + d.autoBonus, 0),
                  manualBonus:    rows.reduce((s, d) => s + d.manualBonus, 0),
                  finalBonus:     rows.reduce((s, d) => s + d.finalBonus, 0),
                  compSalesRank:  null,
                  compSpareRank:  null,
                  compHybridRank: null,
                  totalCompBonus: rows.reduce((s, d) => s + (d.totalCompBonus || 0), 0),
                  finalDailyPay:  rows.reduce((s, d) => s + d.finalDailyPay, 0),
                  _avgHr: (() => {
                    const ms    = rows.reduce((s, d) => s + d.hoursMs, 0)
                    const sales = rows.reduce((s, d) => s + d.salesTotal, 0)
                    return ms > 0 ? sales / (ms / 3600000) : 0
                  })(),
                }

                const thStyle = {
                  padding: '7px 10px', textAlign: 'right', color: MUTED, fontWeight: 600,
                  fontSize: 10, background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`,
                  letterSpacing: 0.4, whiteSpace: 'nowrap',
                }
                const tdStyle = (color) => ({
                  padding: '7px 10px', textAlign: 'right', color, fontSize: 12, whiteSpace: 'nowrap',
                })

                return (
                  <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: hasCompBonus ? 1400 : 1100 }}>
                      <thead>
                        <tr>
                          {cols.map((c, i) => (
                            <th key={c.key} style={{ ...thStyle, textAlign: i === 0 ? 'left' : 'right' }}>
                              {c.label}
                            </th>
                          ))}
                          {mode === 'admin' && <th style={{ ...thStyle, textAlign: 'center' }}>Bonus Adj.</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.length === 0 && (
                          <tr>
                            <td colSpan={cols.length + (mode === 'admin' ? 1 : 0)} style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 13 }}>
                              No sales in selected period
                            </td>
                          </tr>
                        )}
                        {rows.map((d, i) => (
                          <>
                            <tr key={d.dateKey} style={{
                              borderBottom: editingBonusDay === d.dateKey ? 'none' : `1px solid var(--c-border-row)`,
                              background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                            }}>
                              {cols.map((c, ci) => (
                                <td key={c.key} style={{ ...tdStyle(c.color), textAlign: ci === 0 ? 'left' : 'right' }}>
                                  {c.fmt(d[c.key])}
                                </td>
                              ))}
                              {mode === 'admin' && (
                                <td style={{ padding: '7px 10px', textAlign: 'center' }}>
                                  <button
                                    onClick={() => editingBonusDay === d.dateKey ? setEditingBonusDay(null) : openBonusEdit(d)}
                                    title={d.location ? `Location: ${d.location}` : 'Set manual bonus adjustment'}
                                    style={{
                                      padding: '2px 8px', fontSize: 10, fontWeight: 700,
                                      background: d.manualBonus !== 0 ? 'rgba(245,158,11,0.12)' : 'transparent',
                                      border: `1px solid ${d.manualBonus !== 0 ? 'rgba(245,158,11,0.4)' : BORDER}`,
                                      borderRadius: 4, color: d.manualBonus !== 0 ? AMBER : MUTED,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {editingBonusDay === d.dateKey ? 'Cancel' : (d.manualBonus !== 0 ? 'Edit' : '+ Adj')}
                                  </button>
                                </td>
                              )}
                            </tr>
                            {mode === 'admin' && editingBonusDay === d.dateKey && (
                              <tr key={`${d.dateKey}-edit`} style={{ borderBottom: `1px solid var(--c-border-row)`, background: 'rgba(245,158,11,0.03)' }}>
                                <td colSpan={cols.length + 1} style={{ padding: '10px 14px' }}>
                                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                                    <div>
                                      <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 4 }}>MANUAL ADJUSTMENT ($)</label>
                                      <input
                                        type="number"
                                        step="0.01"
                                        value={bonusEditVal}
                                        onChange={e => { setBonusEditVal(e.target.value); setBonusEditErr('') }}
                                        placeholder="0.00 (can be negative)"
                                        autoFocus
                                        style={{ padding: '6px 10px', background: BG, border: `1px solid ${bonusEditErr ? RED : BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: 180 }}
                                      />
                                      {bonusEditErr && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{bonusEditErr}</p>}
                                    </div>
                                    <div style={{ flex: 1, minWidth: 200 }}>
                                      <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 4 }}>NOTE (optional)</label>
                                      <input
                                        value={bonusEditNote}
                                        onChange={e => setBonusEditNote(e.target.value)}
                                        placeholder="Reason for adjustment..."
                                        style={{ padding: '6px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                      />
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, paddingTop: 20 }}>
                                      <button
                                        onClick={() => saveBonusEdit(d.dateKey)}
                                        style={{ padding: '6px 14px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                      >Save</button>
                                      <button
                                        onClick={() => { setBonusEditVal('0'); setBonusEditNote('cleared'); saveBonusEdit(d.dateKey) }}
                                        style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 11, cursor: 'pointer' }}
                                      >Clear</button>
                                    </div>
                                    {d.location && (
                                      <div style={{ paddingTop: 22, color: MUTED, fontSize: 11 }}>
                                        📍 {d.location} · Auto bonus: <span style={{ color: AMBER, fontWeight: 700 }}>{fmt$(d.autoBonus)}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                      {rows.length > 1 && (
                        <tfoot>
                          <tr style={{ borderTop: `2px solid ${BORDER}`, background: CARD }}>
                            {cols.map((c, ci) => (
                              <td key={c.key} style={{
                                ...tdStyle(c.color),
                                textAlign: ci === 0 ? 'left' : 'right',
                                fontWeight: 800, fontSize: ci === 0 ? 11 : 12,
                              }}>
                                {c.fmt(totals[c.key])}
                              </td>
                            ))}
                            {mode === 'admin' && <td />}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )
              })()}

              {/* Invoices Tab */}
              {activeTab === 'Invoices' && (
                <InvoiceTable invoices={employeeSales} onOpenInvoice={setOpenedInvoice} />
              )}

              {/* Product Commission Tab */}
              {activeTab === 'Product Commission' && (() => {
                const totalCommission = productCommissionLines.reduce((s, l) => s + l.commission, 0)
                const linesWithComm   = productCommissionLines.filter(l => l.commission > 0).length

                // Day-level tier summary for the info bar
                const uniqueDays = Object.entries(dayTierMap)

                const thS = {
                  padding: '7px 10px', textAlign: 'left', color: MUTED, fontWeight: 600,
                  fontSize: 10, background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`,
                  whiteSpace: 'nowrap', letterSpacing: 0.4,
                }
                const tdS = (extra = {}) => ({
                  padding: '8px 10px', fontSize: 12, color: DIM,
                  borderBottom: `1px solid var(--c-border-row)`, ...extra,
                })

                const tierColor = (rate) =>
                  rate >= 0.30 ? PURPLE :
                  rate >= 0.25 ? BLUE :
                  rate >= 0.20 ? GREEN :
                  'var(--c-text-dim)'

                return (
                  <div>
                    {/* Summary cards */}
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      {[
                        { label: 'Total Commission',    value: fmt$(totalCommission), color: BLUE  },
                        { label: 'Items Sold',          value: productCommissionLines.length, color: DIM   },
                        { label: 'Items w/ Commission', value: linesWithComm,         color: GREEN },
                      ].map(c => (
                        <div key={c.label} style={{
                          flex: 1, background: CARD, border: `1px solid ${BORDER}`,
                          borderRadius: 8, padding: '12px 16px', borderLeft: `3px solid ${c.color}`,
                        }}>
                          <p style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>{c.label}</p>
                          <p style={{ color: c.color, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
                        </div>
                      ))}
                    </div>

                    {/* Day tier summary */}
                    {uniqueDays.length > 0 && (
                      <div style={{
                        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                        padding: '10px 14px', marginBottom: 12,
                        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
                      }}>
                        <span style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>DAY TIERS</span>
                        {uniqueDays.sort(([a], [b]) => a.localeCompare(b)).map(([date, info]) => (
                          <span key={date} style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: `${tierColor(info.rate)}18`,
                            border: `1px solid ${tierColor(info.rate)}50`,
                            color: tierColor(info.rate),
                          }}>
                            {new Date(date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                            {' · '}{info.label}{' · '}{fmt$(info.subtotal)}
                          </span>
                        ))}
                      </div>
                    )}

                    <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                        <thead>
                          <tr>
                            {[
                              { label: 'Invoice #',    right: false },
                              { label: 'Timestamp',    right: false },
                              { label: 'Tier',         right: false },
                              { label: 'Commission',   right: true  },
                              { label: 'Barcode',      right: false },
                              { label: 'Product Name', right: false },
                              { label: 'Description',  right: false },
                              { label: 'Size',         right: false },
                              { label: 'Qty',          right: true  },
                              { label: 'Subtotal',     right: true  },
                              { label: 'Min Price',    right: true  },
                              { label: '',             right: false },
                            ].map(h => (
                              <th key={h.label} style={{ ...thS, textAlign: h.right ? 'right' : 'left' }}>
                                {h.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {productCommissionLines.length === 0 && (
                            <tr>
                              <td colSpan={12} style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 13 }}>
                                No items sold in this period
                              </td>
                            </tr>
                          )}
                          {productCommissionLines.map((line, i) => (
                            <tr key={`${line.invoiceNumber}-${i}`} style={{
                              borderBottom: `1px solid var(--c-border-row)`,
                              background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                              transition: 'background 0.15s',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.04)' }}
                              onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)' }}
                            >
                              <td style={tdS({ color: BLUE, fontWeight: 700 })}>{line.invoiceNumber}</td>
                              <td style={tdS({ whiteSpace: 'nowrap' })}>{fmtDateTime(line.timestamp)}</td>
                              <td style={tdS()}>
                                <span style={{
                                  padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                                  background: `${tierColor(line.tierRate)}18`,
                                  border: `1px solid ${tierColor(line.tierRate)}50`,
                                  color: tierColor(line.tierRate),
                                  whiteSpace: 'nowrap',
                                }}>{line.tierLabel}</span>
                              </td>
                              <td style={tdS({ textAlign: 'right' })}>
                                <span style={{ color: line.commission > 0 ? GREEN : 'var(--c-text-dim)', fontWeight: line.commission > 0 ? 700 : 400 }}>
                                  {fmt$(line.commission)}
                                </span>
                                {line.productCommission !== null && (
                                  <div style={{ fontSize: 10, color: MUTED, marginTop: 2, whiteSpace: 'nowrap' }}>
                                    prod {fmt$(line.productCommission)} + spare {fmt$(line.spareCommission)}
                                  </div>
                                )}
                              </td>
                              <td style={tdS({ fontFamily: 'monospace', fontSize: 10, color: MUTED })}>{line.barcode}</td>
                              <td style={tdS({ color: TEXT, fontWeight: 600, maxWidth: 160 })}>{line.name}</td>
                              <td style={tdS({ color: MUTED, maxWidth: 140 })}>{line.description || '—'}</td>
                              <td style={tdS()}>{line.size}</td>
                              <td style={tdS({ textAlign: 'right', color: TEXT })}>{line.qty}</td>
                              <td style={tdS({ textAlign: 'right' })}>{fmt$(line.subtotal)}</td>
                              <td style={tdS({ textAlign: 'right', color: MUTED })}>
                                {line.minPrice !== null ? fmt$(line.minPrice) : '—'}
                              </td>
                              <td style={tdS()}>
                                <button
                                  onClick={() => setOpenedInvoice(line._sale)}
                                  style={{
                                    padding: '4px 10px', background: 'transparent',
                                    border: `1px solid ${BLUE}`, borderRadius: 4,
                                    color: BLUE, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                                  }}
                                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.12)' }}
                                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                                >Open Invoice</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        {productCommissionLines.length > 0 && (
                          <tfoot>
                            <tr style={{ borderTop: `2px solid ${BORDER}`, background: CARD }}>
                              <td colSpan={2} style={{ padding: '8px 10px', color: MUTED, fontSize: 10, fontWeight: 700 }}>
                                TOTAL — {productCommissionLines.length} items
                              </td>
                              <td />{/* Tier */}
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: GREEN, fontSize: 13, fontWeight: 800 }}>
                                {fmt$(totalCommission)}
                              </td>
                              <td colSpan={5} />
                              <td style={{ padding: '8px 10px', textAlign: 'right', color: DIM, fontSize: 12, fontWeight: 700 }}>
                                {fmt$(productCommissionLines.reduce((s, l) => s + l.subtotal, 0))}
                              </td>
                              <td colSpan={2} />
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )
              })()}

              {/* Products Sold Tab */}
              {activeTab === 'Products Sold' && (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    {[
                      { label: 'Unique Products', value: productsSold.length, color: BLUE },
                      { label: 'Total Units Sold', value: productsSold.reduce((s, p) => s + p.qty, 0), color: GREEN },
                      { label: 'Total Revenue', value: fmt$(productsSold.reduce((s, p) => s + p.revenue, 0)), color: GREEN },
                    ].map(c => (
                      <div key={c.label} style={{
                        flex: 1, background: CARD, border: `1px solid ${BORDER}`,
                        borderRadius: 8, padding: '12px 16px', borderLeft: `3px solid ${c.color}`,
                      }}>
                        <p style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>{c.label}</p>
                        <p style={{ color: c.color, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Product', 'Size', 'Units Sold', 'Revenue', 'Invoices'].map(h => (
                            <th key={h} style={{
                              padding: '8px 12px', textAlign: ['Units Sold','Revenue','Invoices'].includes(h) ? 'right' : 'left',
                              color: MUTED, fontWeight: 600, fontSize: 10,
                              background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {productsSold.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No products sold in this period</td></tr>
                        )}
                        {productsSold.map((p, i) => (
                          <tr key={p.name + p.size} style={{
                            borderBottom: `1px solid var(--c-border-row)`,
                            background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                          }}>
                            <td style={{ padding: '9px 12px', color: TEXT, fontWeight: 600, fontSize: 13 }}>{p.name}</td>
                            <td style={{ padding: '9px 12px', color: MUTED, fontSize: 12 }}>{p.size || '—'}</td>
                            <td style={{ padding: '9px 12px', color: GREEN, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{p.qty}</td>
                            <td style={{ padding: '9px 12px', color: DIM, fontSize: 12, textAlign: 'right' }}>{fmt$(p.revenue)}</td>
                            <td style={{ padding: '9px 12px', color: MUTED, fontSize: 12, textAlign: 'right' }}>{p.invoices}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Hours Tab */}
              {activeTab === 'Hours' && (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    {[
                      { label: 'Total Hours', value: fmtHours(totalHoursMs), color: BLUE },
                      { label: 'Sessions', value: clockRecords.filter(r => r.clockOut).length, color: DIM },
                      { label: 'Active Now', value: clockRecords.filter(r => !r.clockOut).length > 0 ? 'Yes' : 'No', color: clockRecords.filter(r => !r.clockOut).length > 0 ? GREEN : MUTED },
                    ].map(c => (
                      <div key={c.label} style={{
                        flex: 1, background: CARD, border: `1px solid ${BORDER}`,
                        borderRadius: 8, padding: '12px 16px', borderLeft: `3px solid ${c.color}`,
                      }}>
                        <p style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>{c.label}</p>
                        <p style={{ color: c.color, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Clock In', 'Clock Out', 'Duration', 'Status'].map(h => (
                            <th key={h} style={{
                              padding: '8px 12px', textAlign: 'left', color: MUTED,
                              fontWeight: 600, fontSize: 10, background: CARD,
                              borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {clockRecords.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No clock records in this period</td></tr>
                        )}
                        {[...clockRecords].reverse().map((r, i) => {
                          const ms = r.clockOut ? new Date(r.clockOut) - new Date(r.clockIn) : null
                          return (
                            <tr key={r.id} style={{
                              borderBottom: `1px solid var(--c-border-row)`,
                              background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                            }}>
                              <td style={{ padding: '9px 12px', color: DIM, fontSize: 12 }}>
                                {new Date(r.clockIn).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                              </td>
                              <td style={{ padding: '9px 12px', color: GREEN, fontSize: 13, fontWeight: 600 }}>{fmtTime(r.clockIn)}</td>
                              <td style={{ padding: '9px 12px', color: r.clockOut ? DIM : AMBER, fontSize: 12 }}>
                                {r.clockOut ? fmtTime(r.clockOut) : '— Active'}
                              </td>
                              <td style={{ padding: '9px 12px', color: BLUE, fontWeight: 600, fontSize: 13 }}>
                                {ms !== null ? fmtHours(ms) : '—'}
                              </td>
                              <td style={{ padding: '9px 12px' }}>
                                {r.clockOut
                                  ? <span style={{ fontSize: 10, color: GREEN }}>● Completed</span>
                                  : <span style={{ fontSize: 10, color: AMBER }}>● Active</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Spare Tab */}
              {activeTab === 'Spare' && (
                <div>
                  <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                    {[
                      { label: 'Total Spare', value: fmt$(totalSpare), color: PURPLE },
                      { label: 'Invoices w/ Spare', value: spareInvoices.length, color: DIM },
                      { label: 'Avg Spare / Sale', value: fmt$(spareInvoices.length > 0 ? totalSpare / spareInvoices.length : 0), color: MUTED },
                    ].map(c => (
                      <div key={c.label} style={{
                        flex: 1, background: CARD, border: `1px solid ${BORDER}`,
                        borderRadius: 8, padding: '12px 16px', borderLeft: `3px solid ${c.color}`,
                      }}>
                        <p style={{ color: MUTED, fontSize: 11, marginBottom: 4 }}>{c.label}</p>
                        <p style={{ color: c.color, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Invoice #', 'Date', 'Total', 'Spare', 'Payment'].map(h => (
                            <th key={h} style={{
                              padding: '8px 12px', textAlign: ['Total','Spare'].includes(h) ? 'right' : 'left',
                              color: MUTED, fontWeight: 600, fontSize: 10,
                              background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`, letterSpacing: 0.4,
                            }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {spareInvoices.length === 0 && (
                          <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 12 }}>No spare recorded in this period</td></tr>
                        )}
                        {spareInvoices.map((s, i) => (
                          <tr key={s.number} style={{
                            borderBottom: `1px solid var(--c-border-row)`,
                            background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                          }}>
                            <td style={{ padding: '9px 12px', color: BLUE, fontWeight: 700, fontSize: 13 }}>{s.number}</td>
                            <td style={{ padding: '9px 12px', color: DIM, fontSize: 12 }}>{fmtDateTime(s.timestamp)}</td>
                            <td style={{ padding: '9px 12px', color: GREEN, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{fmt$(s.total)}</td>
                            <td style={{ padding: '9px 12px', color: PURPLE, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{fmt$(s.totalSpare)}</td>
                            <td style={{ padding: '9px 12px', color: MUTED, fontSize: 12 }}>{s.paymentMethod}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* My Clients Tab */}
              {activeTab === 'My Clients' && (() => {
                const withPurchase    = myClients.filter(c => !c.noPurchase)
                const withoutPurchase = myClients.filter(c =>  c.noPurchase)
                const periodRevenue   = myClients.reduce((s, c) => s + c.periodSpent, 0)
                const empName         = selectedName || unlockedEmployee?.name

                const thS = {
                  padding: '7px 12px', textAlign: 'left', color: MUTED, fontWeight: 600,
                  fontSize: 10, background: 'var(--c-bg-stripe)', borderBottom: `1px solid ${BORDER}`,
                  letterSpacing: 0.4, whiteSpace: 'nowrap',
                }
                const tdS = (extra = {}) => ({
                  padding: '8px 12px', fontSize: 12, color: DIM,
                  borderBottom: `1px solid var(--c-border-row)`, ...extra,
                })

                return (
                  <div>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
                      {[
                        { label: 'Total Captured',    value: myClients.length,        color: BLUE   },
                        { label: 'With Purchase',     value: withPurchase.length,      color: GREEN  },
                        { label: 'Without Purchase',  value: withoutPurchase.length,   color: AMBER  },
                        { label: 'Period Revenue',    value: fmt$(periodRevenue),       color: PURPLE },
                      ].map(c => (
                        <div key={c.label} style={{
                          background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                          padding: '12px 16px', borderLeft: `3px solid ${c.color}`,
                        }}>
                          <p style={{ color: MUTED, fontSize: 10, marginBottom: 5, letterSpacing: 0.3 }}>{c.label}</p>
                          <p style={{ color: c.color, fontSize: 20, fontWeight: 800 }}>{c.value}</p>
                        </div>
                      ))}
                    </div>

                    {myClients.length === 0 ? (
                      <div style={{
                        padding: 40, textAlign: 'center',
                        background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                      }}>
                        <div style={{ fontSize: 32, marginBottom: 12 }}>👥</div>
                        <p style={{ color: TEXT, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No clients yet</p>
                        <p style={{ color: MUTED, fontSize: 12 }}>
                          Clients captured or sold to by {empName} will appear here once registered in CRM.
                        </p>
                      </div>
                    ) : (
                      <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
                          <thead>
                            <tr>
                              {['Name','Phone','Status','First Purchase','Last Purchase','Location','All-Time Sales','# Purchases','Period Sales','New?'].map(h => (
                                <th key={h} style={{
                                  ...thS,
                                  textAlign: ['All-Time Sales','Period Sales','# Purchases'].includes(h) ? 'right' : 'left',
                                }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {myClients.map((c, i) => (
                              <tr key={c.id} style={{
                                borderBottom: `1px solid var(--c-border-row)`,
                                background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                                opacity: c.noPurchase ? 0.75 : 1,
                              }}>
                                <td style={tdS({ color: TEXT, fontWeight: 600 })}>{c.name}</td>
                                <td style={tdS({ fontFamily: 'monospace', fontSize: 11 })}>{c.phone}</td>
                                <td style={tdS()}>
                                  {c.noPurchase
                                    ? <span style={{
                                        background: 'rgba(245,158,11,0.12)',
                                        border: '1px solid rgba(245,158,11,0.3)',
                                        color: AMBER, fontSize: 10, fontWeight: 700,
                                        padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap',
                                      }}>No Purchase Yet</span>
                                    : <span style={{
                                        background: 'rgba(34,197,94,0.1)',
                                        border: '1px solid rgba(34,197,94,0.25)',
                                        color: GREEN, fontSize: 10, fontWeight: 700,
                                        padding: '2px 7px', borderRadius: 4,
                                      }}>Buyer</span>
                                  }
                                </td>
                                <td style={tdS()}>
                                  {c.noPurchase
                                    ? (c.capturedAt ? <span style={{ color: MUTED }}>{fmtDateTime(c.capturedAt)} <span style={{ fontSize: 9, color: 'var(--c-text-dim)' }}>(captured)</span></span> : '—')
                                    : (c.firstPurchase ? fmtDateTime(c.firstPurchase) : '—')
                                  }
                                </td>
                                <td style={tdS()}>
                                  {c.noPurchase ? <span style={{ color: 'var(--c-text-dim)' }}>—</span> : (c.lastPurchase ? fmtDateTime(c.lastPurchase) : '—')}
                                </td>
                                <td style={tdS()}>{c.location}</td>
                                <td style={tdS({ textAlign: 'right', color: c.noPurchase ? MUTED : GREEN, fontWeight: 700 })}>
                                  {c.noPurchase ? '—' : fmt$(c.totalSpent)}
                                </td>
                                <td style={tdS({ textAlign: 'right' })}>
                                  {c.noPurchase ? <span style={{ color: 'var(--c-text-dim)' }}>—</span> : c.purchaseCount}
                                </td>
                                <td style={tdS({ textAlign: 'right', color: c.periodPurchases > 0 ? AMBER : MUTED })}>
                                  {c.noPurchase || c.periodPurchases === 0 ? '—' : fmt$(c.periodSpent)}
                                </td>
                                <td style={tdS({ textAlign: 'center' })}>
                                  {c.capturedInPeriod
                                    ? <span style={{ color: GREEN, fontWeight: 700, fontSize: 11 }}>★ NEW</span>
                                    : <span style={{ color: 'var(--c-text-dim)' }}>—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Deductions Tab */}
              {activeTab === 'Deductions' && (
                <div style={{
                  padding: 40, textAlign: 'center',
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
                  <p style={{ color: TEXT, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Deductions</p>
                  <p style={{ color: MUTED, fontSize: 12 }}>No deductions recorded for this period.</p>
                  <p style={{ color: 'var(--c-text-dim)', fontSize: 11, marginTop: 8 }}>Deductions will appear here once recorded by management.</p>
                </div>
              )}

              {/* Reimbursements Tab */}
              {activeTab === 'Reimbursements' && (
                <div style={{
                  padding: 40, textAlign: 'center',
                  background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>💰</div>
                  <p style={{ color: TEXT, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Reimbursements</p>
                  <p style={{ color: MUTED, fontSize: 12 }}>No reimbursements recorded for this period.</p>
                  <p style={{ color: 'var(--c-text-dim)', fontSize: 11, marginTop: 8 }}>Reimbursements will appear here once recorded by management.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Invoice detail modal */}
      {openedInvoice && (
        <InvoiceDetailModal
          invoice={openedInvoice}
          onClose={() => setOpenedInvoice(null)}
          updateSale={updateSale}
          voidSale={voidSale}
        />
      )}
    </div>
  )
}
