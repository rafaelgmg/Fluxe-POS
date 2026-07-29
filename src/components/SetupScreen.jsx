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

const inp = (focused, err) => ({
  width: '100%', padding: '10px 12px', background: CARD,
  border: `1px solid ${err ? RED : focused ? BLUE : BORDER}`,
  borderRadius: 6, color: TEXT, fontSize: 13, outline: 'none',
  boxSizing: 'border-box', fontFamily: 'monospace',
  transition: 'border-color 0.15s',
})

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', color: SUB, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ color: MUTED, fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

export default function SetupScreen() {
  const [form, setForm] = useState({
    supabaseUrl:     '',
    supabaseAnonKey: '',
    machineEmail:    '',
    machinePassword: '',
  })
  const [focused,  setFocused]  = useState(null)
  const [testing,  setTesting]  = useState(false)
  const [error,    setError]    = useState(null)
  const [success,  setSuccess]  = useState(false)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(null) }

  const allFilled = form.supabaseUrl && form.supabaseAnonKey && form.machineEmail && form.machinePassword

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

      // All good — save and reload
      saveClientConfig({
        supabaseUrl:     url,
        supabaseAnonKey: form.supabaseAnonKey.trim(),
        machineEmail:    form.machineEmail.trim(),
        machinePassword: form.machinePassword,
        orgId,
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
      minHeight: '100vh', background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12,
        width: '100%', maxWidth: 520, padding: 36,
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>

        {/* Logo + title */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
            marginBottom: 12, fontSize: 22,
          }}>⚡</div>
          <h1 style={{ color: TEXT, fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Fluxe POS — Setup</h1>
          <p style={{ color: MUTED, fontSize: 13 }}>Connect this kiosk to your Supabase organization</p>
        </div>

        {/* Form */}
        <Field
          label="SUPABASE PROJECT URL"
          hint="Found in Supabase → Settings → API → Project URL"
        >
          <input
            value={form.supabaseUrl}
            onChange={e => set('supabaseUrl', e.target.value)}
            onFocus={() => setFocused('url')} onBlur={() => setFocused(null)}
            style={inp(focused === 'url', false)}
            placeholder="https://xxxxxxxxxxxx.supabase.co"
            spellCheck={false}
          />
        </Field>

        <Field
          label="SUPABASE ANON KEY"
          hint="Found in Supabase → Settings → API → anon public key"
        >
          <input
            value={form.supabaseAnonKey}
            onChange={e => set('supabaseAnonKey', e.target.value)}
            onFocus={() => setFocused('key')} onBlur={() => setFocused(null)}
            style={inp(focused === 'key', false)}
            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
            spellCheck={false}
          />
        </Field>

        <Field
          label="MACHINE ACCOUNT EMAIL"
          hint="The Supabase Auth email created for this org (e.g. pos-machine@yourbusiness.local)"
        >
          <input
            value={form.machineEmail}
            onChange={e => set('machineEmail', e.target.value)}
            onFocus={() => setFocused('email')} onBlur={() => setFocused(null)}
            style={inp(focused === 'email', false)}
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
            style={inp(focused === 'pass', false)}
            placeholder="••••••••••••"
            autoComplete="new-password"
          />
        </Field>

        {error && (
          <div style={{
            padding: '10px 14px', borderRadius: 6, marginBottom: 16,
            background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`,
            color: RED, fontSize: 12, lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleTest}
          disabled={!allFilled || testing || success}
          style={{
            width: '100%', padding: '13px',
            background: success
              ? `linear-gradient(135deg, ${GREEN} 0%, #16a34a 100%)`
              : `linear-gradient(135deg, ${BLUE} 0%, #7c3aed 100%)`,
            border: 'none', borderRadius: 8,
            color: '#fff', fontSize: 14, fontWeight: 700,
            cursor: (!allFilled || testing || success) ? 'not-allowed' : 'pointer',
            opacity: (!allFilled && !testing) ? 0.5 : 1,
            transition: 'all 0.2s',
          }}
        >
          {success ? '✓ Connected — reloading…' : testing ? 'Testing connection…' : 'Test & Save'}
        </button>

        <p style={{ color: MUTED, fontSize: 11, textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
          Credentials are saved locally on this device only.<br/>
          To reset, open Admin → System → Reset Setup.
        </p>

      </div>
    </div>
  )
}
