import { useState, useMemo } from 'react'
import { loadUsers } from '../utils/usersStorage'

const BLUE  = '#3b82f6'
const AMBER = '#f59e0b'
const GREEN = '#22c55e'
const BG    = 'var(--c-bg)'
const PANEL = 'var(--c-bg-panel)'
const CARD  = 'var(--c-bg-card)'
const BORDER= 'var(--c-border)'
const TEXT  = 'var(--c-text)'
const MUTED = 'var(--c-text-muted)'
const RED   = '#ef4444'

const fmt$ = n => '$' + (+(n || 0)).toFixed(2)

function getLocCfg(locationName) {
  try {
    const locs = JSON.parse(localStorage.getItem('fluxe-locations-v1') || '[]')
    return locs.find(l => l.name === locationName) || {}
  } catch { return {} }
}

function StepHeader({ icon, bg, title, sub, authorizedBy, onClose }) {
  return (
    <div style={{
      padding: '14px 20px', background: CARD, borderRadius: '12px 12px 0 0',
      borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center',
      gap: 12, flexShrink: 0,
    }}>
      <div style={{
        width: 34, height: 34, background: bg,
        border: `1px solid ${bg.replace('0.15', '0.35')}`,
        borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
      }}>{icon}</div>
      <div>
        <p style={{ color: TEXT, fontWeight: 800, fontSize: 15 }}>{title}</p>
        <p style={{ color: MUTED, fontSize: 11 }}>{sub}</p>
      </div>
      {authorizedBy && (
        <span style={{
          marginLeft: 'auto', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: GREEN,
        }}>✓ {authorizedBy}</span>
      )}
      <button onClick={onClose} style={{
        marginLeft: authorizedBy ? 8 : 'auto', background: 'none', border: `1px solid ${BORDER}`,
        borderRadius: 6, color: MUTED, fontSize: 18, cursor: 'pointer',
        width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>×</button>
    </div>
  )
}

function Footer({ onBack, backLabel = '← Back', children }) {
  return (
    <div style={{
      padding: '14px 20px', borderTop: `1px solid ${BORDER}`,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexShrink: 0,
    }}>
      <button onClick={onBack} style={{
        padding: '9px 16px', background: 'transparent',
        border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer',
      }}>{backLabel}</button>
      {children}
    </div>
  )
}

/**
 * 3-step refund wizard.
 *
 * Steps:
 *   auth  — Manager/Admin PIN gate (only if requireRefundAuth = true in Location Settings)
 *   type  — Full invoice or some products
 *   items — Item selection (partial only)
 *   review— Payment method + confirm
 *
 * onConfirm receives:
 *   { type, items, refundMethod, subtotal, tax, total, authorizedBy, refundId }
 */
export function RefundModal({ invoice, onClose, onConfirm }) {
  const locCfg      = useMemo(() => getLocCfg(invoice.location), [invoice.location])
  const requireAuth = locCfg.requireRefundAuth ?? false
  const taxRate     = (locCfg.taxRate ?? 8.5) / 100

  const [step, setStep]               = useState(requireAuth ? 'auth' : 'type')
  const [pin, setPin]                 = useState('')
  const [pinError, setPinError]       = useState('')
  const [authorizedBy, setAuthorizedBy] = useState(null)
  const [refundType, setRefundType]   = useState(null)

  // Item selection map for partial refunds
  const baseItems = useMemo(() => {
    const map = {}
    ;(invoice.items || []).forEach((item, idx) => {
      const lineId = item.lineId || `${invoice.number}-${idx + 1}`
      map[lineId] = {
        lineId,
        name:      item.name      || 'Unknown',
        size:      item.size      || '',
        maxQty:    item.qty       || 1,
        qty:       item.qty       || 1,
        salePrice: item.salePrice || 0,
        productId: item.productId || null,
        checked:   false,
      }
    })
    return map
  }, [invoice])
  const [selItems, setSelItems] = useState(baseItems)

  const [refundMethod, setRefundMethod] = useState('original')
  const [methodOther, setMethodOther]   = useState('')

  const selectedCount = useMemo(() =>
    Object.values(selItems).filter(i => i.checked).length,
  [selItems])

  const { refundSubtotal, refundTax, refundTotal } = useMemo(() => {
    if (refundType === 'full') {
      return { refundSubtotal: invoice.subtotal || 0, refundTax: invoice.tax || 0, refundTotal: invoice.total || 0 }
    }
    const items = Object.values(selItems).filter(i => i.checked)
    const sub   = items.reduce((acc, i) => acc + (i.salePrice * i.qty), 0)
    return { refundSubtotal: sub, refundTax: sub * taxRate, refundTotal: sub + sub * taxRate }
  }, [refundType, selItems, invoice, taxRate])

  const origPayment = useMemo(() => {
    if (Array.isArray(invoice.payments) && invoice.payments.length > 1)
      return invoice.payments.map(p => `${p.method}${p.cardBrand ? ` (${p.cardBrand})` : ''}`).join(' + ')
    return invoice.paymentMethod || 'Unknown'
  }, [invoice])

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleAuth = () => {
    if (!pin) { setPinError('Enter your PIN'); return }
    const match = loadUsers().find(u =>
      (u.role === 'manager' || u.role === 'admin') &&
      String(u.pin) === String(pin) &&
      u.status !== 'inactive'
    )
    if (match) {
      setAuthorizedBy(match.name)
      setPinError('')
      setStep('type')
    } else {
      setPinError('Incorrect PIN or insufficient permissions')
      setPin('')
    }
  }

  const toggleItem = lineId => setSelItems(prev => ({
    ...prev, [lineId]: { ...prev[lineId], checked: !prev[lineId].checked },
  }))

  const setQty = (lineId, qty) => setSelItems(prev => ({
    ...prev,
    [lineId]: { ...prev[lineId], qty: Math.max(1, Math.min(prev[lineId].maxQty, parseInt(qty) || 1)) },
  }))

  const handleConfirm = () => {
    const refundedItems = refundType === 'full'
      ? (invoice.items || []).map(item => ({
          lineId:    item.lineId, name: item.name || '',
          qty:       item.qty   || 1,
          salePrice: item.salePrice || 0,
          productId: item.productId || null,
        }))
      : Object.values(selItems).filter(i => i.checked).map(i => ({
          lineId: i.lineId, name: i.name, qty: i.qty,
          salePrice: i.salePrice, productId: i.productId,
        }))

    const method = refundMethod === 'other'
      ? (methodOther.trim() || 'Other')
      : refundMethod === 'cash' ? 'Cash' : origPayment

    onConfirm({
      type:          refundType,
      items:         refundedItems,
      refundMethod:  method,
      subtotal:      refundSubtotal,
      tax:           refundTax,
      total:         refundTotal,
      authorizedBy:  authorizedBy || null,
      refundId:      `${invoice.number}-R${Date.now()}`,
    })
  }

  // ── Shared layout tokens ──────────────────────────────────────────────────────
  const overlay = {
    position: 'fixed', inset: 0, background: 'var(--c-overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1300, backdropFilter: 'blur(4px)', padding: 20,
  }
  const panel = (maxW = 620) => ({
    background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
    width: '100%', maxWidth: maxW, maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
  })
  const body = { flex: 1, overflowY: 'auto', padding: 24 }

  // ── AUTH STEP ─────────────────────────────────────────────────────────────────
  if (step === 'auth') return (
    <div style={overlay}>
      <div style={panel(400)}>
        <StepHeader
          icon="🔐" bg="rgba(245,158,11,0.15)"
          title="Authorization Required"
          sub={`Invoice #${invoice.number} · ${invoice.location}`}
          onClose={onClose}
        />
        <div style={{ ...body, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            padding: '14px 16px', background: 'rgba(245,158,11,0.07)',
            border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8,
          }}>
            <p style={{ color: AMBER, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
              Manager / Admin PIN Required
            </p>
            <p style={{ color: MUTED, fontSize: 11, lineHeight: 1.6 }}>
              Refunds at this location require authorization. Enter the PIN of a Manager or Admin to proceed.
            </p>
          </div>
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
              AUTHORIZATION PIN
            </label>
            <input
              type="password" inputMode="numeric"
              value={pin}
              onChange={e => { setPin(e.target.value); setPinError('') }}
              onKeyDown={e => e.key === 'Enter' && handleAuth()}
              placeholder="Enter PIN..."
              autoFocus
              style={{
                width: '100%', padding: '10px 12px', background: BG,
                border: `1px solid ${pinError ? RED : BORDER}`, borderRadius: 6,
                color: TEXT, fontSize: 16, outline: 'none', letterSpacing: 4,
                boxSizing: 'border-box',
              }}
            />
            {pinError && <p style={{ color: RED, fontSize: 11, marginTop: 6 }}>{pinError}</p>}
          </div>
        </div>
        <Footer onBack={onClose} backLabel="Cancel">
          <button
            onClick={handleAuth}
            disabled={!pin}
            style={{
              padding: '9px 20px', background: pin ? AMBER : 'var(--c-border)',
              border: 'none', borderRadius: 7,
              color: pin ? '#000' : MUTED,
              fontSize: 13, fontWeight: 700, cursor: pin ? 'pointer' : 'not-allowed',
            }}
          >Authorize →</button>
        </Footer>
      </div>
    </div>
  )

  // ── STEP 1: TYPE ─────────────────────────────────────────────────────────────
  if (step === 'type') return (
    <div style={overlay}>
      <div style={panel()}>
        <StepHeader
          icon="↩️" bg="rgba(245,158,11,0.15)"
          title={`Refund Invoice #${invoice.number}`}
          sub="Step 1 — Select refund type"
          authorizedBy={authorizedBy}
          onClose={onClose}
        />
        <div style={{ ...body, display: 'flex', gap: 16 }}>
          {[
            {
              type: 'full', icon: '🧾', color: AMBER,
              title: 'Refund Entire Invoice',
              desc: `Full refund — ${fmt$(invoice.total)} will be returned. All items restored to inventory.`,
            },
            {
              type: 'partial', icon: '📦', color: BLUE,
              title: 'Refund Some Products',
              desc: 'Choose which items to refund. Only the selected items are restored to inventory.',
            },
          ].map(opt => (
            <button
              key={opt.type}
              onClick={() => { setRefundType(opt.type); setStep(opt.type === 'full' ? 'review' : 'items') }}
              style={{
                flex: 1, padding: '28px 20px', background: CARD,
                border: `2px solid ${BORDER}`, borderRadius: 10, cursor: 'pointer',
                textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = opt.color; e.currentTarget.style.background = `${opt.color}0A` }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.background = CARD }}
            >
              <div style={{ fontSize: 36, marginBottom: 14 }}>{opt.icon}</div>
              <p style={{ color: TEXT, fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{opt.title}</p>
              <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.6 }}>{opt.desc}</p>
            </button>
          ))}
        </div>
        <Footer onBack={requireAuth ? () => setStep('auth') : onClose} backLabel={requireAuth ? '← Back' : 'Cancel'}>
          <span style={{ color: MUTED, fontSize: 11 }}>Select an option to continue</span>
        </Footer>
      </div>
    </div>
  )

  // ── STEP 2: ITEM SELECTION ────────────────────────────────────────────────────
  if (step === 'items') return (
    <div style={overlay}>
      <div style={panel(700)}>
        <StepHeader
          icon="📦" bg="rgba(59,130,246,0.15)"
          title="Select Items to Refund"
          sub={`Step 2 — Invoice #${invoice.number} · ${selectedCount > 0 ? `${selectedCount} selected · ${fmt$(refundTotal)}` : 'Click items to select'}`}
          onClose={onClose}
        />
        <div style={body}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                <th style={{ width: 36, paddingBottom: 8 }} />
                <th style={{ textAlign: 'left', color: MUTED, fontWeight: 600, fontSize: 11, letterSpacing: 0.3, paddingBottom: 8 }}>PRODUCT</th>
                <th style={{ textAlign: 'center', color: MUTED, fontWeight: 600, fontSize: 11, letterSpacing: 0.3, paddingBottom: 8, width: 90 }}>QTY</th>
                <th style={{ textAlign: 'right', color: MUTED, fontWeight: 600, fontSize: 11, letterSpacing: 0.3, paddingBottom: 8, paddingRight: 8, width: 90 }}>UNIT</th>
                <th style={{ textAlign: 'right', color: MUTED, fontWeight: 600, fontSize: 11, letterSpacing: 0.3, paddingBottom: 8, width: 90 }}>REFUND</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(selItems).map(item => (
                <tr
                  key={item.lineId}
                  onClick={() => toggleItem(item.lineId)}
                  style={{
                    borderBottom: `1px solid ${BORDER}`, cursor: 'pointer',
                    background: item.checked ? `${BLUE}08` : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <td style={{ padding: '10px 8px 10px 0', verticalAlign: 'middle' }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: 4,
                      border: `2px solid ${item.checked ? BLUE : BORDER}`,
                      background: item.checked ? BLUE : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {item.checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                    </div>
                  </td>
                  <td style={{ padding: '10px 0', verticalAlign: 'middle' }}>
                    <p style={{ color: TEXT, fontWeight: 600 }}>{item.name}</p>
                    {item.size && <p style={{ color: MUTED, fontSize: 11 }}>{item.size}</p>}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'middle' }} onClick={e => e.stopPropagation()}>
                    {item.checked && item.maxQty > 1 ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button onClick={() => setQty(item.lineId, item.qty - 1)} style={{
                          width: 22, height: 22, background: BG, border: `1px solid ${BORDER}`,
                          borderRadius: 4, color: TEXT, fontSize: 14, cursor: 'pointer', lineHeight: 1,
                        }}>−</button>
                        <span style={{ color: TEXT, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.qty}</span>
                        <button onClick={() => setQty(item.lineId, item.qty + 1)} style={{
                          width: 22, height: 22, background: BG, border: `1px solid ${BORDER}`,
                          borderRadius: 4, color: TEXT, fontSize: 14, cursor: 'pointer', lineHeight: 1,
                        }}>+</button>
                      </div>
                    ) : (
                      <span style={{ color: item.checked ? TEXT : MUTED, fontWeight: item.checked ? 700 : 400 }}>
                        {item.qty}
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 8px', color: MUTED, verticalAlign: 'middle' }}>
                    {fmt$(item.salePrice)}
                  </td>
                  <td style={{ textAlign: 'right', padding: '10px 0', verticalAlign: 'middle',
                    color: item.checked ? AMBER : MUTED, fontWeight: item.checked ? 700 : 400 }}>
                    {item.checked ? fmt$(item.salePrice * item.qty) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {selectedCount > 0 && (
            <div style={{
              marginTop: 16, padding: '12px 16px', background: `${AMBER}0A`,
              border: `1px solid ${AMBER}30`, borderRadius: 8,
              display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
            }}>
              {[['Subtotal', fmt$(refundSubtotal), false], ['Tax', fmt$(refundTax), false], ['Total Refund', fmt$(refundTotal), true]].map(([l, v, big]) => (
                <div key={l}>
                  <p style={{ color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{l}</p>
                  <p style={{ color: big ? AMBER : TEXT, fontSize: big ? 18 : 14, fontWeight: 700 }}>{v}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <Footer onBack={() => setStep('type')}>
          <button
            onClick={() => setStep('review')}
            disabled={selectedCount === 0}
            style={{
              padding: '9px 20px',
              background: selectedCount > 0 ? BLUE : 'var(--c-border)',
              border: 'none', borderRadius: 7,
              color: selectedCount > 0 ? '#fff' : MUTED,
              fontSize: 13, fontWeight: 700,
              cursor: selectedCount > 0 ? 'pointer' : 'not-allowed',
            }}
          >Next →</button>
        </Footer>
      </div>
    </div>
  )

  // ── STEP 3: REVIEW + METHOD ───────────────────────────────────────────────────
  if (step === 'review') {
    const methods = [
      { id: 'original', label: 'Original Payment', desc: origPayment, icon: '↩️' },
      { id: 'cash',     label: 'Cash',             desc: 'Refund the full amount in cash', icon: '💵' },
      { id: 'other',    label: 'Other',             desc: 'Specify another method', icon: '📝' },
    ]

    return (
      <div style={overlay}>
        <div style={panel(580)}>
          <StepHeader
            icon="💳" bg="rgba(245,158,11,0.15)"
            title="Review & Refund Method"
            sub={`Step ${refundType === 'partial' ? '3' : '2'} — Invoice #${invoice.number}`}
            authorizedBy={authorizedBy}
            onClose={onClose}
          />
          <div style={{ ...body, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Summary */}
            <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>REFUND SUMMARY</p>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                {[
                  ['Type',     refundType === 'full' ? 'Full Invoice' : `${selectedCount} item${selectedCount !== 1 ? 's' : ''}`],
                  ['Subtotal', fmt$(refundSubtotal)],
                  ['Tax',      fmt$(refundTax)],
                  ['Total',    fmt$(refundTotal)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <p style={{ color: MUTED, fontSize: 10, marginBottom: 2 }}>{l}</p>
                    <p style={{ color: l === 'Total' ? AMBER : TEXT, fontSize: l === 'Total' ? 20 : 14, fontWeight: 700 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment method */}
            <div>
              <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>REFUND METHOD</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {methods.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setRefundMethod(m.id)}
                    style={{
                      padding: '12px 14px', background: CARD,
                      border: `2px solid ${refundMethod === m.id ? AMBER : BORDER}`,
                      borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 12,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      border: `2px solid ${refundMethod === m.id ? AMBER : BORDER}`,
                      background: refundMethod === m.id ? AMBER : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}>
                      {refundMethod === m.id && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#000' }} />}
                    </div>
                    <span style={{ fontSize: 16 }}>{m.icon}</span>
                    <div>
                      <p style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>{m.label}</p>
                      <p style={{ color: MUTED, fontSize: 11 }}>{m.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              {refundMethod === 'other' && (
                <input
                  type="text" value={methodOther} onChange={e => setMethodOther(e.target.value)}
                  placeholder="e.g. Store credit, exchange..."
                  autoFocus
                  style={{
                    marginTop: 10, width: '100%', padding: '9px 12px', background: BG,
                    border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
                    fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          </div>
          <Footer onBack={() => setStep(refundType === 'partial' ? 'items' : 'type')}>
            <button
              onClick={handleConfirm}
              style={{
                padding: '10px 24px',
                background: `${AMBER}20`, border: `2px solid ${AMBER}`,
                borderRadius: 7, color: AMBER, fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}
            >↩️ Confirm Refund · {fmt$(refundTotal)}</button>
          </Footer>
        </div>
      </div>
    )
  }

  return null
}
