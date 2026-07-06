import { useState, useMemo, useCallback, useEffect } from 'react'
import { loadCampaigns, saveCampaign, deleteCampaign, updateCampaign } from '../utils/campaignStorage'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'
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

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function campaignId() { return 'camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) }

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepBar({ step, onHistory, historyCount }) {
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
      <div style={{ flex: 1 }} />
      <button
        onClick={onHistory}
        style={{
          padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
          background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.3)`,
          color: '#c4b5fd', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        📋 History
        {historyCount > 0 && (
          <span style={{ background: PURPLE, color: '#fff', borderRadius: 20, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{historyCount}</span>
        )}
      </button>
    </div>
  )
}

// ── Step 1: Select Customers ──────────────────────────────────────────────────

function StepSelect({ customers, selected, setSelected, onNext }) {
  const [search,      setSearch]      = useState('')
  const [filterType,  setFilterType]  = useState('all')
  const [filterValue, setFilterValue] = useState('')

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

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
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
            {eligible.length === 0
              ? 'No customers with a mobile number yet. Add customers with a phone number first.'
              : 'No customers match the current filters.'}
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

      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

          <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.06)', border: `1px solid rgba(245,158,11,0.2)`, borderRadius: 8 }}>
            <p style={{ color: AMBER, fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Carrier requirement</p>
            <p style={{ color: SUB, fontSize: 12, lineHeight: 1.5 }}>
              Your message must include "Reply STOP to unsubscribe." Customers who reply STOP are automatically blocked from all future messages.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
              PREVIEW
              {firstCustomer && <span style={{ color: DIM, fontWeight: 400, marginLeft: 6 }}>for {firstCustomer.firstName}</span>}
            </label>
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

function StepReview({ selected, customers, message, templateId, posSession, onBack, onReset, onScheduled }) {
  const [runState,     setRunState]     = useState(null)   // null | 'running' | 'done' | 'scheduled'
  const [results,      setResults]      = useState({})
  const [progress,     setProgress]     = useState(0)
  const [twilioOk,     setTwilioOk]     = useState(null)
  const [scheduleFor,  setScheduleFor]  = useState('')     // ISO datetime-local string
  const [showSchedule, setShowSchedule] = useState(false)

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

  // Minimum datetime for schedule picker = now + 5 min
  const minSchedule = useMemo(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000)
    return d.toISOString().slice(0, 16)
  }, [])

  const templateName = TEMPLATES.find(t => t.id === templateId)?.name || 'Custom'

  const buildEntry = (status, isDryRun, scheduledFor = null) => ({
    id:            campaignId(),
    name:          templateName,
    templateId:    templateId || 'custom',
    message,
    createdAt:     new Date().toISOString(),
    scheduledFor:  scheduledFor,
    status,
    isDryRun,
    totalSelected: selectedCustomers.length,
    eligible:      eligibleList.length,
    blocked:       blockedList.length,
    sent:          0,
    errors:        0,
    recipients:    selectedCustomers.map(c => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, status: 'pending' })),
  })

  const handleSchedule = () => {
    if (!scheduleFor) return
    const entry = buildEntry('scheduled', false, new Date(scheduleFor).toISOString())
    saveCampaign(entry)
    setRunState('scheduled')
    onScheduled?.()
  }

  const runCampaign = useCallback(async (dryRun) => {
    if (runState === 'running') return
    setRunState('running')
    setResults({})
    setProgress(0)

    const recipientResults = []

    for (let i = 0; i < eligibleList.length; i++) {
      const c = eligibleList[i]
      let status = 'error'
      let errMsg = ''
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
          status = 'blocked'; errMsg = 'Opted out'
        } else if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          status = 'error'; errMsg = err.error || 'Server error'
        } else {
          status = dryRun ? 'dry_run' : 'sent'
        }
      } catch (err) {
        status = 'error'; errMsg = err.message
      }
      setResults(r => ({ ...r, [c.id]: { status, message: errMsg } }))
      recipientResults.push({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, status, message: errMsg })
      setProgress(i + 1)
    }

    // Add blocked recipients to results
    blockedList.forEach(c => {
      recipientResults.push({ id: c.id, firstName: c.firstName, lastName: c.lastName, phone: c.phone, status: 'blocked' })
    })

    const sentCount = recipientResults.filter(r => r.status === 'dry_run' || r.status === 'sent').length
    const errCount  = recipientResults.filter(r => r.status === 'error').length

    const entry = {
      ...buildEntry(dryRun ? 'dry_run' : 'sent', dryRun),
      sent:       sentCount,
      errors:     errCount,
      recipients: recipientResults,
    }
    saveCampaign(entry)
    setRunState('done')
  }, [eligibleList, blockedList, message, posSession, runState, templateId, templateName, selectedCustomers])

  const resArr      = Object.values(results)
  const sentCount   = resArr.filter(r => r.status === 'dry_run' || r.status === 'sent').length
  const errCount    = resArr.filter(r => r.status === 'error').length
  const blockedRes  = resArr.filter(r => r.status === 'blocked').length

  const isDone      = runState === 'done'
  const isRunning   = runState === 'running'
  const isScheduled = runState === 'scheduled'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Review & Send</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
            <span style={{ color: GREEN, fontWeight: 700 }}>{eligibleList.length}</span> eligible
            {blockedList.length > 0 && <span style={{ color: RED }}> · {blockedList.length} will be skipped (opted out)</span>}
          </p>
        </div>
        <div style={{ flex: 1 }} />
        {!isRunning && !isDone && !isScheduled && (
          <button onClick={onBack} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← Back</button>
        )}
        {(isDone || isScheduled) && (
          <button onClick={onReset} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>New Campaign</button>
        )}
        {!isRunning && !isDone && !isScheduled && (
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
                disabled={!twilioOk || eligibleList.length === 0}
                onClick={() => runCampaign(false)}
                title={!twilioOk ? 'Configure Twilio in server/.env to enable real sending' : `Send to ${eligibleList.length} recipients`}
                style={{
                  padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: (!twilioOk || eligibleList.length === 0) ? 'not-allowed' : 'pointer',
                  background: twilioOk && eligibleList.length > 0 ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(59,130,246,0.07)',
                  border: `1px solid ${twilioOk && eligibleList.length > 0 ? 'rgba(59,130,246,0.6)' : 'rgba(59,130,246,0.15)'}`,
                  color: twilioOk && eligibleList.length > 0 ? '#fff' : DIM,
                  opacity: twilioOk === null ? 0.5 : 1,
                  boxShadow: twilioOk && eligibleList.length > 0 ? '0 0 16px rgba(59,130,246,0.3)' : 'none',
                  transition: 'all 0.15s',
                }}
              >Send Real SMS</button>
              <span style={{ fontSize: 10, whiteSpace: 'nowrap', color: twilioOk === true ? GREEN : twilioOk === false ? RED : DIM }}>
                {twilioOk === true ? '✓ Twilio ready' : twilioOk === false ? '⚠ Twilio not configured' : 'Checking...'}
              </span>
            </div>

            <button
              onClick={() => setShowSchedule(s => !s)}
              style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: showSchedule ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)',
                border: `1px solid ${showSchedule ? 'rgba(245,158,11,0.45)' : 'rgba(245,158,11,0.25)'}`,
                color: AMBER,
              }}
            >🕐 Schedule</button>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Schedule panel */}
        {showSchedule && !isRunning && !isDone && !isScheduled && (
          <div style={{ padding: '16px 18px', background: 'rgba(245,158,11,0.05)', border: `1px solid rgba(245,158,11,0.25)`, borderRadius: 10 }}>
            <p style={{ color: AMBER, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Schedule Campaign</p>
            <p style={{ color: MUTED, fontSize: 12, marginBottom: 12 }}>
              Save this campaign to send later. It will appear in History with status "Scheduled" and you can send it when Twilio is ready.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="datetime-local"
                value={scheduleFor}
                min={minSchedule}
                onChange={e => setScheduleFor(e.target.value)}
                style={{
                  padding: '8px 12px', background: CARD, border: `1px solid ${BORDER}`,
                  borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', colorScheme: 'dark',
                }}
              />
              <button
                onClick={handleSchedule}
                disabled={!scheduleFor}
                style={{
                  padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                  cursor: !scheduleFor ? 'not-allowed' : 'pointer',
                  background: !scheduleFor ? 'rgba(245,158,11,0.07)' : 'rgba(245,158,11,0.2)',
                  border: `1px solid ${!scheduleFor ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.5)'}`,
                  color: !scheduleFor ? DIM : AMBER,
                }}
              >Confirm Schedule</button>
            </div>
          </div>
        )}

        {/* Scheduled confirmation */}
        {isScheduled && (
          <div style={{ padding: '20px', background: 'rgba(245,158,11,0.07)', border: `1px solid rgba(245,158,11,0.3)`, borderRadius: 10, textAlign: 'center' }}>
            <p style={{ fontSize: 28, marginBottom: 8 }}>🕐</p>
            <p style={{ color: AMBER, fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Campaign Scheduled</p>
            <p style={{ color: MUTED, fontSize: 13 }}>
              Saved for {fmtDate(new Date(scheduleFor).toISOString())} · {eligibleList.length} recipients
            </p>
            <p style={{ color: DIM, fontSize: 12, marginTop: 8 }}>You can find it in History and send when Twilio is ready.</p>
          </div>
        )}

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
        {!isScheduled && (
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
        )}

        {/* Recipient list */}
        {!isScheduled && (
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
        )}
      </div>
    </div>
  )
}

// ── Campaign History ──────────────────────────────────────────────────────────

function statusBadge(status) {
  const map = {
    sent:      { label: 'Sent',      bg: 'rgba(34,197,94,0.12)',   border: 'rgba(34,197,94,0.35)',   color: GREEN  },
    dry_run:   { label: 'Dry Run',   bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.35)',  color: BLUE   },
    scheduled: { label: 'Scheduled', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.35)',  color: AMBER  },
    error:     { label: 'Errors',    bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.35)',   color: RED    },
  }
  const s = map[status] || map.dry_run
  return <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.bg, border: `1px solid ${s.border}`, color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
}

function CampaignHistory({ onClose, onReuse }) {
  const [campaigns,    setCampaigns]   = useState(() => loadCampaigns())
  const [expandedId,   setExpandedId]  = useState(null)
  const [confirmDel,   setConfirmDel]  = useState(null)

  const refresh = () => setCampaigns(loadCampaigns())

  const handleDelete = (id) => {
    deleteCampaign(id)
    setConfirmDel(null)
    setExpandedId(null)
    refresh()
  }

  if (campaigns.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: DIM }}>
        <p style={{ fontSize: 40 }}>📋</p>
        <p style={{ fontSize: 15, color: MUTED, fontWeight: 600 }}>No campaigns yet</p>
        <p style={{ fontSize: 13, color: DIM }}>Completed and scheduled campaigns will appear here.</p>
        <button onClick={onClose} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: 'rgba(37,99,235,0.1)', border: `1px solid rgba(37,99,235,0.3)`, color: '#93c5fd', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
          ← Back to Campaign
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Campaign History</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} · newest first</p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← New Campaign</button>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {campaigns.map(c => {
          const isExpanded = expandedId === c.id
          const sentRec    = (c.recipients || []).filter(r => r.status === 'sent' || r.status === 'dry_run')
          const errRec     = (c.recipients || []).filter(r => r.status === 'error')
          const blkRec     = (c.recipients || []).filter(r => r.status === 'blocked')

          return (
            <div key={c.id} style={{ background: CARD, border: `1px solid ${isExpanded ? 'rgba(37,99,235,0.35)' : BORDER}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.15s' }}>
              {/* Row */}
              <div
                onClick={() => setExpandedId(isExpanded ? null : c.id)}
                style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}
              >
                {/* Template icon */}
                <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(139,92,246,0.12)', border: `1px solid rgba(139,92,246,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {c.status === 'scheduled' ? '🕐' : '📨'}
                </div>

                {/* Main info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                    {statusBadge(c.status)}
                    {c.isDryRun && c.status !== 'scheduled' && (
                      <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, background: 'rgba(148,163,184,0.1)', border: `1px solid rgba(148,163,184,0.2)`, color: DIM }}>test</span>
                    )}
                  </div>
                  <div style={{ color: MUTED, fontSize: 12 }}>
                    {c.status === 'scheduled'
                      ? <>Scheduled for <span style={{ color: AMBER }}>{fmtDate(c.scheduledFor)}</span> · {c.eligible} recipients</>
                      : <>{fmtDate(c.createdAt)} · {c.eligible} sent · {blkRec.length > 0 ? `${blkRec.length} blocked · ` : ''}{c.totalSelected} total</>
                    }
                  </div>
                </div>

                {/* Stats chips */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                  {c.status !== 'scheduled' && (
                    <>
                      <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>{c.sent || sentRec.length} ✓</span>
                      {(c.errors || errRec.length) > 0 && <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>{c.errors || errRec.length} ✗</span>}
                    </>
                  )}
                  <span style={{ color: DIM, fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Message preview */}
                  <div>
                    <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>MESSAGE</p>
                    <div style={{ padding: '10px 12px', background: BG, borderRadius: 8, fontFamily: 'monospace', fontSize: 12, color: SUB, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 80, overflowY: 'auto' }}>
                      {c.message}
                    </div>
                  </div>

                  {/* Recipients */}
                  {Array.isArray(c.recipients) && c.recipients.length > 0 && (
                    <div>
                      <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>RECIPIENTS ({c.recipients.length})</p>
                      <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                        {c.recipients.map((r, i) => {
                          const st = r.status
                          const clr = st === 'sent' || st === 'dry_run' ? GREEN : st === 'blocked' ? RED : st === 'error' ? AMBER : MUTED
                          const icon = st === 'sent' || st === 'dry_run' ? '✓' : st === 'blocked' ? '✗' : st === 'error' ? '⚠' : '·'
                          return (
                            <div key={r.id || i} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
                              borderBottom: i < c.recipients.length - 1 ? `1px solid rgba(30,41,59,0.5)` : 'none',
                              background: i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.3)',
                            }}>
                              <span style={{ color: clr, fontSize: 13, width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
                              <span style={{ color: TEXT, fontSize: 13, flex: 1 }}>{r.firstName} {r.lastName}</span>
                              <span style={{ color: DIM, fontSize: 12, fontFamily: 'monospace' }}>{fmtPhone(r.phone)}</span>
                              {r.message && <span style={{ color: AMBER, fontSize: 11 }}>{r.message}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {c.status === 'scheduled' && (
                      <button
                        onClick={() => onReuse?.(c)}
                        style={{ padding: '7px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'rgba(245,158,11,0.12)', border: `1px solid rgba(245,158,11,0.35)`, color: AMBER, fontWeight: 600 }}
                      >
                        Send Now →
                      </button>
                    )}
                    <button
                      onClick={() => onReuse?.(c)}
                      style={{ padding: '7px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.3)`, color: '#c4b5fd', fontWeight: 600 }}
                    >
                      Reuse Campaign
                    </button>
                    {confirmDel === c.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setConfirmDel(null)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED }}>Cancel</button>
                        <button onClick={() => handleDelete(c.id)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'rgba(239,68,68,0.12)', border: `1px solid rgba(239,68,68,0.35)`, color: RED, fontWeight: 600 }}>Delete</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDel(c.id)} style={{ padding: '7px 14px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED }}>Delete</button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function CampaignSMS({ customers = [], posSession = null, initialSelected = null, initialStep = 1, initialMessage = null }) {
  const [view,       setView]       = useState('wizard')  // 'wizard' | 'history'
  const [step,       setStep]       = useState(initialStep)
  const [selected,   setSelected]   = useState(() => initialSelected ? new Set(initialSelected) : new Set())
  const [message,    setMessage]    = useState(() => initialMessage ?? TEMPLATES[0].body)
  const [templateId, setTemplateId] = useState(() => initialMessage ? 'custom' : TEMPLATES[0].id)
  const [histCount,  setHistCount]  = useState(() => loadCampaigns().length)

  const refreshHistCount = () => setHistCount(loadCampaigns().length)

  const handleReset = () => {
    setStep(1)
    setSelected(new Set())
    setMessage(TEMPLATES[0].body)
    setTemplateId(TEMPLATES[0].id)
    refreshHistCount()
  }

  const handleReuse = (campaign) => {
    setMessage(campaign.message)
    setTemplateId(campaign.templateId || 'custom')
    const ids = (campaign.recipients || []).map(r => r.id).filter(Boolean)
    // Only pre-select IDs that still exist in current customers
    const validIds = new Set(customers.map(c => c.id))
    setSelected(new Set(ids.filter(id => validIds.has(id))))
    setStep(1)
    setView('wizard')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }}>
      {view === 'wizard' && (
        <StepBar
          step={step}
          onHistory={() => { refreshHistCount(); setView('history') }}
          historyCount={histCount}
        />
      )}

      {view === 'history' && (
        <CampaignHistory
          onClose={() => setView('wizard')}
          onReuse={handleReuse}
        />
      )}

      {view === 'wizard' && step === 1 && (
        <StepSelect
          customers={customers}
          selected={selected}
          setSelected={setSelected}
          onNext={() => setStep(2)}
        />
      )}
      {view === 'wizard' && step === 2 && (
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
      {view === 'wizard' && step === 3 && (
        <StepReview
          selected={selected}
          customers={customers}
          message={message}
          templateId={templateId}
          posSession={posSession}
          onBack={() => setStep(2)}
          onReset={handleReset}
          onScheduled={refreshHistCount}
        />
      )}
    </div>
  )
}
