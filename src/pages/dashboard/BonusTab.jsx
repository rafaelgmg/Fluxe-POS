/**
 * BonusTab — configuração de Daily Bonus Rules pelo celular (Dashboard).
 */

import { useState, useEffect } from 'react'
import { RETAIL_LOCATIONS }    from '../../config/branding'
import { saveBonusRules }      from '../../utils/bonusStorage'
import {
  fetchBonusRules, createBonusRule, updateBonusRule, deleteBonusRule,
} from '../../services/supabaseBonusRules'

const LOC_NAMES = RETAIL_LOCATIONS.map(l => l.name)

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', sub: '#374151', muted: '#6B7280', dim: '#9CA3AF',
  green: '#10B981', blue: '#3B82F6', amber: '#F59E0B', red: '#EF4444',
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(s) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

const fmt$ = n => `$${Number(n || 0).toFixed(2)}`

// ── Tier display row ───────────────────────────────────────────────────────────
function TierRow({ tier, onDelete }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `1px solid ${C.border}` }}>
      <div style={{ flex: 1, fontSize: 14 }}>
        <span style={{ color: C.muted, fontSize: 12 }}>Sales ≥ </span>
        <span style={{ fontWeight: 700, color: C.amber }}>${tier.threshold.toLocaleString()}</span>
        <span style={{ color: C.muted, fontSize: 12 }}> → </span>
        <span style={{ fontWeight: 700, color: C.green }}>{fmt$(tier.bonusAmount)}</span>
      </div>
      <button
        onClick={onDelete}
        style={{ padding: '5px 12px', borderRadius: 8, border: `1px solid ${C.red}30`, background: `${C.red}0D`, color: C.red, fontSize: 12, cursor: 'pointer' }}
      >Remove</button>
    </div>
  )
}

// ── Tier add row (shared by both forms) ───────────────────────────────────────
function AddTierRow({ onAdd }) {
  const [threshold, setThreshold] = useState('')
  const [bonus,     setBonus]     = useState('')

  const add = () => {
    const t = parseFloat(threshold)
    const b = parseFloat(bonus)
    if (isNaN(t) || isNaN(b) || t < 0 || b <= 0) return
    onAdd({ threshold: t, bonusAmount: b })
    setThreshold('')
    setBonus('')
  }

  const inp = (val, set, ph) => ({
    type: 'number', placeholder: ph, value: val,
    onChange: e => set(e.target.value),
    onKeyDown: e => e.key === 'Enter' && add(),
    style: {
      width: '100%', padding: '9px 9px 9px 24px',
      borderRadius: 10, border: `1px solid ${C.border}`,
      fontSize: 14, color: C.text, background: C.bg, outline: 'none',
    },
  })

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
      <div style={{ flex: 1, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13 }}>$</span>
        <input {...inp(threshold, setThreshold, 'Min sales')} />
      </div>
      <div style={{ flex: 1, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: C.muted, fontSize: 13 }}>$</span>
        <input {...inp(bonus, setBonus, 'Bonus')} />
      </div>
      <button onClick={add} style={{ padding: '9px 16px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>+</button>
    </div>
  )
}

// ── Rule card (view + edit) ────────────────────────────────────────────────────
function RuleCard({ rule, onSave, onDelete }) {
  const [editing,    setEditing]    = useState(false)
  const [date,       setDate]       = useState(rule.date)
  const [loc,        setLoc]        = useState(rule.location)
  const [tiers,      setTiers]      = useState(rule.tiers || [])
  const [saving,     setSaving]     = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const addTier = ({ threshold, bonusAmount }) => {
    if (tiers.some(x => x.threshold === threshold)) return
    setTiers(prev => [...prev, { threshold, bonusAmount }].sort((a, b) => a.threshold - b.threshold))
  }

  const save = async () => {
    if (tiers.length === 0) return
    setSaving(true)
    const result = await onSave({ ...rule, date, location: loc, tiers })
    setSaving(false)
    if (result) setEditing(false)
  }

  const cancel = () => {
    setDate(rule.date); setLoc(rule.location); setTiers(rule.tiers || [])
    setEditing(false); setConfirmDel(false)
  }

  // ── View mode ────────────────────────────────────────────────────────────────
  if (!editing) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{fmtDate(rule.date)}</div>
            <div style={{ fontSize: 12, color: C.blue, marginTop: 2 }}>📍 {rule.location}</div>
          </div>
          <button onClick={() => setEditing(true)} style={{ padding: '7px 16px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
        </div>
        <div style={{ padding: '0 16px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {rule.tiers.map((t, i) => (
            <span key={i} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, background: `${C.amber}12`, border: `1px solid ${C.amber}30` }}>
              ${t.threshold.toLocaleString()}+ → <span style={{ color: C.green }}>{fmt$(t.bonusAmount)}</span>
            </span>
          ))}
        </div>
      </div>
    )
  }

  // ── Edit mode ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.blue}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px rgba(59,130,246,0.10)' }}>
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 4 }}>DATE</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: 'none' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 4 }}>LOCATION</div>
          <select value={loc} onChange={e => setLoc(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: 'none' }}>
            {LOC_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 8 }}>BONUS TIERS</div>
        {tiers.length === 0 && <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>Add a tier below</div>}
        {tiers.map((t, i) => (
          <TierRow key={i} tier={t} onDelete={() => setTiers(prev => prev.filter((_, j) => j !== i))} />
        ))}
        <AddTierRow onAdd={addTier} />
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', gap: 8 }}>
        <button
          onClick={save} disabled={saving || tiers.length === 0}
          style={{ flex: 1, padding: '12px 0', borderRadius: 12, border: 'none', background: saving || tiers.length === 0 ? C.border : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving || tiers.length === 0 ? 'default' : 'pointer' }}
        >{saving ? 'Saving…' : 'Save'}</button>
        <button onClick={cancel} style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
        {!confirmDel
          ? <button onClick={() => setConfirmDel(true)} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.red}30`, background: `${C.red}0A`, color: C.red, fontSize: 16, cursor: 'pointer' }}>🗑</button>
          : <button onClick={() => onDelete(rule.id)} style={{ padding: '12px 12px', borderRadius: 12, border: `1px solid ${C.red}`, background: `${C.red}15`, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Confirm?</button>
        }
      </div>
    </div>
  )
}

// ── New Rule form ──────────────────────────────────────────────────────────────
function NewRuleForm({ rules, onCreate, onCancel }) {
  const [date,  setDate]  = useState(todayStr())
  const [loc,   setLoc]   = useState(LOC_NAMES[0] || '')
  const [tiers, setTiers] = useState([])
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const addTier = ({ threshold, bonusAmount }) => {
    if (tiers.some(x => x.threshold === threshold)) return
    setTiers(prev => [...prev, { threshold, bonusAmount }].sort((a, b) => a.threshold - b.threshold))
  }

  const save = async () => {
    if (!date)            { setErr('Select a date'); return }
    if (tiers.length === 0) { setErr('Add at least one tier'); return }
    if (rules.find(r => r.date === date && r.location === loc)) {
      setErr('Rule already exists for this date + location')
      return
    }
    setErr('')
    setSaving(true)
    const ok = await onCreate({ date, location: loc, tiers })
    setSaving(false)
    if (!ok) setErr('Failed — check your connection')
  }

  return (
    <div style={{ background: C.card, border: `1.5px solid ${C.blue}`, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(59,130,246,0.12)' }}>
      <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.blue }}>New Bonus Rule</span>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: C.muted, fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ padding: '12px 16px', display: 'flex', gap: 10, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 4 }}>DATE</div>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: 'none' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 4 }}>LOCATION</div>
          <select value={loc} onChange={e => setLoc(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 14, color: C.text, background: C.bg, outline: 'none' }}>
            {LOC_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 8 }}>BONUS TIERS</div>
        {tiers.length === 0 && <div style={{ fontSize: 12, color: C.dim, marginBottom: 4 }}>Add tiers below</div>}
        {tiers.map((t, i) => (
          <TierRow key={i} tier={t} onDelete={() => setTiers(prev => prev.filter((_, j) => j !== i))} />
        ))}
        <AddTierRow onAdd={addTier} />
      </div>

      {err && <div style={{ padding: '8px 16px', fontSize: 12, color: C.red, fontWeight: 600 }}>{err}</div>}

      <div style={{ padding: '12px 16px' }}>
        <button
          onClick={save} disabled={saving}
          style={{ width: '100%', padding: '14px 0', borderRadius: 12, border: 'none', background: saving ? C.border : C.blue, color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer' }}
        >{saving ? 'Creating…' : 'Create Rule'}</button>
      </div>
    </div>
  )
}

// ── BonusTab ──────────────────────────────────────────────────────────────────
export default function BonusTab() {
  const [rules,   setRules]   = useState([])
  const [loading, setLoading] = useState(true)
  const [adding,  setAdding]  = useState(false)
  const [toast,   setToast]   = useState(null)

  const showToast = (msg, color = C.green) => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 2500)
  }

  useEffect(() => {
    fetchBonusRules().then(fresh => {
      if (fresh) setRules(fresh)
      setLoading(false)
    })
  }, [])

  const syncCache = next => saveBonusRules(next)

  const handleCreate = async ({ date, location, tiers }) => {
    const result = await createBonusRule({ date, location, tiers })
    if (!result) { showToast('Failed to create', C.red); return null }
    const next = [result, ...rules].sort((a, b) => b.date.localeCompare(a.date))
    setRules(next)
    syncCache(next)
    showToast('Rule created ✓')
    setAdding(false)
    return result
  }

  const handleSave = async (updated) => {
    const result = await updateBonusRule(updated)
    if (!result) { showToast('Failed to save', C.red); return null }
    const next = rules.map(r => r.id === result.id ? result : r)
    setRules(next)
    syncCache(next)
    showToast('Saved ✓')
    return result
  }

  const handleDelete = async (id) => {
    const ok = await deleteBonusRule(id)
    if (!ok) { showToast('Failed to delete', C.red); return }
    const next = rules.filter(r => r.id !== id)
    setRules(next)
    syncCache(next)
    showToast('Deleted', C.amber)
  }

  // Group by date descending
  const grouped = Object.values(
    rules.reduce((acc, r) => {
      if (!acc[r.date]) acc[r.date] = { date: r.date, rules: [] }
      acc[r.date].rules.push(r)
      return acc
    }, {})
  ).sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      padding: '16px 16px env(safe-area-inset-bottom, 20px)',
      display: 'flex', flexDirection: 'column', gap: 14,
      background: C.bg,
    }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.color, color: '#fff',
          padding: '10px 22px', borderRadius: 20,
          fontSize: 13, fontWeight: 700, zIndex: 999,
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          whiteSpace: 'nowrap',
        }}>{toast.msg}</div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: 0 }}>Daily Bonus Rules</h2>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>Per date + location</p>
        </div>
        <button
          onClick={() => setAdding(v => !v)}
          style={{
            padding: '9px 18px', borderRadius: 12, border: 'none',
            background: adding ? C.border : C.blue,
            color: adding ? C.muted : '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}
        >{adding ? 'Cancel' : '+ New'}</button>
      </div>

      {/* Info */}
      <div style={{ background: `${C.amber}12`, border: `1px solid ${C.amber}35`, borderRadius: 14, padding: '11px 14px' }}>
        <p style={{ fontSize: 12, color: C.sub, margin: 0, lineHeight: 1.7 }}>
          The seller's daily subtotal unlocks the <strong>highest tier reached</strong>. No rule = $0 auto-bonus.
        </p>
      </div>

      {/* New rule form */}
      {adding && (
        <NewRuleForm rules={rules} onCreate={handleCreate} onCancel={() => setAdding(false)} />
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: C.muted, fontSize: 14 }}>Loading…</div>
      )}

      {/* Empty state */}
      {!loading && rules.length === 0 && !adding && (
        <div style={{ textAlign: 'center', padding: '48px 20px', background: C.card, borderRadius: 16, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>💰</div>
          <p style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>No bonus rules yet</p>
          <p style={{ fontSize: 13, color: C.muted }}>Tap "+ New" to create your first rule.</p>
        </div>
      )}

      {/* Rules grouped by date */}
      {grouped.map(group => (
        <div key={group.date}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>
            {fmtDate(group.date)}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {group.rules.map(rule => (
              <RuleCard key={rule.id} rule={rule} onSave={handleSave} onDelete={handleDelete} />
            ))}
          </div>
        </div>
      ))}

    </div>
  )
}
