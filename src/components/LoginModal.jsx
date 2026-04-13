import { useState, useEffect } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'

export default function LoginModal({ onLogin, onCancel, requiredRole = null, title = 'Employee Sign In', subtitle = 'Enter your PIN to continue' }) {
  const employees = loadActiveEmployees()
  const [selectedEmployee, setSelectedEmployee] = useState(employees[0]?.name ?? '')
  const [pin, setPin]   = useState('')
  const [error, setError] = useState('')

  const handleKey = (val) => {
    if (val === '⌫') { setPin(p => p.slice(0, -1)); setError(''); return }
    if (pin.length >= 6) return
    setPin(prev => prev + val)
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

  const handleSignIn = () => {
    const emp = employees.find(e => e.name === selectedEmployee)
    if (emp && emp.pin === pin) {
      if (requiredRole && emp.role !== requiredRole) {
        setError('Access restricted — manager PIN required')
        setPin('')
        return
      }
      setError('')
      onLogin(emp)
    } else {
      setError('Incorrect PIN')
      setPin('')
    }
  }

  const numKeys = ['1','2','3','4','5','6','7','8','9','','0','⌫']

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1e 100%)', border: '1px solid #1e293b', borderRadius: 10,
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
            <p style={{ color: '#475569', fontSize: 11, marginTop: 1 }}>{subtitle}</p>
          </div>
        </div>

        {/* Employee select */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ color: '#475569', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            SELECT EMPLOYEE
          </label>
          <select
            value={selectedEmployee}
            onChange={e => { setSelectedEmployee(e.target.value); setPin(''); setError('') }}
            style={{
              width: '100%', padding: '9px 12px', background: '#0f172a',
              border: '1px solid #1e293b', borderRadius: 6, color: '#f1f5f9',
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
          <label style={{ color: '#475569', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
            PIN
          </label>
          <input
            type="password"
            value={pin}
            readOnly
            style={{
              width: '100%', padding: '9px 12px', background: '#0f172a',
              border: `1px solid ${error ? '#ef4444' : '#1e293b'}`,
              borderRadius: 6, color: '#f1f5f9',
              fontSize: 20, letterSpacing: 8, outline: 'none', boxSizing: 'border-box',
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
              disabled={!k}
              style={{
                padding: '13px', background: !k ? 'transparent' : '#0f172a',
                border: !k ? 'none' : '1px solid #1e293b', borderRadius: 7,
                color: k === '⌫' ? '#64748b' : '#f1f5f9',
                fontSize: k === '⌫' ? 16 : 18,
                fontWeight: 600, cursor: !k ? 'default' : 'pointer',
                opacity: !k ? 0 : 1, transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (k) { e.currentTarget.style.background = '#131d35'; e.currentTarget.style.borderColor = '#263354' } }}
              onMouseLeave={e => { if (k) { e.currentTarget.style.background = '#0f172a'; e.currentTarget.style.borderColor = '#1e293b' } }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleSignIn}
            style={{
              flex: 1, padding: '12px',
              background: '#2563eb', border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s',
              boxShadow: '0 0 16px rgba(37,99,235,0.25)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#2563eb' }}
          >
            Sign In
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px',
              background: 'transparent', border: '1px solid #1e293b',
              borderRadius: 6, color: '#64748b', fontSize: 14, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#263354'; e.currentTarget.style.color = '#94a3b8' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
