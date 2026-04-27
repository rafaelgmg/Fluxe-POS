import { useState, useMemo, useCallback, useEffect } from 'react'

const SERVER_URL = 'http://localhost:3001'
const STORE_NAME = 'Perfume Passage'

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
const PURPLE = '#8b5cf6'

const TEMPLATES = [
  {
    id: 'flash_sale',
    name: 'Flash Sale',
    body: `Hi {first_name}! 🧴 We have a special deal just for you at {store_name}. Stop by today — {seller_name} will take great care of you. Reply STOP to unsubscribe.`,
  },
  {
    id: 'new_arrivals',
    name: 'New Arrivals',
    body: `Hi {first_name}! 🌟 New fragrances just arrived at {store_name} and we thought of you. Come check them out — we'd love to see you! Reply STOP to unsubscribe.`,
  },
  {
    id: 'come_back',
    name: 'Come Back',
    body: `Hi {first_name}! 👋 We miss you at {store_name}! Come visit us — {seller_name} has something special for returning customers. Reply STOP to unsubscribe.`,
  },
  {
    id: 'birthday',
    name: 'Happy Birthday',
    body: `Happy Birthday {first_name}! 🎂 The whole team at {store_name} wishes you an amazing day. Come visit us for a special birthday treat! Reply STOP to unsubscribe.`,
  },
  {
    id: 'custom',
    name: 'Custom',
    body: `Hi {first_name}! `,
  },
]

function resolveVars(tpl, customer, sellerName) {
  return tpl
    .replace(/{first_name}/g,  customer.firstName || 'there')
    .replace(/{store_name}/g,  STORE_NAME)
    .replace(/{seller_name}/g, sellerName || 'our team')
}

function smsInfo(text) {
  const len = text.length
  if (len === 0) return { chars: 0, segments: 0 }
  return { chars: len, segments: len <= 160 ? 1 : Math.ceil(len / 153) }
}

function consentInfo(status) {
  if (status === 'opted_in')  return { label: 'Opted In',  bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  color: GREEN }
  if (status === 'opted_out') return { label: 'Opted Out', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)',  color: RED }
  return                             { label: 'Unknown',   bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', color: AMBER }
}

function fmtPhone(p) {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepBar({ step }) {
  const steps = [
    { n: 1, label: 'Select' },
    { n: 2, label: 'Compose' },
    { n: 3, label: 'Review & Send' },
  ]
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '11px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0,
    }}>
      {steps.map((s, i) => {
        const done   = step > s.n
        const active = step === s.n
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && (
              <div style={{ width: 40, height: 1, background: done ? BLUE : BORDER, marginRight: 6, transition: 'background 0.3s' }} />
            )}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? GREEN : active ? BLUE : 'transparent',
              border: `2px solid ${done ? GREEN : active ? BLUE : BORDER}`,
              color: done || active ? '#fff' : DIM, fontSize: 11, fontWeight: 700,
              transition: 'all 0.2s',
            }}>
              {done ? '✓' : s.n}
            </div>
            <span style={{
              color: active ? TEXT : done ? SUB : DIM,
              fontSize: 12, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap',
            }}>{s.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Select Customers ──────────────────────────────────────────────────

function StepSelect({ customers, selected, setSelected, onNext }) {
  const [search,      setSearch]      = useState('')
  const [filterType,  setFilterType]  = useState('all')
  const [filterValue, setFilterValue] = useState('')

  // SMS requires phone number
  const eligible = useMemo(() => customers.filter(c => !c.archived && c.phone), [customers])
  const noPhone  = customers.filter(c => !c.archived && !c.phone).length

  const sellers   = useMemo(() => [...new Set(eligible.map(c => c.capturedBy).filter(Boolean))].sort(),        [eligible])
  const locations = useMemo(() => [...new Set(eligible.map(c => c.capturedLocation).filter(Boolean))].sort(),  [eligible])

  const filtered = useMemo(() => {
    let list = eligible
    if (filterType === 'buyer')          list = list.filter(c => (c.purchases || []).length > 0)
    if (filterType === 'no-purchase')    list = list.filter(c => (c.purchases || []).length === 0)
    if (filterType === 'opted_in')       list = list.filter(c => c.smsConsentStatus === 'opted_in')
    if (filterType === 'location' && filterValue) list = list.filter(c => c.capturedLocation === filterValue)
    if (filterType === 'seller'   && filterValue) list = list.filter(c => c.capturedBy       === filterValue)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        (c.phone  || '').replace(/\D/g,'').includes(q.replace(/\D/g,'')) ||
        (c.email  || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [eligible, filterType, filterValue, search])

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))

  const toggleAll = () => {
    const next = new Set(selected)
    if (allSelected) filtered.forEach(c => next.delete(c.id))
    else              filtered.forEach(c => next.add(c.id))
    setSelected(next)
  }
  const toggleOne = id => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const pill = (type, label, value = '') => {
    const active = filterType === type && (!value || filterValue === value)
    return (
      <button key={type + value} onClick={() => { setFilterType(type); setFilterValue(value) }} style={{
        padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
        background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
        border: `1px solid ${active ? 'rgba(37,99,235,0.4)' : BORDER}`,
        color: active ? '#93c5fd' : MUTED, fontWeight: active ? 700 : 400,
        transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}>{label}</button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div>
            <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Select Recipients</h3>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
              Only customers with a mobile number are shown
              {noPhone > 0 && <span style={{ color: DIM }}> · {noPhone} without phone hidden</span>}
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ color: MUTED, fontSize: 13 }}>
            <span style={{ color: BLUE, fontWeight: 700, fontSize: 16 }}>{selected.size}</span> selected
          </span>
          <button
            onClick={onNext} disabled={selected.size === 0}
            style={{
              padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
              background: selected.size === 0 ? 'rgba(37,99,235,0.08)' : 'linear-gradient(135deg, #3b82f6, #7c3aed)',
              border: 'none', color: selected.size === 0 ? DIM : '#fff',
              boxShadow: selected.size > 0 ? '0 0 16px rgba(37,99,235,0.3)' : 'none',
            }}
          >Compose Message →</button>
        </div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or email..."
            style={{ padding: '6px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', width: 230 }}
          />
          {pill('all',          'All')}
          {pill('buyer',        'Has Purchase')}
          {pill('no-purchase',  'No Purchase')}
          {pill('opted_in',     'Opted In')}
          <select
            value={filterType === 'location' ? filterValue : ''}
            onChange={e => { if (e.target.value) { setFilterType('location'); setFilterValue(e.target.value) } else { setFilterType('all'); setFilterValue('') } }}
            style={{ padding: '5px 10px', background: filterType === 'location' ? 'rgba(37,99,235,0.12)' : CARD, border: `1px solid ${filterType === 'location' ? 'rgba(37,99,235,0.4)' : BORDER}`, borderRadius: 7, color: filterType === 'location' ? '#93c5fd' : MUTED, fontSize: 12, cursor: 'pointer', outline: 'none' }}
          >
            <option value="">By Location</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={filterType === 'seller' ? filterValue : ''}
            onChange={e => { if (e.target.value) { setFilterType('seller'); setFilterValue(e.target.value) } else { setFilterType('all'); setFilterValue('') } }}
            style={{ padding: '5px 10px', background: filterType === 'seller' ? 'rgba(37,99,235,0.12)' : CARD, border: `1px solid ${filterType === 'seller' ? 'rgba(37,99,235,0.4)' : BORDER}`, borderRadius: 7, color: filterType === 'seller' ? '#93c5fd' : MUTED, fontSize: 12, cursor: 'pointer', outline: 'none' }}
          >
            <option value="">By Seller</option>
            {sellers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <span style={{ color: DIM, fontSize: 12 }}>{filtered.length} shown</span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '8px 16px',
          background: CARD, borderBottom: `1px solid ${BORDER}`,
          position: 'sticky', top: 0, zIndex: 10, minWidth: 900,
        }}>
          <div style={{ width: 36, flexShrink: 0 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: BLUE }} />
          </div>
          {[['NAME', 160], ['MOBILE', 140], ['EMAIL', 180], ['ADDED BY', 100], ['LOCATION', 130], ['SMS CONSENT', 110], ['INVOICES', 70], ['', 54]].map(([h, w]) => (
            <div key={h} style={{ width: w, minWidth: w, flexShrink: 0, color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{h}</div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: DIM, fontSize: 14 }}>
            No customers match the current filters.
          </div>
        )}

        {filtered.map((c, idx) => {
          const consent  = consentInfo(c.smsConsentStatus || 'unknown')
          const isSel    = selected.has(c.id)
          const numPurch = (c.purchases || []).length
          return (
            <div key={c.id}
              onClick={() => toggleOne(c.id)}
              style={{
                display: 'flex', alignItems: 'center', padding: '8px 16px',
                borderBottom: `1px solid rgba(30,41,59,0.5)`,
                background: isSel ? 'rgba(37,99,235,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.4)',
                cursor: 'pointer', transition: 'background 0.1s', minWidth: 900,
              }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = 'rgba(37,99,235,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? 'rgba(37,99,235,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.4)' }}
            >
              <div style={{ width: 36, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={isSel} onChange={() => toggleOne(c.id)} style={{ cursor: 'pointer', accentColor: BLUE }} />
              </div>
              <div style={{ width: 160, minWidth: 160, flexShrink: 0, color: TEXT, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.firstName} {c.lastName}</div>
              <div style={{ width: 140, minWidth: 140, flexShrink: 0, color: SUB, fontSize: 12, fontFamily: 'monospace' }}>{fmtPhone(c.phone)}</div>
              <div style={{ width: 180, minWidth: 180, flexShrink: 0, color: MUTED, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: 100, minWidth: 100, flexShrink: 0, color: MUTED, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.capturedBy || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: 130, minWidth: 130, flexShrink: 0, color: MUTED, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.capturedLocation || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: 110, minWidth: 110, flexShrink: 0 }}>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: consent.bg, border: `1px solid ${consent.border}`, color: consent.color }}>{consent.label}</span>
              </div>
              <div style={{ width: 70, minWidth: 70, flexShrink: 0, color: numPurch > 0 ? '#60a5fa' : DIM, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{numPurch}</div>
              <div style={{ width: 54, minWidth: 54, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button style={{ padding: '3px 8px', background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 6, color: '#60a5fa', fontSize: 11, cursor: 'pointer' }}>Open</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2: Compose ───────────────────────────────────────────────────────────

function StepCompose({ selected, customers, message, setMessage, templateId, setTemplateId, sellerName, onBack, onNext }) {
  const firstCustomer = useMemo(() =>
    customers.find(c => selected.has(c.id)) || null
  , [customers, selected])

  const preview = useMemo(() =>
    firstCustomer ? resolveVars(message, firstCustomer, sellerName) : message
  , [message, firstCustomer, sellerName])

  const { chars, segments } = smsInfo(message)

  const handleTemplate = id => {
    setTemplateId(id)
    const tpl = TEMPLATES.find(t => t.id === id)
    if (tpl) setMessage(tpl.body)
  }

  const insertVar = v => setMessage(m => m + v)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Compose Message</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
            Sending to <span style={{ color: BLUE, fontWeight: 700 }}>{selected.size}</span> recipient{selected.size !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onBack} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← Back</button>
        <button
          onClick={onNext} disabled={!message.trim()}
          style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
            cursor: !message.trim() ? 'not-allowed' : 'pointer',
            background: !message.trim() ? 'rgba(37,99,235,0.08)' : 'linear-gradient(135deg, #3b82f6, #7c3aed)',
            border: 'none', color: !message.trim() ? DIM : '#fff',
          }}
        >Review & Send →</button>
      </div>

      {/* Body: two columns */}
      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Left: Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Templates */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>TEMPLATE</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => handleTemplate(t.id)} style={{
                  padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  background: templateId === t.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                  border: `1px solid ${templateId === t.id ? 'rgba(139,92,246,0.5)' : BORDER}`,
                  color: templateId === t.id ? '#c4b5fd' : MUTED, fontWeight: templateId === t.id ? 700 : 400,
                  transition: 'all 0.15s',
                }}>{t.name}</button>
              ))}
            </div>
          </div>

          {/* Variable buttons */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>INSERT VARIABLE</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['{first_name}', '{store_name}', '{seller_name}'].map(v => (
                <button key={v} onClick={() => insertVar(v)} style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', cursor: 'pointer',
                  background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
                  color: '#93c5fd', transition: 'all 0.15s',
                }}>{v}</button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>MESSAGE BODY</label>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); setTemplateId('custom') }}
              placeholder="Type your message here..."
              style={{
                flex: 1, minHeight: 130, padding: '10px 12px', background: CARD,
                border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT,
                fontSize: 13, outline: 'none', resize: 'vertical',
                fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = BLUE }}
              onBlur={e => { e.target.style.borderColor = BORDER }}
            />
            {/* Char counter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <span style={{ fontSize: 11, color: DIM }}>
                <span style={{ color: segments > 1 ? AMBER : MUTED }}>{chars} chars</span>
                {' · '}
                <span style={{ color: segments > 1 ? AMBER : MUTED }}>{segments} SMS segment{segments !== 1 ? 's' : ''}</span>
                {segments > 1 && <span style={{ color: AMBER }}> (multipart)</span>}
              </span>
              <span style={{ fontSize: 11, color: DIM }}>
                {160 * segments - chars} chars left in last segment
              </span>
            </div>
          </div>

          {/* STOP notice */}
          <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 8 }}>
            <p style={{ color: AMBER, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Carrier requirement</p>
            <p style={{ color: SUB, fontSize: 12, lineHeight: 1.5 }}>
              Your message must include "Reply STOP to unsubscribe." Customers who reply STOP are automatically blocked from all future messages.
            </p>
          </div>
        </div>

        {/* Right: Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
              PREVIEW
              {firstCustomer && <span style={{ color: DIM, fontWeight: 400, marginLeft: 6 }}>for {firstCustomer.firstName}</span>}
            </label>
            {/* Phone-style message bubble */}
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: 16, minHeight: 180 }}>
              <div style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 10, color: DIM }}>Perfume Passage · now</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  background: BLUE, borderRadius: '16px 16px 4px 16px',
                  padding: '10px 14px', maxWidth: '88%',
                  color: '#fff', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {preview || <span style={{ opacity: 0.5 }}>Your message will appear here...</span>}
                </div>
              </div>
            </div>
          </div>

          {/* Preview recipient info */}
          {firstCustomer && (
            <div style={{ padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{firstCustomer.firstName} {firstCustomer.lastName}</p>
                <p style={{ color: MUTED, fontSize: 12, fontFamily: 'monospace' }}>{fmtPhone(firstCustomer.phone)}</p>
              </div>
              {(() => {
                const ci = consentInfo(firstCustomer.smsConsentStatus || 'unknown')
                return <span style={{ padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: ci.bg, border: `1px solid ${ci.border}`, color: ci.color, whiteSpace: 'nowrap' }}>{ci.label}</span>
              })()}
            </div>
          )}

          {/* Variable reference */}
          <div style={{ padding: '12px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>VARIABLE REFERENCE</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {[
                ['{first_name}',  firstCustomer?.firstName || 'Customer name'],
                ['{store_name}',  STORE_NAME],
                ['{seller_name}', sellerName || 'our team'],
              ].map(([v, val]) => (
                <div key={v} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  <span style={{ color: '#93c5fd', fontFamily: 'monospace' }}>{v}</span>
                  <span style={{ color: MUTED }}>→ {val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Review & Send ─────────────────────────────────────────────────────

function StepReview({ selected, customers, message, posSession, onBack, onReset }) {
  const [runState,  setRunState]  = useState(null)  // null | 'running' | 'done'
  const [results,   setResults]   = useState({})    // { [id]: { status, message? } }
  const [progress,  setProgress]  = useState(0)
  const [twilioOk,  setTwilioOk]  = useState(null)  // null | true | false

  const selectedCustomers = useMemo(() =>
    customers.filter(c => selected.has(c.id))
  , [customers, selected])

  const blockedList  = selectedCustomers.filter(c => c.smsConsentStatus === 'opted_out')
  const eligibleList = selectedCustomers.filter(c => c.smsConsentStatus !== 'opted_out')

  useEffect(() => {
    fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(2500) })
      .then(r => r.json())
      .then(d => setTwilioOk(!!d.twilio))
      .catch(() => setTwilioOk(false))
  }, [])

  const runCampaign = useCallback(async (dryRun) => {
    if (runState === 'running') return
    setRunState('running')
    setResults({})
    setProgress(0)

    for (let i = 0; i < eligibleList.length; i++) {
      const c = eligibleList[i]
      try {
        const res = await fetch(`${SERVER_URL}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone:      c.phone,
            firstName:  c.firstName,
            message,
            raw:        true,
            dryRun,
            supabaseId: c.supabaseId  || null,
            orgId:      posSession?.orgId        || null,
            locationId: posSession?.locationUUID || null,
            channel:    'sms',
          }),
        })
        if (res.status === 403) {
          setResults(r => ({ ...r, [c.id]: { status: 'blocked', message: 'Opted out' } }))
        } else if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          setResults(r => ({ ...r, [c.id]: { status: 'error', message: err.error || 'Server error' } }))
        } else {
          setResults(r => ({ ...r, [c.id]: { status: dryRun ? 'dry_run' : 'sent' } }))
        }
      } catch (err) {
        setResults(r => ({ ...r, [c.id]: { status: 'error', message: err.message } }))
      }
      setProgress(i + 1)
    }

    setRunState('done')
  }, [eligibleList, message, posSession, runState])

  const resArr      = Object.values(results)
  const sentCount   = resArr.filter(r => r.status === 'dry_run' || r.status === 'sent').length
  const errCount    = resArr.filter(r => r.status === 'error').length
  const blockedRes  = resArr.filter(r => r.status === 'blocked').length

  const isDone    = runState === 'done'
  const isRunning = runState === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Review & Send</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
            <span style={{ color: GREEN, fontWeight: 700 }}>{eligibleList.length}</span> eligible
            {blockedList.length > 0 && <span style={{ color: RED }}> · {blockedList.length} will be skipped (opted out)</span>}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {!isRunning && !isDone && (
          <button onClick={onBack} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← Back</button>
        )}
        {isDone && (
          <button onClick={onReset} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>New Campaign</button>
        )}
        {!isRunning && !isDone && (
          <>
            <button
              onClick={() => runCampaign(true)}
              disabled={eligibleList.length === 0}
              style={{
                padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                cursor: eligibleList.length === 0 ? 'not-allowed' : 'pointer',
                background: eligibleList.length === 0 ? 'rgba(34,197,94,0.07)' : 'rgba(34,197,94,0.15)',
                border: `1px solid ${eligibleList.length === 0 ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.45)'}`,
                color: eligibleList.length === 0 ? DIM : GREEN,
              }}
            >Dry Run</button>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button
                disabled
                title="Configure Twilio in server/.env to enable real sending"
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'not-allowed', background: 'rgba(59,130,246,0.07)', border: `1px solid rgba(59,130,246,0.15)`, color: DIM, opacity: 0.6 }}
              >Send Real SMS</button>
              <span style={{ fontSize: 10, color: twilioOk === false ? RED : DIM, whiteSpace: 'nowrap' }}>
                {twilioOk === false ? '⚠ Twilio not configured' : 'Coming soon'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Progress */}
        {(isRunning || isDone) && (
          <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>
                {isRunning ? `Sending... (${progress} / ${eligibleList.length})` : 'Campaign complete'}
              </span>
              {isDone && (
                <span style={{ fontSize: 13, color: MUTED }}>
                  <span style={{ color: GREEN }}>{sentCount} sent</span>
                  {errCount > 0 && <span style={{ color: RED }}> · {errCount} errors</span>}
                  {blockedRes > 0 && <span style={{ color: RED }}> · {blockedRes} blocked</span>}
                </span>
              )}
            </div>
            <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 3, transition: 'width 0.25s',
                width: `${eligibleList.length > 0 ? (progress / eligibleList.length) * 100 : 0}%`,
                background: isDone && errCount > 0 ? AMBER : GREEN,
              }} />
            </div>
          </div>
        )}

        {/* Summary */}
        <div style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
          <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 12 }}>CAMPAIGN SUMMARY</p>
          <div style={{ display: 'flex', gap: 28, marginBottom: 14 }}>
            {[
              ['TOTAL SELECTED', selectedCustomers.length, TEXT],
              ['ELIGIBLE',       eligibleList.length,       GREEN],
              ...(blockedList.length > 0 ? [['BLOCKED', blockedList.length, RED]] : []),
            ].map(([label, val, color]) => (
              <div key={label}>
                <p style={{ color: DIM, fontSize: 10, letterSpacing: 0.5, marginBottom: 4 }}>{label}</p>
                <p style={{ color, fontSize: 22, fontWeight: 800 }}>{val}</p>
              </div>
            ))}
          </div>
          <div style={{ padding: '10px 12px', background: BG, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: SUB, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 90, overflowY: 'auto' }}>
            {message}
          </div>
        </div>

        {/* Recipient list */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>RECIPIENTS ({selectedCustomers.length})</p>
            {blockedList.length > 0 && (
              <span style={{ fontSize: 11, color: RED }}>{blockedList.length} opted out — will be skipped</span>
            )}
          </div>
          {selectedCustomers.map((c, idx) => {
            const consent   = consentInfo(c.smsConsentStatus || 'unknown')
            const isBlocked = c.smsConsentStatus === 'opted_out'
            const result    = results[c.id]

            let resultBadge = null
            if (result) {
              const map = {
                dry_run: { label: '✓ Dry Run', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  color: GREEN },
                sent:    { label: '✓ Sent',    bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  color: GREEN },
                blocked: { label: '✗ Blocked', bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: RED   },
                error:   { label: `⚠ ${result.message || 'Error'}`, bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', color: AMBER },
              }
              const s = map[result.status] || map.error
              resultBadge = <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: s.bg, border: `1px solid ${s.border}`, color: s.color }}>{s.label}</span>
            }

            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', padding: '9px 16px', gap: 12,
                borderBottom: idx < selectedCustomers.length - 1 ? `1px solid rgba(30,41,59,0.5)` : 'none',
                background: isBlocked ? 'rgba(239,68,68,0.04)' : 'transparent',
                opacity: isBlocked && !result ? 0.65 : 1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: isBlocked ? MUTED : TEXT, fontSize: 13, fontWeight: 600, textDecoration: isBlocked ? 'line-through' : 'none' }}>
                    {c.firstName} {c.lastName}
                  </span>
                  <span style={{ color: DIM, fontSize: 12, marginLeft: 10, fontFamily: 'monospace' }}>{fmtPhone(c.phone)}</span>
                </div>
                <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: consent.bg, border: `1px solid ${consent.border}`, color: consent.color }}>
                  {consent.label}
                </span>
                {resultBadge}
                {isBlocked && !result && !isRunning && (
                  <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: RED }}>Will be skipped</span>
                )}
                {isRunning && !result && !isBlocked && (
                  <span style={{ color: DIM, fontSize: 12 }}>queued...</span>
                )}
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CampaignSMS({ customers = [], posSession = null }) {
  const [step,       setStep]       = useState(1)
  const [selected,   setSelected]   = useState(new Set())
  const [message,    setMessage]    = useState(TEMPLATES[0].body)
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)

  const handleReset = () => {
    setStep(1)
    setSelected(new Set())
    setMessage(TEMPLATES[0].body)
    setTemplateId(TEMPLATES[0].id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }}>
      <StepBar step={step} />
      {step === 1 && (
        <StepSelect
          customers={customers}
          selected={selected}
          setSelected={setSelected}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepCompose
          selected={selected}
          customers={customers}
          message={message}
          setMessage={setMessage}
          templateId={templateId}
          setTemplateId={setTemplateId}
          sellerName="our team"
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <StepReview
          selected={selected}
          customers={customers}
          message={message}
          posSession={posSession}
          onBack={() => setStep(2)}
          onReset={handleReset}
        />
      )}
    </div>
  )
}
