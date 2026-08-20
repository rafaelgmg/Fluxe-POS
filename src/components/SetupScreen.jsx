/**
 * SetupScreen.jsx — First-launch credential setup for new Fluxe deployments.
 *
 * Shows when isClientConfigured() returns false (no env vars AND no localStorage config).
 * Collects Supabase credentials, tests the connection, extracts org_id from JWT, saves.
 * After saving, reloads the page — all service modules then read from clientConfig.
 */

import { useState } from 'react'
import { saveClientConfig } from '../services/clientConfig'

const BG     = '#020b17'
const PANEL  = '#0c1626'
const CARD   = '#111d30'
const BORDER = '#1e3048'
const TEXT   = '#f1f5f9'
const MUTED  = '#64748b'
const SUB    = '#94a3b8'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const RED    = '#ef4444'

const inp = (focused) => ({
  width: '100%', padding: '7px 10px', background: CARD,
  border: `1px solid ${focused ? BLUE : BORDER}`,
  borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'monospace',
  transition: 'border-color 0.15s',
})

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ color: MUTED, fontSize: 10, marginTop: 3, lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )
}

export default function SetupScreen({ onClose }) {
  const [form, setForm] = useState({
    supabaseUrl:     '',
    supabaseAnonKey: '',
    machineEmail:    '',
    machinePassword: '',
    accountUsername:  '',
    accountPassword:  '',
  })
  const [focused,  setFocused]  = useState(null)
  const [testing,  setTesting]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(null) }

  const allFilled = form.supabaseUrl && form.supabaseAnonKey && form.machineEmail && form.machinePassword &&
    form.accountUsername && form.accountPassword

  const handleTest = async () => {
    if (!allFilled || testing) return
    setTesting(true)
    setError(null)

    const url = form.supabaseUrl.replace(/\/$/, '')

    try {
      // Attempt machine account sign-in to validate all credentials at once
      const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method:  'POST',
        headers: { apikey: form.supabaseAnonKey, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.machineEmail, password: form.machinePassword }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error_description || body?.msg || `Auth failed (${res.status})`)
      }

      const data = await res.json()

      // Extract org_id from JWT
      let orgId = ''
      try {
        const payload = JSON.parse(atob(data.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        orgId = payload?.app_metadata?.org_id || ''
      } catch {}

      if (!orgId) {
        throw new Error('Connected but org_id not found in JWT. Check machine account app_metadata.')
      }

      // Clear any org-specific data cached from a previous session before saving new config
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i)
        if (key && key.startsWith('fluxe-') && key !== 'fluxe-client-config-v1') {
          localStorage.removeItem(key)
        }
      }

      // All good — save and reload
      saveClientConfig({
        supabaseUrl:      url,
        supabaseAnonKey:  form.supabaseAnonKey.trim(),
        machineEmail:     form.machineEmail.trim(),
        machinePassword:  form.machinePassword,
        orgId,
        accountUsername:  form.accountUsername.trim().toLowerCase(),
        accountPassword:  form.accountPassword,
      })

      setSuccess(true)
      setTimeout(() => window.location.reload(), 800)

    } catch (err) {
      setError(err.message || 'Connection failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,11,23,0.92)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, zIndex: 9999,
    }}>
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
        width: '100%', maxWidth: 460,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        position: 'relative',
      }}>
        {/* Close button */}
        {onClose && (
          <button onClick={onClose} style={{
            position: 'absolute', top: 12, right: 12,
            background: 'transparent', border: 'none',
            color: MUTED, fontSize: 18, cursor: 'pointer',
            lineHeight: 1, padding: 4, borderRadius: 4,
          }}>✕</button>
        )}

        <div style={{ padding: '20px 24px 24px' }}>
          {/* Logo + title */}
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 36, height: 36, borderRadius: 10,
              background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
              marginBottom: 8, fontSize: 18,
            }}>⚡</div>
            <h1 style={{ color: TEXT, fontSize: 16, fontWeight: 800, marginBottom: 2 }}>Fluxe POS — Setup</h1>
            <p style={{ color: MUTED, fontSize: 11 }}>Connect this kiosk to your Supabase organization</p>
          </div>

          {/* Form */}
          <Field label="SUPABASE PROJECT URL" hint="Settings → API Keys → Project URL">
            <input
              value={form.supabaseUrl}
              onChange={e => set('supabaseUrl', e.target.value)}
              onFocus={() => setFocused('url')} onBlur={() => setFocused(null)}
              style={inp(focused === 'url')}
              placeholder="https://xxxxxxxxxxxx.supabase.co"
              spellCheck={false}
            />
          </Field>

          <Field label="SUPABASE ANON KEY" hint="Settings → API Keys → anon public key">
            <input
              value={form.supabaseAnonKey}
              onChange={e => set('supabaseAnonKey', e.target.value)}
              onFocus={() => setFocused('key')} onBlur={() => setFocused(null)}
              style={inp(focused === 'key')}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              spellCheck={false}
            />
          </Field>

          <Field label="MACHINE ACCOUNT EMAIL">
            <input
              value={form.machineEmail}
              onChange={e => set('machineEmail', e.target.value)}
              onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
              style={inp(focused === 'email')}
              placeholder="pos-machine@yourbusiness.local"
              autoComplete="off"
            />
          </Field>

          <Field label="MACHINE ACCOUNT PASSWORD">
            <input
              type="password"
              value={form.machinePassword}
              onChange={e => set('machinePassword', e.target.value)}
              onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)}
              style={inp(focused === 'pass')}
              placeholder="••••••••••••"
              autoComplete="new-password"
            />
          </Field>

          <div style={{ borderTop: `1px solid ${BORDER}`, margin: '14px 0 12px', opacity: 0.5 }} />
          <p style={{ color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 10 }}>
            ACCESS CREDENTIALS — used to log in to this kiosk
          </p>

          <Field label="ACCOUNT USERNAME" hint="Entered on the 'Sign in to your account' screen">
            <input
              value={form.accountUsername}
              onChange={e => set('accountUsername', e.target.value)}
              onFocus={() => setFocused('accu')} onBlur={() => setFocused(null)}
              style={{ ...inp(focused === 'accu'), fontFamily: 'inherit' }}
              placeholder="e.g. admin"
              autoComplete="off"
            />
          </Field>

          <Field label="ACCOUNT PASSWORD">
            <input
              type="password"
              value={form.accountPassword}
              onChange={e => set('accountPassword', e.target.value)}
              onFocus={() => setFocused('accp')} onBlur={() => setFocused(null)}
              style={inp(focused === 'accp')}
              placeholder="••••••••••••"
              autoComplete="new-password"
            />
          </Field>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`,
              color: RED, fontSize: 11, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleTest}
            disabled={!allFilled || testing || success}
            style={{
              width: '100%', padding: '11px',
              background: success
                ? `linear-gradient(135deg, ${GREEN} 0%, #16a34a 100%)`
                : `linear-gradient(135deg, ${BLUE} 0%, #7c3aed 100%)`,
              border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 13, fontWeight: 700,
              cursor: (!allFilled || testing || success) ? 'not-allowed' : 'pointer',
              opacity: (!allFilled && !testing) ? 0.5 : 1,
              transition: 'all 0.2s',
            }}
          >
            {success ? '✓ Connected — reloading…' : testing ? 'Testing connection…' : 'Test & Save'}
          </button>

          <p style={{ color: MUTED, fontSize: 10, textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            Credentials are saved locally on this device only.
            To reset, open Admin → System → Reset Setup.
          </p>
        </div>
      </div>
    </div>
  )
}
