import { useState } from 'react'
import {
  C, R, T,
  modalOverlay, modalCard,
  btnPrimary, btnSecondary,
  inputStyle, selectStyle, label,
} from '../../../styles/ds'
import { loadAppointments, upsertAppointment, deleteAppointment } from '../../../utils/appointmentsStorage'
import { loadServiceClients } from '../../../utils/serviceClientsStorage'
import { loadServices } from '../../../utils/serviceStorage'

// ── Constants ─────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10)

const STATUSES = ['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']

const STATUS_META = {
  scheduled: { color: C.blue,   label: 'Scheduled' },
  confirmed:  { color: C.teal,   label: 'Confirmed'  },
  completed:  { color: C.green,  label: 'Completed'  },
  cancelled:  { color: C.red,    label: 'Cancelled'  },
  no_show:    { color: C.amber,  label: 'No Show'    },
}

const EMPTY_FORM = {
  clientId: '', serviceName: '', serviceId: '',
  date: TODAY, time: '10:00', duration: 60,
  staffName: '', notes: '', status: 'scheduled',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt12(time) {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDate(dateStr) {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function isToday(dateStr) { return dateStr === TODAY }

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { color: C.textMuted, label: status }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: R.full, fontSize: 11, fontWeight: 700,
      background: meta.color + '22', color: meta.color,
      border: `1px solid ${meta.color}44`, whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  )
}

// ── Status Picker (inline) ────────────────────────────────────────────────────
function StatusPicker({ current, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {STATUSES.map(s => {
        const meta = STATUS_META[s]
        const active = current === s
        return (
          <button
            key={s}
            onClick={() => onChange(s)}
            style={{
              padding: '4px 10px', borderRadius: R.full, fontSize: 11, fontWeight: 700,
              cursor: 'pointer', border: `1px solid ${active ? meta.color : C.border}`,
              background: active ? meta.color + '22' : 'transparent',
              color: active ? meta.color : C.textMuted,
              transition: T.fast,
            }}
          >{meta.label}</button>
        )
      })}
    </div>
  )
}

// ── Appointment Form Modal ────────────────────────────────────────────────────
function ApptFormModal({ initial, clients, services, onSave, onClose }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [error, setError] = useState('')

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  // Auto-fill duration when service changes
  const handleServiceChange = (e) => {
    const svc = services.find(s => s.id === e.target.value)
    setForm(f => ({
      ...f,
      serviceId:   svc?.id   || '',
      serviceName: svc?.name || '',
      duration:    svc?.duration_minutes ?? f.duration,
    }))
  }

  const selectedClient = clients.find(c => c.id === form.clientId)

  const handleSave = () => {
    if (!form.clientId)    { setError('Select a client.'); return }
    if (!form.serviceName) { setError('Select a service.'); return }
    if (!form.date)        { setError('Set a date.'); return }
    onSave({ ...form, type: 'service', clientName: selectedClient?.name || '' })
  }

  const isValid = form.clientId && form.serviceName && form.date

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 480, padding: 28, maxHeight: '90vh', overflowY: 'auto' })}>
        <h3 style={{ color: C.text, fontWeight: 700, fontSize: 17, margin: '0 0 20px' }}>
          {initial?.id ? 'Edit Appointment' : 'New Appointment'}
        </h3>

        {error && (
          <div style={{ background: C.redDim, border: `1px solid ${C.red}44`, borderRadius: R.md, padding: '8px 12px', color: '#fca5a5', fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Client */}
          <div>
            <div style={label()}>Client *</div>
            <select value={form.clientId} onChange={e => { setError(''); set('clientId')(e) }} style={selectStyle()}>
              <option value="">— Select client —</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
            </select>
          </div>

          {/* Service */}
          <div>
            <div style={label()}>Service *</div>
            <select
              value={form.serviceId || ''}
              onChange={e => { setError(''); handleServiceChange(e) }}
              style={selectStyle()}
            >
              <option value="">— Select service —</option>
              {services.filter(s => s.is_active !== false).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.duration_minutes ? ` (${s.duration_minutes} min)` : ''}{s.default_price ? ` · $${Number(s.default_price).toFixed(2)}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Date + Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label()}>Date *</div>
              <input type="date" value={form.date} onChange={set('date')} style={inputStyle()} />
            </div>
            <div>
              <div style={label()}>Time</div>
              <input type="time" value={form.time} onChange={set('time')} style={inputStyle()} />
            </div>
          </div>

          {/* Duration + Staff */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label()}>Duration (min)</div>
              <input
                type="number" min={5} step={5}
                value={form.duration}
                onChange={e => setForm(f => ({ ...f, duration: Number(e.target.value) }))}
                style={inputStyle()}
              />
            </div>
            <div>
              <div style={label()}>Provider / Staff</div>
              <input value={form.staffName} onChange={set('staffName')} style={inputStyle()} placeholder="Optional" />
            </div>
          </div>

          {/* Status (edit only) */}
          {initial?.id && (
            <div>
              <div style={label()}>Status</div>
              <StatusPicker current={form.status} onChange={s => setForm(f => ({ ...f, status: s }))} />
            </div>
          )}

          {/* Notes */}
          <div>
            <div style={label()}>Notes</div>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              style={{ ...inputStyle(), height: 70, resize: 'vertical', fontFamily: 'inherit' }}
              placeholder="Any special notes..."
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary()}>Cancel</button>
          <button onClick={handleSave} disabled={!isValid} style={btnPrimary(!isValid)}>
            {initial?.id ? 'Save Changes' : 'Book Appointment'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Appointment Card ──────────────────────────────────────────────────────────
function ApptCard({ appt, onEdit, onStatusChange, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`, borderRadius: R.md,
      overflow: 'hidden', transition: T.std,
    }}>
      {/* Main row */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer',
        }}
        onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {/* Time column */}
        <div style={{
          width: 70, flexShrink: 0, textAlign: 'center',
          background: C.bgHover, borderRadius: R.md, padding: '6px 0',
          border: `1px solid ${C.border}`,
        }}>
          <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>{fmt12(appt.time)}</div>
          <div style={{ color: C.textDim, fontSize: 10 }}>{appt.duration ? `${appt.duration}m` : ''}</div>
        </div>

        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{appt.clientName || '—'}</div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {appt.serviceName || '—'}
            {appt.staffName ? <span style={{ color: C.textDim }}>  ·  {appt.staffName}</span> : ''}
          </div>
        </div>

        <StatusBadge status={appt.status} />
        <span style={{ color: C.textDim, fontSize: 14 }}>{expanded ? '▾' : '›'}</span>
      </div>

      {/* Expanded actions */}
      {expanded && (
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${C.border}`,
          background: 'rgba(15,23,42,0.5)',
        }}>
          {appt.notes && (
            <div style={{ color: C.textSub, fontSize: 12, marginBottom: 10, fontStyle: 'italic' }}>
              "{appt.notes}"
            </div>
          )}

          <div style={{ marginBottom: 10 }}>
            <div style={{ color: C.textDim, fontSize: 11, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Update Status</div>
            <StatusPicker
              current={appt.status}
              onChange={(s) => onStatusChange(appt.id, s)}
            />
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => onDelete(appt.id)} style={{ background: 'none', border: 'none', color: C.red, fontSize: 12, cursor: 'pointer', opacity: 0.7 }}>
              Delete
            </button>
            <button onClick={() => onEdit(appt)} style={btnSecondary({ fontSize: 12, padding: '6px 14px' })}>
              Edit
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AppointmentsScreen() {
  const [appts,    setAppts]    = useState(() => loadAppointments().filter(a => a.type === 'service'))
  const [clients]               = useState(() => loadServiceClients())
  const [services]              = useState(() => loadServices())
  const [selectedDate, setDate] = useState(TODAY)
  const [viewAll,  setViewAll]  = useState(false)
  const [formData, setFormData] = useState(null)  // null = closed

  // Refresh appointments when form saves
  const refreshAppts = () => setAppts(loadAppointments().filter(a => a.type === 'service'))

  const handleSave = (form) => {
    upsertAppointment(form)
    refreshAppts()
    setFormData(null)
  }

  const handleStatusChange = (id, status) => {
    const appt = appts.find(a => a.id === id)
    if (appt) {
      const updated = { ...appt, status }
      // When completed, compute + store next_return_date for follow-up engine
      if (status === 'completed' && appt.serviceId && appt.date) {
        const svc = services.find(s => s.id === appt.serviceId)
        if ((svc?.return_interval_days ?? 0) > 0) {
          const [y, mo, d] = appt.date.split('-').map(Number)
          const next = new Date(y, mo - 1, d)
          next.setDate(next.getDate() + svc.return_interval_days)
          updated.nextReturnDate = next.toISOString().slice(0, 10)
        }
      }
      upsertAppointment(updated)
    }
    refreshAppts()
  }

  const handleDelete = (id) => {
    if (!window.confirm('Delete this appointment?')) return
    deleteAppointment(id)
    refreshAppts()
  }

  const handleEdit = (appt) => {
    setFormData({
      id:          appt.id,
      clientId:    appt.clientId    || '',
      serviceId:   appt.serviceId   || '',
      serviceName: appt.serviceName || '',
      date:        appt.date        || TODAY,
      time:        appt.time        || '10:00',
      duration:    appt.duration    || 60,
      staffName:   appt.staffName   || '',
      notes:       appt.notes       || '',
      status:      appt.status      || 'scheduled',
    })
  }

  // Displayed appointments
  const displayed = viewAll
    ? [...appts].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    : appts.filter(a => a.date === selectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  // Count for date indicator
  const todayCount = appts.filter(a => a.date === selectedDate).length

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 22px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        background: C.bgPanel,
      }}>
        {/* View toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[false, true].map((v, i) => (
            <button
              key={i}
              onClick={() => setViewAll(v)}
              style={{
                padding: '6px 14px', borderRadius: R.md, fontSize: 12, fontWeight: viewAll === v ? 700 : 500,
                cursor: 'pointer', border: `1px solid ${viewAll === v ? C.blue : C.border}`,
                background: viewAll === v ? C.blueDim : 'transparent',
                color: viewAll === v ? '#93c5fd' : C.textMuted, transition: T.std,
              }}
            >{v ? 'All' : 'Day View'}</button>
          ))}
        </div>

        {/* Date navigator (day view only) */}
        {!viewAll && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setDate(d => shiftDate(d, -1))}
              style={{ background: C.bgHover, border: `1px solid ${C.border}`, borderRadius: R.md, color: C.textSub, cursor: 'pointer', padding: '5px 10px', fontSize: 14 }}
            >‹</button>

            <div style={{ textAlign: 'center', minWidth: 160 }}>
              <div style={{ color: C.text, fontWeight: 700, fontSize: 14 }}>
                {isToday(selectedDate) ? 'Today' : fmtDate(selectedDate)}
              </div>
              {!isToday(selectedDate) && (
                <div style={{ color: C.textDim, fontSize: 11 }}>{selectedDate}</div>
              )}
            </div>

            <button
              onClick={() => setDate(d => shiftDate(d, 1))}
              style={{ background: C.bgHover, border: `1px solid ${C.border}`, borderRadius: R.md, color: C.textSub, cursor: 'pointer', padding: '5px 10px', fontSize: 14 }}
            >›</button>

            {!isToday(selectedDate) && (
              <button
                onClick={() => setDate(TODAY)}
                style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12, cursor: 'pointer', padding: '4px 8px' }}
              >Today</button>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Count badge */}
        <span style={{ color: C.textMuted, fontSize: 12 }}>
          {displayed.length} appointment{displayed.length !== 1 ? 's' : ''}
          {!viewAll && todayCount > 0 && selectedDate !== TODAY && (
            <span style={{ color: C.textDim, marginLeft: 8 }}>· {todayCount} today</span>
          )}
        </span>

        <button
          onClick={() => setFormData({ ...EMPTY_FORM, date: viewAll ? TODAY : selectedDate })}
          style={btnPrimary()}
        >+ New Appointment</button>
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: C.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
            <div style={{ fontSize: 14 }}>
              {viewAll
                ? 'No appointments yet.'
                : `No appointments on ${isToday(selectedDate) ? 'today' : fmtDate(selectedDate)}.`}
            </div>
            <button
              onClick={() => setFormData({ ...EMPTY_FORM, date: viewAll ? TODAY : selectedDate })}
              style={{ ...btnSecondary(), marginTop: 16, fontSize: 13 }}
            >Book an appointment</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Date group header (All view) */}
            {viewAll && (() => {
              const groups = {}
              displayed.forEach(a => {
                if (!groups[a.date]) groups[a.date] = []
                groups[a.date].push(a)
              })
              return Object.entries(groups).map(([date, items]) => (
                <div key={date}>
                  <div style={{
                    color: C.textMuted, fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    textTransform: 'uppercase', padding: '8px 2px 6px',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ color: isToday(date) ? C.blue : C.textMuted }}>
                      {isToday(date) ? 'TODAY' : fmtDate(date).toUpperCase()}
                    </span>
                    <span style={{ color: C.textDim }}>— {items.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(appt => (
                      <ApptCard
                        key={appt.id}
                        appt={appt}
                        onEdit={handleEdit}
                        onStatusChange={handleStatusChange}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              ))
            })()}

            {/* Day view: flat list */}
            {!viewAll && displayed.map(appt => (
              <ApptCard
                key={appt.id}
                appt={appt}
                onEdit={handleEdit}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Form Modal ──────────────────────────────────────────────────── */}
      {formData !== null && (
        <ApptFormModal
          initial={formData}
          clients={clients}
          services={services}
          onSave={handleSave}
          onClose={() => setFormData(null)}
        />
      )}
    </div>
  )
}
