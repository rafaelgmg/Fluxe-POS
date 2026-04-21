import { useState } from 'react'
import {
  C, R, T,
  modalOverlay, modalCard,
  btnPrimary, btnSecondary,
  inputStyle, selectStyle, label,
} from '../../../styles/ds'
import { loadServices, upsertService, deleteService } from '../../../utils/serviceStorage'

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = ['Hair', 'Nails', 'Skin', 'Massage', 'Makeup', 'Waxing', 'Eyebrows', 'Lashes', 'Other']

const EMPTY_FORM = {
  name: '', category: '', duration_minutes: 60,
  default_price: '', return_interval_days: 30, is_active: true,
}

// ── Service Form Modal ────────────────────────────────────────────────────────

function ServiceFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [error, setError] = useState('')

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked
      : e.target.type === 'number' ? Number(e.target.value)
      : e.target.value
    setForm(f => ({ ...f, [field]: val }))
  }

  const handleSave = () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    onSave(form)
  }

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 460, padding: 28 })}>
        <h3 style={{ color: C.text, fontWeight: 700, fontSize: 17, margin: '0 0 22px' }}>
          {initial?.id ? 'Edit Service' : 'New Service'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>

          {/* Name */}
          <div>
            <div style={label()}>Service Name *</div>
            <input
              value={form.name}
              onChange={set('name')}
              style={inputStyle(!!error)}
              placeholder="e.g. Full Color, Brazilian Blowout..."
              autoFocus
            />
            {error && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{error}</div>}
          </div>

          {/* Category */}
          <div>
            <div style={label()}>Category</div>
            <select value={form.category} onChange={set('category')} style={selectStyle()}>
              <option value="">— Select category —</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Duration + Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label()}>Duration (min)</div>
              <input
                type="number" min={5} step={5}
                value={form.duration_minutes}
                onChange={set('duration_minutes')}
                style={inputStyle()}
              />
            </div>
            <div>
              <div style={label()}>Default Price ($)</div>
              <input
                type="number" min={0} step={0.01}
                value={form.default_price}
                onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))}
                style={inputStyle()}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Return interval */}
          <div>
            <div style={label()}>Return Interval (days)</div>
            <input
              type="number" min={1}
              value={form.return_interval_days}
              onChange={set('return_interval_days')}
              style={inputStyle()}
              placeholder="e.g. 30 = monthly"
            />
            <div style={{ color: C.textDim, fontSize: 11, marginTop: 5 }}>
              Used for smart follow-up reminders — how often clients should return.
            </div>
          </div>

          {/* Active toggle */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={set('is_active')}
              style={{ accentColor: C.blue, width: 16, height: 16 }}
            />
            <span style={{ color: C.textSub, fontSize: 13 }}>Active (available for booking)</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary()}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!form.name.trim()}
            style={btnPrimary(!form.name.trim())}
          >
            {initial?.id ? 'Save Changes' : 'Create Service'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ServicesScreen() {
  const [services, setServices] = useState(() => loadServices())
  const [filter,   setFilter]   = useState('all')   // 'all' | 'active' | 'inactive'
  const [formData, setFormData] = useState(null)    // null = closed | obj = open

  const filtered = services.filter(s => {
    if (filter === 'active')   return s.is_active !== false
    if (filter === 'inactive') return s.is_active === false
    return true
  })

  const openCreate = () => setFormData(EMPTY_FORM)

  const openEdit = (s) => setFormData({
    id: s.id,
    name: s.name,
    category: s.category || '',
    duration_minutes: s.duration_minutes ?? 60,
    default_price: s.default_price ?? '',
    return_interval_days: s.return_interval_days ?? 30,
    is_active: s.is_active !== false,
  })

  const handleSave = (form) => {
    setServices(upsertService(form))
    setFormData(null)
  }

  const toggleActive = (s) => {
    setServices(upsertService({ ...s, is_active: !s.is_active }))
  }

  const handleDelete = (s) => {
    if (!window.confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    setServices(deleteService(s.id))
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Header */}
      <div style={{
        padding: '14px 22px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        background: C.bgPanel,
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Services</h2>
          <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>
            {filtered.length} service{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {['all', 'active', 'inactive'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: R.md, fontSize: 12, fontWeight: filter === f ? 700 : 500,
                cursor: 'pointer', border: `1px solid ${filter === f ? C.blue : C.border}`,
                background: filter === f ? C.blueDim : 'transparent',
                color: filter === f ? '#93c5fd' : C.textMuted,
                transition: T.std, textTransform: 'capitalize',
              }}
            >{f}</button>
          ))}
        </div>

        <button onClick={openCreate} style={btnPrimary()}>+ New Service</button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: C.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✂️</div>
            <div style={{ fontSize: 14 }}>
              {filter !== 'all'
                ? `No ${filter} services.`
                : 'No services yet. Add your first service.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(s => (
              <div key={s.id} style={{
                background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.md,
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                opacity: s.is_active === false ? 0.55 : 1, transition: T.std,
              }}>

                {/* Icon dot */}
                <div style={{
                  width: 38, height: 38, borderRadius: R.md, flexShrink: 0,
                  background: s.is_active !== false ? C.purpleDim : C.bgHover,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `1px solid ${s.is_active !== false ? C.purple + '44' : C.border}`,
                  fontSize: 18,
                }}>
                  ✂️
                </div>

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                    {s.category && (
                      <span style={{
                        padding: '1px 7px', borderRadius: R.full, fontSize: 11, fontWeight: 600,
                        background: C.purpleDim, color: C.purpleSoft, border: `1px solid ${C.purple}30`,
                      }}>{s.category}</span>
                    )}
                  </div>
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 4, display: 'flex', gap: 16 }}>
                    <span>⏱ {s.duration_minutes ?? '—'} min</span>
                    <span>💰 ${Number(s.default_price || 0).toFixed(2)}</span>
                    <span style={{ color: C.teal }}>🔁 every {s.return_interval_days ?? '—'} days</span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button
                    onClick={() => toggleActive(s)}
                    title={s.is_active !== false ? 'Set inactive' : 'Set active'}
                    style={{
                      padding: '4px 12px', borderRadius: R.full, fontSize: 11, fontWeight: 700,
                      cursor: 'pointer', border: 'none', transition: T.std,
                      background: s.is_active !== false ? C.greenDim : C.bgHover,
                      color:      s.is_active !== false ? C.green    : C.textMuted,
                    }}
                  >
                    {s.is_active !== false ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => openEdit(s)}
                    style={{
                      background: C.bgHover, border: `1px solid ${C.border}`, borderRadius: R.md,
                      color: C.textSub, fontSize: 12, cursor: 'pointer', padding: '6px 12px',
                    }}
                  >Edit</button>
                  <button
                    onClick={() => handleDelete(s)}
                    style={{
                      background: 'none', border: 'none', color: C.textDim,
                      fontSize: 17, cursor: 'pointer', padding: '4px 6px', lineHeight: 1,
                    }}
                    title="Delete"
                  >×</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {formData !== null && (
        <ServiceFormModal
          initial={formData}
          onSave={handleSave}
          onClose={() => setFormData(null)}
        />
      )}
    </div>
  )
}
