import { useState, useEffect } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { verifyEmployeePin } from '../services/supabaseAuth'

export default function LoginModal({ onLogin, onCancel, requiredRole = null, title = 'Employee Sign In', subtitle = 'Enter your PIN to continue', filterRoles = null }) {
  const employees = filterRoles
    ? loadActiveEmployees().filter(e => filterRoles.includes(e.role))
    : loadActiveEmployees()
  const [selectedEmployee, setSelectedEmployee] = useState(employees[0]?.name ?? '')
  const [pin,       setPin]       = useState('')
  const [error,     setError]     = useState('')
  const [verifying, setVerifying] = useState(false)

  const handleKey = (val) => {
    if (verifying) return
    if (val === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 6) return
    setPin(prev => prev + val)
  }

  const handleSignIn = async () => {
    if (verifying || !pin) return
    setVerifying(true)
    try {
      const result = await verifyEmployeePin(selectedEmployee, pin)
      if (result) {
        const hasAccess = !requiredRole || result.role === requiredRole || result.role === 'admin'
        if (!hasAccess) {
          setError('Access restricted — manager PIN required')
          setPin('')
          setVerifying(false)
          return
        }
        setError('')
        setVerifying(false)
        onLogin(result)
      } else {
        setError('Incorrect PIN')
        setPin('')
        setVerifying(false)
      }
    } catch {
      setError('Verification failed — try again')
      setPin('')
      setVerifying(false)
    }
  }

  // Physical keyboard / numpad support
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT') return
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault()           // prevent SELECT from jumping to matching option
        handleKey(e.key)
      } else if (e.key === 'Backspace' && e.target.tagName !== 'SELECT') {
        handleKey('⌫')
      } else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') {
        handleSignIn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const numKeys = ['7','8','9','4','5','6','1','2','3','','0','⌫']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--c-bg-panel)', border: '1px solid var(--c-border)', borderRadius: 10,
        width: 380, padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
          }}>🔒</div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{title}</h2>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 1 }}>{subtitle}</p>
          </div>
        </div>

        {/* Employee select */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            SELECT EMPLOYEE
          </label>
          <select
            value={selectedEmployee}
            onChange={e => { setSelectedEmployee(e.target.value); setPin(''); setError(''); e.target.blur() }}
            style={{
              width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
              border: '1px solid var(--c-border-md)', borderRadius: 6, color: 'var(--c-text)',
              fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            {employees.map(e => (
              <option key={e.id} value={e.name}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* PIN display */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            PIN
          </label>
          <input
            type="password"
            value={verifying ? '······' : pin}
            readOnly
            style={{
              width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
              border: `1px solid ${error ? '#ef4444' : verifying ? '#3b82f6' : 'var(--c-border-md)'}`,
              borderRadius: 6, color: verifying ? '#3b82f6' : 'var(--c-text)',
              fontSize: 20, letterSpacing: 8, outline: 'none', boxSizing: 'border-box',
              opacity: verifying ? 0.7 : 1, transition: 'all 0.15s',
            }}
          />
          {error && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{error}</p>}
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 18 }}>
          {numKeys.map((k, i) => (
            <button
              key={i}
              onClick={() => { if (k) handleKey(k) }}
              disabled={!k || verifying}
              style={{
                padding: '13px', background: !k ? 'transparent' : 'var(--c-bg-card)',
                border: !k ? 'none' : '1px solid var(--c-border-md)', borderRadius: 7,
                color: k === '⌫' ? 'var(--c-text-muted)' : 'var(--c-text)',
                fontSize: k === '⌫' ? 16 : 18,
                fontWeight: 700, cursor: (!k || verifying) ? 'default' : 'pointer',
                opacity: !k ? 0 : verifying ? 0.5 : 1, transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (k && !verifying) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
              onMouseLeave={e => { if (k && !verifying) { e.currentTarget.style.background = 'var(--c-bg-card)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSignIn}
            disabled={verifying || !pin}
            style={{
              flex: 1, padding: '12px',
              background: 'var(--c-btn-cta-bg)', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: (verifying || !pin) ? 'not-allowed' : 'pointer',
              transition: 'box-shadow 0.2s, opacity 0.2s',
              boxShadow: pin ? 'var(--c-btn-cta-shadow)' : 'none',
              opacity: !pin ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!verifying && pin) e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow-hv)' }}
            onMouseLeave={e => { if (pin) e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow)' }}
          >
            {verifying ? 'Verifying…' : 'Sign In'}
          </button>
          <button
            onClick={onCancel}
            disabled={verifying}
            style={{
              flex: 1, padding: '12px',
              background: 'transparent', border: '1px solid var(--c-border-md)',
              borderRadius: 6, color: 'var(--c-text-sub)', fontSize: 14, cursor: verifying ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { if (!verifying) { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text)'; e.currentTarget.style.background = 'var(--c-bg-hover)' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.color = 'var(--c-text-sub)'; e.currentTarget.style.background = 'transparent' }}
          >
            Cancel
          </button>
        </div>

      </div>
    </div>
  )
}
