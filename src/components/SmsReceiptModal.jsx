import { useState, useEffect } from 'react'

const SERVER_URL = 'http://localhost:3001'
const STORE_NAME = 'Perfume Passage'

const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const TEXT   = '#f1f5f9'
const SUB    = '#cbd0e0'
const MUTED  = '#94a3b8'
const DIM    = '#415569'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'

function fmtPhone(p) {
  if (!p) return ''
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

function buildReceiptSms(invoice) {
  const items    = invoice.items || []
  const shown    = items.slice(0, 4)
  const extra    = items.length - shown.length
  const itemLines = shown.map(i => {
    const name  = i.product?.name || i.name || 'Item'
    const price = (i.subtotal != null ? i.subtotal : (i.salePrice || 0) * (i.qty || 1))
    return `${name} x${i.qty || 1} — $${price.toFixed(2)}`
  })
  if (extra > 0) itemLines.push(`+${extra} more item${extra > 1 ? 's' : ''}`)

  const payMethod = invoice.paymentMethod
    ? invoice.paymentMethod.charAt(0).toUpperCase() + invoice.paymentMethod.slice(1)
    : 'Paid'

  return [
    `${STORE_NAME} — Receipt #${invoice.number}`,
    ...itemLines,
    `Total: $${invoice.total.toFixed(2)} (${payMethod})`,
    `Thank you for shopping with us! 🧴`,
  ].join('\n')
}

function smsSegments(text) {
  const len = text.length
  if (len === 0) return 0
  return len <= 160 ? 1 : Math.ceil(len / 153)
}

export default function SmsReceiptModal({ invoice, defaultPhone = '', onClose }) {
  const [phone,     setPhone]     = useState(defaultPhone)
  const [state,     setState]     = useState('idle')  // idle | checking | sending | sent | error | noclient
  const [errorMsg,  setErrorMsg]  = useState('')
  const [twilioOk,  setTwilioOk]  = useState(null)

  const message  = buildReceiptSms(invoice)
  const segments = smsSegments(message)
  const phoneNorm = phone.replace(/\D/g, '')
  const canSend  = phoneNorm.length >= 7 && twilioOk && state === 'idle'

  useEffect(() => {
    fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(2500) })
      .then(r => r.json())
      .then(d => setTwilioOk(!!d.twilio))
      .catch(() => setTwilioOk(false))
  }, [])

  const handleSend = async () => {
    if (!canSend) return
    setState('sending')
    try {
      const res = await fetch(`${SERVER_URL}/api/sms/send`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          phone,
          firstName: invoice.customerFirstName || '',
          message,
          raw:    true,
          dryRun: false,
          channel: 'sms',
        }),
      })
      if (res.status === 403) {
        setState('error')
        setErrorMsg('This number has opted out of SMS messages.')
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setState('error')
        setErrorMsg(err.error || 'Failed to send. Try again.')
      } else {
        setState('sent')
      }
    } catch (err) {
      setState('error')
      setErrorMsg(err.message || 'Server unreachable.')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 2200, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
        width: 440, display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>📱</span>
            <div>
              <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Send Receipt by SMS</h3>
              <p style={{ color: MUTED, fontSize: 12, marginTop: 1 }}>
                Invoice #{invoice.number} · ${invoice.total.toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Success state */}
          {state === 'sent' && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 40, marginBottom: 8 }}>✅</p>
              <p style={{ color: GREEN, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Receipt sent!</p>
              <p style={{ color: MUTED, fontSize: 13 }}>Delivered to {fmtPhone(phone)}</p>
            </div>
          )}

          {/* Idle / error state */}
          {state !== 'sent' && (
            <>
              {/* Receipt preview */}
              <div>
                <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>
                  MESSAGE PREVIEW
                  <span style={{ color: DIM, fontWeight: 400, marginLeft: 6 }}>{message.length} chars · {segments} SMS</span>
                </label>
                <div style={{
                  background: BG, border: `1px solid ${BORDER}`, borderRadius: 8,
                  padding: '10px 12px', fontFamily: 'monospace', fontSize: 12,
                  color: SUB, lineHeight: 1.7, whiteSpace: 'pre-wrap',
                }}>
                  {message}
                </div>
              </div>

              {/* Phone input */}
              <div>
                <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>
                  CUSTOMER PHONE
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => { setPhone(e.target.value); if (state === 'error') setState('idle') }}
                  placeholder="702-555-1234"
                  disabled={state === 'sending'}
                  style={{
                    width: '100%', padding: '10px 12px', background: CARD,
                    border: `1px solid ${state === 'error' ? RED : BORDER}`,
                    borderRadius: 7, color: TEXT, fontSize: 14,
                    outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.target.style.borderColor = BLUE }}
                  onBlur={e => { e.target.style.borderColor = state === 'error' ? RED : BORDER }}
                  autoFocus={!defaultPhone}
                />
                {state === 'error' && (
                  <p style={{ color: RED, fontSize: 12, marginTop: 5 }}>⚠ {errorMsg}</p>
                )}
              </div>

              {/* Twilio status */}
              {twilioOk === false && (
                <div style={{
                  padding: '10px 14px', background: `${AMBER}0a`,
                  border: `1px solid ${AMBER}33`, borderRadius: 8,
                }}>
                  <p style={{ color: AMBER, fontSize: 12, fontWeight: 600 }}>⚠ Twilio not configured</p>
                  <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>
                    SMS sending is disabled until Twilio is set up in server/.env.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: `1px solid ${BORDER}`,
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 20px', background: 'transparent',
              border: `1px solid ${BORDER}`, borderRadius: 7,
              color: MUTED, fontSize: 13, cursor: 'pointer',
            }}
          >{state === 'sent' ? 'Close' : 'Skip'}</button>

          {state !== 'sent' && (
            <button
              onClick={handleSend}
              disabled={!canSend || state === 'sending'}
              style={{
                padding: '9px 24px', borderRadius: 7, fontSize: 13, fontWeight: 700,
                cursor: canSend && state === 'idle' ? 'pointer' : 'not-allowed',
                background: canSend ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(59,130,246,0.08)',
                border: 'none',
                color: canSend ? '#fff' : DIM,
                boxShadow: canSend ? '0 0 16px rgba(59,130,246,0.3)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {state === 'sending' ? 'Sending...' : '📱 Send Receipt'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
