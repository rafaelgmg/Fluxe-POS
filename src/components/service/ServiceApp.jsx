/**
 * ServiceApp.jsx — Fluxe Service Mode Shell
 *
 * Rendered instead of the retail POS when a location has business_type === 'service'.
 * Shares the same login flow, design system, and top-bar style as the retail app.
 * Does NOT touch any retail logic.
 */
import { useState } from 'react'
import { C, R, GRAD, GLOW, T } from '../../styles/ds'
import { SYSTEM_NAME } from '../../config/branding'
import ServiceDashboard  from './screens/ServiceDashboard'
import AppointmentsScreen from './screens/AppointmentsScreen'
import ClientsScreen     from './screens/ClientsScreen'
import ServicesScreen    from './screens/ServicesScreen'
import FollowUpScreen    from './screens/FollowUpScreen'
import ServiceReports    from './screens/ServiceReports'
import ServiceSettings   from './screens/ServiceSettings'

// ── Navigation definition ─────────────────────────────────────────────────────
const NAV = [
  { id: 'dashboard',    label: 'Dashboard',    icon: '◻' },
  { id: 'appointments', label: 'Appointments', icon: '📅' },
  { id: 'clients',      label: 'Clients',      icon: '👥' },
  { id: 'services',     label: 'Services',     icon: '✂️' },
  { id: 'followup',     label: 'Follow-up',    icon: '💬' },
  { id: 'reports',      label: 'Reports',      icon: '📈' },
  { id: 'settings',     label: 'Settings',     icon: '⚙️' },
]

// ── Screen map ────────────────────────────────────────────────────────────────
function ActiveScreen({ screen, posSession, currentUser }) {
  switch (screen) {
    case 'appointments': return <AppointmentsScreen posSession={posSession} currentUser={currentUser} />
    case 'clients':      return <ClientsScreen      posSession={posSession} currentUser={currentUser} />
    case 'services':     return <ServicesScreen     posSession={posSession} currentUser={currentUser} />
    case 'followup':     return <FollowUpScreen     posSession={posSession} currentUser={currentUser} />
    case 'reports':      return <ServiceReports     posSession={posSession} currentUser={currentUser} />
    case 'settings':     return <ServiceSettings    posSession={posSession} currentUser={currentUser} />
    default:             return <ServiceDashboard   posSession={posSession} currentUser={currentUser} />
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ServiceApp({ posSession, currentUser, onLogout }) {
  const [activeScreen, setActiveScreen] = useState('dashboard')

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'radial-gradient(ellipse at top, #0d1829 0%, #020817 60%)',
    }}>

      {/* ── TOP BAR — identical style to retail top bar ─────────────────────── */}
      <div style={{
        height: 50,
        background: 'linear-gradient(90deg, #0a0f1e 0%, #0d1524 100%)',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 8, flexShrink: 0,
        boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 16 }}>
          <span className="fluxe-logo">
            <span className="fluxe-f">F</span>luxe
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)',
            color: '#60a5fa', fontSize: 11, fontWeight: 600,
          }}>
            {posSession?.location || 'Service'}
          </span>
          {/* Service mode badge */}
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
            color: '#a78bfa', fontSize: 10, fontWeight: 700, letterSpacing: 0.4,
          }}>
            SERVICE
          </span>
        </div>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right side: user + date + logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {currentUser && (
            <span style={{ color: C.green, fontSize: 13 }}>
              👤 {currentUser.name}
            </span>
          )}
          <span style={{ color: C.textMuted, fontSize: 12 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={onLogout}
            title="Switch location / Log out"
            style={{
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 4,
              color: C.textMuted, fontSize: 10, cursor: 'pointer',
              padding: '4px 8px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2, transition: T.std,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMuted }}
          >
            <span style={{ fontSize: 14 }}>🔓</span>
            Switch
          </button>
        </div>
      </div>

      {/* ── BODY: sidebar + main ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── SIDEBAR NAV ───────────────────────────────────────────────────── */}
        <nav style={{
          width: 180,
          background: '#0a0f1e',
          borderRight: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column',
          paddingTop: 12, flexShrink: 0, overflowY: 'auto',
        }}>
          {NAV.map(item => {
            const active = activeScreen === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveScreen(item.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '11px 16px',
                  border: 'none',
                  borderLeft: `3px solid ${active ? C.blue : 'transparent'}`,
                  background: active ? 'rgba(37,99,235,0.10)' : 'transparent',
                  color: active ? '#93c5fd' : C.textMuted,
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  cursor: 'pointer', textAlign: 'left',
                  transition: T.std,
                  width: '100%',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.color = C.textSub
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = C.textMuted
                  }
                }}
              >
                <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* ── MAIN CONTENT AREA ─────────────────────────────────────────────── */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ActiveScreen
            screen={activeScreen}
            posSession={posSession}
            currentUser={currentUser}
          />
        </main>

      </div>
    </div>
  )
}
