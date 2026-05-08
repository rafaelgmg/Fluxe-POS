import { useState, useEffect } from 'react'
import {
  ACCOUNTS, REGIONS, LOCATION_MAP, LOGIN_PASSWORD, LOGIN_CHECKBOX,
  BUSINESS, BUSINESS_SHORT, SYSTEM_NAME, SYSTEM_TAG, CREATOR,
  LOCATIONS_CFG,
} from '../config/branding'
import { loadActiveEmployees, loadUsersAsync } from '../utils/usersStorage'
import { verifyEmployeePin, resolveSessionContext } from '../services/supabaseAuth'
import LoginModal from './LoginModal'
import AdminPanel from './AdminPanel'
import ChangePinModal from './ChangePinModal'

const LOCATION_PASSWORD = LOGIN_PASSWORD
const LOC_KEY      = 'fluxe-locations-v1'
const REMEMBER_KEY = 'fluxe-remembered-location-v1'

const BLUE = '#3b82f6'

function loadRememberedLocation() {
  try { return JSON.parse(localStorage.getItem(REMEMBER_KEY) || 'null') } catch { return null }
}
function saveRememberedLocation(data) {
  localStorage.setItem(REMEMBER_KEY, JSON.stringify(data))
}
function clearRememberedLocation() {
  localStorage.removeItem(REMEMBER_KEY)
}

// Returns active location names for a region, merging saved settings with branding config
function loadActiveLocationNames(region) {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // Use saved list if it has entries for this region
      const regionLocs = saved.filter(l => l.region === region)
      if (regionLocs.length > 0) {
        return regionLocs
          .filter(l => l.status !== 'inactive')
          .map(l => l.name)
      }
    }
  } catch {}
  // Fallback to branding static config
  return LOCATION_MAP[region] || []
}

function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span style={{ color: 'var(--c-text-sub)', fontSize: 13 }}>
      {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
      {'  ·  '}
      {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  )
}

export default function LoginScreen({ onLogin, onBack }) {
  const [account,          setAccount]          = useState(ACCOUNTS[0])
  const [region,           setRegion]           = useState(REGIONS[0])
  const [location,         setLocation]         = useState(LOCATION_MAP[REGIONS[0]][0])
  const [password,         setPassword]         = useState('')
  const [onlyThis,         setOnlyThis]         = useState(() => loadRememberedLocation()?.rememberLocation === true)
  const [locationRestored, setLocationRestored] = useState(false)
  const [error,            setError]            = useState('')
  const [loading,          setLoading]          = useState(false)
  const [pwVisible,        setPwVisible]        = useState(false)
  const [version]                               = useState('1.0.0')
  const [showAdminAuth, setShowAdminAuth] = useState(false)
  const [adminUser,     setAdminUser]     = useState(null)

  // PIN step
  const [step,            setStep]            = useState('location') // 'location' | 'pin'
  const [pendingSession,  setPendingSession]  = useState(null)
  const [employees,       setEmployees]       = useState(() => loadActiveEmployees())
  const [selectedEmp,     setSelectedEmp]     = useState(employees[0]?.name ?? '')
  const [pin,             setPin]             = useState('')
  const [pinError,        setPinError]        = useState('')
  const [verifying,       setVerifying]       = useState(false)
  const [changingPin,     setChangingPin]     = useState(false)

  // Restore remembered location on mount
  useEffect(() => {
    const saved = loadRememberedLocation()
    if (!saved?.rememberLocation) return
    if (!REGIONS.includes(saved.region)) return
    const locs = loadActiveLocationNames(saved.region)
    if (!locs.includes(saved.location)) return
    setAccount(saved.account || ACCOUNTS[0])
    setRegion(saved.region)
    setLocation(saved.location)
    setOnlyThis(true)
    setLocationRestored(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync employees from Supabase on mount so new staff appear on any device without
  // requiring manual admin sync. Falls back silently to whatever is in localStorage.
  useEffect(() => {
    loadUsersAsync().then(() => {
      const fresh = loadActiveEmployees()
      if (fresh.length === 0) return
      setEmployees(fresh)
      setSelectedEmp(prev => fresh.find(e => e.name === prev) ? prev : fresh[0].name)
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const locationList = loadActiveLocationNames(region)

  const handleRegionChange = (r) => {
    setRegion(r)
    setLocation(loadActiveLocationNames(r)[0] || '')
    setLocationRestored(false)
  }

  const handleLocationLogin = async () => {
    if (!password.trim()) { setError('Location password is required.'); return }
    if (password !== LOCATION_PASSWORD) { setError('Incorrect password. Please try again.'); return }
    setError('')
    setLoading(true)
    const locCfg = LOCATIONS_CFG.find(l => l.name === location)
    // Phase 6: resolve org UUID + location UUID once at login time
    const ctx = await resolveSessionContext(locCfg?.id || null)
    setLoading(false)
    setPendingSession({
      account,
      region,
      location,
      locationId:   locCfg?.id    || null,   // legacy 'loc_01' — kept for backward compat
      locationUUID: ctx.locationUUID,          // Supabase UUID — used by write path
      orgId:        ctx.orgId,                 // Supabase org UUID — carried in session
    })
    setStep('pin')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleLocationLogin()
  }

  // PIN numpad — Phase 6: async verification via Supabase RPC
  const pressPin = (val) => {
    if (verifying) return
    if (val === '⌫') { setPin(p => p.slice(0, -1)); setPinError(''); return }
    if (pin.length >= 4) return
    setPin(prev => prev + val)
  }

  // Trigger async verification once PIN reaches 4 digits.
  useEffect(() => {
    const next = pin
    if (next.length < 4 || verifying) return
    let cancelled = false

    const doVerify = async () => {
      setVerifying(true)
      try {
        const result = await verifyEmployeePin(selectedEmp, next)
        if (cancelled) return
        if (result) {
          if (onlyThis) {
            saveRememberedLocation({
              account:        pendingSession.account,
              region:         pendingSession.region,
              location:       pendingSession.location,
              locationId:     pendingSession.locationId,
              rememberLocation: true,
            })
          } else {
            clearRememberedLocation()
          }
          setPinError('')
          setVerifying(false)
          onLogin(pendingSession, result)
        } else {
          setPinError('Incorrect PIN — try again')
          setTimeout(() => { setPin(''); setPinError(''); setVerifying(false) }, 700)
        }
      } catch {
        if (!cancelled) {
          setPinError('Incorrect PIN — try again')
          setTimeout(() => { setPin(''); setPinError(''); setVerifying(false) }, 700)
        }
      }
    }

    doVerify()
    return () => { cancelled = true }
  }, [pin]) // eslint-disable-line react-hooks/exhaustive-deps

  // Physical keyboard / numpad support — only active on PIN step
  useEffect(() => {
    if (step !== 'pin') return
    const onKey = (e) => {
      if (e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return
      if (/^[0-9]$/.test(e.key)) pressPin(e.key)
      else if (e.key === 'Backspace') pressPin('⌫')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sel = (value, onChange) => ({
    value,
    onChange: e => onChange(e.target.value),
    style: {
      width: '100%', padding: '9px 12px',
      background: 'var(--c-bg-card)',
      border: '1px solid var(--c-border-md)',
      borderRadius: 6, color: 'var(--c-text)',
      fontSize: 13, cursor: 'pointer',
      outline: 'none', appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 12px center',
      paddingRight: 34,
      transition: 'border-color 0.15s',
    },
    onFocus: e => { e.target.style.borderColor = BLUE },
    onBlur:  e => { e.target.style.borderColor = 'var(--c-border-md)' },
  })

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--c-bg)',
      display: 'flex', flexDirection: 'column',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div style={{
        height: 48,
        background: 'var(--c-bg-panel)',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center',
        padding: '0 24px', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: 'var(--c-text)', letterSpacing: 2 }}>
            {SYSTEM_NAME.toUpperCase()}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 400, letterSpacing: 0.5,
            color: 'var(--c-text-muted)', marginLeft: 2,
          }}>— {SYSTEM_TAG}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Clock />
          {/* Managers — Admin access shortcut */}
          <button
            onClick={() => setShowAdminAuth(true)}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: 'transparent', border: '1px solid transparent', cursor: 'pointer',
              color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600,
              gap: 4, padding: '6px 10px', borderRadius: 8,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = '#c4b5fd'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; e.currentTarget.style.background = 'rgba(139,92,246,0.12)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-muted)'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'transparent' }}
          >
            <span style={{ fontSize: 20 }}>⚙️</span>
            Admin
          </button>
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: login panel ─────────────────────────────────────────── */}
        <div style={{
          width: 420, flexShrink: 0,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '40px 48px',
          background: 'var(--c-bg-panel)',
          borderRight: '1px solid var(--c-border)',
        }}>

          {/* Version badge */}
          <div style={{
            alignSelf: 'flex-start', marginBottom: 32,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <div style={{
              background: BLUE, color: '#fff',
              fontSize: 11, fontWeight: 800,
              padding: '3px 8px', borderRadius: 4, letterSpacing: 0.5,
            }}>
              v{version}
            </div>
            <span style={{ color: 'var(--c-text-dim)', fontSize: 11 }}>{SYSTEM_NAME}</span>
          </div>

          <h1 style={{
            alignSelf: 'flex-start',
            fontSize: 26, fontWeight: 700,
            color: 'var(--c-text)', marginBottom: 28,
            letterSpacing: -0.3,
          }}>
            {step === 'pin' ? 'Who\'s signing in?' : 'Please sign in'}
          </h1>

          {/* ── PIN step ── */}
          {step === 'pin' && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Location confirmed badge */}
              <div style={{
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 6, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: '#22c55e', fontSize: 12 }}>✓</span>
                <span style={{ color: 'var(--c-text-sub)', fontSize: 12 }}>{pendingSession?.location}</span>
              </div>

              {/* Employee selector */}
              <div>
                <label style={{ display: 'block', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                  SELECT EMPLOYEE
                </label>
                <select
                  value={selectedEmp}
                  onChange={e => { setSelectedEmp(e.target.value); setPin(''); setPinError('') }}
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
                    border: '1px solid var(--c-border-md)', borderRadius: 6, color: 'var(--c-text)',
                    fontSize: 13, cursor: 'pointer', outline: 'none', appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', paddingRight: 34,
                  }}
                >
                  {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>
              </div>

              {/* PIN dots display */}
              <div>
                <label style={{ display: 'block', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                  PIN
                </label>
                <input
                  type="password"
                  value={verifying ? '······' : pin}
                  readOnly
                  style={{
                    width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
                    border: `1px solid ${pinError ? '#ef4444' : verifying ? BLUE : 'var(--c-border-md)'}`,
                    borderRadius: 6, color: verifying ? '#3b82f6' : 'var(--c-text)',
                    fontSize: 22, letterSpacing: 10, outline: 'none', boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                    opacity: verifying ? 0.7 : 1,
                  }}
                />
                {pinError && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{pinError}</p>}
              </div>

              {/* Numpad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7 }}>
                {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => (
                  <button
                    key={i}
                    onClick={() => { if (k) pressPin(k) }}
                    disabled={!k}
                    style={{
                      padding: '13px', background: !k ? 'transparent' : 'var(--c-bg-card)',
                      border: !k ? 'none' : '1px solid var(--c-border-md)', borderRadius: 7,
                      color: k === '⌫' ? 'var(--c-text-muted)' : 'var(--c-text)',
                      fontSize: k === '⌫' ? 16 : 18,
                      fontWeight: 600, cursor: !k ? 'default' : 'pointer',
                      opacity: !k ? 0 : 1, transition: 'all 0.1s',
                    }}
                    onMouseEnter={e => { if (k) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
                    onMouseLeave={e => { if (k) { e.currentTarget.style.background = 'var(--c-bg-card)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
                  >{k}</button>
                ))}
              </div>

              <button
                onClick={() => { setStep('location'); setPin(''); setPinError('') }}
                style={{
                  padding: '10px', background: 'transparent', border: '1px solid var(--c-border-md)',
                  borderRadius: 6, color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-sub)'; e.currentTarget.style.background = 'var(--c-bg-hover)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.color = 'var(--c-text-muted)'; e.currentTarget.style.background = 'transparent' }}
              >← Back</button>

              {/* Change PIN link */}
              <div style={{ textAlign: 'center' }}>
                <button
                  onClick={() => setChangingPin(true)}
                  style={{
                    background: 'none', border: 'none', padding: 0,
                    color: 'var(--c-text-muted)', fontSize: 12, cursor: 'pointer',
                    textDecoration: 'underline', textUnderlineOffset: 3,
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text-sub)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-muted)' }}
                >
                  Change PIN
                </button>
              </div>
            </div>
          )}

          {/* ── Location form ── */}
          {step === 'location' && (
          <>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Select Account */}
            <div>
              <label style={{ display: 'block', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                SELECT ACCOUNT
              </label>
              <select {...sel(account, setAccount)}>
                {ACCOUNTS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>

            {/* Select Region */}
            <div>
              <label style={{ display: 'block', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                SELECT REGION
              </label>
              <select {...sel(region, handleRegionChange)}>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Select Location */}
            <div>
              <label style={{ display: 'block', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                SELECT LOCATION
              </label>
              <select {...sel(location, setLocation)}>
                {locationList.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {/* Location Password */}
            <div>
              <label style={{ display: 'block', color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 700, marginBottom: 6, letterSpacing: 0.5 }}>
                LOCATION PASSWORD
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={pwVisible ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter password"
                  autoComplete="off"
                  style={{
                    width: '100%', padding: '9px 40px 9px 12px',
                    background: 'var(--c-bg-card)',
                    border: `1px solid ${error ? '#ef4444' : 'var(--c-border-md)'}`,
                    borderRadius: 6, color: 'var(--c-text)',
                    fontSize: 13, outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => { if (!error) e.target.style.borderColor = BLUE }}
                  onBlur={e => { if (!error) e.target.style.borderColor = 'var(--c-border-md)' }}
                />
                <button
                  type="button"
                  onClick={() => setPwVisible(v => !v)}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--c-text-muted)', fontSize: 14, padding: 2,
                  }}
                >
                  {pwVisible ? '🙈' : '👁'}
                </button>
              </div>
              {error && (
                <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{error}</p>
              )}
            </div>

            {/* Checkbox */}
            <div style={{ marginTop: 2 }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 8,
                cursor: 'pointer', userSelect: 'none',
              }}>
                <input
                  type="checkbox"
                  checked={onlyThis}
                  onChange={e => {
                    setOnlyThis(e.target.checked)
                    if (!e.target.checked) { setLocationRestored(false); clearRememberedLocation() }
                  }}
                  style={{ accentColor: BLUE, cursor: 'pointer', width: 14, height: 14 }}
                />
                <span style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
                  Remember this location
                </span>
              </label>
              {locationRestored && (
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11 }}>📍</span>
                  <span style={{ fontSize: 11, color: BLUE }}>Location remembered on this device</span>
                </div>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10, width: '100%', marginTop: 28 }}>
            <button
              onClick={handleLocationLogin}
              disabled={loading}
              style={{
                flex: 1, padding: '11px',
                background: 'var(--c-btn-cta-bg)',
                border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'box-shadow 0.2s, opacity 0.2s',
                boxShadow: 'var(--c-btn-cta-shadow)',
                letterSpacing: 0.3,
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow-hv)' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.boxShadow = 'var(--c-btn-cta-shadow)' }}
              onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)' }}
              onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)' }}
            >
              {loading ? 'Signing in...' : 'Login'}
            </button>
            <button
              onClick={() => window.close?.()}
              style={{
                flex: 1, padding: '11px',
                background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border)',
                borderRadius: 6, color: 'var(--c-text-muted)',
                fontSize: 14, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background    = 'var(--c-bg-hover)'
                e.currentTarget.style.color         = 'var(--c-text-sub)'
                e.currentTarget.style.borderColor   = 'var(--c-border-md)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background    = 'var(--c-bg-card)'
                e.currentTarget.style.color         = 'var(--c-text-muted)'
                e.currentTarget.style.borderColor   = 'var(--c-border)'
              }}
            >
              Exit
            </button>
          </div>
          </>) /* end step === 'location' */}

          {/* Version footer */}
          <div style={{ marginTop: 32, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 16 }}>
            <p style={{ color: 'var(--c-text-dim)', fontSize: 12 }}>
              v{version} · {CREATOR}
            </p>
            {onBack && (
              <button
                onClick={onBack}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--c-text-dim)', fontSize: 11, padding: 0,
                  textDecoration: 'underline',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--c-text-muted)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-dim)' }}
              >
                ← Change account
              </button>
            )}
          </div>
        </div>

        {/* ── Right: branding panel ──────────────────────────────────────── */}
        <div style={{
          flex: 1,
          background: 'linear-gradient(135deg, #0d1526 0%, #111d30 40%, #0c1a3a 100%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>

          {/* Background decoration circles */}
          {[
            { size: 500, top: -160, right: -160, opacity: 0.02 },
            { size: 300, bottom: -80, left: -80,  opacity: 0.025 },
            { size: 180, top: '40%', left: '60%', opacity: 0.03 },
          ].map((c, i) => (
            <div key={i} style={{
              position: 'absolute',
              width: c.size, height: c.size,
              borderRadius: '50%',
              border: `1px solid rgba(37,99,235,${c.opacity * 8})`,
              background: `radial-gradient(circle, rgba(37,99,235,${c.opacity}) 0%, transparent 70%)`,
              top: c.top, right: c.right, bottom: c.bottom, left: c.left,
              pointerEvents: 'none',
            }} />
          ))}

          {/* Main content */}
          <div style={{
            textAlign: 'center', zIndex: 1,
            maxWidth: 480, padding: '0 40px',
          }}>
            <h2 style={{
              fontSize: 64, fontWeight: 800,
              background: 'linear-gradient(135deg, #93c5fd 0%, #c4b5fd 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 6, letterSpacing: 4, lineHeight: 1,
            }}>
              {SYSTEM_NAME}
            </h2>
            <p style={{ fontSize: 12, color: '#94a3b8', letterSpacing: 2, marginBottom: 6, textTransform: 'uppercase' }}>
              {SYSTEM_TAG}
            </p>
            <p style={{
              fontSize: 11, fontWeight: 500, letterSpacing: 1.5,
              color: '#415569', marginBottom: 56,
            }}>
              by {CREATOR}
            </p>

            {/* Feature pills */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 48 }}>
              {[
                '💵 Multi-Payment',
                '📦 Inventory',
                '👥 CRM + SMS',
                '📊 Reports',
                '🏆 Competition',
              ].map(f => (
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

          {/* Bottom note */}
          <p style={{
            position: 'absolute', bottom: 20,
            color: '#415569', fontSize: 12, letterSpacing: 0.3,
          }}>
            {LOCATIONS_CFG[0].name} · {LOCATIONS_CFG[0].address}
          </p>
        </div>
      </div>

      {/* Admin auth — triggered from Managers button */}
      {showAdminAuth && (
        <LoginModal
          title="Admin Access"
          subtitle="Admin or Manager PIN required"
          requiredRole="manager"
          filterRoles={['admin', 'manager']}
          onLogin={user => { setShowAdminAuth(false); setAdminUser(user) }}
          onCancel={() => setShowAdminAuth(false)}
        />
      )}

      {/* AdminPanel — opened after successful admin auth */}
      {adminUser && (
        <AdminPanel
          posSession={null}
          currentUser={adminUser}
          onClose={() => setAdminUser(null)}
        />
      )}

      {changingPin && (
        <ChangePinModal
          preselectedName={selectedEmp}
          onClose={() => setChangingPin(false)}
        />
      )}
    </div>
  )
}
