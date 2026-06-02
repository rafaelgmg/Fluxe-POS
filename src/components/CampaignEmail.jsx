import { useState, useMemo, useCallback, useEffect } from 'react'
import { loadCampaigns, saveCampaign } from '../utils/campaignStorage'

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
    subject: `Special offer just for you — ${STORE_NAME}`,
    body: `Hi {first_name},\n\nWe have a special deal just for you at ${STORE_NAME}! 🧴\n\nStop by our kiosk today and ask about our exclusive offer for valued customers. We'd love to see you again!\n\nSee you soon,\nThe ${STORE_NAME} Team`,
  },
  {
    id: 'new_arrivals',
    name: 'New Arrivals',
    subject: `New fragrances just arrived — ${STORE_NAME}`,
    body: `Hi {first_name},\n\nExciting news — new fragrances just arrived at ${STORE_NAME}! 🌟\n\nWe thought of you when they came in. Come check out our newest collection — we think you'll love them.\n\nSee you soon,\nThe ${STORE_NAME} Team`,
  },
  {
    id: 'come_back',
    name: 'Come Back',
    subject: `We miss you at ${STORE_NAME}!`,
    body: `Hi {first_name},\n\nIt's been a while and we miss you! 👋\n\nCome visit us at ${STORE_NAME} — we have something special for returning customers. Our team would love to help you find your next favorite fragrance.\n\nSee you soon,\nThe ${STORE_NAME} Team`,
  },
  {
    id: 'birthday',
    name: 'Happy Birthday',
    subject: `Happy Birthday from ${STORE_NAME}! 🎂`,
    body: `Hi {first_name},\n\nHappy Birthday! 🎂\n\nThe whole team at ${STORE_NAME} wishes you an amazing day. Come visit us to celebrate — we have a special birthday treat waiting for you!\n\nWith love,\nThe ${STORE_NAME} Team`,
  },
  {
    id: 'custom',
    name: 'Custom',
    subject: `A message from ${STORE_NAME}`,
    body: `Hi {first_name},\n\n`,
  },
]

function resolveVars(text, customer) {
  return text
    .replace(/{first_name}/g, customer.firstName || 'there')
    .replace(/{store_name}/g,  STORE_NAME)
}

function campaignId() { return 'camp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7) }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── Step Bar ──────────────────────────────────────────────────────────────────

function StepBar({ step, onHistory, histCount }) {
  const steps = [{ n: 1, label: 'Select' }, { n: 2, label: 'Compose' }, { n: 3, label: 'Review & Send' }]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
      {steps.map((s, i) => {
        const done = step > s.n; const active = step === s.n
        return (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {i > 0 && <div style={{ width: 40, height: 1, background: done ? BLUE : BORDER, marginRight: 6 }} />}
            <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? GREEN : active ? BLUE : 'transparent', border: `2px solid ${done ? GREEN : active ? BLUE : BORDER}`, color: done || active ? '#fff' : DIM, fontSize: 11, fontWeight: 700 }}>
              {done ? '✓' : s.n}
            </div>
            <span style={{ color: active ? TEXT : done ? SUB : DIM, fontSize: 12, fontWeight: active ? 700 : 400, whiteSpace: 'nowrap' }}>{s.label}</span>
          </div>
        )
      })}
      <div style={{ flex: 1 }} />
      <button onClick={onHistory} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.3)`, color: '#c4b5fd', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        📋 History
        {histCount > 0 && <span style={{ background: PURPLE, color: '#fff', borderRadius: 20, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>{histCount}</span>}
      </button>
    </div>
  )
}

// ── Step 1: Select ────────────────────────────────────────────────────────────

function StepSelect({ customers, selected, setSelected, onNext }) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const eligible = useMemo(() => customers.filter(c => !c.archived && c.email && c.email.includes('@')), [customers])
  const noEmail  = customers.filter(c => !c.archived && (!c.email || !c.email.includes('@'))).length

  const filtered = useMemo(() => {
    let list = eligible
    if (filter === 'buyer')       list = list.filter(c => (c.purchases || []).length > 0)
    if (filter === 'no-purchase') list = list.filter(c => (c.purchases || []).length === 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q))
    }
    return list
  }, [eligible, filter, search])

  const allSel = filtered.length > 0 && filtered.every(c => selected.has(c.id))
  const toggle = id => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n) }
  const toggleAll = () => { const n = new Set(selected); allSel ? filtered.forEach(c => n.delete(c.id)) : filtered.forEach(c => n.add(c.id)); setSelected(n) }

  const pill = (id, label) => {
    const active = filter === id
    return <button key={id} onClick={() => setFilter(id)} style={{ padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: active ? 'rgba(37,99,235,0.15)' : 'transparent', border: `1px solid ${active ? 'rgba(37,99,235,0.4)' : BORDER}`, color: active ? '#93c5fd' : MUTED, fontWeight: active ? 700 : 400, transition: 'all 0.15s' }}>{label}</button>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div>
            <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Select Recipients</h3>
            <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
              Only customers with an email address are shown
              {noEmail > 0 && <span style={{ color: DIM }}> · {noEmail} without email hidden</span>}
            </p>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ color: MUTED, fontSize: 13 }}><span style={{ color: BLUE, fontWeight: 700, fontSize: 16 }}>{selected.size}</span> selected</span>
          <button onClick={onNext} disabled={selected.size === 0} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', background: selected.size === 0 ? 'rgba(37,99,235,0.08)' : 'linear-gradient(135deg, #3b82f6, #7c3aed)', border: 'none', color: selected.size === 0 ? DIM : '#fff', boxShadow: selected.size > 0 ? '0 0 16px rgba(37,99,235,0.3)' : 'none' }}>Compose →</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." style={{ padding: '6px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', width: 230 }} />
          {pill('all', 'All')}
          {pill('buyer', 'Has Purchase')}
          {pill('no-purchase', 'No Purchase')}
          <span style={{ color: DIM, fontSize: 12 }}>{filtered.length} shown</span>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 10, minWidth: 700 }}>
          <div style={{ width: 36, flexShrink: 0 }}><input type="checkbox" checked={allSel} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: BLUE }} /></div>
          {[['NAME', 180], ['EMAIL', 220], ['ADDED BY', 120], ['LOCATION', 140], ['INVOICES', 80]].map(([h, w]) => (
            <div key={h} style={{ width: w, minWidth: w, flexShrink: 0, color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{h}</div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: DIM, fontSize: 14 }}>
            {eligible.length === 0 ? 'No customers with an email address yet.' : 'No customers match the current filters.'}
          </div>
        )}
        {filtered.map((c, idx) => {
          const isSel = selected.has(c.id)
          return (
            <div key={c.id} onClick={() => toggle(c.id)} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: `1px solid rgba(30,41,59,0.5)`, background: isSel ? 'rgba(37,99,235,0.08)' : idx % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.4)', cursor: 'pointer', minWidth: 700 }}>
              <div style={{ width: 36, flexShrink: 0 }} onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSel} onChange={() => toggle(c.id)} style={{ cursor: 'pointer', accentColor: BLUE }} /></div>
              <div style={{ width: 180, minWidth: 180, flexShrink: 0, color: TEXT, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.firstName} {c.lastName}</div>
              <div style={{ width: 220, minWidth: 220, flexShrink: 0, color: '#60a5fa', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
              <div style={{ width: 120, minWidth: 120, flexShrink: 0, color: MUTED, fontSize: 12 }}>{c.capturedBy || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: 140, minWidth: 140, flexShrink: 0, color: MUTED, fontSize: 11 }}>{c.capturedLocation || <span style={{ color: DIM }}>—</span>}</div>
              <div style={{ width: 80, minWidth: 80, flexShrink: 0, color: (c.purchases || []).length > 0 ? '#60a5fa' : DIM, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>{(c.purchases || []).length}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 2: Compose ───────────────────────────────────────────────────────────

function StepCompose({ selected, customers, subject, setSubject, body, setBody, templateId, setTemplateId, onBack, onNext }) {
  const firstCustomer = useMemo(() => customers.find(c => selected.has(c.id)) || null, [customers, selected])
  const previewBody   = useMemo(() => firstCustomer ? resolveVars(body, firstCustomer) : body, [body, firstCustomer])
  const previewSubject = useMemo(() => firstCustomer ? resolveVars(subject, firstCustomer) : subject, [subject, firstCustomer])

  const handleTemplate = id => {
    const tpl = TEMPLATES.find(t => t.id === id)
    setTemplateId(id)
    if (tpl) { setSubject(tpl.subject); setBody(tpl.body) }
  }

  const insertVar = v => setBody(b => b + v)
  const canNext = subject.trim() && body.trim()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Compose Email</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Sending to <span style={{ color: BLUE, fontWeight: 700 }}>{selected.size}</span> recipient{selected.size !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onBack} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← Back</button>
        <button onClick={onNext} disabled={!canNext} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: canNext ? 'pointer' : 'not-allowed', background: canNext ? 'linear-gradient(135deg, #3b82f6, #7c3aed)' : 'rgba(37,99,235,0.08)', border: 'none', color: canNext ? '#fff' : DIM }}>Review & Send →</button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Left: editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>TEMPLATE</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => handleTemplate(t.id)} style={{ padding: '6px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: templateId === t.id ? 'rgba(139,92,246,0.15)' : 'transparent', border: `1px solid ${templateId === t.id ? 'rgba(139,92,246,0.5)' : BORDER}`, color: templateId === t.id ? '#c4b5fd' : MUTED, fontWeight: templateId === t.id ? 700 : 400 }}>{t.name}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>SUBJECT LINE</label>
            <input value={subject} onChange={e => { setSubject(e.target.value); setTemplateId('custom') }} placeholder="Your subject here..." style={{ width: '100%', padding: '9px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
          </div>

          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>INSERT VARIABLE</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {['{first_name}', '{store_name}'].map(v => (
                <button key={v} onClick={() => insertVar(v)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', color: '#93c5fd' }}>{v}</button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>EMAIL BODY</label>
            <textarea value={body} onChange={e => { setBody(e.target.value); setTemplateId('custom') }} placeholder="Write your email here..." style={{ flex: 1, minHeight: 180, padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.7, boxSizing: 'border-box' }} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
            <p style={{ color: DIM, fontSize: 11, marginTop: 4 }}>Use line breaks for paragraphs. Unsubscribe link is added automatically.</p>
          </div>
        </div>

        {/* Right: preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>
              EMAIL PREVIEW
              {firstCustomer && <span style={{ color: DIM, fontWeight: 400, marginLeft: 6 }}>for {firstCustomer.firstName}</span>}
            </label>
            <div style={{ background: '#f4f4f5', borderRadius: 10, overflow: 'hidden', border: `1px solid ${BORDER}` }}>
              {/* Email header bar */}
              <div style={{ background: '#030e1e', padding: '16px 20px' }}>
                <p style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 16, margin: 0 }}>{STORE_NAME}</p>
                <p style={{ color: '#94a3b8', fontSize: 11, margin: '3px 0 0' }}>Las Vegas, Nevada</p>
              </div>
              {/* Subject */}
              <div style={{ padding: '12px 20px 0', background: '#fff' }}>
                <p style={{ color: '#64748b', fontSize: 11, margin: '0 0 4px' }}>Subject:</p>
                <p style={{ color: '#1e293b', fontSize: 14, fontWeight: 700, margin: 0 }}>{previewSubject || <span style={{ opacity: 0.4 }}>No subject</span>}</p>
              </div>
              {/* Body */}
              <div style={{ padding: '16px 20px', background: '#fff', color: '#1e293b', fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 100 }}>
                {previewBody || <span style={{ opacity: 0.4 }}>Your message will appear here...</span>}
              </div>
              {/* Footer */}
              <div style={{ padding: '12px 20px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>{STORE_NAME} · 3663 Las Vegas Blvd, Las Vegas NV · <span style={{ textDecoration: 'underline' }}>Unsubscribe</span></p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Review & Send ─────────────────────────────────────────────────────

function StepReview({ selected, customers, subject, body, templateId, onBack, onReset }) {
  const [runState, setRunState] = useState(null)
  const [results,  setResults]  = useState({})
  const [progress, setProgress] = useState(0)
  const [resendOk, setResendOk] = useState(null)

  const selectedCustomers = useMemo(() => customers.filter(c => selected.has(c.id)), [customers, selected])

  useEffect(() => {
    fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(2500) })
      .then(r => r.json())
      .then(d => setResendOk(!!d.resend))
      .catch(() => setResendOk(false))
  }, [])

  const templateName = TEMPLATES.find(t => t.id === templateId)?.name || 'Custom'

  const runCampaign = useCallback(async (dryRun) => {
    if (runState === 'running') return
    setRunState('running'); setResults({}); setProgress(0)

    const recipientResults = []
    let sent = 0; let errors = 0

    for (let i = 0; i < selectedCustomers.length; i++) {
      const c = selectedCustomers[i]
      const resolvedBody    = resolveVars(body, c)
      const resolvedSubject = resolveVars(subject, c)
      let status = 'error'; let errMsg = ''

      try {
        const res = await fetch(`${SERVER_URL}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: c.email, firstName: c.firstName, subject: resolvedSubject, body: resolvedBody, dryRun }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          status = 'error'; errMsg = err.error || 'Server error'
        } else {
          status = dryRun ? 'dry_run' : 'sent'
        }
      } catch (err) { status = 'error'; errMsg = err.message }

      if (status === 'error') errors++; else sent++
      setResults(r => ({ ...r, [c.id]: { status, message: errMsg } }))
      recipientResults.push({ id: c.id, firstName: c.firstName, lastName: c.lastName, email: c.email, status, message: errMsg })
      setProgress(i + 1)
    }

    saveCampaign({
      id:            campaignId(),
      name:          templateName,
      templateId:    templateId || 'custom',
      message:       body,
      subject,
      channel:       'email',
      createdAt:     new Date().toISOString(),
      scheduledFor:  null,
      status:        dryRun ? 'dry_run' : 'sent',
      isDryRun:      dryRun,
      totalSelected: selectedCustomers.length,
      eligible:      selectedCustomers.length,
      blocked:       0,
      sent, errors,
      recipients: recipientResults,
    })
    setRunState('done')
  }, [selectedCustomers, body, subject, templateId, templateName, runState])

  const resArr    = Object.values(results)
  const sentCount = resArr.filter(r => r.status === 'dry_run' || r.status === 'sent').length
  const errCount  = resArr.filter(r => r.status === 'error').length
  const isDone    = runState === 'done'
  const isRunning = runState === 'running'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Review & Send</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}><span style={{ color: GREEN, fontWeight: 700 }}>{selectedCustomers.length}</span> recipients</p>
        </div>
        <div style={{ flex: 1 }} />
        {!isRunning && !isDone && <button onClick={onBack} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← Back</button>}
        {isDone && <button onClick={onReset} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>New Campaign</button>}
        {!isRunning && !isDone && (
          <>
            <button onClick={() => runCampaign(true)} disabled={selectedCustomers.length === 0} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: selectedCustomers.length === 0 ? 'not-allowed' : 'pointer', background: 'rgba(34,197,94,0.15)', border: `1px solid rgba(34,197,94,0.45)`, color: GREEN }}>Dry Run</button>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <button
                disabled={!resendOk || selectedCustomers.length === 0}
                onClick={() => runCampaign(false)}
                style={{ padding: '8px 18px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: (resendOk && selectedCustomers.length > 0) ? 'pointer' : 'not-allowed', background: (resendOk && selectedCustomers.length > 0) ? 'linear-gradient(135deg, #3b82f6, #1d4ed8)' : 'rgba(59,130,246,0.07)', border: 'none', color: (resendOk && selectedCustomers.length > 0) ? '#fff' : DIM, boxShadow: (resendOk && selectedCustomers.length > 0) ? '0 0 16px rgba(59,130,246,0.3)' : 'none', opacity: resendOk === null ? 0.5 : 1 }}
              >Send Emails</button>
              <span style={{ fontSize: 10, whiteSpace: 'nowrap', color: resendOk === true ? GREEN : resendOk === false ? RED : DIM }}>
                {resendOk === true ? '✓ Resend ready' : resendOk === false ? '⚠ Resend not configured' : 'Checking...'}
              </span>
            </div>
          </>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {(isRunning || isDone) && (
          <div style={{ padding: '14px 16px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{isRunning ? `Sending... (${progress} / ${selectedCustomers.length})` : 'Campaign complete'}</span>
              {isDone && <span style={{ fontSize: 13, color: MUTED }}><span style={{ color: GREEN }}>{sentCount} sent</span>{errCount > 0 && <span style={{ color: RED }}> · {errCount} errors</span>}</span>}
            </div>
            <div style={{ height: 6, background: BORDER, borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${selectedCustomers.length > 0 ? (progress / selectedCustomers.length) * 100 : 0}%`, background: isDone && errCount > 0 ? AMBER : GREEN, borderRadius: 3, transition: 'width 0.25s' }} />
            </div>
          </div>
        )}

        <div style={{ padding: '16px 18px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10 }}>
          <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 10 }}>CAMPAIGN SUMMARY</p>
          <p style={{ color: TEXT, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Subject: {subject || <span style={{ color: DIM }}>—</span>}</p>
          <div style={{ padding: '10px 12px', background: BG, borderRadius: 8, fontFamily: 'inherit', fontSize: 12, color: SUB, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto', marginBottom: 10 }}>{body}</div>
          <div style={{ display: 'flex', gap: 24 }}>
            <div><p style={{ color: DIM, fontSize: 10, letterSpacing: 0.5, marginBottom: 3 }}>RECIPIENTS</p><p style={{ color: TEXT, fontSize: 22, fontWeight: 800 }}>{selectedCustomers.length}</p></div>
          </div>
        </div>

        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', borderBottom: `1px solid ${BORDER}` }}>
            <p style={{ color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>RECIPIENTS ({selectedCustomers.length})</p>
          </div>
          {selectedCustomers.map((c, idx) => {
            const result = results[c.id]
            let badge = null
            if (result) {
              const map = { dry_run: { label: '✓ Dry Run', color: GREEN }, sent: { label: '✓ Sent', color: GREEN }, error: { label: `⚠ ${result.message || 'Error'}`, color: AMBER } }
              const s = map[result.status] || map.error
              badge = <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', background: `${s.color}18`, border: `1px solid ${s.color}55`, color: s.color }}>{s.label}</span>
            }
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', padding: '9px 16px', gap: 12, borderBottom: idx < selectedCustomers.length - 1 ? `1px solid rgba(30,41,59,0.5)` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{c.firstName} {c.lastName}</span>
                  <span style={{ color: DIM, fontSize: 12, marginLeft: 10 }}>{c.email}</span>
                </div>
                {badge}
                {isRunning && !result && <span style={{ color: DIM, fontSize: 12 }}>queued...</span>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── History ───────────────────────────────────────────────────────────────────

function EmailHistory({ onClose, onReuse }) {
  const [campaigns, setCampaigns] = useState(() => loadCampaigns().filter(c => c.channel === 'email'))
  const [expandedId, setExpandedId] = useState(null)

  const refresh = () => setCampaigns(loadCampaigns().filter(c => c.channel === 'email'))

  if (campaigns.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: DIM }}>
        <p style={{ fontSize: 40 }}>📧</p>
        <p style={{ fontSize: 15, color: MUTED, fontWeight: 600 }}>No email campaigns yet</p>
        <p style={{ fontSize: 13, color: DIM }}>Completed campaigns will appear here.</p>
        <button onClick={onClose} style={{ marginTop: 8, padding: '8px 20px', borderRadius: 8, background: 'rgba(37,99,235,0.1)', border: `1px solid rgba(37,99,235,0.3)`, color: '#93c5fd', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>← Back to Campaign</button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Email Campaign History</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>← New Campaign</button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {campaigns.map(c => {
          const isExpanded = expandedId === c.id
          const sentRec = (c.recipients || []).filter(r => r.status === 'sent' || r.status === 'dry_run').length
          return (
            <div key={c.id} style={{ background: CARD, border: `1px solid ${isExpanded ? 'rgba(37,99,235,0.35)' : BORDER}`, borderRadius: 10, overflow: 'hidden' }}>
              <div onClick={() => setExpandedId(isExpanded ? null : c.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 38, height: 38, borderRadius: 8, background: 'rgba(59,130,246,0.12)', border: `1px solid rgba(59,130,246,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>📧</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{c.name}</span>
                    <span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.status === 'sent' ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)', border: `1px solid ${c.status === 'sent' ? 'rgba(34,197,94,0.35)' : 'rgba(59,130,246,0.35)'}`, color: c.status === 'sent' ? GREEN : BLUE }}>{c.status === 'dry_run' ? 'Dry Run' : 'Sent'}</span>
                  </div>
                  <p style={{ color: MUTED, fontSize: 12 }}>{fmtDate(c.createdAt)} · {c.eligible} recipients · Subject: {c.subject || '—'}</p>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: GREEN, fontWeight: 700 }}>{c.sent || sentRec} ✓</span>
                  {(c.errors || 0) > 0 && <span style={{ fontSize: 12, color: RED, fontWeight: 700 }}>{c.errors} ✗</span>}
                  <span style={{ color: DIM, fontSize: 14 }}>{isExpanded ? '▲' : '▼'}</span>
                </div>
              </div>
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${BORDER}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ padding: '10px 12px', background: BG, borderRadius: 8, fontFamily: 'inherit', fontSize: 12, color: SUB, lineHeight: 1.7, whiteSpace: 'pre-wrap', maxHeight: 100, overflowY: 'auto' }}>{c.message}</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => onReuse?.(c)} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 13, cursor: 'pointer', background: 'rgba(139,92,246,0.1)', border: `1px solid rgba(139,92,246,0.3)`, color: '#c4b5fd', fontWeight: 600 }}>Reuse Campaign</button>
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

// ── Main Export ───────────────────────────────────────────────────────────────

export default function CampaignEmail({ customers = [] }) {
  const [view,       setView]       = useState('wizard')
  const [step,       setStep]       = useState(1)
  const [selected,   setSelected]   = useState(() => new Set())
  const [subject,    setSubject]    = useState(TEMPLATES[0].subject)
  const [body,       setBody]       = useState(TEMPLATES[0].body)
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id)
  const [histCount,  setHistCount]  = useState(() => loadCampaigns().filter(c => c.channel === 'email').length)

  const refreshHistCount = () => setHistCount(loadCampaigns().filter(c => c.channel === 'email').length)

  const handleReset = () => {
    setStep(1); setSelected(new Set())
    setSubject(TEMPLATES[0].subject); setBody(TEMPLATES[0].body)
    setTemplateId(TEMPLATES[0].id); refreshHistCount()
  }

  const handleReuse = (campaign) => {
    setSubject(campaign.subject || ''); setBody(campaign.message || '')
    setTemplateId(campaign.templateId || 'custom')
    const validIds = new Set(customers.map(c => c.id))
    const ids = (campaign.recipients || []).map(r => r.id).filter(id => validIds.has(id))
    setSelected(new Set(ids)); setStep(1); setView('wizard')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }}>
      {view === 'wizard' && (
        <StepBar step={step} onHistory={() => { refreshHistCount(); setView('history') }} histCount={histCount} />
      )}
      {view === 'history' && <EmailHistory onClose={() => setView('wizard')} onReuse={handleReuse} />}
      {view === 'wizard' && step === 1 && <StepSelect customers={customers} selected={selected} setSelected={setSelected} onNext={() => setStep(2)} />}
      {view === 'wizard' && step === 2 && <StepCompose selected={selected} customers={customers} subject={subject} setSubject={setSubject} body={body} setBody={setBody} templateId={templateId} setTemplateId={setTemplateId} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {view === 'wizard' && step === 3 && <StepReview selected={selected} customers={customers} subject={subject} body={body} templateId={templateId} onBack={() => setStep(2)} onReset={handleReset} />}
    </div>
  )
}
