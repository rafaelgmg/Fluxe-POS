import { useState, useMemo } from 'react'
import { BUSINESS_SHORT, COLORS } from '../config/branding'

const TEAL = COLORS.crm

const FRAGRANCE_OPTIONS = [
  'Floral', 'Fresh / Aquatic', 'Woody', 'Oriental / Oud',
  'Citrus', 'Sweet / Gourmand', 'Spicy', 'Unisex / Niche',
]

function exportCustomersCSV(customers) {
  const headers = [
    'First Name', 'Last Name', 'Phone', 'Email', 'Birthday',
    'Fragrance Preferences', 'Marketing Consent',
    'Captured By', 'Captured At', 'Customer Since',
    'Total Spent', 'Purchase Count', 'Last Purchase',
  ]
  const rows = customers.map(c => {
    const prefs = getFragrancePrefs(c).join('; ')
    const spent = totalSpent(c).toFixed(2)
    const last  = lastPurchase(c)
    return [
      c.firstName, c.lastName, c.phone || '', c.email || '', c.birthday || '',
      prefs,
      c.marketingConsent ? 'Yes' : 'No',
      c.capturedBy || '', c.capturedAt ? fmtDate(c.capturedAt) : '',
      c.createdAt   ? fmtDate(c.createdAt)  : '',
      spent, (c.purchases || []).length,
      last ? fmtDate(last) : '',
    ]
  })
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `fluxe-crm-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function totalSpent(customer) {
  return (customer.purchases || []).reduce((s, p) => s + p.total, 0)
}

function lastPurchase(customer) {
  const dates = (customer.purchases || []).map(p => new Date(p.date))
  if (!dates.length) return null
  return new Date(Math.max(...dates))
}

function allProducts(customer) {
  const map = {}
  ;(customer.purchases || []).forEach(p => {
    p.items.forEach(i => {
      const key = i.barcode || i.name
      if (map[key]) {
        map[key].qty += i.qty
        map[key].times += 1
      } else {
        map[key] = { name: i.name, size: i.size, qty: i.qty, times: 1 }
      }
    })
  })
  return Object.values(map).sort((a, b) => b.times - a.times)
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtPhone(p) {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

// Backward compat: clientes antigos têm fragrancePreference (string); novos têm fragrancePreferences (array)
function getFragrancePrefs(customer) {
  if (Array.isArray(customer.fragrancePreferences) && customer.fragrancePreferences.length > 0)
    return customer.fragrancePreferences
  if (customer.fragrancePreference) return [customer.fragrancePreference]
  return []
}

// ─── Customer Detail ─────────────────────────────────────────────────────────

function CustomerDetail({ customer, onClose, onSendSMS, onUpdate, onArchive, onRestore, onDelete }) {
  const spent    = totalSpent(customer)
  const last     = lastPurchase(customer)
  const products = allProducts(customer)
  const [activeTab,    setActiveTab]   = useState('overview')
  const [smsText,      setSmsText]     = useState('')
  const [smsChannel,   setSmsChannel]  = useState('sms')
  const [smsSending,   setSmsSending]  = useState(false)
  const [smsResult,    setSmsResult]   = useState(null)
  const [confirmArchive, setConfirmArchive] = useState(false)

  // Edit form state — pre-filled from customer
  const [editForm, setEditForm] = useState({
    firstName:            customer.firstName || '',
    lastName:             customer.lastName  || '',
    phone:                customer.phone     || '',
    email:                customer.email     || '',
    birthday:             customer.birthday  || '',
    fragrancePreferences: getFragrancePrefs(customer),
    notes:                customer.notes     || '',
    marketingConsent:     customer.marketingConsent || false,
  })
  const [editSaved, setEditSaved] = useState(false)

  const setEdit = (key, val) => setEditForm(f => ({ ...f, [key]: val }))
  const toggleEditFragrance = (opt) => setEditForm(f => {
    const prefs = f.fragrancePreferences
    return { ...f, fragrancePreferences: prefs.includes(opt) ? prefs.filter(p => p !== opt) : [...prefs, opt] }
  })
  const editHasContact = editForm.phone.trim() || editForm.email.trim()
  const editCanSave    = editForm.firstName.trim() && editHasContact

  const handleEditSave = () => {
    if (!editCanSave || !onUpdate) return
    onUpdate(customer.id, editForm)
    setEditSaved(true)
    setTimeout(() => setEditSaved(false), 2000)
  }

  const handleArchive = () => {
    if (onArchive) { onArchive(customer.id); onClose() }
  }

  const TABS = [
    { id: 'overview',  label: 'Overview'   },
    { id: 'history',   label: `Purchases (${(customer.purchases || []).length})` },
    { id: 'products',  label: 'Products'   },
    { id: 'edit',      label: '✏ Edit'     },
    { id: 'sms',       label: '✉ Send MSG' },
  ]

  const handleSend = async () => {
    if (!smsText.trim() || !onSendSMS) return
    setSmsSending(true)
    setSmsResult(null)
    try {
      const result = await onSendSMS(customer.id, smsText.trim(), smsChannel)
      setSmsResult({ ok: true, text: result.sid === 'dry-run' ? 'Sent (dry-run — server has no Twilio credentials yet)' : `Sent ✓ SID: ${result.sid}` })
      setSmsText('')
    } catch (err) {
      setSmsResult({ ok: false, text: err.message })
    } finally {
      setSmsSending(false)
    }
  }

  return (
    <div style={{
      width: 420, background: '#0d1526', borderLeft: '1px solid #253349',
      display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 18px 12px', background: '#111d30',
        borderBottom: '1px solid #253349', flexShrink: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ color: '#f1f5f9', fontSize: 17, fontWeight: 700 }}>
              {customer.firstName} {customer.lastName}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
              {customer.phone ? fmtPhone(customer.phone) : '—'}
              {customer.email && ` · ${customer.email}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {customer.archived ? (
              /* ── Archived: Restore + Delete permanently ── */
              !confirmArchive ? (
                <div style={{ display: 'flex', gap: 5 }}>
                  <button
                    onClick={() => { if (onRestore) { onRestore(customer.id); onClose() } }}
                    style={{
                      padding: '4px 10px', background: 'rgba(34,197,94,0.12)',
                      border: '1px solid rgba(34,197,94,0.3)', borderRadius: 5,
                      color: '#22c55e', fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    }}
                  >↩ Restore</button>
                  <button
                    onClick={() => setConfirmArchive(true)}
                    style={{
                      padding: '4px 10px', background: 'none',
                      border: '1px solid #253349', borderRadius: 5,
                      color: '#94a3b8', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
                  >Delete</button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ color: '#ef4444', fontSize: 11 }}>Delete permanently?</span>
                  <button onClick={() => { if (onDelete) { onDelete(customer.id); onClose() } }} style={{
                    padding: '4px 10px', background: '#ef4444', border: 'none',
                    borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                  }}>Yes, delete</button>
                  <button onClick={() => setConfirmArchive(false)} style={{
                    padding: '4px 8px', background: 'none', border: '1px solid #253349',
                    borderRadius: 5, color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              )
            ) : (
              /* ── Active: Archive ── */
              !confirmArchive ? (
                <button
                  onClick={() => setConfirmArchive(true)}
                  title="Archive customer"
                  style={{
                    background: 'none', border: '1px solid #253349', borderRadius: 5,
                    color: '#94a3b8', fontSize: 11, cursor: 'pointer', padding: '4px 10px',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
                >Archive</button>
              ) : (
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                  <span style={{ color: '#ef4444', fontSize: 11 }}>Archive?</span>
                  <button onClick={handleArchive} style={{
                    padding: '4px 10px', background: '#ef4444', border: 'none',
                    borderRadius: 5, color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 700,
                  }}>Yes</button>
                  <button onClick={() => setConfirmArchive(false)} style={{
                    padding: '4px 8px', background: 'none', border: '1px solid #253349',
                    borderRadius: 5, color: '#94a3b8', fontSize: 11, cursor: 'pointer',
                  }}>No</button>
                </div>
              )
            )}
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer'
            }}>×</button>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
          {[
            { label: 'Total Spent',   value: `$${spent.toFixed(2)}`,                   color: '#22c55e' },
            { label: 'Purchases',     value: (customer.purchases || []).length,          color: TEAL     },
            { label: 'Last Purchase', value: last ? fmtDate(last) : '—',               color: '#94a3b8' },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: '#111d30', border: '1px solid #253349', borderRadius: 6, padding: '8px 10px', textAlign: 'center'
            }}>
              <p style={{ color: s.color, fontWeight: 800, fontSize: 15 }}>{s.value}</p>
              <p style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#111d30', borderBottom: '1px solid rgba(30,41,59,0.6)', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, padding: '9px 6px', background: 'none',
            border: 'none', borderBottom: `2px solid ${activeTab === t.id ? TEAL : 'transparent'}`,
            color: activeTab === t.id ? TEAL : '#94a3b8',
            fontSize: 12, fontWeight: activeTab === t.id ? 700 : 400, cursor: 'pointer',
            transition: 'all 0.2s ease',
            textShadow: activeTab === t.id ? `0 0 10px ${TEAL}80` : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Fragrance preferences */}
            {getFragrancePrefs(customer).length > 0 && (
              <div style={{ background: '#111d30', border: '1px solid #253349', borderRadius: 6, padding: '12px 14px' }}>
                <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>
                  FRAGRANCE PREFERENCES
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {getFragrancePrefs(customer).map(pref => (
                    <span key={pref} style={{
                      display: 'inline-block', padding: '4px 12px',
                      background: TEAL + '22', border: `1px solid ${TEAL}55`,
                      borderRadius: 20, color: TEAL, fontSize: 12, fontWeight: 600
                    }}>
                      {pref}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {customer.notes && (
              <div style={{ background: '#111d30', border: '1px solid #253349', borderRadius: 6, padding: '12px 14px' }}>
                <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                  NOTES
                </p>
                <p style={{ color: '#cbd0e0', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                  {customer.notes}
                </p>
              </div>
            )}

            {/* Other info */}
            <div style={{ background: '#111d30', border: '1px solid #253349', borderRadius: 6, padding: '12px 14px' }}>
              <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>
                PROFILE
              </p>
              {[
                { label: 'Birthday',   value: customer.birthday ? fmtDate(customer.birthday + 'T12:00:00') : '—' },
                { label: 'Marketing',  value: customer.marketingConsent ? '✓ Opted In' : '✗ Opted Out' },
                { label: 'Customer Since', value: fmtDate(customer.createdAt) },
              ].map(f => (
                <div key={f.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>{f.label}</span>
                  <span style={{ color: '#cbd0e0', fontSize: 12 }}>{f.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Purchase history ── */}
        {activeTab === 'history' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(customer.purchases || []).slice().reverse().map((p, idx) => (
              <div key={idx} style={{
                background: '#111d30', borderRadius: 8, padding: '12px 14px',
                border: '1px solid #253349'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <p style={{ color: '#f1f5f9', fontSize: 13, fontWeight: 600 }}>
                      Invoice #{p.invoiceNumber}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                      {fmtDate(p.date)} · {p.seller} · {p.location}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#22c55e', fontWeight: 800, fontSize: 15 }}>
                      ${p.total.toFixed(2)}
                    </p>
                    <p style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>{p.paymentMethod}</p>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #253349', paddingTop: 8 }}>
                  {p.items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: '#94a3b8', fontSize: 12 }}>
                        {item.name}{item.size ? ` — ${item.size}` : ''}
                      </span>
                      <span style={{ color: '#22c55e', fontSize: 12 }}>
                        ${item.subtotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Products ── */}
        {activeTab === 'products' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.length === 0 && (
              <p style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20, fontSize: 13 }}>No products</p>
            )}
            {products.map((p, idx) => (
              <div key={idx} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                background: '#111d30', border: '1px solid #253349', borderRadius: 6, padding: '10px 14px'
              }}>
                <div>
                  <p style={{ color: '#cbd0e0', fontSize: 13, fontWeight: 500 }}>{p.name}</p>
                  {p.size && <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{p.size}</p>}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: TEAL, fontWeight: 700, fontSize: 13 }}>×{p.qty}</p>
                  <p style={{ color: '#415569', fontSize: 10, marginTop: 2 }}>{p.times} order{p.times > 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Edit ── */}
        {activeTab === 'edit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Name row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['firstName','First Name'],['lastName','Last Name']].map(([k, label]) => (
                <div key={k}>
                  <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>{label.toUpperCase()}</label>
                  <input
                    value={editForm[k]}
                    onChange={e => setEdit(k, e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = TEAL }}
                    onBlur={e =>  { e.target.style.borderColor = '#253349' }}
                  />
                </div>
              ))}
            </div>

            {/* Phone + Email */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[['phone','Phone'],['email','Email']].map(([k, label]) => (
                <div key={k}>
                  <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>{label.toUpperCase()}</label>
                  <input
                    value={editForm[k]}
                    onChange={e => setEdit(k, e.target.value)}
                    type={k === 'email' ? 'email' : 'tel'}
                    style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                    onFocus={e => { e.target.style.borderColor = TEAL }}
                    onBlur={e =>  { e.target.style.borderColor = '#253349' }}
                  />
                </div>
              ))}
            </div>
            {!editHasContact && (
              <p style={{ color: '#ef4444', fontSize: 11, marginTop: -8 }}>⚠ Phone or email required</p>
            )}

            {/* Birthday */}
            <div>
              <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>BIRTHDAY</label>
              <input
                type="date"
                value={editForm.birthday}
                onChange={e => setEdit('birthday', e.target.value)}
                style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none', colorScheme: 'dark' }}
              />
            </div>

            {/* Fragrance preferences */}
            <div>
              <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>FRAGRANCE PREFERENCES</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {FRAGRANCE_OPTIONS.map(opt => {
                  const active = editForm.fragrancePreferences.includes(opt)
                  return (
                    <button key={opt} onClick={() => toggleEditFragrance(opt)} style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                      border: `1px solid ${active ? TEAL : '#253349'}`,
                      background: active ? TEAL + '22' : '#111d30',
                      color: active ? TEAL : '#94a3b8',
                      fontWeight: active ? 700 : 400, transition: 'all 0.12s',
                    }}>{opt}</button>
                  )
                })}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>NOTES</label>
              <textarea
                value={editForm.notes}
                onChange={e => setEdit('notes', e.target.value)}
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', outline: 'none' }}
                onFocus={e => { e.target.style.borderColor = TEAL }}
                onBlur={e =>  { e.target.style.borderColor = '#253349' }}
              />
            </div>

            {/* Marketing consent */}
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
              background: '#111d30', borderRadius: 6, padding: '10px 12px',
              border: `1px solid ${editForm.marketingConsent ? TEAL + '66' : '#253349'}`,
            }}>
              <input
                type="checkbox"
                checked={editForm.marketingConsent}
                onChange={e => setEdit('marketingConsent', e.target.checked)}
                style={{ marginTop: 2, accentColor: TEAL, cursor: 'pointer' }}
              />
              <div>
                <p style={{ color: '#f1f5f9', fontSize: 12, fontWeight: 600 }}>Receive promotions & offers</p>
                <p style={{ color: '#415569', fontSize: 11, marginTop: 1 }}>Marketing consent via SMS or email</p>
              </div>
            </label>

            {/* Save button */}
            <button
              onClick={handleEditSave}
              disabled={!editCanSave}
              style={{
                padding: '12px', borderRadius: 6, fontSize: 14, fontWeight: 700, cursor: editCanSave ? 'pointer' : 'not-allowed',
                background: editSaved ? '#22c55e' : editCanSave ? TEAL : '#111d30',
                border: editCanSave ? 'none' : '1px solid #253349',
                color: editCanSave ? '#fff' : '#415569',
                transition: 'background 0.2s',
              }}
            >
              {editSaved ? '✓ Saved' : 'Save Changes'}
            </button>
          </div>
        )}

        {/* ── Send SMS / WhatsApp ── */}
        {activeTab === 'sms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Channel selector */}
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { id: 'sms',       label: '💬 SMS',       color: '#2980b9' },
                { id: 'whatsapp',  label: '📱 WhatsApp',  color: '#27ae60' },
              ].map(ch => (
                <button key={ch.id} onClick={() => setSmsChannel(ch.id)} style={{
                  flex: 1, padding: '9px',
                  background: smsChannel === ch.id ? ch.color + '22' : '#111d30',
                  border: `1px solid ${smsChannel === ch.id ? ch.color : '#253349'}`,
                  borderRadius: 6, color: smsChannel === ch.id ? ch.color : '#94a3b8',
                  fontWeight: smsChannel === ch.id ? 700 : 400,
                  fontSize: 13, cursor: 'pointer'
                }}>{ch.label}</button>
              ))}
            </div>

            {/* Recipient info */}
            <div style={{ background: '#111d30', border: '1px solid #253349', borderRadius: 6, padding: '10px 14px' }}>
              <p style={{ color: '#94a3b8', fontSize: 11 }}>
                To: <span style={{ color: '#cbd0e0' }}>{customer.firstName} {customer.lastName}</span>
                {' · '}
                <span style={{ color: TEAL }}>{fmtPhone(customer.phone)}</span>
              </p>
              {!customer.marketingConsent && (
                <p style={{ color: '#ef4444', fontSize: 11, marginTop: 4 }}>
                  ⚠ Customer did not opt in to marketing — send with caution
                </p>
              )}
            </div>

            {/* Message textarea */}
            <div>
              <label style={{ color: '#94a3b8', fontSize: 11, display: 'block', marginBottom: 4 }}>
                Message
              </label>
              <textarea
                value={smsText}
                onChange={e => setSmsText(e.target.value)}
                placeholder={`Hi ${customer.firstName}, ...`}
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', background: '#111d30',
                  border: '1px solid #253349', borderRadius: 6,
                  color: '#f1f5f9', fontSize: 13, resize: 'vertical',
                  fontFamily: 'inherit', outline: 'none'
                }}
                onFocus={e => { e.target.style.borderColor = '#3b82f6' }}
                onBlur={e =>  { e.target.style.borderColor = '#253349' }}
              />
              <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                {smsText.length} characters
                {' · '}Your name + "Reply STOP to unsubscribe" will be appended automatically.
              </p>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!smsText.trim() || smsSending || !onSendSMS}
              style={{
                padding: '12px', background: !smsText.trim() || smsSending ? '#111d30' : TEAL,
                border: !smsText.trim() || smsSending ? '1px solid #253349' : 'none',
                borderRadius: 6,
                color: !smsText.trim() || smsSending ? '#94a3b8' : '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: !smsText.trim() || smsSending ? 'not-allowed' : 'pointer'
              }}
            >
              {smsSending ? '⟳ Sending...' : `Send ${smsChannel === 'whatsapp' ? 'WhatsApp' : 'SMS'}`}
            </button>

            {/* Result */}
            {smsResult && (
              <div style={{
                padding: '10px 14px', borderRadius: 6,
                background: smsResult.ok ? '#22c55e22' : '#ef444422',
                border: `1px solid ${smsResult.ok ? '#22c55e55' : '#ef444455'}`,
                color: smsResult.ok ? '#22c55e' : '#ef4444',
                fontSize: 12
              }}>
                {smsResult.text}
              </div>
            )}

            {!onSendSMS && (
              <p style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                Server offline — start the backend to send messages
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main CRM Panel ───────────────────────────────────────────────────────────

export default function CRMPanel({ customers, serverOnline, onSendSMS, onGetSMSLog, onGetScheduled, onUpdateCustomer, onArchiveCustomer, onRestoreCustomer, onDeleteCustomer, onClose }) {
  const [search,          setSearch]          = useState('')
  const [selected,        setSelected]        = useState(null)
  const [purchaseFilter,  setPurchaseFilter]  = useState('all') // 'all' | 'with' | 'none'

  // Deve vir ANTES de filtered (const não sofre hoisting — TDZ crash se invertido)
  const activeCustomers   = useMemo(() => customers.filter(c => !c.archived), [customers])
  const archivedCustomers = useMemo(() => customers.filter(c =>  c.archived),  [customers])

  const filtered = useMemo(() => {
    // Archived view — lista própria, sem filtros de purchase
    if (purchaseFilter === 'archived') {
      const q = search.trim().toLowerCase()
      if (!q) return archivedCustomers
      return archivedCustomers.filter(c => {
        const name  = `${c.firstName} ${c.lastName}`.toLowerCase()
        const phone = (c.phone || '').replace(/\D/g, '')
        const email = (c.email || '').toLowerCase()
        return name.includes(q) || phone.includes(q.replace(/\D/g, '')) || email.includes(q)
      })
    }

    let list = activeCustomers

    // Purchase filter
    if (purchaseFilter === 'with') {
      list = list.filter(c => (c.purchases || []).length > 0)
    } else if (purchaseFilter === 'none') {
      list = list.filter(c => (c.purchases || []).length === 0)
    }

    // Text search
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(c => {
        const name  = `${c.firstName} ${c.lastName}`.toLowerCase()
        const phone = (c.phone || '').replace(/\D/g, '')
        const email = (c.email || '').toLowerCase()
        return name.includes(q) || phone.includes(q.replace(/\D/g, '')) || email.includes(q)
      })
    }

    return list
  }, [activeCustomers, search, purchaseFilter])

  // Sort: with purchases first (by last purchase desc), then no-purchase by capturedAt desc
  const sorted = useMemo(() =>
    [...filtered].sort((a, b) => {
      const la = lastPurchase(a)
      const lb = lastPurchase(b)
      if (!la && !lb) {
        return new Date(b.capturedAt || b.createdAt || 0) - new Date(a.capturedAt || a.createdAt || 0)
      }
      if (!la) return 1
      if (!lb) return -1
      return lb - la
    }),
    [filtered]
  )

  const withPurchaseCount    = useMemo(() => activeCustomers.filter(c => (c.purchases || []).length > 0).length, [activeCustomers])
  const withoutPurchaseCount = useMemo(() => activeCustomers.filter(c => (c.purchases || []).length === 0).length, [activeCustomers])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000,
      display: 'flex', flexDirection: 'column'
    }}>

      {/* Header */}
      <div style={{
        height: 50, background: '#0d1526', borderBottom: `2px solid ${TEAL}`,
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#f59e0b', letterSpacing: 1 }}>
          {BUSINESS_SHORT}
        </span>
        <div style={{
          background: TEAL, borderRadius: 4, padding: '3px 10px',
          fontSize: 10, fontWeight: 800, color: '#fff', letterSpacing: 2
        }}>
          CRM
        </div>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>
          {sorted.length}/{activeCustomers.length} customer{activeCustomers.length !== 1 ? 's' : ''}
        </span>
        <span style={{ color: serverOnline ? '#22c55e' : '#94a3b8', fontSize: 12 }}>
          {serverOnline ? '● SMS online' : '○ SMS offline'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {serverOnline && (
            <>
              <button
                onClick={async () => { const log = await onGetSMSLog(); console.table(log) }}
                title="Print SMS sent log to browser console"
                style={{
                  padding: '5px 12px', background: 'transparent',
                  border: `1px solid ${TEAL}55`, borderRadius: 4,
                  color: TEAL, fontSize: 11, cursor: 'pointer'
                }}
              >
                📋 SMS Log
              </button>
              <button
                onClick={async () => { const q = await onGetScheduled(); console.table(q) }}
                title="Print scheduled messages to browser console"
                style={{
                  padding: '5px 12px', background: 'transparent',
                  border: '1px solid #253349', borderRadius: 4,
                  color: '#94a3b8', fontSize: 11, cursor: 'pointer'
                }}
              >
                🗓 Scheduled
              </button>
            </>
          )}
          <button
            onClick={() => exportCustomersCSV(activeCustomers)}
            title="Export all customers to CSV"
            style={{
              padding: '5px 12px', background: 'transparent',
              border: '1px solid #253349', borderRadius: 4,
              color: '#94a3b8', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.color = '#22c55e' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
          >⬇ Export CSV</button>
          <button onClick={onClose} style={{
            padding: '6px 16px', background: 'transparent', border: '1px solid #253349',
            borderRadius: 4, color: '#94a3b8', fontSize: 12, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
          >← Back to POS</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Customer list */}
        <div style={{ width: 340, background: '#0d1526', borderRight: '1px solid #253349', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

          {/* Search + Filter */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #253349', flexShrink: 0 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone or email..."
              style={{
                width: '100%', padding: '8px 12px', boxSizing: 'border-box',
                background: '#111d30', border: '1px solid #253349',
                borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none',
                marginBottom: 10,
              }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6' }}
              onBlur={e =>  { e.target.style.borderColor = '#253349' }}
            />
            {/* Purchase filter pills */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { id: 'all',      label: `All (${activeCustomers.length})` },
                { id: 'with',     label: `With Purchase (${withPurchaseCount})` },
                { id: 'none',     label: `No Purchase (${withoutPurchaseCount})` },
                { id: 'archived', label: `Archived (${archivedCustomers.length})`, dim: true },
              ].map(f => {
                const activeColor = f.dim ? '#ef4444' : TEAL
                const isActive    = purchaseFilter === f.id
                return (
                  <button
                    key={f.id}
                    onClick={() => { setPurchaseFilter(f.id); setSelected(null) }}
                    style={{
                      flex: 1, padding: '5px 0', fontSize: 10, fontWeight: 600,
                      borderRadius: 5, cursor: 'pointer', transition: 'all 0.15s',
                      border: `1px solid ${isActive ? activeColor : '#253349'}`,
                      background: isActive ? activeColor + '22' : '#111d30',
                      color: isActive ? activeColor : '#94a3b8',
                    }}
                  >
                    {f.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sorted.length === 0 && (
              <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                {search ? 'No customers found' : 'No customers yet'}
              </div>
            )}
            {sorted.map(c => {
              const spent = totalSpent(c)
              const last  = lastPurchase(c)
              const isActive = selected?.id === c.id
              return (
                <div
                  key={c.id}
                  onClick={() => setSelected(c)}
                  style={{
                    padding: '12px 16px', borderBottom: '1px solid rgba(30,41,59,0.5)',
                    cursor: 'pointer',
                    background: isActive ? TEAL + '18' : 'transparent',
                    borderLeft: `3px solid ${isActive ? TEAL : 'transparent'}`,
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(37,99,235,0.06)'; e.currentTarget.style.borderLeftColor = 'rgba(37,99,235,0.3)' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent' } }}
                >
                  {/* Name row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>
                        {c.firstName} {c.lastName}
                      </p>
                      <p style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                        {fmtPhone(c.phone)}
                      </p>
                    </div>
                    <p style={{ color: '#22c55e', fontWeight: 700, fontSize: 13 }}>
                      ${spent.toFixed(2)}
                    </p>
                  </div>

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(c.purchases || []).length === 0 ? (
                      <span style={{
                        fontSize: 10, padding: '2px 8px',
                        background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)',
                        borderRadius: 20, color: '#f59e0b', fontWeight: 600,
                      }}>
                        No Purchase
                      </span>
                    ) : (
                      <span style={{ color: '#94a3b8', fontSize: 11 }}>
                        {(c.purchases || []).length} purchase{(c.purchases || []).length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {getFragrancePrefs(c).slice(0, 2).map(pref => (
                      <span key={pref} style={{
                        fontSize: 10, padding: '2px 8px',
                        background: TEAL + '18', border: `1px solid ${TEAL}33`,
                        borderRadius: 20, color: TEAL
                      }}>
                        {pref}
                      </span>
                    ))}
                    {getFragrancePrefs(c).length > 2 && (
                      <span style={{ color: '#415569', fontSize: 10 }}>+{getFragrancePrefs(c).length - 2}</span>
                    )}
                    <span style={{ marginLeft: 'auto', color: '#415569', fontSize: 11 }}>
                      {last ? fmtDate(last) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selected ? (
          <CustomerDetail
            customer={selected}
            onClose={() => setSelected(null)}
            onSendSMS={serverOnline ? onSendSMS : null}
            onUpdate={onUpdateCustomer}
            onArchive={(id) => { onArchiveCustomer(id); setSelected(null) }}
            onRestore={(id) => { onRestoreCustomer(id); setSelected(null) }}
            onDelete={(id)  => { onDeleteCustomer(id);  setSelected(null) }}
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
            background: 'radial-gradient(ellipse at center, rgba(14,116,144,0.04) 0%, transparent 70%)',
          }}>
            <div style={{ fontSize: 48, opacity: 0.25 }}>👥</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#253349', letterSpacing: 1 }}>CUSTOMERS</p>
            <p style={{ fontSize: 13, color: '#415569' }}>Select a customer to view details</p>
          </div>
        )}
      </div>
    </div>
  )
}
