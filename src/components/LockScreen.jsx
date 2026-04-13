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

// ─── Colors ───────────────────────────────────────────────────────────────────
const BG     = '#020817'
const PANEL  = '#080f1f'
const CARD   = '#0d1829'
const BORDER = '#1e293b'
const BLUE   = '#2563eb'
const RED    = '#ef4444'
const MUTED  = '#475569'
const DIM    = '#94a3b8'
const TEXT   = '#f1f5f9'

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
      <rect x="10" y="28" width="44" height="30" rx="5" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
      {/* Red stripe */}
      <rect x="10" y="36" width="44" height="6" fill="#ef4444" opacity="0.7" />
      <rect x="10" y="42" width="44" height="6" fill="#ef4444" opacity="0.4" />
      {/* Keyhole */}
      <circle cx="32" cy="44" r="4" fill="#0a0f1e" />
      <rect x="30" y="46" width="4" height="6" rx="1" fill="#0a0f1e" />
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
            padding: '14px', background: CARD,
            border: `1px solid ${BORDER}`, borderRadius: 8,
            color: TEXT, fontSize: k === 'Clear' ? 12 : 20,
            fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#131d35'; e.currentTarget.style.borderColor = '#263354' }}
          onMouseLeave={e => { e.currentTarget.style.background = CARD; e.currentTarget.style.borderColor = BORDER }}
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

  const [unlocking, setUnlocking]     = useState(false)
  const [selected,  setSelected]      = useState(employees[0]?.name ?? '')
  const [pin,       setPin]           = useState('')
  const [error,     setError]         = useState('')
  const [shake,     setShake]         = useState(false)

  // Elapsed time since lock
  const elapsedMs   = now - new Date(lockedAt)
  const elapsedMins = Math.floor(elapsedMs / 60000)
  const elapsedSecs = Math.floor((elapsedMs % 60000) / 1000)
  const elapsed     = elapsedMins > 0
    ? `${elapsedMins}m ${pad2(elapsedSecs)}s`
    : `${elapsedSecs}s`

  const handleKey = (val) => {
    setError('')
    if (val === 'Clear') { setPin(''); return }
    if (pin.length >= 6) return
    setPin(prev => prev + val)
  }

  const handleUnlock = () => {
    const emp = employees.find(e => e.name === selected)
    if (emp && emp.pin === pin) {
      onUnlock({ employee: emp, unlockedAt: new Date().toISOString() })
    } else {
      setError('Incorrect PIN — try again')
      setPin('')
      setShake(true)
      setTimeout(() => setShake(false), 500)
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
      background: BG,
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
      <p style={{ color: DIM, fontSize: 13, marginBottom: 32, position: 'relative' }}>
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
            <h1 style={{ color: TEXT, fontSize: 28, fontWeight: 800, margin: 0 }}>
              Station is now locked
            </h1>
            <p style={{ color: MUTED, fontSize: 14, marginTop: 8 }}>
              You will need to sign in again to continue
            </p>
            {lockedBy && (
              <p style={{ color: '#334155', fontSize: 12, marginTop: 4 }}>
                Locked by {lockedBy} · {elapsed} ago
              </p>
            )}
            {!lockedBy && (
              <p style={{ color: '#334155', fontSize: 12, marginTop: 4 }}>
                Locked {elapsed} ago
              </p>
            )}
          </div>

          <button
            onClick={() => setUnlocking(true)}
            style={{
              marginTop: 8,
              padding: '13px 48px',
              background: BLUE, border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 16, fontWeight: 700,
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: '0 0 30px rgba(37,99,235,0.35)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8'; e.currentTarget.style.boxShadow = '0 0 40px rgba(37,99,235,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = BLUE; e.currentTarget.style.boxShadow = '0 0 30px rgba(37,99,235,0.35)' }}
          >
            Unlock
          </button>
        </div>

      ) : (
        /* ── UNLOCK FORM ───────────────────────────────────────────────── */
        <div style={{
          background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1e 100%)',
          border: `1px solid ${BORDER}`, borderRadius: 12,
          width: 360, padding: 28,
          boxShadow: '0 20px 60px rgba(0,0,0,0.8)',
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
              <p style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Unlock Station</p>
              <p style={{ color: MUTED, fontSize: 11 }}>Select your profile and enter PIN</p>
            </div>
            <button
              onClick={() => { setUnlocking(false); setPin(''); setError('') }}
              style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                color: MUTED, fontSize: 20, cursor: 'pointer', lineHeight: 1,
              }}
            >×</button>
          </div>

          {/* Employee selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: MUTED, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
              SELECT PROFILE
            </label>
            <select
              value={selected}
              onChange={e => { setSelected(e.target.value); setPin(''); setError('') }}
              style={{
                width: '100%', padding: '9px 12px', background: '#0f172a',
                border: `1px solid ${BORDER}`, borderRadius: 6,
                color: TEXT, fontSize: 13, outline: 'none', cursor: 'pointer',
              }}
            >
              {employees.map(e => (
                <option key={e.id} value={e.name}>{e.name}</option>
              ))}
            </select>
          </div>

          {/* PIN display */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ color: MUTED, fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
              PIN
            </label>
            <input
              type="password"
              value={pin}
              readOnly
              style={{
                width: '100%', padding: '10px 14px', background: '#0f172a',
                border: `1px solid ${error ? RED : BORDER}`,
                borderRadius: 6, color: TEXT,
                fontSize: 22, letterSpacing: 10, outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
            />
            {error && (
              <p style={{ color: RED, fontSize: 11, marginTop: 5 }}>{error}</p>
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
              background: pin.length > 0 ? BLUE : '#1e293b',
              border: 'none', borderRadius: 7,
              color: pin.length > 0 ? '#fff' : MUTED,
              fontSize: 15, fontWeight: 700,
              cursor: pin.length > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s',
              boxShadow: pin.length > 0 ? '0 0 20px rgba(37,99,235,0.3)' : 'none',
            }}
            onMouseEnter={e => { if (pin.length > 0) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (pin.length > 0) e.currentTarget.style.background = BLUE }}
          >
            🔓 Unlock
          </button>
        </div>
      )}

      {/* Bottom brand */}
      <p style={{ color: '#1e293b', fontSize: 11, position: 'absolute', bottom: 18 }}>
        Fluxe — Station secured
      </p>
    </div>
  )
}
