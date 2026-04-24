import { useState } from 'react'
import {
  loadCRMSettings, saveCRMSettings,
  ALL_FIELDS, DEFAULT_SETTINGS,
} from '../utils/crmSettingsStorage'

// ── Colors ────────────────────────────────────────────────────────────────────
const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const TEXT   = '#f1f5f9'
const SUB    = '#cbd0e0'
const MUTED  = '#94a3b8'
const DIM    = '#415569'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'

const STAR_COLORS = ['', '#cbd0e0', '#f59e0b', '#f59e0b', '#f59e0b', '#22c55e']

export default function CRMSettings() {
  const [settings, setSettings] = useState(loadCRMSettings)
  const [saved,    setSaved]    = useState(false)
  const [tierError, setTierError] = useState('')

  const toggleMandatory = (key) => {
    // firstName always mandatory — cannot uncheck
    if (key === 'firstName') return
    setSettings(s => ({
      ...s,
      mandatoryFields: s.mandatoryFields.includes(key)
        ? s.mandatoryFields.filter(f => f !== key)
        : [...s.mandatoryFields, key],
    }))
    setSaved(false)
  }

  const updateTier = (idx, field, raw) => {
    const val = raw === '' ? '' : Number(raw)
    setSettings(s => ({
      ...s,
      loyaltyTiers: s.loyaltyTiers.map((t, i) =>
        i !== idx ? t : { ...t, [field]: raw === '' || isNaN(val) ? '' : val }
      ),
    }))
    setSaved(false)
    setTierError('')
  }

  const handleSave = () => {
    // Validate tiers
    for (let i = 0; i < settings.loyaltyTiers.length; i++) {
      const t = settings.loyaltyTiers[i]
      if (t.min === '' || isNaN(t.min)) { setTierError(`Tier ${i + 1}: Min value is required.`); return }
      if (i < settings.loyaltyTiers.length - 1 && (t.max === '' || isNaN(t.max))) { setTierError(`Tier ${i + 1}: Max value is required.`); return }
      if (i > 0 && t.min !== settings.loyaltyTiers[i - 1].max) { setTierError(`Tier ${i + 1}: Min must equal previous tier's Max.`); return }
    }
    saveCRMSettings(settings)
    setSaved(true)
    setTierError('')
    setTimeout(() => setSaved(false), 2500)
  }

  const resetDefaults = () => {
    setSettings({ ...DEFAULT_SETTINGS })
    setSaved(false)
    setTierError('')
  }

  const sectionStyle = {
    background: PANEL, border: `1px solid ${BORDER}`,
    borderRadius: 12, padding: '22px 24px', marginBottom: 20,
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: BG }}>

      {/* ── Mandatory Fields ── */}
      <div style={sectionStyle}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Mandatory Fields</h3>
          <p style={{ color: MUTED, fontSize: 12 }}>
            Fields marked as mandatory will be required when capturing a new customer.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {ALL_FIELDS.map(f => {
            const checked  = settings.mandatoryFields.includes(f.key)
            const locked   = f.key === 'firstName'
            return (
              <label key={f.key} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px',
                background: checked ? 'rgba(37,99,235,0.07)' : CARD,
                border: `1px solid ${checked ? 'rgba(37,99,235,0.35)' : BORDER}`,
                borderRadius: 8, cursor: locked ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleMandatory(f.key)}
                  disabled={locked}
                  style={{ accentColor: BLUE, width: 15, height: 15, cursor: locked ? 'not-allowed' : 'pointer' }}
                />
                <span style={{ color: checked ? '#93c5fd' : SUB, fontSize: 13, fontWeight: checked ? 600 : 400 }}>
                  {f.label}
                </span>
                {locked && (
                  <span style={{ color: DIM, fontSize: 10, marginLeft: 'auto' }}>always</span>
                )}
              </label>
            )
          })}
        </div>
      </div>

      {/* ── Loyalty Program ── */}
      <div style={sectionStyle}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>Loyalty Program</h3>
          <p style={{ color: MUTED, fontSize: 12 }}>
            Customers are automatically classified by total spend. Edit the thresholds below.
          </p>
        </div>

        {/* Preview legend */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
          {settings.loyaltyTiers.map(t => (
            <div key={t.stars} style={{
              padding: '6px 14px', background: CARD,
              border: `1px solid ${BORDER}`, borderRadius: 20,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ color: STAR_COLORS[t.stars], fontSize: 14, letterSpacing: -1 }}>
                {'★'.repeat(t.stars)}{'☆'.repeat(5 - t.stars)}
              </span>
              <span style={{ color: MUTED, fontSize: 11 }}>
                ${t.min}{t.max !== null ? `–$${t.max}` : '+'}
              </span>
            </div>
          ))}
        </div>

        {/* Tier table */}
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          {['Stars', 'Min ($)', 'Max ($)', 'Range Preview'].map(h => (
            <div key={h} style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, paddingBottom: 4 }}>{h.toUpperCase()}</div>
          ))}
          {settings.loyaltyTiers.map((t, idx) => {
            const isLast = idx === settings.loyaltyTiers.length - 1
            return [
              // Stars
              <div key={`star-${idx}`} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: STAR_COLORS[t.stars], fontSize: 16, letterSpacing: -2 }}>
                  {'★'.repeat(t.stars)}
                </span>
              </div>,
              // Min
              <input
                key={`min-${idx}`}
                type="number" min="0"
                value={t.min}
                onChange={e => updateTier(idx, 'min', e.target.value)}
                style={{
                  padding: '7px 10px', background: CARD,
                  border: `1px solid ${BORDER}`, borderRadius: 7,
                  color: TEXT, fontSize: 13, outline: 'none', width: '100%',
                }}
                onFocus={e => { e.target.style.borderColor = BLUE }}
                onBlur={e => { e.target.style.borderColor = BORDER }}
              />,
              // Max
              isLast ? (
                <div key={`max-${idx}`} style={{ display: 'flex', alignItems: 'center', padding: '0 10px', color: MUTED, fontSize: 13 }}>
                  No limit
                </div>
              ) : (
                <input
                  key={`max-${idx}`}
                  type="number" min="0"
                  value={t.max ?? ''}
                  onChange={e => updateTier(idx, 'max', e.target.value)}
                  style={{
                    padding: '7px 10px', background: CARD,
                    border: `1px solid ${BORDER}`, borderRadius: 7,
                    color: TEXT, fontSize: 13, outline: 'none', width: '100%',
                  }}
                  onFocus={e => { e.target.style.borderColor = BLUE }}
                  onBlur={e => { e.target.style.borderColor = BORDER }}
                />
              ),
              // Preview
              <div key={`prev-${idx}`} style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: DIM, fontSize: 12 }}>
                  ${t.min ?? '?'}{t.max !== null && t.max !== undefined && t.max !== '' ? ` – $${t.max}` : '+'}
                </span>
              </div>,
            ]
          })}
        </div>

        {tierError && (
          <p style={{ color: RED, fontSize: 12, marginBottom: 10, padding: '7px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
            {tierError}
          </p>
        )}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={handleSave} style={{
          padding: '11px 28px',
          background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
          border: 'none', borderRadius: 10, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 0 20px rgba(37,99,235,0.35)',
        }}>
          Save Settings
        </button>
        <button onClick={resetDefaults} style={{
          padding: '10px 20px', background: 'transparent',
          border: `1px solid ${BORDER}`, borderRadius: 10,
          color: MUTED, fontSize: 13, cursor: 'pointer',
        }}>
          Reset to Defaults
        </button>
        {saved && (
          <span style={{ color: GREEN, fontSize: 13, fontWeight: 600 }}>
            ✓ Saved successfully
          </span>
        )}
      </div>
    </div>
  )
}
