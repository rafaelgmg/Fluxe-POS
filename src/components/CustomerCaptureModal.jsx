import { useState } from 'react'

const FRAGRANCE_OPTIONS = [
  'Floral', 'Fresh / Aquatic', 'Woody', 'Oriental / Oud',
  'Citrus', 'Sweet / Gourmand', 'Spicy', 'Unisex / Niche',
]

// invoice = null → modo standalone (captura sem venda)
export default function CustomerCaptureModal({ invoice = null, onSave, onSkip }) {
  const standalone = !invoice

  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    birthday: '', fragrancePreferences: [], notes: '', marketingConsent: false,
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

  const inp = (key, extra = {}) => ({
    value: form[key],
    onChange: e => set(key, e.target.value),
    style: {
      width: '100%', padding: '9px 12px',
      background: '#0f172a', border: '1px solid #1e293b',
      borderRadius: 6, color: '#f1f5f9', fontSize: 13,
      boxSizing: 'border-box', outline: 'none',
      transition: 'border-color 0.15s',
      ...extra.style,
    },
    onFocus: e => { e.target.style.borderColor = '#2563eb' },
    onBlur:  e => { e.target.style.borderColor = '#1e293b' },
    ...extra,
  })

  const lbl = (text, optional) => (
    <label style={{ color: '#475569', fontSize: 11, fontWeight: 600, marginBottom: 6, display: 'block', letterSpacing: 0.5 }}>
      {text}
      {optional && <span style={{ color: '#334155', marginLeft: 4, fontWeight: 400 }}>(optional)</span>}
    </label>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1e 100%)', border: '1px solid #1e293b', borderRadius: 10,
        width: 480, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 22px 14px', borderBottom: '1px solid #1e293b',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700, marginBottom: 2 }}>
              {standalone ? '➕ Capture Client' : '👤 Customer Info'}
            </h2>
            <p style={{ color: '#475569', fontSize: 12 }}>
              {standalone
                ? 'Save this contact — no sale required'
                : 'Link this sale to a customer — or skip'}
            </p>
          </div>
          {!standalone && (
            <div style={{
              background: '#0f172a', border: '1px solid #1e293b',
              borderRadius: 6, padding: '6px 12px', textAlign: 'right'
            }}>
              <p style={{ color: '#475569', fontSize: 10 }}>Invoice #{invoice.number}</p>
              <p style={{ color: '#22c55e', fontWeight: 800, fontSize: 16 }}>${invoice.total.toFixed(2)}</p>
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
              <input {...inp('birthday')} type="date" style={{ colorScheme: 'dark' }} />
            </div>
          </div>

          {/* Contact validation hint */}
          {!hasContact ? (
            <p style={{ color: '#ef4444', fontSize: 11, marginBottom: 14 }}>
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
                      border: `1px solid ${active ? '#2563eb' : '#1e293b'}`,
                      background: active ? 'rgba(37,99,235,0.15)' : '#0f172a',
                      color: active ? '#93c5fd' : '#64748b',
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
              {...inp('notes', { style: { resize: 'vertical', fontFamily: 'inherit', minHeight: 60 } })}
              rows={2}
              placeholder="Bought for wife, prefers light scents..."
            />
          </div>

          {/* Marketing consent */}
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
            background: '#0f172a', borderRadius: 6, padding: '12px 14px',
            border: `1px solid ${form.marketingConsent ? 'rgba(37,99,235,0.4)' : '#1e293b'}`,
            transition: 'border-color 0.15s',
          }}>
            <input
              type="checkbox"
              checked={form.marketingConsent}
              onChange={e => set('marketingConsent', e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer', accentColor: '#2563eb' }}
            />
            <div>
              <p style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 500 }}>
                Receive promotions & offers
              </p>
              <p style={{ color: '#334155', fontSize: 11, marginTop: 2 }}>
                Customer agrees to receive marketing messages via SMS or email
              </p>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 22px', borderTop: '1px solid #1e293b',
          display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              flex: 2, padding: '13px',
              background: canSave ? '#2563eb' : '#0f172a',
              border: canSave ? 'none' : '1px solid #1e293b',
              borderRadius: 6,
              color: canSave ? '#fff' : '#334155',
              fontSize: 14, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              transition: 'background 0.15s',
              boxShadow: canSave ? '0 0 20px rgba(37,99,235,0.25)' : 'none',
            }}
            onMouseEnter={e => { if (canSave) e.currentTarget.style.background = '#1d4ed8' }}
            onMouseLeave={e => { if (canSave) e.currentTarget.style.background = '#2563eb' }}
          >
            {standalone ? '💾 Save Client' : '💾 Save & Complete'}
          </button>
          <button
            onClick={onSkip}
            style={{
              flex: 1, padding: '13px',
              background: 'transparent', border: '1px solid #1e293b',
              borderRadius: 6, color: '#64748b', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#263354'; e.currentTarget.style.color = '#94a3b8' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
