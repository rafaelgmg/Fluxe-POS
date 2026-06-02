import { useState, useMemo, useEffect, useCallback } from 'react'
import { LOCATIONS_CFG } from '../config/branding'
import { loadActiveEmployees } from '../utils/usersStorage'
import { getLoyaltyStars, starsLabel, calcCRMScore } from '../utils/loyaltyEngine'
import { getCustomerAppointments, upsertAppointment, deleteAppointment } from '../utils/appointmentsStorage'
import { writeCustomerToSupabase } from '../services/supabaseCRM'
import { isSupabaseConfigured } from '../services/supabaseRead'
import CampaignSMS    from './CampaignSMS'
import CampaignEmail  from './CampaignEmail'
import DripCampaigns  from './DripCampaigns'

const FRAGRANCE_OPTIONS = [
  'Floral', 'Fresh / Aquatic', 'Woody', 'Oriental / Oud',
  'Citrus', 'Sweet / Gourmand', 'Spicy', 'Unisex / Niche',
]

// ── Colors ────────────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const TEXT   = 'var(--c-text)'
const SUB    = 'var(--c-text-sub)'
const MUTED  = 'var(--c-text-muted)'
const DIM    = 'var(--c-text-dim)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'

const STAR_COLORS = ['', 'var(--c-text-sub)', '#f59e0b', '#f59e0b', '#f59e0b', '#22c55e']

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}
function fmtPhone(p) {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}
function derived(c) {
  const p = c.purchases || []
  const totalSpent = p.reduce((s, x) => s + (x.total || 0), 0)
  return {
    numPurchases: p.length,
    totalSpent,
    lastPurchase: p.length ? p[p.length - 1].date : null,
    status:       p.length > 0 ? 'Buyer' : 'No Purchase Yet',
    loyaltyStars: getLoyaltyStars(totalSpent),
  }
}

// ── Shared field input ────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text', optional = false }) {
  return (
    <div>
      <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
        {optional && <span style={{ color: DIM, fontWeight: 400, marginLeft: 4 }}>(optional)</span>}
      </label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '8px 11px', background: CARD,
          border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT,
          fontSize: 13, outline: 'none', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => { e.target.style.borderColor = BLUE }}
        onBlur={e => { e.target.style.borderColor = BORDER }}
      />
    </div>
  )
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </label>
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '8px 11px', background: CARD,
          border: `1px solid ${BORDER}`, borderRadius: 7, color: value ? TEXT : MUTED,
          fontSize: 13, outline: 'none', cursor: 'pointer', appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 30,
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

// ── Add Customer Modal ────────────────────────────────────────────────────────
function AddCustomerModal({ onSave, onClose }) {
  const employees = loadActiveEmployees()
  const locations = LOCATIONS_CFG.map(l => l.name)

  const [form, setForm] = useState({
    firstName: '', lastName: '', phone: '', email: '',
    notes: '', fragrancePreferences: [],
    capturedBy: '', capturedLocation: '',
  })
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const toggleFrag = (opt) => set('fragrancePreferences',
    form.fragrancePreferences.includes(opt)
      ? form.fragrancePreferences.filter(x => x !== opt)
      : [...form.fragrancePreferences, opt]
  )

  const handleSave = () => {
    if (!form.firstName.trim()) { setError('First Name is required.'); return }
    if (!form.phone.trim() && !form.email.trim()) { setError('Phone or Email is required.'); return }
    const result = onSave(form)
    if (result?.error) { setError(result.error); return }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 16,
        width: 560, maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.75)',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>Add Customer</h3>
          <button onClick={onClose} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 16, cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="First Name" value={form.firstName} onChange={v => set('firstName', v)} placeholder="First name" />
            <Field label="Last Name" value={form.lastName} onChange={v => set('lastName', v)} placeholder="Last name" optional />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Mobile" value={form.phone} onChange={v => set('phone', v)} placeholder="(702) 555-0000" type="tel" optional />
            <Field label="Email" value={form.email} onChange={v => set('email', v)} placeholder="email@example.com" type="email" optional />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <SelectField
              label="Captured By" value={form.capturedBy}
              onChange={v => set('capturedBy', v)}
              options={employees.map(e => e.name)}
              placeholder="— Select seller —"
            />
            <SelectField
              label="Location Captured" value={form.capturedLocation}
              onChange={v => set('capturedLocation', v)}
              options={locations}
              placeholder="— Select location —"
            />
          </div>

          {/* Fragrance Preferences */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginBottom: 8, letterSpacing: 0.5 }}>FRAGRANCE PREFERENCES <span style={{ color: DIM, fontWeight: 400 }}>(optional)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {FRAGRANCE_OPTIONS.map(opt => {
                const active = form.fragrancePreferences.includes(opt)
                return (
                  <button key={opt} onClick={() => toggleFrag(opt)} style={{
                    padding: '5px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                    background: active ? `rgba(37,99,235,0.15)` : 'transparent',
                    border: `1px solid ${active ? 'rgba(37,99,235,0.5)' : BORDER}`,
                    color: active ? '#93c5fd' : MUTED, transition: 'all 0.15s',
                  }}>{opt}</button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, marginBottom: 5, letterSpacing: 0.5 }}>NOTES <span style={{ color: DIM, fontWeight: 400 }}>(optional)</span></label>
            <textarea
              value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any notes about this customer..."
              rows={3}
              style={{
                width: '100%', padding: '8px 11px', background: CARD,
                border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT,
                fontSize: 13, outline: 'none', boxSizing: 'border-box',
                resize: 'vertical', fontFamily: 'inherit',
              }}
              onFocus={e => { e.target.style.borderColor = BLUE }}
              onBlur={e => { e.target.style.borderColor = BORDER }}
            />
          </div>

          {error && (
            <p style={{ color: RED, fontSize: 12, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6 }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 10, flexShrink: 0 }}>
          <button onClick={handleSave} style={{
            flex: 1, padding: '11px',
            background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
            border: 'none', borderRadius: 10, color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 0 20px rgba(37,99,235,0.35)',
          }}>
            Add Customer
          </button>
          <button onClick={onClose} style={{
            flex: 1, padding: '11px', background: 'transparent',
            border: `1px solid ${BORDER}`, borderRadius: 10,
            color: MUTED, fontSize: 14, cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Customer Profile Modal ────────────────────────────────────────────────────
function CustomerProfile({ customer, onClose, onSave, onDelete }) {
  const { numPurchases, totalSpent, lastPurchase, status, loyaltyStars } = derived(customer)
  const employees = loadActiveEmployees()
  const locations = LOCATIONS_CFG.map(l => l.name)

  const [tab,        setTab]        = useState('info')   // 'info' | 'appointments' | 'ai'
  const [editing,    setEditing]    = useState(false)
  const [confirming, setConfirming] = useState(false)    // delete confirmation
  const [form, setForm] = useState({
    firstName:            customer.firstName || '',
    lastName:             customer.lastName  || '',
    phone:                customer.phone     || '',
    email:                customer.email     || '',
    notes:                customer.notes     || '',
    fragrancePreferences: Array.isArray(customer.fragrancePreferences) ? [...customer.fragrancePreferences] : [],
    capturedBy:           customer.capturedBy       || '',
    capturedLocation:     customer.capturedLocation || '',
  })
  const [aiForm, setAiForm] = useState({
    tags:             Array.isArray(customer.tags) ? customer.tags.join(', ') : '',
    preferredChannel: customer.preferredChannel || '',
  })

  // Transfer state
  const [transfering, setTransfering] = useState(false)
  const [transferLoc, setTransferLoc] = useState('')

  // Appointments state
  const [appointments, setAppointments] = useState(() => getCustomerAppointments(customer.id))
  const [showApptForm, setShowApptForm] = useState(false)
  const [apptForm, setApptForm] = useState({ date: '', time: '', notes: '', status: 'scheduled' })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setAi = (k, v) => setAiForm(f => ({ ...f, [k]: v }))

  const toggleFrag = (opt) => set('fragrancePreferences',
    form.fragrancePreferences.includes(opt)
      ? form.fragrancePreferences.filter(x => x !== opt)
      : [...form.fragrancePreferences, opt]
  )

  const handleSave = () => {
    onSave(customer.id, form)
    setEditing(false)
  }
  const handleSaveAi = () => {
    const tags = aiForm.tags.split(',').map(t => t.trim()).filter(Boolean)
    onSave(customer.id, {
      tags,
      preferredChannel: aiForm.preferredChannel,
      crmScore: calcCRMScore({ ...customer, ...form }),
      lastInteraction: new Date().toISOString(),
    })
  }

  const cancelEdit = () => {
    setForm({
      firstName: customer.firstName||'', lastName: customer.lastName||'',
      phone: customer.phone||'', email: customer.email||'',
      notes: customer.notes||'',
      fragrancePreferences: Array.isArray(customer.fragrancePreferences) ? [...customer.fragrancePreferences] : [],
      capturedBy: customer.capturedBy||'', capturedLocation: customer.capturedLocation||'',
    })
    setEditing(false)
  }

  const handleTransfer = () => {
    if (!transferLoc) return
    onSave(customer.id, { capturedLocation: transferLoc })
    setTransfering(false)
    setTransferLoc('')
  }

  const handleAddAppt = () => {
    if (!apptForm.date) return
    const updated = upsertAppointment({ ...apptForm, customerId: customer.id })
    setAppointments(updated.filter(a => a.customerId === customer.id))
    setApptForm({ date: '', time: '', notes: '', status: 'scheduled' })
    setShowApptForm(false)
  }

  const handleDeleteAppt = (id) => {
    const updated = deleteAppointment(id)
    setAppointments(updated.filter(a => a.customerId === customer.id))
  }

  const handleUpdateApptStatus = (appt, newStatus) => {
    const updated = upsertAppointment({ ...appt, status: newStatus })
    setAppointments(updated.filter(a => a.customerId === customer.id))
  }

  const inpStyle = {
    width: '100%', padding: '8px 11px', background: CARD,
    border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT,
    fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s',
  }

  const crmScore = customer.crmScore ?? calcCRMScore(customer)

  const APPT_STATUS_COLORS = {
    scheduled: { bg: 'rgba(37,99,235,0.1)', border: 'rgba(37,99,235,0.3)', color: '#60a5fa' },
    completed: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)', color: '#4ade80' },
    canceled:  { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', color: '#f87171' },
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 3000, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 16,
        width: 720, maxHeight: '92vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 80px rgba(0,0,0,0.75)',
        position: 'relative',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 24px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 18 }}>
              {customer.firstName} {customer.lastName}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{
                padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                background: status === 'Buyer' ? 'rgba(34,197,94,0.12)' : 'rgba(71,85,105,0.15)',
                border: `1px solid ${status === 'Buyer' ? 'rgba(34,197,94,0.3)' : BORDER}`,
                color: status === 'Buyer' ? GREEN : MUTED,
              }}>{status}</span>
              {loyaltyStars > 0 && (
                <span style={{ color: STAR_COLORS[loyaltyStars], fontSize: 13, letterSpacing: -1 }}>
                  {starsLabel(loyaltyStars)}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Transfer button */}
            {!transfering ? (
              <button onClick={() => setTransfering(true)} style={{
                padding: '6px 12px', background: 'rgba(245,158,11,0.1)',
                border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8,
                color: AMBER, fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}>Transfer</button>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={transferLoc} onChange={e => setTransferLoc(e.target.value)} style={{
                  padding: '5px 8px', background: CARD, border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none', cursor: 'pointer',
                }}>
                  <option value="">— select location —</option>
                  {locations.filter(l => l !== customer.capturedLocation).map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                <button onClick={handleTransfer} disabled={!transferLoc} style={{
                  padding: '5px 10px', background: 'rgba(34,197,94,0.15)',
                  border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6,
                  color: GREEN, fontSize: 12, cursor: transferLoc ? 'pointer' : 'not-allowed', fontWeight: 700,
                }}>OK</button>
                <button onClick={() => { setTransfering(false); setTransferLoc('') }} style={{
                  padding: '5px 10px', background: 'transparent', border: `1px solid ${BORDER}`,
                  borderRadius: 6, color: MUTED, fontSize: 12, cursor: 'pointer',
                }}>✕</button>
              </div>
            )}

            {tab === 'info' && !editing && (
              <button onClick={() => setEditing(true)} style={{ padding: '7px 14px', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8, color: '#60a5fa', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                Edit
              </button>
            )}
            {tab === 'info' && editing && (
              <>
                <button onClick={handleSave} style={{ padding: '7px 14px', background: 'linear-gradient(135deg, #3b82f6, #7c3aed)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                <button onClick={cancelEdit} style={{ padding: '7px 14px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </>
            )}
            {/* Delete customer */}
            {onDelete && !editing && (
              <button onClick={() => setConfirming(true)} style={{
                padding: '7px 12px', background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
                color: '#f87171', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}>Delete</button>
            )}
            <button onClick={onClose} style={{ padding: '7px 12px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 8, color: MUTED, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
          </div>
        </div>

        {/* ── Delete Confirmation overlay ── */}
        {confirming && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(2,8,23,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10, borderRadius: 16, backdropFilter: 'blur(4px)',
          }}>
            <div style={{
              background: 'var(--c-bg-card)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 12, padding: '28px 32px', width: 380, textAlign: 'center',
              boxShadow: '0 16px 48px rgba(239,68,68,0.15)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ color: TEXT, fontWeight: 800, fontSize: 16, marginBottom: 6 }}>
                Remove customer?
              </h3>
              <p style={{ color: SUB, fontSize: 13, marginBottom: 4 }}>
                <strong style={{ color: TEXT }}>{customer.firstName} {customer.lastName}</strong>
              </p>
              {(customer.phone || customer.email) && (
                <p style={{ color: MUTED, fontSize: 12, marginBottom: 12 }}>
                  {customer.phone || customer.email}
                </p>
              )}
              {numPurchases > 0 ? (
                <div style={{
                  background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                  borderRadius: 8, padding: '10px 14px', marginBottom: 20, textAlign: 'left',
                }}>
                  <p style={{ color: AMBER, fontSize: 12, fontWeight: 600, marginBottom: 3 }}>
                    This customer has {numPurchases} linked invoice{numPurchases !== 1 ? 's' : ''}.
                  </p>
                  <p style={{ color: MUTED, fontSize: 11 }}>
                    The contact will be removed, but all invoices and financial records remain intact.
                  </p>
                </div>
              ) : (
                <p style={{ color: MUTED, fontSize: 12, marginBottom: 20 }}>
                  This contact has no purchases. It will be permanently hidden from all CRM views.
                </p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { onDelete(customer.id); onClose() }}
                  style={{
                    flex: 1, padding: '11px',
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    border: 'none', borderRadius: 9, color: '#fff',
                    fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  Yes, remove
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  style={{
                    flex: 1, padding: '11px', background: 'transparent',
                    border: `1px solid ${BORDER}`, borderRadius: 9,
                    color: MUTED, fontSize: 14, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 0, background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          {[
            { id: 'info',         label: 'Info & History' },
            { id: 'appointments', label: `Appointments${appointments.length > 0 ? ` (${appointments.length})` : ''}` },
            { id: 'ai',           label: 'AI Fields' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 20px', background: 'none',
              border: 'none', borderBottom: `2px solid ${tab === t.id ? BLUE : 'transparent'}`,
              color: tab === t.id ? '#93c5fd' : MUTED, fontSize: 13,
              fontWeight: tab === t.id ? 700 : 400, cursor: 'pointer', transition: 'all 0.15s',
            }}>{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* ── TAB: Info & History ── */}
          {tab === 'info' && (
            <>
              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24 }}>
                {[
                  { label: 'Purchases',     value: numPurchases,                color: '#60a5fa' },
                  { label: 'Total Spent',   value: `$${totalSpent.toFixed(2)}`, color: GREEN },
                  { label: 'Last Purchase', value: fmtDate(lastPurchase),       color: SUB },
                  { label: 'Loyalty',       value: loyaltyStars > 0 ? starsLabel(loyaltyStars) : '—', color: STAR_COLORS[loyaltyStars] || DIM },
                ].map(s => (
                  <div key={s.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '14px', textAlign: 'center' }}>
                    <p style={{ color: s.color, fontWeight: 800, fontSize: 18, lineHeight: 1, letterSpacing: loyaltyStars > 0 && s.label === 'Loyalty' ? -1 : 0 }}>{s.value}</p>
                    <p style={{ color: MUTED, fontSize: 11, marginTop: 5 }}>{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Contact + Meta */}
              {!editing ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                  {[
                    { label: 'First Name',        value: customer.firstName || '—' },
                    { label: 'Last Name',          value: customer.lastName  || '—' },
                    { label: 'Mobile',             value: fmtPhone(customer.phone) },
                    { label: 'Email',              value: customer.email     || '—' },
                    { label: 'Added By',           value: customer.capturedBy       || '—' },
                    { label: 'Location Captured',  value: customer.capturedLocation || '—' },
                    { label: 'Date Added',         value: fmtDate(customer.capturedAt || customer.createdAt) },
                    { label: 'Birthday',           value: customer.birthday  || '—' },
                  ].map(f => (
                    <div key={f.label}>
                      <p style={{ color: MUTED, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, marginBottom: 3 }}>{f.label.toUpperCase()}</p>
                      <p style={{ color: TEXT, fontSize: 14 }}>{f.value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {[
                    ['FIRST NAME', 'firstName'], ['LAST NAME', 'lastName'],
                    ['MOBILE', 'phone'], ['EMAIL', 'email'],
                  ].map(([lbl, key]) => (
                    <div key={key}>
                      <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>{lbl}</label>
                      <input value={form[key]} onChange={e => set(key, e.target.value)} style={inpStyle}
                        onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
                    </div>
                  ))}
                  <div>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>CAPTURED BY</label>
                    <select value={form.capturedBy} onChange={e => set('capturedBy', e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>
                      <option value="">— select —</option>
                      {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>LOCATION</label>
                    <select value={form.capturedLocation} onChange={e => set('capturedLocation', e.target.value)} style={{ ...inpStyle, cursor: 'pointer' }}>
                      <option value="">— select —</option>
                      {locations.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
              )}

              {/* Fragrance Preferences */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: MUTED, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>FRAGRANCE PREFERENCES</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {editing ? (
                    FRAGRANCE_OPTIONS.map(opt => {
                      const active = form.fragrancePreferences.includes(opt)
                      return (
                        <button key={opt} onClick={() => toggleFrag(opt)} style={{
                          padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                          background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
                          border: `1px solid ${active ? 'rgba(37,99,235,0.5)' : BORDER}`,
                          color: active ? '#93c5fd' : MUTED, transition: 'all 0.15s',
                        }}>{opt}</button>
                      )
                    })
                  ) : (
                    (customer.fragrancePreferences || []).length > 0
                      ? (customer.fragrancePreferences || []).map(p => (
                          <span key={p} style={{ padding: '4px 12px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.25)', borderRadius: 20, color: '#93c5fd', fontSize: 12 }}>{p}</span>
                        ))
                      : <span style={{ color: DIM, fontSize: 13 }}>—</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ color: MUTED, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>NOTES</p>
                {editing ? (
                  <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                    style={{ ...inpStyle, width: '100%', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
                ) : (
                  <p style={{ color: customer.notes ? TEXT : DIM, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {customer.notes || '—'}
                  </p>
                )}
              </div>

              {/* Purchase History */}
              {(customer.purchases || []).length > 0 && (
                <div>
                  <p style={{ color: MUTED, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, marginBottom: 10 }}>PURCHASE HISTORY</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...(customer.purchases || [])].reverse().map((p, i) => (
                      <div key={i} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <div>
                            <span style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600 }}>#{p.invoiceNumber || '—'}</span>
                            <span style={{ color: MUTED, fontSize: 11, marginLeft: 10 }}>{fmtDate(p.date)}</span>
                            {p.location && <span style={{ color: DIM, fontSize: 11, marginLeft: 10 }}>{p.location}</span>}
                          </div>
                          <span style={{ color: GREEN, fontWeight: 700, fontSize: 14 }}>${(p.total || 0).toFixed(2)}</span>
                        </div>
                        {(p.items || []).length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {p.items.map((it, j) => (
                              <div key={j} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: SUB, fontSize: 12 }}>{it.name} {it.size ? `(${it.size})` : ''} × {it.qty}</span>
                                <span style={{ color: SUB, fontSize: 12 }}>${(it.subtotal || 0).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {p.seller && <p style={{ color: DIM, fontSize: 11, marginTop: 4 }}>Seller: {p.seller} · {p.paymentMethod || '—'}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TAB: Appointments ── */}
          {tab === 'appointments' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <p style={{ color: MUTED, fontSize: 12 }}>Manage scheduled visits for this customer.</p>
                <button onClick={() => setShowApptForm(v => !v)} style={{
                  padding: '7px 14px', background: showApptForm ? 'transparent' : 'linear-gradient(135deg,#3b82f6,#7c3aed)',
                  border: showApptForm ? `1px solid ${BORDER}` : 'none', borderRadius: 8,
                  color: showApptForm ? MUTED : '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}>{showApptForm ? 'Cancel' : '+ New Appointment'}</button>
              </div>

              {showApptForm && (
                <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                    <div>
                      <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>DATE *</label>
                      <input type="date" value={apptForm.date} onChange={e => setApptForm(f => ({ ...f, date: e.target.value }))}
                        style={inpStyle} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>TIME</label>
                      <input type="time" value={apptForm.time} onChange={e => setApptForm(f => ({ ...f, time: e.target.value }))}
                        style={inpStyle} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>STATUS</label>
                    <select value={apptForm.status} onChange={e => setApptForm(f => ({ ...f, status: e.target.value }))}
                      style={{ ...inpStyle, cursor: 'pointer' }}>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="canceled">Canceled</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 4, letterSpacing: 0.5 }}>NOTES</label>
                    <textarea value={apptForm.notes} onChange={e => setApptForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                      placeholder="Purpose, product interest, etc."
                      style={{ ...inpStyle, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                      onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
                  </div>
                  <button onClick={handleAddAppt} disabled={!apptForm.date} style={{
                    width: '100%', padding: '9px',
                    background: apptForm.date ? 'linear-gradient(135deg,#3b82f6,#7c3aed)' : DIM,
                    border: 'none', borderRadius: 8, color: '#fff',
                    fontSize: 13, fontWeight: 700, cursor: apptForm.date ? 'pointer' : 'not-allowed',
                  }}>Save Appointment</button>
                </div>
              )}

              {appointments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 0', color: DIM, fontSize: 13 }}>
                  No appointments yet.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {[...appointments].sort((a, b) => b.date > a.date ? 1 : -1).map(appt => {
                    const sc = APPT_STATUS_COLORS[appt.status] || APPT_STATUS_COLORS.scheduled
                    return (
                      <div key={appt.id} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: appt.notes ? 8 : 0 }}>
                          <div>
                            <span style={{ color: TEXT, fontWeight: 600, fontSize: 14 }}>{appt.date}</span>
                            {appt.time && <span style={{ color: MUTED, fontSize: 12, marginLeft: 10 }}>{appt.time}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select value={appt.status}
                              onChange={e => handleUpdateApptStatus(appt, e.target.value)}
                              style={{
                                padding: '3px 8px', background: sc.bg, border: `1px solid ${sc.border}`,
                                borderRadius: 20, color: sc.color, fontSize: 11, fontWeight: 600,
                                cursor: 'pointer', outline: 'none',
                              }}>
                              <option value="scheduled">Scheduled</option>
                              <option value="completed">Completed</option>
                              <option value="canceled">Canceled</option>
                            </select>
                            <button onClick={() => handleDeleteAppt(appt.id)} style={{
                              padding: '3px 8px', background: 'rgba(239,68,68,0.08)',
                              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6,
                              color: '#f87171', fontSize: 11, cursor: 'pointer',
                            }}>Del</button>
                          </div>
                        </div>
                        {appt.notes && <p style={{ color: MUTED, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{appt.notes}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: AI Fields ── */}
          {tab === 'ai' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* CRM Score */}
              <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>CRM SCORE</p>
                  <span style={{ color: crmScore >= 70 ? GREEN : crmScore >= 40 ? AMBER : RED, fontWeight: 800, fontSize: 15 }}>{crmScore}/100</span>
                </div>
                <div style={{ height: 8, background: DIM, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 4,
                    width: `${crmScore}%`,
                    background: crmScore >= 70 ? GREEN : crmScore >= 40 ? AMBER : RED,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
                <p style={{ color: DIM, fontSize: 11, marginTop: 6 }}>
                  Based on spend, frequency, contact info, preferences and notes.
                </p>
              </div>

              {/* Last Interaction */}
              <div>
                <p style={{ color: MUTED, fontSize: 10, fontWeight: 600, letterSpacing: 0.5, marginBottom: 4 }}>LAST INTERACTION</p>
                <p style={{ color: TEXT, fontSize: 13 }}>{fmtDate(customer.lastInteraction) || '—'}</p>
              </div>

              {/* Tags */}
              <div>
                <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>
                  TAGS <span style={{ color: DIM, fontWeight: 400 }}>(comma separated)</span>
                </label>
                <input
                  value={aiForm.tags}
                  onChange={e => setAi('tags', e.target.value)}
                  placeholder="vip, tourist, repeat-buyer"
                  style={inpStyle}
                  onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }}
                />
                {(customer.tags || []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {(customer.tags || []).map(tag => (
                      <span key={tag} style={{
                        padding: '3px 10px', background: 'rgba(139,92,246,0.1)',
                        border: '1px solid rgba(139,92,246,0.25)', borderRadius: 20,
                        color: '#a78bfa', fontSize: 12,
                      }}>{tag}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* Preferred Channel */}
              <div>
                <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 600, marginBottom: 6, letterSpacing: 0.5 }}>PREFERRED CHANNEL</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['', 'sms', 'whatsapp', 'email'].map(ch => (
                    <button key={ch} onClick={() => setAi('preferredChannel', ch)} style={{
                      padding: '6px 14px', borderRadius: 8, fontSize: 12, cursor: 'pointer',
                      background: aiForm.preferredChannel === ch ? 'rgba(37,99,235,0.15)' : 'transparent',
                      border: `1px solid ${aiForm.preferredChannel === ch ? 'rgba(37,99,235,0.4)' : BORDER}`,
                      color: aiForm.preferredChannel === ch ? '#93c5fd' : MUTED,
                      fontWeight: aiForm.preferredChannel === ch ? 700 : 400,
                    }}>{ch || 'None'}</button>
                  ))}
                </div>
              </div>

              <button onClick={handleSaveAi} style={{
                padding: '10px', background: 'linear-gradient(135deg,#3b82f6,#7c3aed)',
                border: 'none', borderRadius: 9, color: '#fff',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                boxShadow: '0 0 16px rgba(37,99,235,0.3)',
              }}>Save AI Fields</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Table header cell ─────────────────────────────────────────────────────────
function TH({ children, width, align = 'left' }) {
  return (
    <div style={{ width, minWidth: width, color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textAlign: align, userSelect: 'none' }}>
      {children}
    </div>
  )
}

// ── Quick Templates (used by Send from Segment buttons) ──────────────────────
const QUICK_TEMPLATES = [
  {
    id:    'follow_up',
    label: 'Follow-up',
    icon:  '👋',
    body:  `Hey {first_name}, this is {seller_name} from the kiosk 👋\nIt was nice meeting you earlier. Let me know if you want me to hold a deal for you.`,
  },
  {
    id:    'promo',
    label: 'Promo',
    icon:  '🔥',
    body:  `Hey {first_name}, we have a special deal today 🔥\nI can give you a better price if you stop by.`,
  },
  {
    id:    'new_arrivals',
    label: 'New Arrivals',
    icon:  '👀',
    body:  `Hey {first_name}, we just got new fragrances in 👀\nSome are very close to what you liked.`,
  },
]

// ── Quick Segments ────────────────────────────────────────────────────────────
const QUICK_SEGMENTS = [
  { id: 'customers_today',   label: 'Customers Today',   color: '#3b82f6' },
  { id: 'bought_today',      label: 'Bought Today',      color: '#22c55e' },
  { id: 'no_purchase_today', label: 'No Purchase Today', color: '#f59e0b' },
  { id: 'last_3_days',       label: 'Last 3 Days',       color: '#8b5cf6' },
  { id: 'high_value',        label: 'High Value ($150+)', color: '#f59e0b' },
  { id: 'inactive',          label: 'Inactive (7d+)',    color: '#ef4444' },
]

// ── Main Component ────────────────────────────────────────────────────────────
const PAGE_SIZE = 30

export default function CustomersAdmin({ customers = [], onAddCustomer, onPatchCustomer, onArchiveCustomer, posSession = null }) {
  const [activeTab,    setActiveTab]   = useState('customers')
  const [search,       setSearch]      = useState('')
  const [filterType,   setFilterType]  = useState('all')
  const [filterValue,  setFilterValue] = useState('')
  const [openId,       setOpenId]      = useState(null)
  const [showAdd,      setShowAdd]     = useState(false)
  const [page,         setPage]        = useState(1)

  // Advanced filters
  const [showAdvanced,  setShowAdvanced]  = useState(false)
  const [dateFrom,      setDateFrom]      = useState('')
  const [dateTo,        setDateTo]        = useState('')
  const [minSpent,      setMinSpent]      = useState('')
  const [maxSpent,      setMaxSpent]      = useState('')
  const [minPurchases,  setMinPurchases]  = useState('')

  // Quick segment
  const [activeSegment,  setActiveSegment]  = useState(null)

  // Campaign preload — set when "Send from Segment" is clicked
  const [campaignKey,    setCampaignKey]    = useState(0)
  const [campaignPreload, setCampaignPreload] = useState(null) // { selected: Set, step: number }

  // Supabase sync state
  const [importing,     setImporting]    = useState(false)
  const [importResult,  setImportResult] = useState(null) // { imported, failed, total }

  const employees = useMemo(() => loadActiveEmployees(), [])
  const locations = LOCATIONS_CFG.map(l => l.name)

  // Unique sellers present in data
  const sellers = useMemo(() =>
    [...new Set(customers.map(c => c.capturedBy).filter(Boolean))].sort()
  , [customers])

  const hasAdvanced = dateFrom || dateTo || minSpent || maxSpent || minPurchases

  // Sync counts
  const activeCustomers  = useMemo(() => customers.filter(c => !c.archived), [customers])
  const syncedCount      = useMemo(() => activeCustomers.filter(c => c.supabaseId).length, [activeCustomers])
  const unsyncedCount    = useMemo(() => activeCustomers.filter(c => !c.supabaseId).length, [activeCustomers])
  const supabaseReady    = isSupabaseConfigured() && !!posSession?.orgId

  // Segment predicate functions — computed once per mount (dates don't change mid-session)
  const segmentFns = useMemo(() => {
    const today  = new Date().toISOString().slice(0, 10)
    const minus3 = new Date(Date.now() - 3 * 86400_000).toISOString()
    const minus7 = new Date(Date.now() - 7 * 86400_000).toISOString()
    return {
      customers_today:   c => (c.capturedAt || c.createdAt || '').slice(0, 10) === today,
      bought_today:      c => (c.purchases || []).some(p => (p.date || '').slice(0, 10) === today),
      no_purchase_today: c => (c.capturedAt || c.createdAt || '').slice(0, 10) === today
                              && !(c.purchases || []).some(p => (p.date || '').slice(0, 10) === today),
      last_3_days:       c => (c.capturedAt || c.createdAt || '') >= minus3,
      high_value:        c => (c.purchases || []).reduce((s, p) => s + (p.total || 0), 0) >= 150,
      inactive:          c => { const ps = c.purchases || []; return ps.length > 0 && ps[ps.length - 1].date < minus7 },
    }
  }, [])

  // Live counts per segment (shown as badges on the buttons)
  const segmentCounts = useMemo(() => {
    const base = customers.filter(c => !c.archived)
    const out = {}
    for (const seg of QUICK_SEGMENTS) out[seg.id] = base.filter(segmentFns[seg.id]).length
    return out
  }, [customers, segmentFns])

  const handleImport = useCallback(async () => {
    if (!supabaseReady || importing) return
    const unsynced = activeCustomers.filter(c => !c.supabaseId)
    if (!unsynced.length) return
    setImporting(true)
    setImportResult(null)
    let imported = 0; let failed = 0
    for (const c of unsynced) {
      try {
        const result = await writeCustomerToSupabase(
          c,
          posSession.orgId,
          null,
          posSession.locationUUID || null,
        )
        if (result?.supabaseId) {
          onPatchCustomer?.(c.id, { supabaseId: result.supabaseId })
          imported++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }
    setImporting(false)
    setImportResult({ imported, failed, total: unsynced.length })
  }, [supabaseReady, importing, activeCustomers, posSession, onPatchCustomer])

  // Filtered list
  const filtered = useMemo(() => {
    let list = customers.filter(c => !c.archived)

    // Quick segment (first layer — combines with all other filters)
    if (activeSegment && segmentFns[activeSegment]) list = list.filter(segmentFns[activeSegment])

    if (filterType === 'buyer')           list = list.filter(c => (c.purchases || []).length > 0)
    else if (filterType === 'no-purchase') list = list.filter(c => (c.purchases || []).length === 0)
    else if (filterType === 'location' && filterValue) list = list.filter(c => c.capturedLocation === filterValue)
    else if (filterType === 'seller'   && filterValue) list = list.filter(c => c.capturedBy === filterValue)

    // Advanced filters
    if (dateFrom) list = list.filter(c => (c.capturedAt || c.createdAt || '') >= dateFrom)
    if (dateTo)   list = list.filter(c => (c.capturedAt || c.createdAt || '') <= dateTo + 'T23:59:59')
    if (minSpent !== '') {
      const mn = Number(minSpent)
      list = list.filter(c => (c.purchases || []).reduce((s, x) => s + (x.total || 0), 0) >= mn)
    }
    if (maxSpent !== '') {
      const mx = Number(maxSpent)
      list = list.filter(c => (c.purchases || []).reduce((s, x) => s + (x.total || 0), 0) <= mx)
    }
    if (minPurchases !== '') {
      const mp = Number(minPurchases)
      list = list.filter(c => (c.purchases || []).length >= mp)
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.phone || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        (c.email || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [customers, activeSegment, segmentFns, filterType, filterValue, search, dateFrom, dateTo, minSpent, maxSpent, minPurchases])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const openCustomer = openId ? customers.find(c => c.id === openId) : null

  // Handlers — delegate to useCRM via props (single source of truth)
  const handleUpdateCustomer = (id, fields) => {
    onPatchCustomer?.(id, fields)
  }

  const handleAddCustomer = (formData) => {
    const result = onAddCustomer?.(formData)
    if (result?.error) return result
    setShowAdd(false)
    // Reset to page 1, clear search, and switch to All filter so new customer is visible
    setPage(1)
    setSearch('')
    setFilterType('all')
    setFilterValue('')
    setActiveSegment(null)
    return { success: true }
  }

  const openCampaignWithSegment = (message = null) => {
    const ids = new Set(filtered.map(c => c.id))
    setCampaignPreload({ selected: ids, step: 2, message })
    setCampaignKey(k => k + 1)
    setActiveTab('sms')
  }

  const handleSendFromSegment = () => openCampaignWithSegment(null)

  const resetAdvanced = () => {
    setDateFrom(''); setDateTo(''); setMinSpent(''); setMaxSpent(''); setMinPurchases('')
    setActiveSegment(null)
    setPage(1)
  }

  const filterBtn = (type, label, value = '') => {
    const active = filterType === type && (!value || filterValue === value)
    return (
      <button
        key={type + value}
        onClick={() => { setFilterType(type); setFilterValue(value); setPage(1) }}
        style={{
          padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
          background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
          border: `1px solid ${active ? 'rgba(37,99,235,0.4)' : BORDER}`,
          color: active ? '#93c5fd' : MUTED,
          fontWeight: active ? 700 : 400,
          transition: 'all 0.15s', whiteSpace: 'nowrap',
        }}
      >{label}</button>
    )
  }

  const colW = {
    firstName: 96, lastName: 96, phone: 130, email: 160,
    addedBy: 96, location: 110, status: 110, loyalty: 70,
    num: 32, total: 86, dateAdded: 86, lastPurchase: 86, open: 50,
  }

  const TABS = [
    { id: 'customers', label: 'Customers' },
    { id: 'sms',       label: 'SMS Campaign' },
    { id: 'drip',      label: 'Drip Campaigns' },
    { id: 'email',     label: 'Email Campaign' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, overflow: 'hidden' }}>

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, padding: '0 20px', gap: 2 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => {
            if (t.id === 'sms') { setCampaignPreload(null); setCampaignKey(k => k + 1) }
            setActiveTab(t.id)
          }} style={{
            padding: '11px 16px', background: 'none', border: 'none', marginBottom: -1,
            borderBottom: activeTab === t.id ? `2px solid ${BLUE}` : '2px solid transparent',
            color: activeTab === t.id ? TEXT : MUTED,
            fontSize: 13, fontWeight: activeTab === t.id ? 700 : 400,
            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Campaign Tabs ── */}
      {activeTab === 'sms' && (
        <CampaignSMS
          key={campaignKey}
          customers={customers}
          posSession={posSession}
          initialSelected={campaignPreload?.selected ?? null}
          initialStep={campaignPreload?.step ?? 1}
          initialMessage={campaignPreload?.message ?? null}
        />
      )}
      {activeTab === 'drip' && (
        <DripCampaigns customers={customers} posSession={posSession} />
      )}
      {activeTab === 'email' && <CampaignEmail customers={customers} />}

      {/* ── Customers Tab ── */}
      {activeTab === 'customers' && <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        {/* Row 1 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 10 }}>
          <div>
            <h2 style={{ color: TEXT, fontWeight: 800, fontSize: 17, lineHeight: 1 }}>Customers Management</h2>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>
              <span style={{ color: '#60a5fa', fontWeight: 700 }}>{(customers || []).filter(c => !c.archived).length}</span> total in CRM
              {filtered.length !== customers.filter(c => !c.archived).length && (
                <span style={{ color: DIM }}> · {filtered.length} shown</span>
              )}
            </p>
          </div>
          <div style={{ flex: 1 }} />

          {/* Supabase sync status */}
          {supabaseReady ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 7,
                background: unsyncedCount > 0 ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                border: `1px solid ${unsyncedCount > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
              }}>
                <span style={{ fontSize: 11, color: GREEN, fontWeight: 600 }}>
                  {syncedCount} synced
                </span>
                {unsyncedCount > 0 && (
                  <span style={{ fontSize: 11, color: AMBER, fontWeight: 600 }}>
                    · {unsyncedCount} local only
                  </span>
                )}
              </div>
              {unsyncedCount > 0 && (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  style={{
                    padding: '5px 12px', borderRadius: 7, fontSize: 12, fontWeight: 700,
                    cursor: importing ? 'not-allowed' : 'pointer',
                    background: importing ? 'rgba(245,158,11,0.1)' : 'rgba(245,158,11,0.15)',
                    border: `1px solid ${importing ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.4)'}`,
                    color: AMBER, transition: 'all 0.15s',
                  }}
                >
                  {importing ? 'Importing...' : 'Import to Supabase'}
                </button>
              )}
              {importResult && (
                <span style={{ fontSize: 11, color: importResult.failed > 0 ? AMBER : GREEN }}>
                  {importResult.imported}/{importResult.total} imported
                  {importResult.failed > 0 ? ` (${importResult.failed} failed)` : ''}
                </span>
              )}
            </div>
          ) : (
            <div style={{
              padding: '5px 10px', borderRadius: 7, fontSize: 11,
              background: 'rgba(148,163,184,0.07)', border: `1px solid ${BORDER}`,
              color: DIM,
            }}>
              Supabase not configured
            </div>
          )}

          <button
            onClick={() => setShowAdd(true)}
            style={{
              padding: '8px 18px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
              border: 'none', borderRadius: 8, color: '#fff',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 0 16px rgba(37,99,235,0.3)',
            }}
          >
            + Add Customer
          </button>
        </div>

        {/* Row 1.5 — Quick Segments */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ color: DIM, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>QUICK:</span>
          {QUICK_SEGMENTS.map(seg => {
            const isActive = activeSegment === seg.id
            const count    = segmentCounts[seg.id] ?? 0
            return (
              <button
                key={seg.id}
                onClick={() => { setActiveSegment(isActive ? null : seg.id); setPage(1) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  background: isActive ? `${seg.color}22` : 'transparent',
                  border: `1px solid ${isActive ? seg.color : BORDER}`,
                  color: isActive ? seg.color : MUTED,
                  fontWeight: isActive ? 700 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {seg.label}
                <span style={{
                  minWidth: 18, padding: '1px 5px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                  background: isActive ? `${seg.color}33` : 'rgba(148,163,184,0.1)',
                  color: isActive ? seg.color : DIM,
                }}>{count}</span>
              </button>
            )
          })}
          {activeSegment && (
            <button
              onClick={() => { setActiveSegment(null); setPage(1) }}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${BORDER}`,
                color: RED, transition: 'all 0.15s',
              }}
            >✕ Clear</button>
          )}

          {activeSegment && filtered.length > 0 && (
            <button
              onClick={handleSendFromSegment}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                cursor: 'pointer',
                background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
                border: 'none', color: '#fff',
                boxShadow: '0 0 14px rgba(59,130,246,0.35)',
                transition: 'all 0.15s',
              }}
            >
              Send to {filtered.length} Customer{filtered.length !== 1 ? 's' : ''} →
            </button>
          )}
        </div>

        {/* Row 1.5b — Quick Templates (only when segment active with results) */}
        {activeSegment && filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ color: DIM, fontSize: 11, fontWeight: 600, letterSpacing: 0.4, whiteSpace: 'nowrap' }}>SEND:</span>
            {QUICK_TEMPLATES.map(qt => (
              <button
                key={qt.id}
                onClick={() => openCampaignWithSegment(qt.body)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
                  background: 'rgba(59,130,246,0.08)',
                  border: `1px solid rgba(59,130,246,0.3)`,
                  color: '#93c5fd', fontWeight: 600, transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.6)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = 'rgba(59,130,246,0.3)' }}
              >
                <span>{qt.icon}</span> {qt.label}
              </button>
            ))}
            <span style={{ color: DIM, fontSize: 11, marginLeft: 4 }}>
              → opens compose with message pre-filled, {filtered.length} recipients
            </span>
          </div>
        )}

        {/* Row 2 — search + filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Search */}
          <input
            value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search by name, phone or email..."
            style={{
              padding: '7px 12px', background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none',
              width: 240, transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = BORDER }}
          />

          {/* Filter pills */}
          {filterBtn('all',        'All')}
          {filterBtn('buyer',      'With Purchase')}
          {filterBtn('no-purchase','No Purchase')}

          {/* By Location */}
          <select
            value={filterType === 'location' ? filterValue : ''}
            onChange={e => { if (e.target.value) { setFilterType('location'); setFilterValue(e.target.value) } else { setFilterType('all'); setFilterValue('') }; setPage(1) }}
            style={{
              padding: '5px 10px', background: filterType === 'location' ? 'rgba(37,99,235,0.12)' : CARD,
              border: `1px solid ${filterType === 'location' ? 'rgba(37,99,235,0.4)' : BORDER}`,
              borderRadius: 7, color: filterType === 'location' ? '#93c5fd' : MUTED,
              fontSize: 12, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">By Location</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          {/* By Seller */}
          <select
            value={filterType === 'seller' ? filterValue : ''}
            onChange={e => { if (e.target.value) { setFilterType('seller'); setFilterValue(e.target.value) } else { setFilterType('all'); setFilterValue('') }; setPage(1) }}
            style={{
              padding: '5px 10px', background: filterType === 'seller' ? 'rgba(37,99,235,0.12)' : CARD,
              border: `1px solid ${filterType === 'seller' ? 'rgba(37,99,235,0.4)' : BORDER}`,
              borderRadius: 7, color: filterType === 'seller' ? '#93c5fd' : MUTED,
              fontSize: 12, cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">By Seller</option>
            {sellers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Advanced filters toggle */}
          <button
            onClick={() => setShowAdvanced(v => !v)}
            style={{
              padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
              background: hasAdvanced ? 'rgba(139,92,246,0.15)' : 'transparent',
              border: `1px solid ${hasAdvanced ? 'rgba(139,92,246,0.4)' : BORDER}`,
              color: hasAdvanced ? '#a78bfa' : MUTED, fontWeight: hasAdvanced ? 700 : 400,
            }}
          >{hasAdvanced ? '▼ Filters active' : '▼ Advanced'}</button>
        </div>

        {/* Advanced filter row */}
        {showAdvanced && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: MUTED, fontSize: 11 }}>Added from</span>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1) }}
                style={{ padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none' }} />
              <span style={{ color: MUTED, fontSize: 11 }}>to</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1) }}
                style={{ padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: MUTED, fontSize: 11 }}>Spent $</span>
              <input type="number" placeholder="min" value={minSpent} onChange={e => { setMinSpent(e.target.value); setPage(1) }}
                style={{ width: 70, padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none' }} />
              <span style={{ color: MUTED, fontSize: 11 }}>–</span>
              <input type="number" placeholder="max" value={maxSpent} onChange={e => { setMaxSpent(e.target.value); setPage(1) }}
                style={{ width: 70, padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: MUTED, fontSize: 11 }}>Min purchases</span>
              <input type="number" placeholder="0" value={minPurchases} onChange={e => { setMinPurchases(e.target.value); setPage(1) }}
                style={{ width: 55, padding: '4px 8px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none' }} />
            </div>
            {hasAdvanced && (
              <button onClick={resetAdvanced} style={{
                padding: '4px 10px', background: 'transparent',
                border: `1px solid ${BORDER}`, borderRadius: 6,
                color: RED, fontSize: 11, cursor: 'pointer',
              }}>Clear filters</button>
            )}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {/* Table header */}
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '8px 16px', background: CARD,
          borderBottom: `1px solid ${BORDER}`,
          position: 'sticky', top: 0, zIndex: 10,
          gap: 8, minWidth: 1230,
        }}>
          <TH width={colW.firstName}>First Name</TH>
          <TH width={colW.lastName}>Last Name</TH>
          <TH width={colW.phone}>Mobile</TH>
          <TH width={colW.email}>Email</TH>
          <TH width={colW.addedBy}>Added By</TH>
          <TH width={colW.location}>Location</TH>
          <TH width={colW.status}>Status</TH>
          <TH width={colW.loyalty} align="center">Loyalty</TH>
          <TH width={colW.num} align="center">#</TH>
          <TH width={colW.total} align="right">Total Spent</TH>
          <TH width={colW.dateAdded}>Date Added</TH>
          <TH width={colW.lastPurchase}>Last Purchase</TH>
          <TH width={colW.open} align="center">Open</TH>
        </div>

        {/* Empty state */}
        {paginated.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: DIM, fontSize: 14 }}>
            {search || filterType !== 'all' || hasAdvanced ? 'No customers match your filters.' : 'No customers in CRM yet.'}
          </div>
        )}

        {/* Rows */}
        {paginated.map((c, idx) => {
          const { numPurchases, totalSpent, lastPurchase, status, loyaltyStars } = derived(c)
          const isBuyer = status === 'Buyer'
          return (
            <div
              key={c.id}
              style={{
                display: 'flex', alignItems: 'center',
                padding: '9px 16px', gap: 8,
                borderBottom: `1px solid var(--c-border-row)`,
                background: idx % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)',
                transition: 'background 0.15s',
                minWidth: 1230,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.background = idx % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)' }}
            >
              <div style={{ width: colW.firstName, minWidth: colW.firstName, color: TEXT, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.firstName}</div>
              <div style={{ width: colW.lastName,  minWidth: colW.lastName,  color: SUB,  fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastName || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: colW.phone,     minWidth: colW.phone,     color: SUB,  fontSize: 12, fontFamily: 'monospace' }}>{fmtPhone(c.phone)}</div>
              <div style={{ width: colW.email,     minWidth: colW.email,     color: MUTED, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: colW.addedBy,   minWidth: colW.addedBy,   color: MUTED, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.capturedBy || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: colW.location,  minWidth: colW.location,  color: MUTED, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.capturedLocation || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: colW.status, minWidth: colW.status }}>
                <span style={{
                  padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                  background: isBuyer ? 'rgba(34,197,94,0.1)' : 'rgba(71,85,105,0.12)',
                  border: `1px solid ${isBuyer ? 'rgba(34,197,94,0.25)' : BORDER}`,
                  color: isBuyer ? GREEN : MUTED,
                }}>{status}</span>
              </div>
              <div style={{ width: colW.loyalty, minWidth: colW.loyalty, textAlign: 'center' }}>
                {loyaltyStars > 0 ? (
                  <span style={{ color: STAR_COLORS[loyaltyStars], fontSize: 12, letterSpacing: -1 }}>
                    {'★'.repeat(loyaltyStars)}
                  </span>
                ) : (
                  <span style={{ color: DIM, fontSize: 12 }}>—</span>
                )}
              </div>
              <div style={{ width: colW.num,  minWidth: colW.num,  color: numPurchases > 0 ? '#60a5fa' : DIM, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{numPurchases}</div>
              <div style={{ width: colW.total, minWidth: colW.total, color: totalSpent > 0 ? GREEN : DIM, fontSize: 13, fontWeight: 600, textAlign: 'right' }}>${totalSpent.toFixed(2)}</div>
              <div style={{ width: colW.dateAdded,    minWidth: colW.dateAdded,    color: MUTED, fontSize: 12 }}>{fmtDate(c.capturedAt || c.createdAt)}</div>
              <div style={{ width: colW.lastPurchase, minWidth: colW.lastPurchase, color: MUTED, fontSize: 12 }}>{fmtDate(lastPurchase)}</div>
              <div style={{ width: colW.open, minWidth: colW.open, textAlign: 'center' }}>
                <button
                  onClick={() => setOpenId(c.id)}
                  style={{
                    padding: '4px 10px', background: 'rgba(37,99,235,0.1)',
                    border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6,
                    color: '#60a5fa', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.2)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.1)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)' }}
                >
                  Open
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div style={{ padding: '10px 20px', background: PANEL, borderTop: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ color: MUTED, fontSize: 12 }}>
            Page {page} of {totalPages} · {filtered.length} customers
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '5px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: page === 1 ? DIM : SUB, fontSize: 12, cursor: page === 1 ? 'not-allowed' : 'pointer' }}>← Prev</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: '5px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: page === totalPages ? DIM : SUB, fontSize: 12, cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {openCustomer && (
        <CustomerProfile
          customer={openCustomer}
          onClose={() => setOpenId(null)}
          onSave={(id, fields) => { handleUpdateCustomer(id, fields); setOpenId(null) }}
          onDelete={onArchiveCustomer ? (id) => { onArchiveCustomer(id); setOpenId(null) } : undefined}
        />
      )}
      {showAdd && (
        <AddCustomerModal
          onSave={handleAddCustomer}
          onClose={() => setShowAdd(false)}
        />
      )}
      </div>}
    </div>
  )
}
