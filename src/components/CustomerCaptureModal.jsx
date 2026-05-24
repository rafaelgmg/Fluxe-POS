import { useState } from 'react'

const BLUE  = '#3b82f6'
const GREEN = '#22c55e'
const RED   = '#ef4444'

const FRAGRANCE_OPTIONS = [
  'Floral', 'Fresh / Aquatic', 'Woody', 'Oriental / Oud',
  'Citrus', 'Sweet / Gourmand', 'Spicy', 'Unisex / Niche',
]

// invoice = null → modo standalone (captura sem venda)
// capturedByEmployee = { id, name } — vendedor autenticado via PIN (pré-preenche o dropdown)
// sellerOptions = [{ id, name }] — lista de vendedores ativos para o dropdown
export default function CustomerCaptureModal({ invoice = null, onSave, onSkip, capturedByEmployee = null, sellerOptions = [] }) {
  const standalone = !invoice

  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    birthday: '', fragrancePreferences: [], notes: '', marketingConsent: false,
    capturedByName: capturedByEmployee?.name || '',
    capturedById:   capturedByEmployee?.id   || null,
  })

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const toggleFragrance = (opt) => {
    setForm(f => {
      const prefs = f.fragrancePreferences
      return {
        ...f,
        fragrancePreferences: prefs.includes(opt)
          ? prefs.filter(p => p !== opt)
          : [...prefs, opt],
      }
    })
  }

  // Pelo menos uma forma de contato válida
  const hasContact = form.phone.trim() || form.email.trim()
  const canSave    = form.firstName.trim() && hasContact

  const handleSave = () => { if (canSave) onSave(form) }

  const inputStyle = {
    width: '100%', padding: '9px 12px',
    background: 'var(--c-bg-card)', border: '1px solid var(--c-border-md)',
    borderRadius: 6, color: 'var(--c-text)', fontSize: 13,
    boxSizing: 'border-box', outline: 'none',
    transition: 'border-color 0.15s',
  }

  const inp = (key, extraStyle = {}) => ({
    value: form[key],
    onChange: e => set(key, e.target.value),
    style: { ...inputStyle, ...extraStyle },
    onFocus: e => { e.target.style.borderColor = BLUE },
    onBlur:  e => { e.target.style.borderColor = 'var(--c-border-md)' },
  })

  const lbl = (text, optional) => (
    <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>
      {text}
      {optional && <span style={{ color: 'var(--c-text-sub)', marginLeft: 4, fontWeight: 400 }}>(optional)</span>}
    </label>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--c-bg-panel)', border: '1px solid var(--c-border)', borderRadius: 10,
        width: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--c-shadow-card)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 22px 14px', borderBottom: '1px solid var(--c-border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ color: 'var(--c-text)', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
              {standalone ? '➕ Capture Client' : '👤 Customer Info'}
            </h2>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
              {standalone
                ? 'Save this contact — no sale required'
                : 'Link this sale to a customer — or skip'}
            </p>
          </div>
          {!standalone && (
            <div style={{
              background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
              borderRadius: 6, padding: '6px 12px', textAlign: 'right',
            }}>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 10 }}>Invoice #{invoice.number}</p>
              <p style={{ color: GREEN, fontWeight: 800, fontSize: 16 }}>${invoice.total.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Form body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 22px' }}>

          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              {lbl('First Name')}
              <input {...inp('firstName')} placeholder="Maria" />
            </div>
            <div>
              {lbl('Last Name', true)}
              <input {...inp('lastName')} placeholder="Silva" />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            {lbl('Phone Number', true)}
            <input {...inp('phone')} placeholder="702-555-1234" type="tel" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 4 }}>
            <div>
              {lbl('Email', true)}
              <input {...inp('email')} placeholder="email@example.com" type="email" />
            </div>
            <div>
              {lbl('Birthday', true)}
              <input {...inp('birthday')} type="date" />
            </div>
          </div>

          {/* Contact validation hint */}
          {!hasContact ? (
            <p style={{ color: RED, fontSize: 11, marginBottom: 14 }}>
              ⚠ Phone or email required — at least one must be filled
            </p>
          ) : (
            <div style={{ marginBottom: 14 }} />
          )}

          <div style={{ marginBottom: 14 }}>
            {lbl('Fragrance Preferences', true)}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {FRAGRANCE_OPTIONS.map(opt => {
                const active = form.fragrancePreferences.includes(opt)
                return (
                  <button
                    key={opt}
                    onClick={() => toggleFragrance(opt)}
                    style={{
                      padding: '5px 12px', borderRadius: 20,
                      border: `1px solid ${active ? BLUE : 'var(--c-border)'}`,
                      background: active ? 'rgba(37,99,235,0.15)' : 'var(--c-bg-card)',
                      color: active ? BLUE : 'var(--c-text-sub)',
                      fontSize: 12, cursor: 'pointer',
                      fontWeight: active ? 700 : 400,
                      transition: 'all 0.12s',
                    }}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            {lbl('Notes', true)}
            <textarea
              {...inp('notes', { resize: 'vertical', fontFamily: 'inherit', minHeight: 60 })}
              rows={2}
              placeholder="Bought for wife, prefers light scents..."
            />
          </div>

          {/* Captured by — only in standalone Capture mode */}
          {standalone && sellerOptions.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {lbl('Captured by')}
              <select
                value={form.capturedByName}
                onChange={e => {
                  const sel = sellerOptions.find(s => s.name === e.target.value)
                  setForm(f => ({ ...f, capturedByName: e.target.value, capturedById: sel?.id || null }))
                }}
                style={{
                  ...inputStyle,
                  cursor: 'pointer',
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right 12px center',
                  paddingRight: 34,
                  appearance: 'none',
                }}
              >
                <option value="">— Select seller —</option>
                {sellerOptions.map(s => (
                  <option key={s.id || s.name} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Marketing consent */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            background: 'var(--c-bg-card)', borderRadius: 6, padding: '12px 14px',
            border: `1px solid ${form.marketingConsent ? 'rgba(37,99,235,0.4)' : 'var(--c-border)'}`,
            transition: 'border-color 0.15s',
          }}>
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={e => set('marketingConsent', e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer', accentColor: BLUE }}
            />
            <div>
              <p style={{ color: 'var(--c-text)', fontSize: 13, fontWeight: 500 }}>
                Receive promotions & offers
              </p>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 2 }}>
                Customer agrees to receive marketing messages via SMS or email
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 2, padding: '13px',
              background: canSave ? BLUE : 'var(--c-bg-card)',
              border: canSave ? 'none' : '1px solid var(--c-border)',
              borderRadius: 6,
              color: canSave ? '#fff' : 'var(--c-text-muted)',
              fontSize: 14, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
              boxShadow: canSave ? '0 0 20px rgba(37,99,235,0.25)' : 'none',
            }}
            onMouseEnter={e => { if (canSave) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (canSave) e.currentTarget.style.background = BLUE }}
          >
            {standalone ? '💾 Save Client' : '💾 Save & Complete'}
          </button>
          <button
            onClick={onSkip}
            style={{
              flex: 1, padding: '13px',
              background: 'transparent', border: '1px solid var(--c-border)',
              borderRadius: 6, color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-muted)' }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
