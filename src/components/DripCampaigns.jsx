import { useState, useMemo, useCallback } from 'react'
import { loadDripRules, saveDripRule, deleteDripRule, loadDripLog, appendDripLog } from '../utils/dripStorage'

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

const TRIGGER_OPTIONS = [
  { id: 'days_after_capture',  label: 'Days after capture',       icon: '📥', desc: 'Send X days after the customer was first added' },
  { id: 'days_since_purchase', label: 'Days since last purchase',  icon: '🛍️', desc: 'Send X days after their most recent purchase' },
  { id: 'birthday',            label: 'Birthday (days before)',    icon: '🎂', desc: 'Send X days before their birthday (0 = on the day)' },
]

const TEMPLATES = [
  { id: 'flash_sale',    name: 'Flash Sale',     body: `Hi {first_name}! 🧴 We have a special deal just for you at ${STORE_NAME}. Stop by today — we'll take great care of you. Reply STOP to unsubscribe.` },
  { id: 'new_arrivals',  name: 'New Arrivals',   body: `Hi {first_name}! 🌟 New fragrances just arrived at ${STORE_NAME} and we thought of you. Come check them out — we'd love to see you! Reply STOP to unsubscribe.` },
  { id: 'come_back',     name: 'Come Back',      body: `Hi {first_name}! 👋 We miss you at ${STORE_NAME}! Come visit us — we have something special for returning customers. Reply STOP to unsubscribe.` },
  { id: 'birthday',      name: 'Happy Birthday', body: `Happy Birthday {first_name}! 🎂 The whole team at ${STORE_NAME} wishes you an amazing day. Come visit us for a special birthday treat! Reply STOP to unsubscribe.` },
  { id: 'custom',        name: 'Custom',         body: `Hi {first_name}! ` },
]

function ruleId() { return 'drip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }
function logId()  { return 'dlog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) }

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function fmtPhone(p) {
  if (!p) return '—'
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

function resolveVars(tpl, customer) {
  return tpl
    .replace(/{first_name}/g, customer.firstName || 'there')
    .replace(/{store_name}/g,  STORE_NAME)
    .replace(/{seller_name}/g, 'our team')
}

// ── Eligibility engine ────────────────────────────────────────────────────────

function getEligibleCustomers(rule, customers, dripLog) {
  const alreadySent = new Set(
    dripLog.filter(e => e.ruleId === rule.id && e.status !== 'error').map(e => e.customerId)
  )
  const now = Date.now()

  return customers.filter(c => {
    if (c.archived)                            return false
    if (!c.phone)                              return false
    if (c.smsConsentStatus === 'opted_out')    return false
    if (alreadySent.has(c.id))                 return false

    if (rule.trigger === 'days_after_capture') {
      const anchor = c.capturedAt || c.createdAt
      if (!anchor) return false
      const daysSince = (now - new Date(anchor).getTime()) / 86400_000
      return daysSince >= rule.delayDays
    }

    if (rule.trigger === 'days_since_purchase') {
      const purchases = c.purchases || []
      if (purchases.length === 0) return false
      const lastDate = purchases[purchases.length - 1]?.date
      if (!lastDate) return false
      const daysSince = (now - new Date(lastDate).getTime()) / 86400_000
      return daysSince >= rule.delayDays
    }

    if (rule.trigger === 'birthday') {
      if (!c.birthday) return false
      const today = new Date()
      const bday  = new Date(c.birthday)
      // Use this year's birthday; if already passed, check next year
      let thisYearBday = new Date(today.getFullYear(), bday.getMonth(), bday.getDate())
      if (thisYearBday < today) {
        thisYearBday = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate())
      }
      const daysUntil = Math.floor((thisYearBday.getTime() - today.setHours(0,0,0,0)) / 86400_000)
      return daysUntil >= 0 && daysUntil <= (rule.delayDays ?? 0)
    }

    return false
  })
}

// ── Rule Form Modal ───────────────────────────────────────────────────────────

function RuleModal({ rule, onSave, onClose }) {
  const isEdit = !!rule?.id
  const [form, setForm] = useState(() => rule || {
    name:       '',
    enabled:    true,
    trigger:    'days_after_capture',
    delayDays:  3,
    templateId: 'come_back',
    message:    TEMPLATES.find(t => t.id === 'come_back')?.body || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleTemplate = id => {
    const tpl = TEMPLATES.find(t => t.id === id)
    set('templateId', id)
    if (tpl && form.templateId !== 'custom') set('message', tpl.body)
    else if (tpl) set('message', tpl.body)
  }

  const triggerInfo = TRIGGER_OPTIONS.find(t => t.id === form.trigger)

  const canSave = form.name.trim() && form.message.trim() && form.delayDays >= 0

  const handleSave = () => {
    if (!canSave) return
    onSave({
      ...form,
      id:        form.id || ruleId(),
      createdAt: form.createdAt || new Date().toISOString(),
      totalSent: form.totalSent || 0,
      lastRunAt: form.lastRunAt || null,
    })
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, width: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ padding: '16px 20px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>{isEdit ? 'Edit Rule' : 'New Drip Rule'}</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Automated message triggered by a customer event</p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Name */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>RULE NAME</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Welcome Message, Re-engagement, Birthday"
              style={{ width: '100%', padding: '9px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.borderColor = BLUE }}
              onBlur={e => { e.target.style.borderColor = BORDER }}
            />
          </div>

          {/* Trigger */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>TRIGGER</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {TRIGGER_OPTIONS.map(t => (
                <div
                  key={t.id}
                  onClick={() => set('trigger', t.id)}
                  style={{
                    padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                    background: form.trigger === t.id ? 'rgba(37,99,235,0.12)' : CARD,
                    border: `1px solid ${form.trigger === t.id ? 'rgba(37,99,235,0.45)' : BORDER}`,
                    display: 'flex', alignItems: 'center', gap: 12, transition: 'all 0.12s',
                  }}
                >
                  <span style={{ fontSize: 20 }}>{t.icon}</span>
                  <div>
                    <p style={{ color: form.trigger === t.id ? '#93c5fd' : TEXT, fontSize: 13, fontWeight: 600 }}>{t.label}</p>
                    <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Delay */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 6 }}>
              {form.trigger === 'birthday' ? 'DAYS BEFORE BIRTHDAY (0 = on the day)' : 'DELAY (DAYS)'}
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="number" min={0} max={365}
                value={form.delayDays}
                onChange={e => set('delayDays', Math.max(0, parseInt(e.target.value) || 0))}
                style={{ width: 80, padding: '8px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 7, color: TEXT, fontSize: 14, fontWeight: 700, outline: 'none', textAlign: 'center' }}
                onFocus={e => { e.target.style.borderColor = BLUE }}
                onBlur={e => { e.target.style.borderColor = BORDER }}
              />
              <span style={{ color: MUTED, fontSize: 13 }}>
                {form.trigger === 'birthday'
                  ? form.delayDays === 0 ? 'Send on the birthday' : `Send ${form.delayDays} day${form.delayDays !== 1 ? 's' : ''} before`
                  : `Send ${form.delayDays} day${form.delayDays !== 1 ? 's' : ''} after the trigger`
                }
              </span>
            </div>
          </div>

          {/* Template */}
          <div>
            <label style={{ display: 'block', color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 8 }}>TEMPLATE</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => handleTemplate(t.id)} style={{
                  padding: '5px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                  background: form.templateId === t.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                  border: `1px solid ${form.templateId === t.id ? 'rgba(139,92,246,0.5)' : BORDER}`,
                  color: form.templateId === t.id ? '#c4b5fd' : MUTED,
                  fontWeight: form.templateId === t.id ? 700 : 400, transition: 'all 0.12s',
                }}>{t.name}</button>
              ))}
            </div>
            <textarea
              value={form.message}
              onChange={e => { set('message', e.target.value); set('templateId', 'custom') }}
              rows={4}
              style={{ width: '100%', padding: '10px 12px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, color: TEXT, fontSize: 13, outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, boxSizing: 'border-box' }}
              onFocus={e => { e.target.style.borderColor = BLUE }}
              onBlur={e => { e.target.style.borderColor = BORDER }}
            />
            <p style={{ color: DIM, fontSize: 11, marginTop: 4 }}>Variables: {'{first_name}'} · {'{store_name}'} · {'{seller_name}'} · Must include "Reply STOP to unsubscribe."</p>
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 18px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              padding: '8px 22px', borderRadius: 7, fontSize: 13, fontWeight: 700,
              cursor: canSave ? 'pointer' : 'not-allowed',
              background: canSave ? 'linear-gradient(135deg, #3b82f6, #7c3aed)' : 'rgba(37,99,235,0.08)',
              border: 'none', color: canSave ? '#fff' : DIM,
            }}
          >{isEdit ? 'Save Changes' : 'Create Rule'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Preview Panel ─────────────────────────────────────────────────────────────

function PreviewModal({ rule, eligible, dryRun, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, backdropFilter: 'blur(2px)' }}>
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 12, width: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>{dryRun ? 'Dry Run Preview' : 'Send Preview'} — {rule.name}</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{eligible.length} customer{eligible.length !== 1 ? 's' : ''} will receive this message</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {eligible.length === 0 ? (
            <p style={{ color: DIM, textAlign: 'center', padding: '30px 0', fontSize: 14 }}>No eligible customers at this time.</p>
          ) : (
            eligible.map((c, i) => (
              <div key={c.id} style={{ padding: '9px 0', borderBottom: i < eligible.length - 1 ? `1px solid rgba(30,41,59,0.5)` : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{c.firstName} {c.lastName}</span>
                  <span style={{ color: DIM, fontSize: 12, fontFamily: 'monospace' }}>{fmtPhone(c.phone)}</span>
                </div>
                <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.5 }}>{resolveVars(rule.message, c)}</p>
              </div>
            ))
          )}
        </div>
        <div style={{ padding: '12px 20px', borderTop: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 20px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 7, color: MUTED, fontSize: 13, cursor: 'pointer' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function DripCampaigns({ customers = [], posSession = null }) {
  const [rules,       setRules]       = useState(() => loadDripRules())
  const [log,         setLog]         = useState(() => loadDripLog())
  const [tab,         setTab]         = useState('rules')  // 'rules' | 'log'
  const [showForm,    setShowForm]    = useState(false)
  const [editRule,    setEditRule]    = useState(null)
  const [running,     setRunning]     = useState(null)   // ruleId being executed
  const [results,     setResults]     = useState({})     // { ruleId: { sent, errors, skipped } }
  const [preview,     setPreview]     = useState(null)   // { rule, eligible, dryRun }
  const [confirmDel,  setConfirmDel]  = useState(null)

  const refreshRules = () => setRules(loadDripRules())
  const refreshLog   = () => setLog(loadDripLog())

  const handleSaveRule = (rule) => {
    saveDripRule(rule)
    refreshRules()
    setShowForm(false)
    setEditRule(null)
  }

  const handleDeleteRule = (id) => {
    deleteDripRule(id)
    setConfirmDel(null)
    refreshRules()
  }

  const handleToggle = (rule) => {
    saveDripRule({ ...rule, enabled: !rule.enabled })
    refreshRules()
  }

  const currentLog = useMemo(() => log, [log])

  const getEligible = useCallback((rule) => {
    return getEligibleCustomers(rule, customers, log)
  }, [customers, log])

  const runRule = useCallback(async (rule, dryRun) => {
    const eligible = getEligible(rule)
    if (eligible.length === 0) {
      setResults(r => ({ ...r, [rule.id]: { sent: 0, errors: 0, skipped: 0, dryRun, ran: true } }))
      return
    }
    setRunning(rule.id)

    let sent = 0; let errors = 0
    const logEntries = []

    for (const c of eligible) {
      const message = resolveVars(rule.message, c)
      let status = 'error'
      try {
        const res = await fetch(`${SERVER_URL}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: c.phone, firstName: c.firstName, message, raw: true, dryRun,
            supabaseId: c.supabaseId || null,
            orgId: posSession?.orgId || null,
            locationId: posSession?.locationUUID || null,
            channel: 'sms',
          }),
        })
        status = (!res.ok && res.status !== 403) ? 'error' : dryRun ? 'dry_run' : 'sent'
        if (status === 'error') errors++; else sent++
      } catch { errors++; status = 'error' }

      logEntries.push({
        id:           logId(),
        ruleId:       rule.id,
        ruleName:     rule.name,
        customerId:   c.id,
        customerName: `${c.firstName} ${c.lastName}`.trim(),
        phone:        c.phone,
        sentAt:       new Date().toISOString(),
        status,
        dryRun,
      })
    }

    appendDripLog(logEntries)
    saveDripRule({ ...rule, lastRunAt: new Date().toISOString(), totalSent: (rule.totalSent || 0) + sent })
    setRunning(null)
    setResults(r => ({ ...r, [rule.id]: { sent, errors, skipped: 0, dryRun, ran: true } }))
    refreshRules()
    refreshLog()
  }, [getEligible, posSession])

  const triggerLabel = (trigger) => TRIGGER_OPTIONS.find(t => t.id === trigger)?.label || trigger
  const triggerIcon  = (trigger) => TRIGGER_OPTIONS.find(t => t.id === trigger)?.icon || '⚡'

  const logByRule = useMemo(() => {
    const map = {}
    for (const e of log) {
      if (!map[e.ruleId]) map[e.ruleId] = 0
      if (e.status === 'sent' || e.status === 'dry_run') map[e.ruleId]++
    }
    return map
  }, [log])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: BG }}>

      {/* Header */}
      <div style={{ padding: '14px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <h3 style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Drip Campaigns</h3>
          <p style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>Automated messages triggered by customer events</p>
        </div>
        <div style={{ flex: 1 }} />
        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: 2, background: CARD, borderRadius: 8, padding: 3 }}>
          {[['rules', 'Rules'], ['log', 'Send Log']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
              background: tab === id ? BORDER : 'transparent',
              border: 'none', color: tab === id ? TEXT : MUTED, fontWeight: tab === id ? 700 : 400,
              transition: 'all 0.12s',
            }}>{label}{id === 'log' && log.length > 0 && <span style={{ color: DIM, marginLeft: 4 }}>({log.length})</span>}</button>
          ))}
        </div>
        {tab === 'rules' && (
          <button
            onClick={() => { setEditRule(null); setShowForm(true) }}
            style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f6, #7c3aed)', border: 'none', color: '#fff', boxShadow: '0 0 16px rgba(37,99,235,0.25)' }}
          >+ Add Rule</button>
        )}
      </div>

      {/* Rules tab */}
      {tab === 'rules' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rules.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: DIM }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>⚡</p>
              <p style={{ color: MUTED, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No drip rules yet</p>
              <p style={{ color: DIM, fontSize: 13, marginBottom: 20 }}>Create rules to send automated messages based on customer events.</p>
              <button
                onClick={() => { setEditRule(null); setShowForm(true) }}
                style={{ padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer', background: 'linear-gradient(135deg, #3b82f6, #7c3aed)', border: 'none', color: '#fff' }}
              >Create First Rule</button>
            </div>
          )}

          {rules.map(rule => {
            const eligible    = getEligible(rule)
            const isRunning   = running === rule.id
            const ruleResult  = results[rule.id]
            const sentTotal   = logByRule[rule.id] || 0

            return (
              <div key={rule.id} style={{ background: CARD, border: `1px solid ${rule.enabled ? BORDER : 'rgba(65,85,105,0.4)'}`, borderRadius: 10, overflow: 'hidden', opacity: rule.enabled ? 1 : 0.65, transition: 'opacity 0.2s' }}>
                <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                  {/* Icon */}
                  <div style={{ width: 40, height: 40, borderRadius: 9, flexShrink: 0, background: rule.enabled ? 'rgba(139,92,246,0.12)' : 'rgba(65,85,105,0.15)', border: `1px solid ${rule.enabled ? 'rgba(139,92,246,0.25)' : BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {triggerIcon(rule.trigger)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{rule.name}</span>
                      <span style={{ padding: '2px 7px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: rule.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(65,85,105,0.2)', border: `1px solid ${rule.enabled ? 'rgba(34,197,94,0.3)' : BORDER}`, color: rule.enabled ? GREEN : DIM }}>
                        {rule.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    <p style={{ color: MUTED, fontSize: 12 }}>
                      {triggerLabel(rule.trigger)} · {rule.trigger === 'birthday' ? `${rule.delayDays} days before` : `${rule.delayDays} days`}
                    </p>
                    <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                      <span style={{ color: DIM, fontSize: 12 }}>
                        <span style={{ color: eligible.length > 0 ? AMBER : DIM, fontWeight: eligible.length > 0 ? 700 : 400 }}>{eligible.length}</span> eligible now
                      </span>
                      <span style={{ color: DIM, fontSize: 12 }}>
                        <span style={{ color: sentTotal > 0 ? GREEN : DIM }}>{sentTotal}</span> total sent
                      </span>
                      {rule.lastRunAt && (
                        <span style={{ color: DIM, fontSize: 12 }}>Last run: {fmtDate(rule.lastRunAt)}</span>
                      )}
                    </div>
                    {/* Message preview */}
                    <p style={{ color: DIM, fontSize: 11, marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 480 }}>
                      {rule.message}
                    </p>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                    {/* Toggle */}
                    <button
                      onClick={() => handleToggle(rule)}
                      style={{ padding: '4px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: rule.enabled ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${rule.enabled ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`, color: rule.enabled ? RED : GREEN, fontWeight: 600 }}
                    >{rule.enabled ? 'Pause' : 'Resume'}</button>

                    <div style={{ display: 'flex', gap: 5 }}>
                      <button onClick={() => { setEditRule(rule); setShowForm(true) }} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'rgba(59,130,246,0.08)', border: `1px solid rgba(59,130,246,0.2)`, color: '#60a5fa' }}>Edit</button>
                      {confirmDel === rule.id ? (
                        <>
                          <button onClick={() => setConfirmDel(null)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED }}>Cancel</button>
                          <button onClick={() => handleDeleteRule(rule.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`, color: RED, fontWeight: 600 }}>Delete</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmDel(rule.id)} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED }}>Delete</button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Run bar */}
                <div style={{ padding: '10px 16px', borderTop: `1px solid ${BORDER}`, background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {ruleResult?.ran && (
                    <span style={{ fontSize: 12, color: ruleResult.errors > 0 ? AMBER : GREEN }}>
                      {ruleResult.dryRun ? 'Dry run: ' : 'Sent: '}
                      {ruleResult.sent} ✓
                      {ruleResult.errors > 0 && ` · ${ruleResult.errors} errors`}
                    </span>
                  )}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setPreview({ rule, eligible, dryRun: true })}
                    disabled={eligible.length === 0}
                    style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12, cursor: eligible.length === 0 ? 'not-allowed' : 'pointer', background: eligible.length > 0 ? 'rgba(34,197,94,0.1)' : 'transparent', border: `1px solid ${eligible.length > 0 ? 'rgba(34,197,94,0.35)' : BORDER}`, color: eligible.length > 0 ? GREEN : DIM, fontWeight: 600 }}
                  >Preview ({eligible.length})</button>
                  <button
                    onClick={() => runRule(rule, true)}
                    disabled={isRunning || eligible.length === 0}
                    style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12, cursor: (isRunning || eligible.length === 0) ? 'not-allowed' : 'pointer', background: 'rgba(59,130,246,0.08)', border: `1px solid rgba(59,130,246,0.2)`, color: isRunning ? DIM : '#93c5fd', fontWeight: 600 }}
                  >{isRunning ? 'Running...' : 'Dry Run'}</button>
                  <button
                    onClick={() => runRule(rule, false)}
                    disabled={isRunning || eligible.length === 0}
                    style={{ padding: '5px 13px', borderRadius: 7, fontSize: 12, cursor: (isRunning || eligible.length === 0) ? 'not-allowed' : 'pointer', background: (isRunning || eligible.length === 0) ? 'rgba(37,99,235,0.06)' : 'linear-gradient(135deg,#3b82f6,#1d4ed8)', border: 'none', color: (isRunning || eligible.length === 0) ? DIM : '#fff', fontWeight: 700, boxShadow: (isRunning || eligible.length === 0) ? 'none' : '0 0 12px rgba(37,99,235,0.25)' }}
                  >Send Now</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Log tab */}
      {tab === 'log' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {log.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 0', color: DIM }}>
              <p style={{ fontSize: 36, marginBottom: 12 }}>📋</p>
              <p style={{ color: MUTED, fontSize: 15, fontWeight: 600 }}>No sends yet</p>
              <p style={{ fontSize: 13 }}>Every drip message sent will be recorded here.</p>
            </div>
          ) : (
            <>
              {/* Log header */}
              <div style={{ display: 'flex', alignItems: 'center', padding: '8px 20px', background: CARD, borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 0, zIndex: 5 }}>
                {[['DATE', 170], ['CUSTOMER', 160], ['PHONE', 140], ['RULE', 160], ['STATUS', 90]].map(([h, w]) => (
                  <div key={h} style={{ width: w, minWidth: w, color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 0.5 }}>{h}</div>
                ))}
              </div>
              {log.map((e, i) => {
                const clr = e.status === 'sent' || e.status === 'dry_run' ? GREEN : e.status === 'error' ? RED : MUTED
                const statusLabel = e.status === 'dry_run' ? 'Dry Run' : e.status === 'sent' ? 'Sent' : e.status === 'error' ? 'Error' : e.status
                return (
                  <div key={e.id || i} style={{
                    display: 'flex', alignItems: 'center', padding: '9px 20px',
                    borderBottom: `1px solid rgba(30,41,59,0.4)`,
                    background: i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.3)',
                  }}>
                    <div style={{ width: 170, minWidth: 170, color: MUTED, fontSize: 12 }}>{fmtDate(e.sentAt)}</div>
                    <div style={{ width: 160, minWidth: 160, color: TEXT, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.customerName}</div>
                    <div style={{ width: 140, minWidth: 140, color: MUTED, fontSize: 12, fontFamily: 'monospace' }}>{fmtPhone(e.phone)}</div>
                    <div style={{ width: 160, minWidth: 160, color: MUTED, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.ruleName}</div>
                    <div style={{ width: 90, minWidth: 90 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `rgba(${clr === GREEN ? '34,197,94' : clr === RED ? '239,68,68' : '148,163,184'},0.1)`, border: `1px solid rgba(${clr === GREEN ? '34,197,94' : clr === RED ? '239,68,68' : '148,163,184'},0.3)`, color: clr }}>{statusLabel}</span>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <RuleModal
          rule={editRule}
          onSave={handleSaveRule}
          onClose={() => { setShowForm(false); setEditRule(null) }}
        />
      )}
      {preview && (
        <PreviewModal
          rule={preview.rule}
          eligible={preview.eligible}
          dryRun={preview.dryRun}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
