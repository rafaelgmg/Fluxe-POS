import { useState } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { verifyEmployeePin } from '../services/supabaseAuth'
import { updateEmployeePin } from '../services/supabaseWrite'

const BLUE  = '#3b82f6'
const GREEN = '#22c55e'
const RED   = '#ef4444'

const NUM_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']
const MIN_PIN  = 4
const MAX_PIN  = 6

export default function ChangePinModal({ preselectedName = '', onClose }) {
  const employees = loadActiveEmployees()

  const [step,     setStep]     = useState(1) // 1 = verify identity, 2 = set new PIN
  const [name,     setName]     = useState(preselectedName || employees[0]?.name || '')
  const [pin,      setPin]      = useState('')
  const [newPin,   setNewPin]   = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [phase,    setPhase]    = useState('new') // 'new' | 'confirm'
  const [busy,     setBusy]     = useState(false)
  const [error,    setError]    = useState('')
  const [success,  setSuccess]  = useState(false)

  // Which PIN buffer is currently being typed
  const activePin   = step === 1 ? pin   : phase === 'new' ? newPin  : confirm
  const setActive   = step === 1
    ? v => { setPin(v); setError('') }
    : phase === 'new'
      ? v => { setNewPin(v); setError('') }
      : v => { setConfirm(v); setError('') }

  const handleKey = (val) => {
    if (busy) return
    if (val === '⌫') { setActive(p => p.slice(0, -1)); return }
    if (activePin.length >= MAX_PIN) return
    setActive(p => p + val)
  }

  // ── Step 1: verify current PIN ───────────────────────────────────────────────
  const handleVerify = async () => {
    if (busy || pin.length < MIN_PIN) return
    setBusy(true)
    try {
      const result = await verifyEmployeePin(name, pin)
      if (result) {
        setStep(2)
        setPin('')
        setError('')
      } else {
        setError('Incorrect PIN — try again')
        setPin('')
      }
    } catch {
      setError('Verification failed — try again')
      setPin('')
    } finally {
      setBusy(false)
    }
  }

  // ── Step 2: set new PIN ──────────────────────────────────────────────────────
  const handleNewPin = () => {
    if (newPin.length < MIN_PIN) { setError(`PIN must be at least ${MIN_PIN} digits`); return }
    setPhase('confirm')
    setError('')
  }

  const handleConfirm = async () => {
    if (busy) return
    if (confirm !== newPin) { setError('PINs do not match — try again'); setConfirm(''); return }
    setBusy(true)
    try {
      await updateEmployeePin(name, newPin)
      setSuccess(true)
    } catch (e) {
      setError('Failed to save — try again')
    } finally {
      setBusy(false)
    }
  }

  const handlePrimary = () => {
    if (step === 1)                  return handleVerify()
    if (step === 2 && phase === 'new') return handleNewPin()
    if (step === 2 && phase === 'confirm') return handleConfirm()
  }

  const canProceed = step === 1
    ? pin.length >= MIN_PIN
    : phase === 'new'
      ? newPin.length >= MIN_PIN
      : confirm.length >= MIN_PIN

  // ── Labels ───────────────────────────────────────────────────────────────────
  const stepLabel = step === 1
    ? 'Enter current PIN to verify your identity'
    : phase === 'new'
      ? 'Enter your new PIN'
      : 'Enter new PIN again to confirm'

  const primaryLabel = busy
    ? '…'
    : step === 1
      ? 'Verify'
      : phase === 'new'
        ? 'Continue'
        : 'Save New PIN'

  // ── Dots display ─────────────────────────────────────────────────────────────
  const dots = Array.from({ length: MAX_PIN }, (_, i) => ({
    filled: i < activePin.length,
  }))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--c-bg-panel)', border: '1px solid var(--c-border)',
        borderRadius: 10, width: 380, padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(59,130,246,0.15)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
          }}>🔑</div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Change PIN</h2>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 1 }}>{stepLabel}</p>
          </div>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          {[1, 2].map(s => (
            <div key={s} style={{
              flex: 1, height: 3, borderRadius: 2,
              background: s <= step ? BLUE : 'var(--c-border)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Success screen */}
        {success ? (
          <div style={{ textAlign: 'center', padding: '12px 0 8px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>PIN updated!</p>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 12, marginBottom: 24 }}>
              Your new PIN is active. Use it on your next login.
            </p>
            <button
              onClick={onClose}
              style={{
                width: '100%', padding: '12px', background: BLUE,
                border: 'none', borderRadius: 6, color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}
            >Done</button>
          </div>
        ) : (
          <>
            {/* Employee select — only on step 1 */}
            {step === 1 && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
                  SELECT EMPLOYEE
                </label>
                <select
                  value={name}
                  onChange={e => { setName(e.target.value); setPin(''); setError(''); e.target.blur() }}
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
                    border: '1px solid var(--c-border-md)', borderRadius: 6,
                    color: 'var(--c-text)', fontSize: 13, outline: 'none', cursor: 'pointer',
                  }}
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.name}>{e.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Phase label on step 2 */}
            {step === 2 && (
              <p style={{ color: 'var(--c-text-sub)', fontSize: 12, marginBottom: 14, textAlign: 'center' }}>
                {phase === 'new' ? `Changing PIN for ${name}` : 'Confirm your new PIN'}
              </p>
            )}

            {/* PIN dots */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 14 }}>
              {dots.map((d, i) => (
                <div key={i} style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: d.filled
                    ? (step === 2 && phase === 'confirm' ? GREEN : BLUE)
                    : 'var(--c-bg-card)',
                  border: `2px solid ${d.filled
                    ? (step === 2 && phase === 'confirm' ? GREEN : BLUE)
                    : 'var(--c-border-md)'}`,
                  transition: 'all 0.15s',
                }} />
              ))}
            </div>

            {/* Error */}
            {error && (
              <p style={{ color: RED, fontSize: 11, marginBottom: 10, textAlign: 'center' }}>{error}</p>
            )}

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 18 }}>
              {NUM_KEYS.map((k, i) => (
                <button
                  key={i}
                  onClick={() => { if (k) handleKey(k) }}
                  disabled={!k || busy}
                  style={{
                    padding: '13px', background: !k ? 'transparent' : 'var(--c-bg-card)',
                    border: !k ? 'none' : '1px solid var(--c-border-md)', borderRadius: 7,
                    color: k === '⌫' ? 'var(--c-text-muted)' : 'var(--c-text)',
                    fontSize: k === '⌫' ? 16 : 18,
                    fontWeight: 700, cursor: (!k || busy) ? 'default' : 'pointer',
                    opacity: !k ? 0 : busy ? 0.5 : 1, transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { if (k && !busy) { e.currentTarget.style.background = 'var(--c-bg-hover)' } }}
                  onMouseLeave={e => { if (k && !busy) { e.currentTarget.style.background = 'var(--c-bg-card)' } }}
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handlePrimary}
                disabled={!canProceed || busy}
                style={{
                  flex: 1, padding: '12px',
                  background: (canProceed && !busy) ? BLUE : 'var(--c-bg-card)',
                  border: (canProceed && !busy) ? 'none' : '1px solid var(--c-border)',
                  borderRadius: 6, color: (canProceed && !busy) ? '#fff' : 'var(--c-text-muted)',
                  fontSize: 14, fontWeight: 700,
                  cursor: (!canProceed || busy) ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {primaryLabel}
              </button>
              <button
                onClick={onClose}
                disabled={busy}
                style={{
                  flex: 1, padding: '12px',
                  background: 'transparent', border: '1px solid var(--c-border-md)',
                  borderRadius: 6, color: 'var(--c-text-sub)', fontSize: 14,
                  cursor: busy ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { if (!busy) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.color = 'var(--c-text)' } }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
