/**
 * SystemSetupScreen.jsx — Admin → General → System / Reset Setup
 *
 * Shows current Supabase connection info and allows resetting credentials.
 * Resetting clears localStorage config → next boot shows SetupScreen.
 */

import { useState } from 'react'
import { getClientConfig, clearClientConfig } from '../services/clientConfig'

const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const TEXT   = 'var(--c-text)'
const MUTED  = 'var(--c-text-muted)'
const RED    = '#ef4444'
const GREEN  = '#22c55e'

function Row({ label, value, mono }) {
  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: 12, borderBottom: `1px solid ${BORDER}`, marginBottom: 12 }}>
      <span style={{ color: MUTED, fontSize: 12, minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: TEXT, fontSize: 12,
        fontFamily: mono ? 'monospace' : 'inherit',
        wordBreak: 'break-all', lineHeight: 1.5,
      }}>{value || <em style={{ color: MUTED }}>not set</em>}</span>
    </div>
  )
}

function mask(str) {
  if (!str) return ''
  if (str.length <= 8) return '••••••••'
  return str.slice(0, 6) + '•••••••••••' + str.slice(-4)
}

export default function SystemSetupScreen({ onBack }) {
  const cfg = getClientConfig()
  const fromEnv = !localStorage.getItem('fluxe-client-config-v1')
  const [confirming, setConfirming] = useState(false)
  const [done,       setDone]       = useState(false)

  const handleReset = () => {
    clearClientConfig()
    setDone(true)
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '10px 16px', background: CARD,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer' }}>←</button>
        <span style={{ color: '#64748b', fontWeight: 700, fontSize: 13 }}>⚙️ System / Reset Setup</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', maxWidth: 680 }}>

        {/* Source badge */}
        <div style={{ marginBottom: 20 }}>
          <span style={{
            display: 'inline-block', padding: '3px 10px', borderRadius: 20,
            background: fromEnv ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
            border: `1px solid ${fromEnv ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
            color: fromEnv ? '#fbbf24' : GREEN, fontSize: 11, fontWeight: 700,
          }}>
            {fromEnv ? 'Config source: environment variables (build-time)' : 'Config source: localStorage (runtime setup)'}
          </span>
        </div>

        {/* Current credentials */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 20px', marginBottom: 24 }}>
          <p style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 16 }}>Current Connection</p>
          <Row label="Supabase URL"       value={cfg.supabaseUrl}                 mono />
          <Row label="Anon Key"           value={mask(cfg.supabaseAnonKey)}        mono />
          <Row label="Machine Email"      value={cfg.machineEmail}                 mono />
          <Row label="Machine Password"   value={cfg.machinePassword ? '••••••••' : ''} />
          <Row label="Org ID"             value={cfg.orgId}                        mono />
        </div>

        {/* Reset section */}
        {!fromEnv && (
          <div style={{ background: 'rgba(239,68,68,0.05)', border: `1px solid rgba(239,68,68,0.2)`, borderRadius: 8, padding: '18px 20px' }}>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Reset Setup</p>
            <p style={{ color: MUTED, fontSize: 12, marginBottom: 16, lineHeight: 1.6 }}>
              Clears the stored credentials from this device. The setup screen will appear on next load.
              Use this to re-connect to a different Supabase org or fix incorrect credentials.
            </p>

            {!confirming && !done && (
              <button
                onClick={() => setConfirming(true)}
                style={{
                  padding: '9px 20px', background: 'transparent',
                  border: `1px solid rgba(239,68,68,0.4)`,
                  borderRadius: 6, color: RED, fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reset Credentials
              </button>
            )}

            {confirming && !done && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ color: RED, fontSize: 12 }}>Are you sure? This kiosk will be disconnected.</span>
                <button
                  onClick={handleReset}
                  style={{
                    padding: '7px 16px', background: RED, border: 'none',
                    borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >Yes, Reset</button>
                <button
                  onClick={() => setConfirming(false)}
                  style={{
                    padding: '7px 16px', background: 'transparent',
                    border: `1px solid ${BORDER}`, borderRadius: 6,
                    color: MUTED, fontSize: 12, cursor: 'pointer',
                  }}
                >Cancel</button>
              </div>
            )}

            {done && (
              <p style={{ color: GREEN, fontSize: 13, fontWeight: 700 }}>✓ Reset — reloading…</p>
            )}
          </div>
        )}

        {fromEnv && (
          <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.6 }}>
            This deployment uses build-time environment variables. To change credentials, update the Vercel project settings and redeploy.
          </p>
        )}

      </div>
    </div>
  )
}
