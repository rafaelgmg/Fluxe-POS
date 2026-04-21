import { useState, useEffect, useCallback } from 'react'
import {
  C, R, GRAD, GLOW, T,
  modalOverlay, modalCard,
  btnPrimary, btnSecondary, btnGhost,
  inputStyle, selectStyle, label,
} from '../../../styles/ds'
import { deriveFollowUpList, generateFollowUpMessage } from '../../../utils/followUpEngine'
import { loadContactedRecords, markAsContacted, clearContacted } from '../../../utils/followUpStorage'
import { loadServices }      from '../../../utils/serviceStorage'
import { upsertAppointment } from '../../../utils/appointmentsStorage'

// ── Constants ─────────────────────────────────────────────────────────────────
const TODAY = new Date().toISOString().slice(0, 10)

const STATUS_META = {
  overdue:   { label: 'Overdue',   color: C.red,   bg: C.redDim   },
  no_show:   { label: 'No Show',   color: C.red,   bg: C.redDim   },
  due_today: { label: 'Due Today', color: C.amber, bg: C.amberDim },
  upcoming:  { label: 'Upcoming',  color: C.green, bg: C.greenDim },
}

const STATUS_ORDER = { no_show: 0, overdue: 1, due_today: 2, upcoming: 3 }

const FILTERS = [
  { id: 'all',       label: 'All'       },
  { id: 'overdue',   label: 'Overdue'   },
  { id: 'no_show',   label: 'No Show'   },
  { id: 'due_today', label: 'Due Today' },
  { id: 'upcoming',  label: 'Upcoming'  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(dateStr) {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function relativeLabel(daysUntil, status) {
  if (status === 'no_show') return 'No show'
  if (daysUntil === null)   return '—'
  if (daysUntil === 0)      return 'Today'
  if (daysUntil > 0)        return `in ${daysUntil}d`
  return `${Math.abs(daysUntil)}d ago`
}

// ── Status Badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, color: C.textMuted, bg: C.bgHover }
  return (
    <span style={{
      padding: '3px 10px', borderRadius: R.full, fontSize: 11, fontWeight: 700,
      background: meta.bg, color: meta.color,
      border: `1px solid ${meta.color}44`,
      whiteSpace: 'nowrap', letterSpacing: 0.2,
    }}>
      {meta.label}
    </span>
  )
}

// ── Message Modal ─────────────────────────────────────────────────────────────
function MessageModal({ item, onClose }) {
  const [copied, setCopied] = useState(false)
  const message = generateFollowUpMessage({
    clientName:  item.clientName,
    serviceName: item.serviceName,
    status:      item.status,
    daysSince:   item.daysSince,
    daysUntil:   item.daysUntil,
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(message).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 500, padding: 28 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ color: C.text, fontWeight: 700, fontSize: 16, margin: 0 }}>Follow-up Message</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {/* Client info */}
        <div style={{
          background: C.bgHover, border: `1px solid ${C.border}`,
          borderRadius: R.md, padding: '10px 14px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: R.full, background: GRAD.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0,
          }}>
            {item.clientName.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ color: C.text, fontWeight: 600, fontSize: 14 }}>{item.clientName}</div>
            <div style={{ color: C.textMuted, fontSize: 12 }}>
              {item.phone}{item.instagram ? `  ·  @${item.instagram}` : ''}
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <StatusBadge status={item.status} />
          </div>
        </div>

        {/* Message */}
        <div style={label()}>Message</div>
        <div style={{
          background: C.bgCard, border: `1px solid ${C.borderMd}`,
          borderRadius: R.md, padding: '14px 16px',
          color: C.text, fontSize: 14, lineHeight: 1.7,
          marginBottom: 18,
          fontStyle: 'normal',
        }}>
          {message}
        </div>

        {/* Send via */}
        <div style={{ color: C.textDim, fontSize: 12, marginBottom: 16 }}>
          💡 Copy and send via WhatsApp, SMS, or Instagram DM
          {item.phone && <> · <span style={{ color: C.textSub }}>{item.phone}</span></>}
          {item.instagram && <> · <span style={{ color: C.textSub }}>@{item.instagram}</span></>}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary()}>Close</button>
          <button
            onClick={handleCopy}
            style={btnPrimary(false, { minWidth: 120 })}
          >
            {copied ? '✓ Copied!' : 'Copy Message'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Quick Book Modal ──────────────────────────────────────────────────────────
function QuickBookModal({ clientId, clientName, services, onSave, onClose }) {
  const [form, setForm] = useState({
    serviceId: '', serviceName: '', date: TODAY, time: '10:00', duration: 60, notes: '',
  })

  const handleServiceChange = (e) => {
    const svc = services.find(s => s.id === e.target.value)
    setForm(f => ({
      ...f,
      serviceId:   svc?.id   || '',
      serviceName: svc?.name || '',
      duration:    svc?.duration_minutes ?? f.duration,
    }))
  }

  const handleBook = () => {
    if (!form.serviceName || !form.date) return
    upsertAppointment({
      type:        'service',
      clientId,
      clientName,
      serviceId:   form.serviceId,
      serviceName: form.serviceName,
      date:        form.date,
      time:        form.time,
      duration:    form.duration,
      notes:       form.notes,
      status:      'scheduled',
    })
    onSave()
  }

  const isValid = form.serviceName && form.date

  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 420, padding: 26 })}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ color: C.text, fontWeight: 700, fontSize: 16, margin: 0 }}>Schedule Appointment</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        {/* Client (readonly) */}
        <div style={{ marginBottom: 14 }}>
          <div style={label()}>Client</div>
          <div style={{
            ...inputStyle(),
            color: C.textSub, background: C.bgHover,
            cursor: 'default', display: 'flex', alignItems: 'center',
          }}>
            {clientName}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          <div>
            <div style={label()}>Service *</div>
            <select value={form.serviceId} onChange={handleServiceChange} style={selectStyle()}>
              <option value="">— Select service —</option>
              {services.filter(s => s.is_active !== false).map(s => (
                <option key={s.id} value={s.id}>{s.name}{s.duration_minutes ? ` (${s.duration_minutes}min)` : ''}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={label()}>Date *</div>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle()} />
            </div>
            <div>
              <div style={label()}>Time</div>
              <input type="time" value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} style={inputStyle()} />
            </div>
          </div>

          <div>
            <div style={label()}>Notes (optional)</div>
            <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inputStyle()} placeholder="Any notes..." />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary()}>Cancel</button>
          <button onClick={handleBook} disabled={!isValid} style={btnPrimary(!isValid)}>
            Book Appointment
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Client Info Modal ─────────────────────────────────────────────────────────
function ClientInfoModal({ item, onClose }) {
  return (
    <div style={modalOverlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modalCard({ width: 400, padding: 26 })}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 46, height: 46, borderRadius: R.full, background: GRAD.primary,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 700, fontSize: 20, flexShrink: 0, boxShadow: GLOW.blue,
          }}>
            {item.clientName.charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: C.text, fontWeight: 700, fontSize: 17 }}>{item.clientName}</div>
            <StatusBadge status={item.status} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', fontSize: 20 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {item.phone && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: C.textMuted, fontSize: 12, width: 80, flexShrink: 0 }}>Phone</span>
              <span style={{ color: C.text, fontSize: 14 }}>{item.phone}</span>
            </div>
          )}
          {item.instagram && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: C.textMuted, fontSize: 12, width: 80, flexShrink: 0 }}>Instagram</span>
              <span style={{ color: C.text, fontSize: 14 }}>@{item.instagram}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: C.textMuted, fontSize: 12, width: 80, flexShrink: 0 }}>Service</span>
            <span style={{ color: C.text, fontSize: 14 }}>{item.serviceName}</span>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ color: C.textMuted, fontSize: 12, width: 80, flexShrink: 0 }}>Last Visit</span>
            <span style={{ color: C.text, fontSize: 14 }}>{fmtDate(item.lastVisit)}</span>
          </div>
          {item.nextReturnDate && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ color: C.textMuted, fontSize: 12, width: 80, flexShrink: 0 }}>Due Date</span>
              <span style={{ color: STATUS_META[item.status]?.color || C.text, fontSize: 14, fontWeight: 600 }}>
                {fmtDate(item.nextReturnDate)}
              </span>
            </div>
          )}
          {item.notes && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: C.textMuted, fontSize: 12, marginBottom: 6 }}>Notes</div>
              <div style={{
                background: C.bgCard, border: `1px solid ${C.border}`,
                borderRadius: R.md, padding: '10px 12px', color: C.textSub, fontSize: 13, lineHeight: 1.6,
              }}>
                {item.notes}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Follow-up Row Card ────────────────────────────────────────────────────────
function FollowUpCard({ item, contacted, onMessage, onContacted, onClient, onSchedule }) {
  const meta      = STATUS_META[item.status] || STATUS_META.upcoming
  const isContacted = !!contacted

  return (
    <div style={{
      background: C.bgCard, border: `1px solid ${C.border}`,
      borderRadius: R.md, overflow: 'hidden',
      opacity: isContacted ? 0.65 : 1,
      transition: T.std,
      borderLeft: `3px solid ${meta.color}`,
    }}>
      {/* Main row */}
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>

        {/* Avatar */}
        <div style={{
          width: 38, height: 38, borderRadius: R.full, flexShrink: 0,
          background: GRAD.primary, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: 15,
        }}>
          {item.clientName.charAt(0).toUpperCase()}
        </div>

        {/* Client + service */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: C.text, fontWeight: 700, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.clientName}
            </span>
            {isContacted && (
              <span style={{ fontSize: 11, color: C.green, fontWeight: 600, whiteSpace: 'nowrap' }}>
                ✓ contacted {contacted.contactedAt ? new Date(contacted.contactedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
              </span>
            )}
          </div>
          <div style={{ color: C.textMuted, fontSize: 12, marginTop: 2 }}>
            {item.serviceName}
            {item.phone && <span style={{ marginLeft: 8, color: C.textDim }}>· {item.phone}</span>}
          </div>
        </div>

        {/* Dates */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ color: C.textMuted, fontSize: 11 }}>Last visit</div>
          <div style={{ color: C.textSub, fontSize: 13, fontWeight: 500 }}>{fmtDate(item.lastVisit)}</div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 80 }}>
          <div style={{ color: C.textMuted, fontSize: 11 }}>Due</div>
          <div style={{ color: meta.color, fontSize: 13, fontWeight: 700 }}>
            {relativeLabel(item.daysUntil, item.status)}
          </div>
        </div>

        <StatusBadge status={item.status} />
      </div>

      {/* Action buttons */}
      <div style={{
        padding: '8px 16px 12px',
        display: 'flex', gap: 8, alignItems: 'center',
        borderTop: `1px solid ${C.border}`,
      }}>
        <button
          onClick={() => onMessage(item)}
          style={{
            padding: '6px 13px', borderRadius: R.md, fontSize: 12, fontWeight: 600,
            background: C.blueDim, border: `1px solid ${C.blue}44`, color: '#93c5fd',
            cursor: 'pointer', transition: T.fast,
          }}
        >
          💬 Generate Message
        </button>

        <button
          onClick={() => onSchedule(item)}
          style={{
            padding: '6px 13px', borderRadius: R.md, fontSize: 12, fontWeight: 600,
            background: C.purpleDim, border: `1px solid ${C.purple}44`, color: C.purpleSoft,
            cursor: 'pointer', transition: T.fast,
          }}
        >
          📅 Schedule
        </button>

        <button
          onClick={() => onClient(item)}
          style={btnGhost({ fontSize: 12, padding: '6px 13px' })}
        >
          👤 Client
        </button>

        <div style={{ flex: 1 }} />

        {isContacted ? (
          <button
            onClick={() => onContacted(item.clientId, false)}
            style={{ background: 'none', border: 'none', color: C.textDim, fontSize: 12, cursor: 'pointer' }}
          >
            Reset
          </button>
        ) : (
          <button
            onClick={() => onContacted(item.clientId, true)}
            style={{
              padding: '5px 12px', borderRadius: R.md, fontSize: 12, fontWeight: 600,
              background: C.greenDim, border: `1px solid ${C.green}44`, color: C.green,
              cursor: 'pointer', transition: T.fast,
            }}
          >
            ✓ Mark Contacted
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function FollowUpScreen() {
  const [items,     setItems]     = useState([])
  const [contacted, setContacted] = useState({})
  const [filter,    setFilter]    = useState('all')
  const [search,    setSearch]    = useState('')
  const [services]                = useState(() => loadServices())

  // Modals
  const [msgModal,    setMsgModal]    = useState(null) // follow-up item
  const [bookModal,   setBookModal]   = useState(null) // { clientId, clientName }
  const [clientModal, setClientModal] = useState(null) // follow-up item

  const refresh = useCallback(() => {
    setItems(deriveFollowUpList())
    setContacted(loadContactedRecords())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Filter + search + sort
  const filtered = items
    .filter(item => {
      if (filter !== 'all' && item.status !== filter) return false
      if (!search) return true
      const q = search.toLowerCase()
      return item.clientName.toLowerCase().includes(q) || (item.phone || '').includes(q)
    })
    .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9))

  // Counts for filter badges
  const counts = items.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {})

  // Handlers
  const handleContacted = (clientId, set) => {
    if (set) setContacted(markAsContacted(clientId))
    else     setContacted(clearContacted(clientId))
  }

  const handleBookSave = () => {
    setBookModal(null)
    refresh()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '14px 22px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        background: C.bgPanel,
      }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Follow-up</h2>
          <p style={{ color: C.textMuted, fontSize: 12, margin: '2px 0 0' }}>
            {filtered.length} client{filtered.length !== 1 ? 's' : ''} to follow up
          </p>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name or phone..."
          style={{ ...inputStyle(), width: 220, height: 36 }}
        />

        {/* Refresh */}
        <button
          onClick={refresh}
          title="Refresh list"
          style={{ ...btnGhost({ padding: '7px 12px', fontSize: 13 }) }}
        >
          ↻
        </button>
      </div>

      {/* ── Filter tabs ──────────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 22px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', gap: 6, flexShrink: 0, background: C.bgPanel, flexWrap: 'wrap',
      }}>
        {FILTERS.map(f => {
          const active = filter === f.id
          const count  = f.id === 'all' ? items.length : (counts[f.id] || 0)
          const meta   = STATUS_META[f.id]
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '5px 13px', borderRadius: R.full, fontSize: 12, fontWeight: active ? 700 : 500,
                cursor: 'pointer', transition: T.std, display: 'flex', alignItems: 'center', gap: 6,
                border:      `1px solid ${active ? (meta?.color || C.blue) : C.border}`,
                background:  active ? (meta?.bg || C.blueDim) : 'transparent',
                color:       active ? (meta?.color || '#93c5fd') : C.textMuted,
              }}
            >
              {f.label}
              {count > 0 && (
                <span style={{
                  background: active ? (meta?.color || C.blue) + '33' : C.bgHover,
                  color: active ? (meta?.color || C.blue) : C.textDim,
                  borderRadius: R.full, fontSize: 10, fontWeight: 700,
                  padding: '1px 6px', minWidth: 18, textAlign: 'center',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── List ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 0', color: C.textMuted }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>💬</div>
            {items.length === 0 ? (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: C.textSub }}>No follow-ups yet</div>
                <div style={{ fontSize: 13, marginTop: 8, maxWidth: 340, margin: '8px auto 0', lineHeight: 1.6 }}>
                  Follow-ups appear here when appointments are completed or marked as no-show.
                  Make sure your services have a <strong style={{ color: C.textSub }}>Return Interval</strong> set.
                </div>
              </>
            ) : (
              <div style={{ fontSize: 14 }}>No clients match this filter.</div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(item => (
              <FollowUpCard
                key={item.clientId}
                item={item}
                contacted={contacted[item.clientId] || null}
                onMessage={setMsgModal}
                onContacted={handleContacted}
                onClient={setClientModal}
                onSchedule={(i) => setBookModal({ clientId: i.clientId, clientName: i.clientName })}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {msgModal && (
        <MessageModal item={msgModal} onClose={() => setMsgModal(null)} />
      )}

      {clientModal && (
        <ClientInfoModal item={clientModal} onClose={() => setClientModal(null)} />
      )}

      {bookModal && (
        <QuickBookModal
          clientId={bookModal.clientId}
          clientName={bookModal.clientName}
          services={services}
          onSave={handleBookSave}
          onClose={() => setBookModal(null)}
        />
      )}
    </div>
  )
}
