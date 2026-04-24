/**
 * PaymentModal.jsx
 * ──────────────────────────────────────────────────────────────────────────────
 * Supports both single-method and split-payment (cash + card, etc.).
 *
 * STATE MODEL
 *  payments[]      — confirmed payment entries already added to this sale
 *  method          — currently selected method tab for the entry form
 *  entryAmount     — partial amount for the current entry (defaults to remaining)
 *  (method fields) — cashReceived / cardBrand / cardLast4 / authNumber / extRef / checkNumber
 *
 * PAYLOAD to onConfirm
 *  payments[]      — full array (new)
 *  method          — first method or 'split' (backward compat)
 *  Legacy flat fields (amountReceived, changeDue, cardBrand, …) only when single payment
 *
 * INVOICE BACKWARD COMPAT
 *  Old invoices have no `payments` field — all existing reads still work via
 *  the top-level `paymentMethod`, `amountReceived`, `cardBrand` etc. fields.
 *  New invoices have both: the `payments[]` array AND the legacy top-level
 *  fields (for single payments). Split invoices set paymentMethod:'split'.
 */

import { useState, useMemo } from 'react'

const ALL_METHODS = [
  { id: 'cash',     label: 'Cash',            icon: '💵', color: '#22c55e', prefKey: 'acceptCash'       },
  { id: 'card',     label: 'Credit Card',     icon: '💳', color: '#3b82f6', prefKey: 'acceptCard'       },
  { id: 'external', label: 'External Credit', icon: '📱', color: '#8b5cf6', prefKey: 'acceptExtCredit'  },
  { id: 'check',    label: 'Check',           icon: '✍️', color: '#f59e0b', prefKey: 'acceptCheck'      },
]

const CARD_BRANDS = [
  { id: 'visa',       label: 'Visa',       color: '#1a56db' },
  { id: 'mastercard', label: 'Mastercard', color: '#eb001b' },
  { id: 'amex',       label: 'Amex',       color: '#2b7de9' },
  { id: 'discover',   label: 'Discover',   color: '#f76f20' },
  { id: 'other',      label: 'Other',      color: '#94a3b8' },
]

// ── Card brand SVG icons (unchanged) ──────────────────────────────────────────
function VisaIcon() {
  return (
    <svg viewBox="0 0 60 36" width="54" height="33" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="36" rx="5" fill="#1A1F71" />
      <text x="30" y="25" textAnchor="middle" fill="white" fontSize="19"
        fontStyle="italic" fontFamily="Arial, sans-serif" fontWeight="bold" letterSpacing="-0.5">VISA</text>
    </svg>
  )
}
function MastercardIcon() {
  return (
    <svg viewBox="0 0 60 36" width="54" height="33" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="36" rx="5" fill="#1a1a1a" />
      <circle cx="22" cy="18" r="11" fill="#EB001B" />
      <circle cx="38" cy="18" r="11" fill="#F79E1B" />
      <path d="M30 9.5 a11 11 0 0 1 0 17 a11 11 0 0 1 0-17z" fill="#FF5F00" />
      <text x="30" y="31" textAnchor="middle" fill="#ccc" fontSize="5.5"
        fontFamily="Arial, sans-serif" fontWeight="bold" letterSpacing="0.4">MASTERCARD</text>
    </svg>
  )
}
function AmexIcon() {
  return (
    <svg viewBox="0 0 60 36" width="54" height="33" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="amexGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2E77BC" /><stop offset="100%" stopColor="#1a5fa8" />
        </linearGradient>
      </defs>
      <rect width="60" height="36" rx="5" fill="url(#amexGrad)" />
      <text x="30" y="17" textAnchor="middle" fill="rgba(255,255,255,0.15)"
        fontSize="28" fontFamily="serif" fontWeight="bold">✦</text>
      <text x="30" y="27" textAnchor="middle" fill="white" fontSize="11"
        fontFamily="Arial, sans-serif" fontWeight="bold" letterSpacing="2">AMEX</text>
    </svg>
  )
}
function DiscoverIcon() {
  return (
    <svg viewBox="0 0 60 36" width="54" height="33" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="36" rx="5" fill="#fff" />
      <text x="8" y="16" fill="#231F20" fontSize="6.5"
        fontFamily="Arial, sans-serif" fontWeight="bold" letterSpacing="0.3">DISCOVER</text>
      <circle cx="46" cy="18" r="13" fill="#F76F20" />
      <text x="8" y="27" fill="#888" fontSize="5" fontFamily="Arial, sans-serif">NETWORK</text>
    </svg>
  )
}
function OtherCardIcon() {
  return (
    <svg viewBox="0 0 60 36" width="54" height="33" xmlns="http://www.w3.org/2000/svg">
      <rect width="60" height="36" rx="5" fill="#253349" stroke="#415569" strokeWidth="1" />
      <rect x="8" y="10" width="10" height="8" rx="2" fill="#94a3b8" />
      <path d="M25 14 a4 4 0 0 1 0 8"  stroke="#94a3b8" strokeWidth="1.5" fill="none" />
      <path d="M28 11 a8 8 0 0 1 0 14" stroke="#415569" strokeWidth="1.5" fill="none" />
      <rect x="0" y="24" width="60" height="5" rx="0" fill="#415569" />
      <text x="30" y="22" textAnchor="middle" fill="#94a3b8" fontSize="7"
        fontFamily="Arial, sans-serif" fontWeight="bold" letterSpacing="1">OTHER</text>
    </svg>
  )
}
const BRAND_ICON = {
  visa: <VisaIcon />, mastercard: <MastercardIcon />, amex: <AmexIcon />,
  discover: <DiscoverIcon />, other: <OtherCardIcon />,
}

const BILLS = [1000, 500, 100, 50, 20, 10, 5, 1]
const COINS = [1, 0.25, 0.10, 0.05, 0.01]

// ── Shared styles ──────────────────────────────────────────────────────────────
const LABEL = {
  color: '#94a3b8', fontSize: 11, fontWeight: 600,
  letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, display: 'block',
}
const INPUT = {
  width: '100%', padding: '11px 14px',
  background: '#0b1426', border: '1px solid #253349', borderRadius: 8,
  color: '#f1f5f9', fontSize: 14, outline: 'none', fontFamily: 'inherit',
}
const CARD_DARK = {
  background: '#080f1e', border: '1px solid #253349',
  borderRadius: 12, padding: 16, marginBottom: 12,
}

// ── Method label helper ────────────────────────────────────────────────────────
function methodLabel(p) {
  if (p.method === 'cash')     return 'Cash'
  if (p.method === 'external') return `External${p.externalRef ? ` (${p.externalRef})` : ''}`
  if (p.method === 'check')    return `Check${p.checkNumber ? ` #${p.checkNumber}` : ''}`
  if (p.method === 'card') {
    const brand = p.cardBrand ? (p.cardBrand.charAt(0).toUpperCase() + p.cardBrand.slice(1)) : 'Card'
    const last4 = p.cardLast4 ? ` ****${p.cardLast4}` : ''
    return `${brand}${last4}`
  }
  return p.method
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PaymentModal({
  items, taxRate = 0.085, currentUser, customers = [], locationPrefs = {}, onConfirm, onCancel,
}) {
  const METHODS = ALL_METHODS.filter(m => locationPrefs[m.prefKey] !== false)

  // ── Confirmed payments list ─────────────────────────────────────────────────
  const [payments, setPayments] = useState([])

  // ── Current entry form ──────────────────────────────────────────────────────
  const [method,      setMethod]      = useState(() => METHODS[0]?.id || 'cash')
  const [entryAmount, setEntryAmount] = useState('')   // '' = use remaining
  const [cashReceived, setCashReceived] = useState('')
  const [cardBrand,   setCardBrand]   = useState('visa')
  const [cardLast4,   setCardLast4]   = useState('')
  const [authNumber,  setAuthNumber]  = useState('')
  const [extRef,      setExtRef]      = useState('')
  const [checkNumber, setCheckNumber] = useState('')

  // ── Shared ──────────────────────────────────────────────────────────────────
  const [notes,          setNotes]           = useState('')
  const [custSearch,     setCustSearch]      = useState('')
  const [linkedCustomer, setLinkedCustomer]  = useState(null)
  const [showCustDropdown, setShowCustDropdown] = useState(false)

  // ── Totals ──────────────────────────────────────────────────────────────────
  const subtotal   = items.reduce((sum, i) => sum + i.subtotal, 0)
  const tax        = subtotal * taxRate
  const total      = subtotal + tax
  const totalPaid  = payments.reduce((s, p) => s + p.amount, 0)
  const remaining  = Math.max(0, Math.round((total - totalPaid) * 100) / 100)

  // ── Current entry derived values ────────────────────────────────────────────
  const entryAmt   = Math.min(parseFloat(entryAmount) || remaining, remaining)
  const cashRecv   = parseFloat(cashReceived) || entryAmt
  const changeDue  = method === 'cash' ? Math.max(0, Math.round((cashRecv - entryAmt) * 100) / 100) : 0

  // ── Validation for "Add Payment" button ─────────────────────────────────────
  const canAdd = (() => {
    if (entryAmt <= 0) return false
    if (method === 'cash') return cashRecv >= entryAmt
    return true
  })()

  const canConfirm = remaining === 0 && payments.length > 0

  // ── Customer search ─────────────────────────────────────────────────────────
  const custResults = useMemo(() => {
    if (!custSearch.trim() || custSearch.length < 2) return []
    const q = custSearch.toLowerCase()
    return customers
      .filter(c => !c.archived)
      .filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.phone || '').replace(/\D/g, '').includes(q.replace(/\D/g, ''))
      )
      .slice(0, 5)
  }, [custSearch, customers])

  // ── Denomination quick-add for cash ─────────────────────────────────────────
  const addDenom = (val) => {
    setCashReceived(prev => ((parseFloat(prev) || 0) + val).toFixed(2))
  }

  // ── Add current entry to the payments list ───────────────────────────────────
  const addPayment = () => {
    if (!canAdd) return

    const amount = entryAmt  // already capped at remaining
    const entry  = { method, amount }

    if (method === 'cash') {
      entry.amountReceived = cashRecv
      entry.changeDue      = changeDue
    } else if (method === 'card') {
      entry.cardBrand          = cardBrand
      entry.cardLast4          = cardLast4.replace(/\D/g, '').slice(-4)
      entry.authorizationNumber = authNumber
    } else if (method === 'external') {
      entry.externalRef = extRef
    } else if (method === 'check') {
      entry.checkNumber = checkNumber
    }

    setPayments(prev => [...prev, entry])
    // Reset entry form
    setEntryAmount('')
    setCashReceived('')
    setCardLast4('')
    setAuthNumber('')
    setExtRef('')
    setCheckNumber('')
  }

  const removePayment = (idx) => {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  // ── Build onConfirm payload ──────────────────────────────────────────────────
  const buildPayload = (receiptAction) => {
    const isSingle = payments.length === 1
    const p0       = payments[0] || {}
    const m        = isSingle ? p0.method : 'split'

    return {
      // New field — array of payments
      payments,
      // Legacy fields (backward compat — only for single-payment invoices)
      method:   m,
      total, subtotal, tax,
      notes,
      linkedCustomerId: linkedCustomer?.id || null,
      receiptAction,
      ...(isSingle && m === 'cash'     && { amountReceived: p0.amountReceived, changeDue: p0.changeDue }),
      ...(isSingle && m === 'card'     && { cardBrand: p0.cardBrand, cardLast4: p0.cardLast4, authorizationNumber: p0.authorizationNumber }),
      ...(isSingle && m === 'external' && { externalRef: p0.externalRef }),
      ...(isSingle && m === 'check'    && { checkNumber: p0.checkNumber }),
    }
  }

  const activeColor = METHODS.find(m => m.id === method)?.color || '#3b82f6'

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,2,15,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0d1526 100%)',
        border: '1px solid #253349', borderRadius: 20,
        width: 540, maxHeight: '93vh', overflowY: 'auto',
        padding: 28,
        boxShadow: '0 24px 80px rgba(0,0,0,0.85), 0 0 0 1px rgba(37,99,235,0.07) inset',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>Complete Sale</h2>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', color: '#94a3b8',
            fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {/* ── Total + Remaining ── */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16,
        }}>
          {/* Total Due */}
          <div style={{
            background: '#070e1c', border: '1px solid #253349',
            borderRadius: 12, padding: '14px 18px', textAlign: 'center',
          }}>
            <p style={{ color: '#94a3b8', fontSize: 10, letterSpacing: 0.8, fontWeight: 600, marginBottom: 5 }}>TOTAL DUE</p>
            <p style={{ color: '#cbd0e0', fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1, margin: 0 }}>
              ${total.toFixed(2)}
            </p>
            <p style={{ color: '#253349', fontSize: 11, marginTop: 4 }}>
              ${subtotal.toFixed(2)} + tax ${tax.toFixed(2)}
            </p>
          </div>

          {/* Remaining Balance */}
          <div style={{
            background: remaining > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(34,197,94,0.06)',
            border: `1px solid ${remaining > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
            borderRadius: 12, padding: '14px 18px', textAlign: 'center',
            transition: 'all 0.3s',
          }}>
            <p style={{ color: '#94a3b8', fontSize: 10, letterSpacing: 0.8, fontWeight: 600, marginBottom: 5 }}>
              {remaining > 0 ? 'REMAINING' : '✓ PAID IN FULL'}
            </p>
            <p style={{
              color: remaining > 0 ? '#ef4444' : '#22c55e',
              fontSize: 32, fontWeight: 800, letterSpacing: -1, lineHeight: 1, margin: 0,
              transition: 'color 0.3s',
            }}>
              ${remaining.toFixed(2)}
            </p>
            {payments.length > 0 && (
              <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                ${totalPaid.toFixed(2)} collected
              </p>
            )}
          </div>
        </div>

        {/* ── Payments already added ── */}
        {payments.length > 0 && (
          <div style={{
            background: '#080f1e', border: '1px solid #253349',
            borderRadius: 12, padding: '10px 14px', marginBottom: 14,
          }}>
            <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 8 }}>
              PAYMENTS COLLECTED
            </p>
            {payments.map((p, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 0',
                borderBottom: idx < payments.length - 1 ? '1px solid #111d30' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 15 }}>
                    {p.method === 'cash' ? '💵' : p.method === 'card' ? '💳' : p.method === 'external' ? '📱' : '✍️'}
                  </span>
                  <div>
                    <span style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>{methodLabel(p)}</span>
                    {p.method === 'cash' && p.changeDue > 0 && (
                      <span style={{ color: '#22c55e', fontSize: 11, marginLeft: 8 }}>
                        Change: ${p.changeDue.toFixed(2)}
                      </span>
                    )}
                    {p.method === 'card' && p.authorizationNumber && (
                      <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 8 }}>
                        Auth: {p.authorizationNumber}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: '#22c55e', fontSize: 15, fontWeight: 700 }}>
                    ${p.amount.toFixed(2)}
                  </span>
                  <button
                    onClick={() => removePayment(idx)}
                    title="Remove this payment"
                    style={{
                      background: 'none', border: '1px solid #253349', borderRadius: 4,
                      color: '#94a3b8', fontSize: 12, cursor: 'pointer',
                      width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
                  >✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Add payment entry (hidden when remaining = 0) ── */}
        {remaining > 0 && (
          <>
            <div style={{
              background: '#080f1e', border: `1px solid ${activeColor}28`,
              borderRadius: 12, padding: 16, marginBottom: 12,
              transition: 'border-color 0.2s',
            }}>
              <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
                ADD PAYMENT
              </p>

              {/* Method tabs */}
              <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
                {METHODS.map(m => {
                  const active = method === m.id
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setMethod(m.id); setEntryAmount('') }}
                      style={{
                        flex: 1, padding: '10px 4px', borderRadius: 10,
                        border: `1px solid ${active ? m.color : '#253349'}`,
                        background: active ? `${m.color}1a` : '#0b1426',
                        color: active ? '#f1f5f9' : '#94a3b8',
                        fontSize: 12, fontWeight: active ? 700 : 400,
                        cursor: 'pointer', transition: 'all 0.18s',
                        boxShadow: active ? `0 0 12px ${m.color}28` : 'none',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 17 }}>{m.icon}</span>
                      <span style={{ fontSize: 10 }}>{m.label}</span>
                    </button>
                  )
                })}
              </div>

              {/* Amount for this payment */}
              <div style={{ marginBottom: 14 }}>
                <span style={LABEL}>Amount (max ${remaining.toFixed(2)})</span>
                <input
                  type="number"
                  min={0}
                  max={remaining}
                  step="0.01"
                  value={entryAmount}
                  onChange={e => setEntryAmount(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder={remaining.toFixed(2)}
                  style={{
                    ...INPUT,
                    fontSize: 22, fontWeight: 800,
                    color: activeColor, textAlign: 'right',
                    padding: '10px 16px',
                    border: `1px solid ${activeColor}28`,
                  }}
                />
              </div>

              {/* ── CASH sub-fields ── */}
              {method === 'cash' && (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <span style={LABEL}>Amount Received ($)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder={(entryAmt || remaining).toFixed(2)}
                      style={{
                        ...INPUT,
                        fontSize: 22, fontWeight: 800,
                        color: '#22c55e', textAlign: 'right',
                        padding: '10px 16px',
                        border: '1px solid #22c55e28',
                      }}
                    />
                  </div>

                  <span style={{ ...LABEL, marginBottom: 6 }}>Quick Add — Bills</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
                    {BILLS.map(d => (
                      <button key={d} onClick={() => addDenom(d)} style={{
                        padding: '5px 10px', borderRadius: 6,
                        border: '1px solid #22c55e28',
                        background: '#22c55e0e', color: '#22c55e',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>${d}</button>
                    ))}
                  </div>

                  <span style={{ ...LABEL, marginBottom: 6 }}>Quick Add — Coins</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                    {COINS.map(d => (
                      <button key={d} onClick={() => addDenom(d)} style={{
                        padding: '5px 10px', borderRadius: 6,
                        border: '1px solid #cbd0e028',
                        background: '#cbd0e00a', color: '#cbd0e0',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>${d.toFixed(2)}</button>
                    ))}
                  </div>

                  {/* Change due */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 16px', borderRadius: 10,
                    background: changeDue > 0 ? '#22c55e12' : '#070e1c',
                    border: `1px solid ${changeDue > 0 ? '#22c55e38' : '#111d30'}`,
                    transition: 'all 0.2s',
                  }}>
                    <span style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Change Due</span>
                    <span style={{
                      color: changeDue > 0 ? '#22c55e' : '#253349',
                      fontSize: 26, fontWeight: 800, transition: 'color 0.2s',
                    }}>${changeDue.toFixed(2)}</span>
                  </div>

                  {cashRecv > 0 && cashRecv < entryAmt && (
                    <p style={{ color: '#ef4444', fontSize: 11, marginTop: 7 }}>
                      ⚠ Amount received is less than ${entryAmt.toFixed(2)}
                    </p>
                  )}
                </>
              )}

              {/* ── CARD sub-fields ── */}
              {method === 'card' && (
                <>
                  <span style={LABEL}>Card Brand</span>
                  <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
                    {CARD_BRANDS.map(b => {
                      const active = cardBrand === b.id
                      return (
                        <button key={b.id} onClick={() => setCardBrand(b.id)} style={{
                          flex: 1, padding: '8px 4px 6px',
                          borderRadius: 10,
                          border: `2px solid ${active ? b.color : '#253349'}`,
                          background: active ? `${b.color}14` : '#080f1e',
                          cursor: 'pointer', transition: 'all 0.18s',
                          boxShadow: active ? `0 0 12px ${b.color}35` : 'none',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, outline: 'none',
                        }} title={b.label}>
                          <div style={{
                            borderRadius: 5, overflow: 'hidden',
                            boxShadow: active ? `0 0 8px ${b.color}50` : 'none',
                            opacity: active ? 1 : 0.55, transition: 'opacity 0.18s', lineHeight: 0,
                          }}>
                            {BRAND_ICON[b.id]}
                          </div>
                          <span style={{
                            fontSize: 9, fontWeight: active ? 700 : 500,
                            color: active ? b.color : '#94a3b8', letterSpacing: 0.3,
                          }}>{b.label}</span>
                        </button>
                      )
                    })}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <span style={LABEL}>Last 4 Digits</span>
                      <input type="text" inputMode="numeric" maxLength={4}
                        value={cardLast4}
                        onChange={e => setCardLast4(e.target.value.replace(/\D/g, ''))}
                        placeholder="0000"
                        style={{ ...INPUT, letterSpacing: 6, fontSize: 18, textAlign: 'center', fontWeight: 700 }}
                      />
                    </div>
                    <div>
                      <span style={LABEL}>Authorization #</span>
                      <input type="text" value={authNumber}
                        onChange={e => setAuthNumber(e.target.value)}
                        placeholder="Auth code"
                        style={INPUT}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ── EXTERNAL sub-fields ── */}
              {method === 'external' && (
                <>
                  <span style={LABEL}>Reference / App (optional)</span>
                  <input type="text" value={extRef}
                    onChange={e => setExtRef(e.target.value)}
                    placeholder="Venmo, Zelle, transaction ref…"
                    style={INPUT}
                  />
                </>
              )}

              {/* ── CHECK sub-fields ── */}
              {method === 'check' && (
                <>
                  <span style={LABEL}>Check Number (optional)</span>
                  <input type="text" value={checkNumber}
                    onChange={e => setCheckNumber(e.target.value)}
                    placeholder="e.g. 1042"
                    style={{ ...INPUT, letterSpacing: 2, fontWeight: 600 }}
                  />
                  <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>
                    Make check payable to: <b style={{ color: '#cbd0e0' }}>Perfume Passage</b>
                  </p>
                </>
              )}
            </div>

            {/* Add Payment button */}
            <button
              onClick={addPayment}
              disabled={!canAdd}
              style={{
                width: '100%', padding: '13px',
                borderRadius: 10, marginBottom: 14,
                background: canAdd
                  ? `linear-gradient(135deg, ${activeColor} 0%, ${activeColor}cc 100%)`
                  : '#0b1426',
                border: canAdd ? 'none' : '1px solid #253349',
                color: canAdd ? '#fff' : '#415569',
                fontSize: 14, fontWeight: 700,
                cursor: canAdd ? 'pointer' : 'not-allowed',
                boxShadow: canAdd ? `0 0 18px ${activeColor}35` : 'none',
                transition: 'all 0.2s',
              }}
            >
              {canAdd
                ? `+ Add ${entryAmt.toFixed(2)} — ${METHODS.find(m => m.id === method)?.label}`
                : `Fill in payment details to add`}
            </button>
          </>
        )}

        {/* ── Customer link ── */}
        <div style={{ marginBottom: 14, position: 'relative' }}>
          <span style={LABEL}>Link Customer (optional)</span>
          {linkedCustomer ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', background: '#0b1426',
              border: '1px solid #3b82f640', borderRadius: 8,
            }}>
              <div>
                <span style={{ color: '#f1f5f9', fontSize: 14, fontWeight: 600 }}>
                  {linkedCustomer.firstName} {linkedCustomer.lastName}
                </span>
                {linkedCustomer.phone && (
                  <span style={{ color: '#94a3b8', fontSize: 12, marginLeft: 10 }}>{linkedCustomer.phone}</span>
                )}
              </div>
              <button onClick={() => { setLinkedCustomer(null); setCustSearch('') }}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
            </div>
          ) : (
            <>
              <input type="text" value={custSearch}
                onChange={e => { setCustSearch(e.target.value); setShowCustDropdown(true) }}
                onFocus={() => setShowCustDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustDropdown(false), 150)}
                placeholder="Search by name or phone…"
                style={INPUT}
              />
              {showCustDropdown && custResults.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: '#0d1829', border: '1px solid #253349',
                  borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.6)', marginTop: 4,
                }}>
                  {custResults.map(c => (
                    <button key={c.id}
                      onMouseDown={() => { setLinkedCustomer(c); setCustSearch(''); setShowCustDropdown(false) }}
                      style={{
                        display: 'block', width: '100%', padding: '10px 14px',
                        textAlign: 'left', background: 'transparent',
                        border: 'none', borderBottom: '1px solid #253349',
                        color: '#f1f5f9', fontSize: 13, cursor: 'pointer',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#111d30'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <span style={{ fontWeight: 600 }}>{c.firstName} {c.lastName}</span>
                      {c.phone && <span style={{ color: '#94a3b8', marginLeft: 10, fontSize: 12 }}>{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Notes ── */}
        <div style={{ marginBottom: 18 }}>
          <span style={LABEL}>Notes (optional)</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Add a note to this sale…"
            rows={2}
            style={{ ...INPUT, resize: 'vertical' }}
          />
        </div>

        {/* ── Action buttons (only active when paid in full) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <ActionButton label="🖨 Print Receipt"  disabled={!canConfirm} primary onClick={() => onConfirm(buildPayload('print'))} />
            <ActionButton label="✉ Email"           disabled={!canConfirm}         onClick={() => onConfirm(buildPayload('email'))} />
            <ActionButton label="🖨+✉ Both"         disabled={!canConfirm}         onClick={() => onConfirm(buildPayload('both'))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={!canConfirm}
              onClick={() => onConfirm(buildPayload('none'))}
              style={{
                flex: 1, padding: '10px 8px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid #253349',
                color: canConfirm ? '#94a3b8' : '#415569',
                fontSize: 12, fontWeight: 500,
                cursor: canConfirm ? 'pointer' : 'not-allowed',
              }}
            >✓ Confirm (no receipt)</button>
            <button onClick={onCancel} style={{
              flex: 1, padding: '10px 8px', borderRadius: 8,
              background: 'rgba(255,255,255,0.02)', border: '1px solid #253349',
              color: '#94a3b8', fontSize: 12, cursor: 'pointer',
            }}>Cancel</button>
          </div>
          {!canConfirm && payments.length === 0 && (
            <p style={{ color: '#415569', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
              Add at least one payment to complete this sale
            </p>
          )}
          {!canConfirm && remaining > 0 && payments.length > 0 && (
            <p style={{ color: '#ef4444', fontSize: 11, textAlign: 'center', marginTop: 2 }}>
              ⚠ ${remaining.toFixed(2)} still remaining — add another payment method
            </p>
          )}
        </div>

      </div>
    </div>
  )
}

// ── Helper button ─────────────────────────────────────────────────────────────
function ActionButton({ label, disabled, primary, onClick }) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      flex: 1, padding: '13px 6px', borderRadius: 10,
      background: disabled ? '#0b1426' : primary
        ? 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)' : '#0b1426',
      border: disabled ? '1px solid #253349' : primary ? 'none' : '1px solid #253349',
      color: disabled ? '#415569' : primary ? '#fff' : '#cbd0e0',
      fontSize: 13, fontWeight: primary ? 700 : 600,
      cursor: disabled ? 'not-allowed' : 'pointer',
      boxShadow: !disabled && primary ? '0 0 20px rgba(37,99,235,0.38)' : 'none',
      transition: 'all 0.18s',
    }}>{label}</button>
  )
}
