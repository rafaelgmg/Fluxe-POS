import { useState } from 'react'
import {
  C, R, GRAD, GLOW, T,
  modalOverlay, modalCard,
  btnPrimary, btnSecondary,
  inputStyle, label,
} from '../../../styles/ds'
import { loadServiceClients, upsertServiceClient, deleteServiceClient } from '../../../utils/serviceClientsStorage'
import { loadAppointments } from '../../../utils/appointmentsStorage'

// ── Constants ─────────────────────────────────────────────────────────────────
const EMPTY_FORM = { name: '', phone: '', instagram: '', notes: '' }

const STATUS_COLORS = {
  scheduled: C.blue,
  confirmed:  C.teal,
  completed:  C.green,
  cancelled:  C.red,
  no_show:    C.amber,
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ name, size = 40, fontSize = 16 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: R.full, flexShrink: 0,
      background: GRAD.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize, boxShadow: GLOW.blueSm,
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || C.textMuted
  return (
    <span style={{
      padding: '2px 8px', borderRadius: R.full, fontSize: 11, fontWeight: 600,
      background: color + '22', color, border: `1px solid ${color}44`,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>
      {(status || 'scheduled').replace('_', ' ')}
    </span>
  )
}

// ── Client Detail Modal ───────────────────────────────────────────────────────

function ClientDetailModal({ client, onEdit, onDelete, onClose }) {
  const history = loadAppointments()
    .filter(a => a.type === 'service' && a.clientId === client.id)
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 500, maxHeight: '82vh', display: 'flex', flexDirection: 'column' })}>

        {/* Header */}
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        }}>
          <Avatar name={client.name} size={48} fontSize={20} />
          <div style={{ flex: 1 }}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>{client.name}</div>
            <div style={{ color: C.textMuted, fontSize: 12, marginTop: 3 }}>
              {[client.phone, client.instagram ? `@${client.instagram}` : null].filter(Boolean).join('  ·  ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={onEdit} style={btnSecondary({ fontSize: 13, padding: '7px 14px' })}>Edit</button>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: '0 4px' }}
            >×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Notes */}
          {client.notes && (
            <div style={{ marginBottom: 22 }}>
              <div style={label()}>Notes</div>
              <div style={{
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderRadius: R.md, padding: '10px 14px', color: C.textSub, fontSize: 13, lineHeight: 1.6,
              }}>
                {client.notes}
              </div>
            </div>
          )}

          {/* Appointment history */}
          <div>
            <div style={label()}>Appointment History ({history.length})</div>
            {history.length === 0 ? (
              <div style={{
                color: C.textDim, fontSize: 13, textAlign: 'center', padding: '24px 0',
                background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.md,
              }}>
                No appointments yet
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {history.slice(0, 12).map(appt => (
                  <div key={appt.id} style={{
                    background: C.bgCard, border: `1px solid ${C.border}`,
                    borderRadius: R.md, padding: '10px 14px',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: C.text, fontSize: 13, fontWeight: 600 }}>
                        {appt.serviceName || '—'}
                      </div>
                      <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                        {fmtDate(appt.date)}{appt.time ? `  ·  ${appt.time}` : ''}
                        {appt.staffName ? `  ·  ${appt.staffName}` : ''}
                      </div>
                    </div>
                    <StatusBadge status={appt.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px', borderTop: `1px solid ${C.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0,
        }}>
          <button
            onClick={onDelete}
            style={{ background: 'none', border: 'none', color: C.red, fontSize: 13, cursor: 'pointer', opacity: 0.8 }}
          >
            Delete client
          </button>
          <span style={{ color: C.textDim, fontSize: 11 }}>
            Added {fmtDate(client.createdAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Client Form Modal ─────────────────────────────────────────────────────────

function ClientFormModal({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleSave = () => {
    if (!form.name.trim()) { setError('Name is required.'); return }
    onSave(form)
  }

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 440, padding: 28 })}>
        <h3 style={{ color: C.text, fontWeight: 700, fontSize: 17, margin: '0 0 20px' }}>
          {initial?.id ? 'Edit Client' : 'New Client'}
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={label()}>Name *</div>
            <input
              value={form.name}
              onChange={set('name')}
              style={inputStyle(!!error)}
              placeholder="Full name"
              autoFocus
            />
            {error && <div style={{ color: C.red, fontSize: 12, marginTop: 4 }}>{error}</div>}
          </div>

          <div>
            <div style={label()}>Phone</div>
            <input value={form.phone} onChange={set('phone')} style={inputStyle()} placeholder="+1 (702) 000-0000" />
          </div>

          <div>
            <div style={label()}>Instagram</div>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: C.textMuted, fontSize: 14 }}>@</span>
              <input
                value={form.instagram}
                onChange={set('instagram')}
                style={{ ...inputStyle(), paddingLeft: 26 }}
                placeholder="handle"
              />
            </div>
          </div>

          <div>
            <div style={label()}>Notes</div>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              style={{ ...inputStyle(), height: 84, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Preferences, allergies, anything useful..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary()}>Cancel</button>
          <button onClick={handleSave} style={btnPrimary(!form.name.trim())} disabled={!form.name.trim()}>
            {initial?.id ? 'Save Changes' : 'Create Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ClientsScreen() {
  const [clients, setClients] = useState(() => loadServiceClients())
  const [search,  setSearch]  = useState('')
  const [formData, setFormData] = useState(null)  // null = closed | obj = open (with or without id)
  const [viewClient, setViewClient] = useState(null)

  const filtered = clients
    .filter(c => {
      if (!search) return true
      const q = search.toLowerCase()
      return c.name?.toLowerCase().includes(q) || (c.phone || '').includes(q)
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))

  const openCreate = () => setFormData(EMPTY_FORM)

  const openEdit = (client) => {
    setViewClient(null)
    setFormData({ id: client.id, name: client.name, phone: client.phone || '', instagram: client.instagram || '', notes: client.notes || '' })
  }

  const handleSave = (form) => {
    const updated = upsertServiceClient(form)
    setClients(updated)
    setFormData(null)
  }

  const handleDelete = (id) => {
    if (!window.confirm('Delete this client? This cannot be undone.')) return
    setClients(deleteServiceClient(id))
    setViewClient(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 22px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        background: C.bgPanel,
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Clients</h2>
          <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>
            {clients.length} client{clients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone..."
          style={{ ...inputStyle(), width: 240, height: 36 }}
        />
        <button onClick={openCreate} style={btnPrimary()}>+ New Client</button>
      </div>

      {/* ── List ──────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: C.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
            <div style={{ fontSize: 14 }}>
              {search ? 'No clients match your search.' : 'No clients yet. Add your first one.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => setViewClient(c)}
                style={{
                  background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.md,
                  padding: '13px 18px', display: 'flex', alignItems: 'center', gap: 14,
                  cursor: 'pointer', transition: T.std,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderMd; e.currentTarget.style.background = C.bgHover }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border;  e.currentTarget.style.background = C.bgCard }}
              >
                <Avatar name={c.name} />
                <div style={{ flex: 1 }}>
                  <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
                    {c.phone && <span>{c.phone}</span>}
                    {c.phone && c.instagram && <span style={{ margin: '0 6px', color: C.textDim }}>·</span>}
                    {c.instagram && <span>@{c.instagram}</span>}
                  </div>
                </div>
                <span style={{ color: C.textDim, fontSize: 11 }}>
                  {fmtDate(c.createdAt)}
                </span>
                <span style={{ color: C.textDim, fontSize: 16 }}>›</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {formData !== null && (
        <ClientFormModal
          initial={formData}
          onSave={handleSave}
          onClose={() => setFormData(null)}
        />
      )}

      {viewClient && (
        <ClientDetailModal
          client={viewClient}
          onEdit={() => openEdit(viewClient)}
          onDelete={() => handleDelete(viewClient.id)}
          onClose={() => setViewClient(null)}
        />
      )}
    </div>
  )
}
