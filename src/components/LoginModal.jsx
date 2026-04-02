import { useState } from 'react'
import { EMPLOYEES } from '../data/mockData'

export default function LoginModal({ onLogin, onCancel }) {
  const [selectedEmployee, setSelectedEmployee] = useState(EMPLOYEES[0].name)
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')

  const handleKey = (val) => {
    if (val === 'Clear') { setPin(''); setError(''); return }
    if (pin.length >= 6) return
    setPin(prev => prev + val)
  }

  const handleSignIn = () => {
    const emp = EMPLOYEES.find(e => e.name === selectedEmployee)
    if (emp && emp.pin === pin) {
      setError('')
      onLogin(emp)
    } else {
      setError('Incorrect PIN')
      setPin('')
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#3d3d3d', border: '1px solid #444', borderRadius: 8,
        width: 480, padding: 32
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{
            width: 36, height: 36, background: '#c0392b', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
          }}>🔒</div>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: '#fff' }}>Please Sign In</h2>
        </div>

        {/* Employee select */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>Username</label>
          <select
            value={selectedEmployee}
            onChange={e => { setSelectedEmployee(e.target.value); setPin(''); setError('') }}
            style={{
              width: '100%', padding: '8px 12px', background: '#2c2c2c',
              border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 15
            }}
          >
            {EMPLOYEES.map(e => (
              <option key={e.id} value={e.name}>{e.name}</option>
            ))}
          </select>
        </div>

        {/* PIN display */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#aaa', fontSize: 13, display: 'block', marginBottom: 6 }}>PIN</label>
          <input
            type="password"
            value={pin}
            readOnly
            style={{
              width: '100%', padding: '8px 12px', background: '#2c2c2c',
              border: `1px solid ${error ? '#e74c3c' : '#555'}`, borderRadius: 4,
              color: '#fff', fontSize: 18, letterSpacing: 6
            }}
          />
          {error && <p style={{ color: '#e74c3c', fontSize: 12, marginTop: 4 }}>{error}</p>}
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 20 }}>
          {['7','8','9','4','5','6','1','2','3','0','Clear'].map((k) => (
            <button
              key={k}
              onClick={() => handleKey(k)}
              style={{
                gridColumn: k === 'Clear' ? 'span 2' : 'auto',
                padding: '14px', background: '#4a4a4a', border: '1px solid #555',
                borderRadius: 6, color: '#fff', fontSize: 18, fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.target.style.background = '#444460'}
              onMouseLeave={e => e.target.style.background = '#4a4a4a'}
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
              flex: 1, padding: '12px', background: '#2980b9',
              border: 'none', borderRadius: 6, color: '#fff',
              fontSize: 16, fontWeight: 600
            }}
          >
            Sign In
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '12px', background: '#555',
              border: 'none', borderRadius: 6, color: '#fff', fontSize: 16
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
