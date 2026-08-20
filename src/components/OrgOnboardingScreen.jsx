/**
 * OrgOnboardingScreen.jsx — First-time business setup for new Fluxe clients.
 *
 * Shown when the machine account is configured (SetupScreen done) but
 * org_settings has not been created yet in Supabase. The client fills in
 * their business name, first location, and kiosk password — no SQL needed.
 */

import { useState } from 'react'
import { upsertOrgSettings } from '../services/supabaseOrgSettings'

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
  width: '100%', padding: '9px 12px', background: CARD,
  border: `1px solid ${focused ? BLUE : BORDER}`,
  borderRadius: 6, color: TEXT, fontSize: 13, outline: 'none',
  boxSizing: 'border-box', transition: 'border-color 0.15s',
})

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ color: MUTED, fontSize: 10, marginTop: 4, lineHeight: 1.4 }}>{hint}</p>}
    </div>
  )
}

export default function OrgOnboardingScreen({ onComplete }) {
  const [form, setForm] = useState({
    businessName:  '',
    locationName:  '',
    address:       '',
    password:      '',
  })
  const [focused, setFocused] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(null) }

  const canSave = form.businessName.trim() && form.locationName.trim()

  const handleSave = async () => {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)
    try {
      const location = {
        id:            'loc_01',
        name:          form.locationName.trim(),
        address:       form.address.trim() || 'Las Vegas, Nevada',
        region:        'Las Vegas',
        business_type: 'retail',
        location_type: 'retail',
        phone:         '',
      }

      await upsertOrgSettings({
        business_name:     form.businessName.trim(),
        business_short:    form.businessName.trim().toUpperCase().slice(0, 20),
        tax_rate:          8.5,
        currency_symbol:   '$',
        receipt_footer:    'No Refunds. Exchanges within 14 days.',
        receipt_legal:     'Thank you for your purchase!',
        crm_sms_signature: `— ${form.businessName.trim()}`,
        locations:         [location],
      })

      // Save kiosk password to local location config so LoginScreen can read it
      if (form.password) {
        const locs = [{ ...location, password: form.password }]
        localStorage.setItem('fluxe-locations-v1', JSON.stringify(locs))
      }

      onComplete()
    } catch (err) {
      setError(err.message || 'Failed to save. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: BG,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 14,
        width: '100%', maxWidth: 480,
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        <div style={{ padding: '28px 32px 32px' }}>

          {/* Header */}
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 12,
              background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
              marginBottom: 12, fontSize: 22,
            }}>🏪</div>
            <h1 style={{ color: TEXT, fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
              Set Up Your Business
            </h1>
            <p style={{ color: MUTED, fontSize: 12 }}>
              Configure your business name and first location to get started.
            </p>
          </div>

          {/* Business Info */}
          <div style={{ color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
            BUSINESS INFORMATION
          </div>

          <Field label="BUSINESS NAME *">
            <input
              value={form.businessName}
              onChange={e => set('businessName', e.target.value)}
              onFocus={() => setFocused('biz')} onBlur={() => setFocused(null)}
              style={inp(focused === 'biz')}
              placeholder="e.g. Kahsay Retail"
              autoFocus
            />
          </Field>

          {/* Location Info */}
          <div style={{ borderTop: `1px solid ${BORDER}`, margin: '16px 0 14px', opacity: 0.4 }} />
          <div style={{ color: SUB, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 12 }}>
            FIRST LOCATION
          </div>

          <Field label="LOCATION NAME *" hint="This is the name shown on the login screen and receipts.">
            <input
              value={form.locationName}
              onChange={e => set('locationName', e.target.value)}
              onFocus={() => setFocused('loc')} onBlur={() => setFocused(null)}
              style={inp(focused === 'loc')}
              placeholder="e.g. Kiosk 01"
            />
          </Field>

          <Field label="ADDRESS" hint="Optional — appears on receipts.">
            <input
              value={form.address}
              onChange={e => set('address', e.target.value)}
              onFocus={() => setFocused('addr')} onBlur={() => setFocused(null)}
              style={inp(focused === 'addr')}
              placeholder="e.g. 3663 Las Vegas Blvd, Las Vegas NV"
            />
          </Field>

          <Field label="KIOSK PASSWORD" hint="Optional — set now or later in Admin → Locations → Security.">
            <input
              type="password"
              value={form.password}
              onChange={e => set('password', e.target.value)}
              onFocus={() => setFocused('pw')} onBlur={() => setFocused(null)}
              style={inp(focused === 'pw')}
              placeholder="Leave blank to set later"
              autoComplete="new-password"
            />
          </Field>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 6, marginBottom: 14,
              background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`,
              color: RED, fontSize: 11, lineHeight: 1.5,
            }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              width: '100%', padding: '12px',
              background: `linear-gradient(135deg, ${BLUE} 0%, #7c3aed 100%)`,
              border: 'none', borderRadius: 8,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: (!canSave || saving) ? 'not-allowed' : 'pointer',
              opacity: (!canSave && !saving) ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {saving ? 'Saving…' : 'Continue →'}
          </button>

          <p style={{ color: MUTED, fontSize: 10, textAlign: 'center', marginTop: 12, lineHeight: 1.5 }}>
            You can add more locations and employees in Admin after setup.
          </p>
        </div>
      </div>
    </div>
  )
}
