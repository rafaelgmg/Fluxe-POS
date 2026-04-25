import { useState, useEffect } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { verifyEmployeePin } from '../services/supabaseAuth'

export default function LoginModal({ onLogin, onCancel, requiredRole = null, title = 'Employee Sign In', subtitle = 'Enter your PIN to continue' }) {
  const employees = loadActiveEmployees()
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
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return
      if (/^[0-9]$/.test(e.key)) handleKey(e.key)
      else if (e.key === 'Backspace') handleKey('⌫')
      else if (e.key === 'Enter') handleSignIn()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const numKeys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0d1526 100%)', border: '1px solid #253349', borderRadius: 10,
        width: 380, padding: 28,
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(239,68,68,0.15)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
          }}>🔒</div>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>{title}</h2>
            <p style={{ color: '#b8c8da', fontSize: 11, marginTop: 1 }}>{subtitle}</p>
          </div>
        </div>

        {/* Employee select */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#c0cfe0', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            SELECT EMPLOYEE
          </label>
          <select
            value={selectedEmployee}
            onChange={e => { setSelectedEmployee(e.target.value); setPin(''); setError('') }}
            style={{
              width: '100%', padding: '9px 12px', background: '#111d30',
              border: '1px solid #3a4f6a', borderRadius: 6, color: '#f1f5f9',
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
          <label style={{ color: '#c0cfe0', fontSize: 11, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            PIN
          </label>
          <input
            type="password"
            value={verifying ? '······' : pin}
            readOnly
            style={{
              width: '100%', padding: '9px 12px', background: '#111d30',
              border: `1px solid ${error ? '#ef4444' : verifying ? '#3b82f6' : '#3a4f6a'}`,
              borderRadius: 6, color: verifying ? '#3b82f6' : '#f1f5f9',
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
                padding: '13px', background: !k ? 'transparent' : '#111d30',
                border: !k ? 'none' : '1px solid #3a4f6a', borderRadius: 7,
                color: k === '⌫' ? '#c0cfe0' : '#f1f5f9',
                fontSize: k === '⌫' ? 16 : 18,
                fontWeight: 700, cursor: (!k || verifying) ? 'default' : 'pointer',
                opacity: !k ? 0 : verifying ? 0.5 : 1, transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (k && !verifying) { e.currentTarget.style.background = '#1a3050'; e.currentTarget.style.borderColor = '#4a6080' } }}
              onMouseLeave={e => { if (k && !verifying) { e.currentTarget.style.background = '#111d30'; e.currentTarget.style.borderColor = '#3a4f6a' } }}
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
              background: verifying ? '#1d4ed8' : '#3b82f6', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: (verifying || !pin) ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              boxShadow: '0 0 16px rgba(37,99,235,0.25)',
              opacity: !pin ? 0.6 : 1,
            }}
            onMouseEnter={e => { if (!verifying && pin) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (!verifying) e.currentTarget.style.background = verifying ? '#1d4ed8' : '#3b82f6' }}
          >
            {verifying ? 'Verifying…' : 'Sign In'}
          </button>
          <button
            onClick={onCancel}
            disabled={verifying}
            style={{
              flex: 1, padding: '12px',
              background: 'transparent', border: '1px solid #3a4f6a',
              borderRadius: 6, color: '#cbd0e0', fontSize: 14, cursor: verifying ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { if (!verifying) { e.currentTarget.style.borderColor = '#4a6080'; e.currentTarget.style.color = '#f1f5f9' } }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a4f6a'; e.currentTarget.style.color = '#cbd0e0' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
