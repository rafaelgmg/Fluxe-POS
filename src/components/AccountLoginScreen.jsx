import { useState } from 'react'
import { SYSTEM_NAME, SYSTEM_TAG, BUSINESS, CREATOR } from '../config/branding'

const BLUE    = '#2563eb'
const BLUE_HV = '#1d4ed8'

export default function AccountLoginScreen({ onLogin }) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [pwVisible, setPwVisible] = useState(false)
  const [error,    setError]    = useState('')

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.')
      return
    }
    // Local auth — no backend required
    const validEmail = email.trim().toLowerCase()
    const validPasswords = ['pass123']
    const validEmails = ['admin@perfumepassage.com', 'rafael', 'admin']
    if (!validEmails.includes(validEmail) || !validPasswords.includes(password)) {
      setError('Incorrect email or password.')
      return
    }
    setError('')
    onLogin({ email: email.trim(), accountId: 'Delmondes_Retailing_NV_Inc', role: 'admin' })
  }

  const handleKey = (e) => { if (e.key === 'Enter') handleLogin() }

  const inputStyle = (hasError) => ({
    width: '100%', padding: '10px 12px',
    background: '#0f172a',
    border: `1px solid ${hasError ? '#ef4444' : '#1e293b'}`,
    borderRadius: 6, color: '#e2e8f0',
    fontSize: 13, outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: '#020817',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* Top bar — same as LoginScreen */}
      <div style={{
        height: 48, background: '#0a0f1e',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#f1f5f9', letterSpacing: 2 }}>
            {SYSTEM_NAME.toUpperCase()}
          </span>
          <span style={{ fontSize: 10, color: '#475569', marginLeft: 2 }}>— {SYSTEM_TAG}</span>
        </div>
      </div>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left — login panel */}
        <div style={{
          width: 420, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 48px',
          background: '#0a0f1e',
          borderRight: '1px solid #1e293b',
        }}>

          <div style={{ alignSelf: 'flex-start', marginBottom: 32 }}>
            <div style={{
              background: BLUE, color: '#fff',
              fontSize: 11, fontWeight: 800,
              padding: '3px 8px', borderRadius: 4, letterSpacing: 0.5,
              display: 'inline-block',
            }}>ACCOUNT</div>
          </div>

          <h1 style={{
            alignSelf: 'flex-start',
            fontSize: 26, fontWeight: 700,
            color: '#f1f5f9', marginBottom: 8,
            letterSpacing: -0.3,
          }}>
            Sign in to your account
          </h1>
          <p style={{
            alignSelf: 'flex-start',
            color: '#475569', fontSize: 13, marginBottom: 28,
          }}>
            {BUSINESS}
          </p>

          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Email */}
            <div>
              <label style={{
                display: 'block', color: '#64748b',
                fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5,
              }}>
                EMAIL / USERNAME
              </label>
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={handleKey}
                placeholder="admin@perfumepassage.com"
                autoComplete="username"
                style={inputStyle(!!error)}
                onFocus={e => { if (!error) e.target.style.borderColor = BLUE }}
                onBlur={e => { if (!error) e.target.style.borderColor = '#1e293b' }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: 'block', color: '#64748b',
                fontSize: 11, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5,
              }}>
                PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={pwVisible ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={handleKey}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  style={{ ...inputStyle(!!error), paddingRight: 40 }}
                  onFocus={e => { if (!error) e.target.style.borderColor = BLUE }}
                  onBlur={e => { if (!error) e.target.style.borderColor = '#1e293b' }}
                />
                <button
                  type="button"
                  onClick={() => setPwVisible(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#475569', fontSize: 14, padding: 2,
                  }}
                >
                  {pwVisible ? '🙈' : '👁'}
                </button>
              </div>
              {error && (
                <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{error}</p>
              )}
            </div>
          </div>

          {/* Login button */}
          <button
            onClick={handleLogin}
            style={{
              width: '100%', marginTop: 28, padding: '11px',
              background: BLUE,
              border: 'none', borderRadius: 6,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s, transform 0.1s',
              letterSpacing: 0.3,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = BLUE_HV }}
            onMouseLeave={e => { e.currentTarget.style.background = BLUE    }}
            onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
            onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
          >
            Continue →
          </button>

          <p style={{ color: '#334155', fontSize: 12, marginTop: 32, alignSelf: 'flex-start' }}>
            v1.0.0 · {CREATOR}
          </p>
        </div>

        {/* Right — branding panel (identical to LoginScreen) */}
        <div style={{
          flex: 1,
          background: 'linear-gradient(135deg, #0a0f1e 0%, #0f172a 40%, #0c1a3a 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {[
            { size: 500, top: -160, right: -160, opacity: 0.02 },
            { size: 300, bottom: -80, left: -80,  opacity: 0.025 },
            { size: 180, top: '40%', left: '60%', opacity: 0.03 },
          ].map((c, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: c.size, height: c.size,
              borderRadius: '50%',
              border: `1px solid rgba(37,99,235,${c.opacity * 10})`,
              background: `radial-gradient(circle, rgba(37,99,235,${c.opacity}) 0%, transparent 70%)`,
              top: c.top, right: c.right, bottom: c.bottom, left: c.left,
              pointerEvents: 'none',
            }} />
          ))}

          <div style={{ textAlign: 'center', zIndex: 1, maxWidth: 480, padding: '0 40px' }}>
            <h2 style={{
              fontSize: 64, fontWeight: 800,
              background: 'linear-gradient(135deg, #93c5fd 0%, #c4b5fd 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 6, letterSpacing: 4, lineHeight: 1,
            }}>
              {SYSTEM_NAME}
            </h2>
            <p style={{ fontSize: 12, color: '#475569', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
              {SYSTEM_TAG}
            </p>
            <p style={{
              fontSize: 11, fontWeight: 500, letterSpacing: 1.5,
              color: '#334155', marginBottom: 56,
            }}>by {CREATOR}</p>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {['💵 Multi-Payment', '📦 Inventory', '👥 CRM + SMS', '📊 Reports', '🏆 Competition'].map(f => (
                <span key={f} style={{
                  padding: '6px 14px',
                  background: 'rgba(37,99,235,0.1)',
                  border: '1px solid rgba(37,99,235,0.2)',
                  borderRadius: 20, color: '#60a5fa',
                  fontSize: 12, fontWeight: 500,
                }}>{f}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
