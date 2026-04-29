/**
 * LockScreen.jsx
 *
 * Tela de bloqueio de estação (Lock Station).
 *
 * - Renderizado sobre o POS inteiro (z-index 9000)
 * - Não encerra sessão nem perde carrinho — só bloqueia a UI
 * - Unlock via usuário ativo + PIN real (loadActiveEmployees)
 * - Registra evento de lock/unlock em fluxe-lock-log-v1
 *
 * Props:
 *   lockedAt   {string}   — ISO timestamp de quando foi bloqueado
 *   lockedBy   {string}   — nome de quem bloqueou (ou null)
 *   onUnlock   {fn}       — chamado com { employee, unlockedAt } após PIN correto
 */

import { useState, useEffect } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { verifyEmployeePin } from '../services/supabaseAuth'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0') }

function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

// ─── Lock icon SVG ────────────────────────────────────────────────────────────
function LockIcon({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* Shackle */}
      <path
        d="M20 28V20a12 12 0 0 1 24 0v8"
        stroke="#ef4444" strokeWidth="4" strokeLinecap="round"
        fill="none"
      />
      {/* Body */}
      <rect x="10" y="28" width="44" height="30" rx="5" fill="#253349" stroke="#415569" strokeWidth="1.5" />
      {/* Red stripe */}
      <rect x="10" y="36" width="44" height="6" fill="#ef4444" opacity="0.7" />
      <rect x="10" y="42" width="44" height="6" fill="#ef4444" opacity="0.4" />
      {/* Keyhole */}
      <circle cx="32" cy="44" r="4" fill="#0d1526" />
      <rect x="30" y="46" width="4" height="6" rx="1" fill="#0d1526" />
    </svg>
  )
}

// ─── Numpad ───────────────────────────────────────────────────────────────────
const NUMKEYS = ['7','8','9','4','5','6','1','2','3','0','Clear']

function Numpad({ onKey }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
      {NUMKEYS.map(k => (
        <button
          key={k}
          onClick={() => onKey(k)}
          style={{
            gridColumn: k === 'Clear' ? 'span 2' : 'auto',
            padding: '14px', background: 'var(--c-bg-card)',
            border: '1px solid var(--c-border)', borderRadius: 8,
            color: 'var(--c-text)', fontSize: k === 'Clear' ? 12 : 20,
            fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-bg-card)'; e.currentTarget.style.borderColor = 'var(--c-border)' }}
        >
          {k}
        </button>
      ))}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LockScreen({ lockedAt, lockedBy, onUnlock }) {
  const now = useClock()
  const employees = loadActiveEmployees()

  const [unlocking,  setUnlocking]  = useState(false)
  const [selected,   setSelected]   = useState(employees[0]?.name ?? '')
  const [pin,        setPin]        = useState('')
  const [error,      setError]      = useState('')
  const [shake,      setShake]      = useState(false)
  const [verifying,  setVerifying]  = useState(false)

  // Elapsed time since lock
  const elapsedMs   = now - new Date(lockedAt)
  const elapsedMins = Math.floor(elapsedMs / 60000)
  const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000)
  const elapsed     = elapsedMins > 0
    ? `${elapsedMins}m ${pad2(elapsedSecs)}s`
    : `${elapsedSecs}s`

  const handleKey = (val) => {
    if (verifying) return
    setError('')
    if (val === 'Clear') { setPin(''); return }
    if (pin.length >= 6) return
    setPin(prev => prev + val)
  }

  const handleUnlock = async () => {
    if (verifying || !pin) return
    setVerifying(true)
    try {
      const result = await verifyEmployeePin(selected, pin)
      if (result) {
        setVerifying(false)
        onUnlock({ employee: result, unlockedAt: new Date().toISOString() })
      } else {
        setError('Incorrect PIN — try again')
        setPin('')
        setShake(true)
        setVerifying(false)
        setTimeout(() => setShake(false), 500)
      }
    } catch {
      setError('Verification failed — try again')
      setPin('')
      setVerifying(false)
    }
  }

  // Allow Enter key to submit
  useEffect(() => {
    const handler = (e) => {
      if (!unlocking) return
      if (e.key === 'Enter') handleUnlock()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9000,
      background: 'var(--c-bg)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      userSelect: 'none',
    }}>

      {/* Subtle grid pattern */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.03,
        backgroundImage: 'linear-gradient(#93c5fd 1px, transparent 1px), linear-gradient(90deg, #93c5fd 1px, transparent 1px)',
        backgroundSize: '40px 40px',
        pointerEvents: 'none',
      }} />

      {/* Clock */}
      <p style={{ color: 'var(--c-text-sub)', fontSize: 13, marginBottom: 32, position: 'relative' }}>
        {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        {'  ·  '}
        {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </p>

      {!unlocking ? (
        /* ── LOCKED STATE ──────────────────────────────────────────────── */
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
          position: 'relative',
        }}>
          <LockIcon size={72} />

          <div style={{ textAlign: 'center' }}>
            <h1 style={{ color: 'var(--c-text)', fontSize: 28, fontWeight: 800, margin: 0 }}>
              Station is now locked
            </h1>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 14, marginTop: 8 }}>
              You will need to sign in again to continue
            </p>
            {lockedBy && (
              <p style={{ color: 'var(--c-text-dim)', fontSize: 12, marginTop: 4 }}>
                Locked by {lockedBy} · {elapsed} ago
              </p>
            )}
            {!lockedBy && (
              <p style={{ color: 'var(--c-text-dim)', fontSize: 12, marginTop: 4 }}>
                Locked {elapsed} ago
              </p>
            )}
          </div>

          <button
            onClick={() => setUnlocking(true)}
            style={{
              marginTop: 8,
              padding: '13px 48px',
              background: 'var(--c-btn-cta-bg)', border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', transition: 'box-shadow 0.2s',
              boxShadow: 'var(--c-btn-cta-shadow)',
            }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow-hv)' }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow)' }}
          >
            Unlock
          </button>
        </div>

      ) : (
        /* ── UNLOCK FORM ───────────────────────────────────────────────── */
        <div style={{
          background: 'var(--c-bg-panel)',
          border: '1px solid var(--c-border)', borderRadius: 12,
          width: 360, padding: 28,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          position: 'relative',
          animation: shake ? 'shake 0.4s ease' : 'none',
        }}>

          {/* Inject shake keyframe */}
          <style>{`
            @keyframes shake {
              0%,100%{transform:translateX(0)}
              20%{transform:translateX(-8px)}
              40%{transform:translateX(8px)}
              60%{transform:translateX(-6px)}
              80%{transform:translateX(6px)}
            }
          `}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
            <div style={{
              width: 36, height: 36,
              background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <LockIcon size={20} />
            </div>
            <div>
              <p style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 15 }}>Unlock Station</p>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 11 }}>Select your profile and enter PIN</p>
            </div>
            <button
              onClick={() => { setUnlocking(false); setPin(''); setError('') }}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                color: 'var(--c-text-muted)', fontSize: 20, cursor: 'pointer', lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* Employee selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
              SELECT PROFILE
            </label>
            <select
              value={selected}
              onChange={e => { setSelected(e.target.value); setPin(''); setError('') }}
              style={{
                width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border)', borderRadius: 6,
                color: 'var(--c-text)', fontSize: 13, outline: 'none', cursor: 'pointer',
              }}
            >
              {employees.map(e => (
                <option key={e.id} value={e.name}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* PIN display */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
              PIN
            </label>
            <input
              type="password"
              value={pin}
              readOnly
              style={{
                width: '100%', padding: '10px 14px', background: 'var(--c-bg-card)',
                border: `1px solid ${error ? '#ef4444' : 'var(--c-border)'}`,
                borderRadius: 6, color: 'var(--c-text)',
                fontSize: 22, letterSpacing: 10, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
            />
            {error && (
              <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{error}</p>
            )}
          </div>

          {/* Numpad */}
          <div style={{ marginBottom: 16 }}>
            <Numpad onKey={handleKey} />
          </div>

          {/* Unlock button */}
          <button
            onClick={handleUnlock}
            disabled={pin.length === 0}
            style={{
              width: '100%', padding: '13px',
              background: pin.length > 0 ? 'var(--c-btn-cta-bg)' : 'var(--c-border)',
              border: 'none', borderRadius: 7,
              color: pin.length > 0 ? '#fff' : 'var(--c-text-muted)',
              fontSize: 15, fontWeight: 700,
              cursor: pin.length > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: pin.length > 0 ? 'var(--c-btn-cta-shadow)' : 'none',
            }}
            onMouseEnter={e => { if (pin.length > 0) e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow-hv)' }}
            onMouseLeave={e => { if (pin.length > 0) e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow)' }}
          >
            🔓 Unlock
          </button>
        </div>
      )}

      {/* Bottom brand */}
      <p style={{ color: 'var(--c-text-dim)', fontSize: 11, position: 'absolute', bottom: 18 }}>
        Fluxe — Station secured
      </p>
    </div>
  )
}
