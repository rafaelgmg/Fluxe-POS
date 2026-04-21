import { useState, useMemo } from 'react'
import { loadBonusRules, saveBonusRules, nextRuleId } from '../utils/bonusStorage'
import { localDateKey } from '../utils/dateUtils'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#020817'
const PANEL  = '#0a0f1e'
const CARD   = '#0f172a'
const BORDER = '#1e293b'
const TEXT   = '#f1f5f9'
const MUTED  = '#475569'
const DIM    = '#94a3b8'
const GREEN  = '#22c55e'
const BLUE   = '#2563eb'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const PURPLE = '#8b5cf6'

const fmt$ = n => `$${Number(n || 0).toFixed(2)}`

// ── Helpers ────────────────────────────────────────────────────────────────────
const todayStr = () => localDateKey()

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

const inp = (value, onChange, extra = {}) => ({
  value,
  onChange,
  style: {
    width: '100%', padding: '8px 10px', background: BG,
    border: `1px solid ${BORDER}`, borderRadius: 4,
    color: TEXT, fontSize: 13, boxSizing: 'border-box', outline: 'none',
    ...extra,
  },
})

// ── TierEditor — inline editor for threshold/bonus tiers ────────────────────
function TierEditor({ tiers, onChange }) {
  const [editIdx, setEditIdx] = useState(null)
  const [form,    setForm]    = useState({ threshold: '', bonusAmount: '' })
  const [err,     setErr]     = useState({})
  const [addMode, setAddMode] = useState(false)

  const validate = (otherTiers) => {
    const e = {}
    const t = parseFloat(form.threshold)
    const b = parseFloat(form.bonusAmount)
    if (!form.threshold || isNaN(t) || t < 0) e.threshold = 'Enter a positive number'
    if (!form.bonusAmount || isNaN(b) || b <= 0) e.bonusAmount = 'Enter a positive amount'
    const dup = otherTiers.some(x => x.threshold === t)
    if (dup) e.threshold = 'Threshold already exists'
    setErr(e)
    return Object.keys(e).length === 0
  }

  const startEdit = (idx) => {
    setEditIdx(idx)
    setForm({ threshold: String(tiers[idx].threshold), bonusAmount: String(tiers[idx].bonusAmount) })
    setErr({})
    setAddMode(false)
  }

  const cancel = () => { setEditIdx(null); setAddMode(false); setForm({ threshold: '', bonusAmount: '' }); setErr({}) }

  const saveEdit = () => {
    const others = tiers.filter((_, i) => i !== editIdx)
    if (!validate(others)) return
    const next = tiers.map((t, i) =>
      i === editIdx ? { threshold: parseFloat(form.threshold), bonusAmount: parseFloat(form.bonusAmount) } : t
    )
    onChange(next.sort((a, b) => a.threshold - b.threshold))
    cancel()
  }

  const saveAdd = () => {
    if (!validate(tiers)) return
    const next = [...tiers, { threshold: parseFloat(form.threshold), bonusAmount: parseFloat(form.bonusAmount) }]
    onChange(next.sort((a, b) => a.threshold - b.threshold))
    cancel()
  }

  const remove = (idx) => {
    onChange(tiers.filter((_, i) => i !== idx))
  }

  const thS = { padding: '6px 10px', color: MUTED, fontWeight: 600, fontSize: 10, letterSpacing: 0.4, textAlign: 'left', borderBottom: `1px solid ${BORDER}` }
  const tdS = { padding: '7px 10px', fontSize: 12, color: DIM, borderBottom: `1px solid rgba(30,41,59,0.4)` }

  return (
    <div style={{ border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#0d1829' }}>
            <th style={thS}>Subtotal ≥</th>
            <th style={thS}>Bonus</th>
            <th style={{ ...thS, textAlign: 'right' }}>
              <button
                onClick={() => { setAddMode(true); setEditIdx(null); setForm({ threshold: '', bonusAmount: '' }); setErr({}) }}
                style={{
                  padding: '2px 8px', background: 'rgba(37,99,235,0.12)',
                  border: '1px solid rgba(37,99,235,0.4)', borderRadius: 3,
                  color: BLUE, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                }}>+ Add</button>
            </th>
          </tr>
        </thead>
        <tbody>
          {tiers.length === 0 && !addMode && (
            <tr>
              <td colSpan={3} style={{ ...tdS, textAlign: 'center', color: '#334155', padding: 16 }}>
                No tiers — click + Add
              </td>
            </tr>
          )}
          {tiers.map((tier, idx) => (
            <tr key={idx} style={{ background: editIdx === idx ? 'rgba(37,99,235,0.05)' : 'transparent' }}>
              {editIdx === idx ? (
                <>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: MUTED, fontSize: 11 }}>$</span>
                      <input {...inp(form.threshold, e => setForm(f => ({ ...f, threshold: e.target.value })))} style={{ ...inp('').style, width: 90 }} placeholder="300" />
                    </div>
                    {err.threshold && <p style={{ color: RED, fontSize: 10, marginTop: 2 }}>{err.threshold}</p>}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: MUTED, fontSize: 11 }}>$</span>
                      <input {...inp(form.bonusAmount, e => setForm(f => ({ ...f, bonusAmount: e.target.value })))} style={{ ...inp('').style, width: 80 }} placeholder="20" />
                    </div>
                    {err.bonusAmount && <p style={{ color: RED, fontSize: 10, marginTop: 2 }}>{err.bonusAmount}</p>}
                  </td>
                  <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={saveEdit} style={{ padding: '3px 8px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 3, color: GREEN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Save</button>
                      <button onClick={cancel}   style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 3, color: MUTED, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td style={tdS}><span style={{ color: AMBER, fontWeight: 700 }}>${tier.threshold.toLocaleString()}+</span></td>
                  <td style={tdS}><span style={{ color: GREEN, fontWeight: 700 }}>{fmt$(tier.bonusAmount)}</span></td>
                  <td style={{ ...tdS, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                      <button onClick={() => startEdit(idx)} style={{ padding: '2px 8px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 3, color: MUTED, fontSize: 10, cursor: 'pointer' }}>Edit</button>
                      <button onClick={() => remove(idx)}    style={{ padding: '2px 8px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 3, color: RED,  fontSize: 10, cursor: 'pointer' }}>✕</button>
                    </div>
                  </td>
                </>
              )}
            </tr>
          ))}
          {addMode && (
            <tr style={{ borderTop: `1px solid ${BORDER}`, background: 'rgba(37,99,235,0.04)' }}>
              <td style={{ padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: MUTED, fontSize: 11 }}>$</span>
                  <input {...inp(form.threshold, e => setForm(f => ({ ...f, threshold: e.target.value })))} style={{ ...inp('').style, width: 90 }} placeholder="300" autoFocus />
                </div>
                {err.threshold && <p style={{ color: RED, fontSize: 10, marginTop: 2 }}>{err.threshold}</p>}
              </td>
              <td style={{ padding: '6px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: MUTED, fontSize: 11 }}>$</span>
                  <input {...inp(form.bonusAmount, e => setForm(f => ({ ...f, bonusAmount: e.target.value })))} style={{ ...inp('').style, width: 80 }} placeholder="20" />
                </div>
                {err.bonusAmount && <p style={{ color: RED, fontSize: 10, marginTop: 2 }}>{err.bonusAmount}</p>}
              </td>
              <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                  <button onClick={saveAdd} style={{ padding: '3px 8px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 3, color: GREEN, fontSize: 10, fontWeight: 700, cursor: 'pointer' }}>Add</button>
                  <button onClick={cancel}  style={{ padding: '3px 8px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 3, color: MUTED, fontSize: 10, cursor: 'pointer' }}>Cancel</button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

// ── RuleCard — one card per rule ───────────────────────────────────────────────
function RuleCard({ rule, onSave, onDelete }) {
  const [editing,  setEditing]  = useState(false)
  const [date,     setDate]     = useState(rule.date)
  const [location, setLocation] = useState(rule.location)
  const [tiers,    setTiers]    = useState(rule.tiers || [])
  const [err,      setErr]      = useState({})
  const [confirmDel, setConfirmDel] = useState(false)

  const handleSave = () => {
    const e = {}
    if (!date)     e.date     = 'Required'
    if (!location.trim()) e.location = 'Required'
    if (tiers.length === 0) e.tiers = 'Add at least one tier'
    setErr(e)
    if (Object.keys(e).length > 0) return
    onSave({ ...rule, date, location: location.trim(), tiers })
    setEditing(false)
  }

  const handleCancel = () => {
    setDate(rule.date); setLocation(rule.location); setTiers(rule.tiers || []); setErr({}); setEditing(false)
  }

  return (
    <div style={{
      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: editing ? `1px solid ${BORDER}` : 'none',
        background: '#0d1829',
      }}>
        <div>
          {editing ? (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <label style={{ color: MUTED, fontSize: 10, display: 'block', marginBottom: 3 }}>DATE</label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  style={{ padding: '5px 8px', background: BG, border: `1px solid ${err.date ? RED : BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none' }}
                />
                {err.date && <p style={{ color: RED, fontSize: 10, marginTop: 2 }}>{err.date}</p>}
              </div>
              <div>
                <label style={{ color: MUTED, fontSize: 10, display: 'block', marginBottom: 3 }}>LOCATION</label>
                <input
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  placeholder="e.g. Miracle Mall 01"
                  style={{ padding: '5px 8px', background: BG, border: `1px solid ${err.location ? RED : BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none', width: 180 }}
                />
                {err.location && <p style={{ color: RED, fontSize: 10, marginTop: 2 }}>{err.location}</p>}
              </div>
            </div>
          ) : (
            <>
              <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>{fmtDate(rule.date)}</p>
              <p style={{ color: BLUE, fontSize: 11, marginTop: 2 }}>📍 {rule.location}</p>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {editing ? (
            <>
              <button onClick={handleSave} style={{ padding: '5px 12px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4, color: GREEN, fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Save</button>
              <button onClick={handleCancel} style={{ padding: '5px 12px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 11, cursor: 'pointer' }}>Edit</button>
              {confirmDel ? (
                <>
                  <button onClick={() => onDelete(rule.id)} style={{ padding: '4px 10px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4, color: '#fca5a5', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirm Delete</button>
                  <button onClick={() => setConfirmDel(false)} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                </>
              ) : (
                <button onClick={() => setConfirmDel(true)} style={{ padding: '4px 10px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: RED, fontSize: 11, cursor: 'pointer' }}>Delete</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tier table */}
      <div style={{ padding: 16 }}>
        {err.tiers && <p style={{ color: RED, fontSize: 10, marginBottom: 6 }}>{err.tiers}</p>}
        {editing ? (
          <TierEditor tiers={tiers} onChange={setTiers} />
        ) : (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {rule.tiers.map((t, i) => (
              <div key={i} style={{
                padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)',
              }}>
                <span style={{ color: MUTED }}>${t.threshold}+ → </span>
                <span style={{ color: GREEN }}>{fmt$(t.bonusAmount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function BonusRulesScreen({ onBack }) {
  const [rules,   setRules]   = useState(loadBonusRules)
  const [adding,  setAdding]  = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [search,  setSearch]  = useState('')

  // New rule form state
  const [newDate,     setNewDate]     = useState(todayStr)
  const [newLocation, setNewLocation] = useState('')
  const [newTiers,    setNewTiers]    = useState([])
  const [newErr,      setNewErr]      = useState({})

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1800) }

  const persist = (next) => {
    saveBonusRules(next)
    setRules(next)
    flash()
  }

  const handleSaveRule = (updated) => {
    const next = rules.map(r => r.id === updated.id ? updated : r)
    persist(next)
  }

  const handleDeleteRule = (id) => {
    persist(rules.filter(r => r.id !== id))
  }

  const handleAddRule = () => {
    const e = {}
    if (!newDate)          e.date     = 'Required'
    if (!newLocation.trim()) e.location = 'Required'
    if (newTiers.length === 0) e.tiers = 'Add at least one tier'
    setNewErr(e)
    if (Object.keys(e).length > 0) return

    // Warn if rule already exists for date+location
    const dup = rules.find(r => r.date === newDate && r.location === newLocation.trim())
    if (dup) { setNewErr({ location: 'Rule already exists for this date + location' }); return }

    const next = [...rules, { id: nextRuleId(rules), date: newDate, location: newLocation.trim(), tiers: newTiers }]
    persist(next)
    setAdding(false)
    setNewDate(todayStr())
    setNewLocation('')
    setNewTiers([])
    setNewErr({})
  }

  // Group by date descending for display
  const grouped = useMemo(() => {
    let filtered = rules
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = rules.filter(r =>
        r.date.includes(q) || r.location.toLowerCase().includes(q)
      )
    }
    const dates = [...new Set(filtered.map(r => r.date))].sort((a, b) => b.localeCompare(a))
    return dates.map(d => ({ date: d, rules: filtered.filter(r => r.date === d) }))
  }, [rules, search])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: BG, overflow: 'hidden' }}>

      {/* Sub-header */}
      <div style={{
        padding: '10px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>←</button>
        <span style={{ color: AMBER, fontWeight: 700, fontSize: 13 }}>💰 Users</span>
        <span style={{ color: MUTED, fontSize: 11 }}>Daily Bonus Rules</span>
        {saved && (
          <span style={{ padding: '2px 10px', borderRadius: 12, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: GREEN, fontSize: 11, fontWeight: 700 }}>✓ Saved</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search date or location..."
            style={{ padding: '5px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none', width: 200 }}
          />
          <button
            onClick={() => setAdding(true)}
            style={{ padding: '6px 14px', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 4, color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >+ New Rule</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Explainer */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${AMBER}`, borderRadius: 8, padding: '14px 18px' }}>
          <p style={{ color: DIM, fontSize: 12, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>HOW DAILY BONUS RULES WORK</p>
          <ul style={{ color: MUTED, fontSize: 12, paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
            <li>Each rule applies to a specific <strong style={{ color: DIM }}>date + location</strong>.</li>
            <li>If no rule exists for a day/location, <strong style={{ color: DIM }}>autoBonus = $0</strong>.</li>
            <li>The system picks the <strong style={{ color: DIM }}>highest tier reached</strong> by the seller's day subtotal.</li>
            <li>Manual adjustments (set in the seller's User Report) are added on top.</li>
            <li><strong style={{ color: DIM }}>finalDailyPay = max(hourlyPay, commission) + autoBonus + manualBonus</strong></li>
          </ul>
        </div>

        {/* Add new rule form */}
        {adding && (
          <div style={{ background: CARD, border: `1px solid ${BLUE}`, borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'rgba(37,99,235,0.06)', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ color: BLUE, fontWeight: 700, fontSize: 13 }}>New Bonus Rule</span>
              <button onClick={() => { setAdding(false); setNewErr({}) }} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 4 }}>DATE</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={e => setNewDate(e.target.value)}
                    style={{ padding: '7px 10px', background: BG, border: `1px solid ${newErr.date ? RED : BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  {newErr.date && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{newErr.date}</p>}
                </div>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 4 }}>LOCATION</label>
                  <input
                    value={newLocation}
                    onChange={e => setNewLocation(e.target.value)}
                    placeholder="e.g. Miracle Mall 01"
                    style={{ padding: '7px 10px', background: BG, border: `1px solid ${newErr.location ? RED : BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                  />
                  {newErr.location && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{newErr.location}</p>}
                </div>
              </div>
              <div>
                <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 6 }}>BONUS TIERS</label>
                {newErr.tiers && <p style={{ color: RED, fontSize: 10, marginBottom: 4 }}>{newErr.tiers}</p>}
                <TierEditor tiers={newTiers} onChange={setNewTiers} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleAddRule} style={{ padding: '8px 20px', background: BLUE, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Create Rule</button>
                <button onClick={() => { setAdding(false); setNewErr({}) }} style={{ padding: '8px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Rules grouped by date */}
        {grouped.length === 0 && !adding && (
          <div style={{ textAlign: 'center', padding: 60, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8 }}>
            <p style={{ color: TEXT, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No bonus rules yet</p>
            <p style={{ color: MUTED, fontSize: 12, marginBottom: 20 }}>Create rules per date and location to unlock automatic daily bonuses.</p>
            <button onClick={() => setAdding(true)} style={{ padding: '8px 20px', background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.4)', borderRadius: 6, color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>+ New Rule</button>
          </div>
        )}

        {grouped.map(group => (
          <div key={group.date}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ color: AMBER, fontWeight: 700, fontSize: 12 }}>{fmtDate(group.date)}</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ color: MUTED, fontSize: 11 }}>{group.rules.length} location{group.rules.length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {group.rules.map(rule => (
                <RuleCard
                  key={rule.id}
                  rule={rule}
                  onSave={handleSaveRule}
                  onDelete={handleDeleteRule}
                />
              ))}
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
