/**
 * OrgSettingsScreen.jsx
 * Admin → General → Business Settings
 *
 * Edits org_settings in Supabase: business name, tax rate,
 * receipt footer, SMS signature.
 */

import { useState, useEffect } from 'react'
import { fetchOrgSettings, saveOrgSettings } from '../services/supabaseOrgSettings'

const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const MUTED  = 'var(--c-text-muted)'
const TEXT   = 'var(--c-text)'

const inp = (extra = {}) => ({
  padding: '8px 10px', background: BG, border: `1px solid ${BORDER}`,
  borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none',
  width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', ...extra,
})

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ color: MUTED, fontSize: 11, marginTop: 4, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 12 }}>{title}</p>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '18px 18px 4px' }}>
        {children}
      </div>
    </div>
  )
}

const EMPTY = {
  business_name: '', business_short: '', tax_rate: 8.5,
  receipt_footer: '', receipt_legal: '', crm_sms_signature: '',
}

export default function OrgSettingsScreen({ onBack }) {
  const [form,    setForm]    = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    fetchOrgSettings()
      .then(s => {
        if (s) setForm({
          business_name:     s.business_name     || '',
          business_short:    s.business_short    || '',
          tax_rate:          s.tax_rate          ?? 8.5,
          receipt_footer:    s.receipt_footer    || '',
          receipt_legal:     s.receipt_legal     || '',
          crm_sms_signature: s.crm_sms_signature || '',
        })
      })
      .catch(() => setError('Failed to load settings from Supabase.'))
      .finally(() => setLoading(false))
  }, [])

  const set = (key, val) => { setForm(f => ({ ...f, [key]: val })); setSaved(false) }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await saveOrgSettings({
        business_name:     form.business_name.trim(),
        business_short:    form.business_short.trim() || form.business_name.toUpperCase().trim(),
        tax_rate:          parseFloat(form.tax_rate) || 8.5,
        receipt_footer:    form.receipt_footer.trim(),
        receipt_legal:     form.receipt_legal.trim(),
        crm_sms_signature: form.crm_sms_signature.trim(),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.message || 'Failed to save.')
    } finally {
      setSaving(false)
    }
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
        <span style={{ color: '#64748b', fontWeight: 700, fontSize: 13 }}>⚙️ Business Settings</span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 13 }}>
          Loading…
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 680 }}>

          {error && (
            <div style={{ padding: '10px 14px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#ef4444', fontSize: 12, marginBottom: 20 }}>
              {error}
            </div>
          )}

          <Section title="Business Identity">
            <Field label="BUSINESS NAME" hint="Shown in the POS header, receipts and account login screen.">
              <input value={form.business_name} onChange={e => set('business_name', e.target.value)} style={inp()} placeholder="e.g. Perfume Passage" />
            </Field>
            <Field label="BUSINESS SHORT NAME" hint="Uppercase display version used in compact headers. Leave blank to auto-generate.">
              <input value={form.business_short} onChange={e => set('business_short', e.target.value)} style={inp()} placeholder="e.g. PERFUME PASSAGE" />
            </Field>
          </Section>

          <Section title="Tax">
            <Field label="TAX RATE (%)" hint="Applied at checkout for all locations. Each location can override this via Location Settings.">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="number" step="0.001" min="0" max="100"
                  value={form.tax_rate}
                  onChange={e => set('tax_rate', e.target.value)}
                  style={{ ...inp(), width: 110, color: '#f59e0b' }}
                />
                <span style={{ color: MUTED, fontSize: 12 }}>% → {(parseFloat(form.tax_rate) || 0).toFixed(3)}%</span>
              </div>
            </Field>
          </Section>

          <Section title="Receipt">
            <Field label="RECEIPT FOOTER" hint="Printed at the bottom of every sale receipt.">
              <textarea
                value={form.receipt_footer}
                onChange={e => set('receipt_footer', e.target.value)}
                rows={2}
                style={{ ...inp(), resize: 'vertical', minHeight: 50 }}
                placeholder="e.g. No Refunds. Exchanges within 14 days."
              />
            </Field>
            <Field label="RECEIPT LEGAL TEXT" hint="Secondary text below the footer (e.g. thank you message).">
              <textarea
                value={form.receipt_legal}
                onChange={e => set('receipt_legal', e.target.value)}
                rows={2}
                style={{ ...inp(), resize: 'vertical', minHeight: 50 }}
                placeholder="e.g. Thank you for your purchase!"
              />
            </Field>
          </Section>

          <Section title="CRM / SMS">
            <Field label="SMS SIGNATURE" hint="Appended automatically to every SMS sent from the CRM.">
              <input value={form.crm_sms_signature} onChange={e => set('crm_sms_signature', e.target.value)} style={inp()} placeholder="e.g. — Perfume Passage" />
            </Field>
          </Section>

          {/* Save button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingBottom: 32 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: '10px 28px', borderRadius: 6, border: 'none',
                background: saved ? GREEN : BLUE,
                color: '#fff', fontSize: 13, fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'background 0.2s',
              }}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved!' : '💾 Save Settings'}
            </button>
            <p style={{ color: MUTED, fontSize: 11 }}>
              Changes apply to all kiosks after the next page load.
            </p>
          </div>

        </div>
      )}
    </div>
  )
}
