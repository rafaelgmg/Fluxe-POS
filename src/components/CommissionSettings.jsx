import { useState } from 'react'
import {
  loadCommissionTiers, saveCommissionTiers,
  nextTierId, DEFAULT_TIERS,
  loadSpareRate, saveSpareRate, DEFAULT_SPARE_RATE,
} from '../utils/commissionTiersStorage'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const TEXT   = 'var(--c-text)'
const MUTED  = 'var(--c-text-muted)'
const DIM    = 'var(--c-text-sub)'
const GREEN  = '#22c55e'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const PURPLE = '#8b5cf6'
const RED    = '#ef4444'
const GOLD   = '#f59e0b'

const fmt$ = (n) => `$${Number(n || 0).toFixed(2)}`

// ── Tier color by rate value ───────────────────────────────────────────────────
function tierColor(rate) {
  if (rate >= 30) return PURPLE
  if (rate >= 25) return BLUE
  if (rate >= 20) return GREEN
  return MUTED
}

export default function CommissionSettings({ onBack }) {
  const [tiers, setTiers]       = useState(loadCommissionTiers)
  const [editId, setEditId]     = useState(null)   // id of tier being edited
  const [addMode, setAddMode]   = useState(false)
  const [saved, setSaved]       = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  // Spare rate state
  const [spareRate, setSpareRate]       = useState(() => String(loadSpareRate()))
  const [spareRateEdit, setSpareRateEdit] = useState(false)
  const [spareRateErr, setSpareRateErr]   = useState('')

  // Form state for editing / adding
  const emptyForm = { threshold: '', rate: '' }
  const [form, setForm]     = useState(emptyForm)
  const [formErr, setFormErr] = useState({})

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const persist = (next) => {
    saveCommissionTiers(next)
    setTiers(next.sort((a, b) => b.threshold - a.threshold))
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const validateForm = (otherTiers) => {
    const e = {}
    const thresh = parseFloat(form.threshold)
    const rate   = parseFloat(form.rate)

    if (!form.threshold || isNaN(thresh) || thresh <= 0)
      e.threshold = 'Enter a positive number'
    if (!form.rate || isNaN(rate) || rate <= 0 || rate > 100)
      e.rate = 'Enter a % between 1 and 100'

    const dupThreshold = otherTiers.some(t => t.threshold === thresh)
    if (dupThreshold) e.threshold = 'This threshold already exists'

    setFormErr(e)
    return Object.keys(e).length === 0
  }

  const startEdit = (tier) => {
    setEditId(tier.id)
    setForm({ threshold: String(tier.threshold), rate: String(tier.rate) })
    setFormErr({})
    setAddMode(false)
  }

  const cancelEdit = () => {
    setEditId(null)
    setAddMode(false)
    setForm(emptyForm)
    setFormErr({})
  }

  const handleSaveEdit = () => {
    const others = tiers.filter(t => t.id !== editId)
    if (!validateForm(others)) return
    const next = tiers.map(t =>
      t.id === editId
        ? { ...t, threshold: parseFloat(form.threshold), rate: parseFloat(form.rate) }
        : t
    )
    persist(next)
    cancelEdit()
  }

  const handleAddSave = () => {
    if (!validateForm(tiers)) return
    const next = [
      ...tiers,
      { id: nextTierId(tiers), threshold: parseFloat(form.threshold), rate: parseFloat(form.rate) },
    ]
    persist(next)
    cancelEdit()
  }

  const handleDelete = (id) => {
    const next = tiers.filter(t => t.id !== id)
    persist(next)
    setDeleteId(null)
  }

  const handleReset = () => {
    persist([...DEFAULT_TIERS])
  }

  const handleSaveSpareRate = () => {
    const val = parseFloat(spareRate)
    if (isNaN(val) || val < 0 || val > 100) {
      setSpareRateErr('Enter a % between 0 and 100')
      return
    }
    saveSpareRate(val)
    setSpareRate(String(val))
    setSpareRateEdit(false)
    setSpareRateErr('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  const handleCancelSpareRate = () => {
    setSpareRate(String(loadSpareRate()))
    setSpareRateEdit(false)
    setSpareRateErr('')
  }

  // ── Shared input style ────────────────────────────────────────────────────────
  const inp = (key, placeholder) => ({
    value: form[key],
    onChange: e => setForm(f => ({ ...f, [key]: e.target.value })),
    placeholder,
    style: {
      width: '100%', padding: '8px 10px', background: BG,
      border: `1px solid ${formErr[key] ? RED : BORDER}`,
      borderRadius: 4, color: TEXT, fontSize: 13, boxSizing: 'border-box', outline: 'none',
    },
  })

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', background: BG,
      overflow: 'hidden',
    }}>

      {/* Sub-header */}
      <div style={{
        padding: '10px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: MUTED,
          fontSize: 18, cursor: 'pointer', paddingRight: 4, lineHeight: 1,
        }}>←</button>
        <span style={{ color: GOLD, fontWeight: 700, fontSize: 13 }}>💰 Users</span>
        <span style={{ color: MUTED, fontSize: 11 }}>Commission Settings</span>
        {saved && (
          <span style={{
            marginLeft: 8, padding: '2px 10px', borderRadius: 12,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            color: GREEN, fontSize: 11, fontWeight: 700,
          }}>✓ Saved</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setAddMode(true); setEditId(null); setForm(emptyForm); setFormErr({}) }}
            style={{
              padding: '6px 14px', background: 'rgba(37,99,235,0.12)',
              border: '1px solid rgba(37,99,235,0.4)', borderRadius: 4,
              color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}
          >+ Add Tier</button>
          <button
            onClick={handleReset}
            style={{
              padding: '6px 14px', background: 'transparent',
              border: `1px solid ${BORDER}`, borderRadius: 4,
              color: MUTED, fontSize: 12, cursor: 'pointer',
            }}
            title="Reset to default tiers"
          >Reset Defaults</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Explainer card */}
        <div style={{
          background: CARD, border: `1px solid ${BORDER}`, borderLeft: `3px solid ${BLUE}`,
          borderRadius: 8, padding: '14px 18px',
        }}>
          <p style={{ color: DIM, fontSize: 12, fontWeight: 700, marginBottom: 6, letterSpacing: 0.3 }}>
            HOW DAILY TIERS WORK
          </p>
          <ul style={{ color: MUTED, fontSize: 12, paddingLeft: 18, lineHeight: 1.8, margin: 0 }}>
            <li>Commission unlocks only when the seller reaches the first threshold ($) on a given day.</li>
            <li>Tiers are <strong style={{ color: DIM }}>retroactive</strong>: if the seller ends the day at a higher tier, that rate applies to all eligible items sold that day.</li>
            <li>Categories set to <strong style={{ color: DIM }}>New Collection (day tier%)</strong> use the rate from the table below.</li>
            <li>Categories set to <strong style={{ color: DIM }}>fixed % types</strong> (Brands, Spare) are still gated by the $600 minimum but use their own fixed rate.</li>
          </ul>
        </div>

        {/* Tier table */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: BG }}>
                {['Daily Subtotal (min)', 'Commission Rate', 'Example: $800 day', ''].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left', color: MUTED,
                    fontWeight: 600, fontSize: 10, letterSpacing: 0.5,
                    borderBottom: `1px solid ${BORDER}`,
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>

              {/* "Below threshold" always shown as first row */}
              <tr style={{ borderBottom: `1px solid rgba(30,41,59,0.4)` }}>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ color: RED, fontWeight: 700, fontSize: 13 }}>
                    Below ${tiers.length > 0 ? Math.min(...tiers.map(t => t.threshold)) : 600}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: RED,
                  }}>No commission</span>
                </td>
                <td style={{ padding: '12px 16px', color: MUTED, fontSize: 12 }}>—</td>
                <td style={{ padding: '12px 16px' }} />
              </tr>

              {tiers.map((tier, i) => {
                const color  = tierColor(tier.rate)
                const isEdit = editId === tier.id
                const example800 = tier.threshold <= 800 ? fmt$(800 * tier.rate / 100) : '—'

                return (
                  <tr key={tier.id} style={{
                    borderBottom: `1px solid rgba(30,41,59,0.4)`,
                    background: isEdit ? 'rgba(37,99,235,0.05)' : i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.3)',
                  }}>
                    {isEdit ? (
                      <>
                        {/* Edit row */}
                        <td style={{ padding: '10px 16px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ color: MUTED, fontSize: 12 }}>$</span>
                              <input {...inp('threshold', '600')} style={{ ...inp('threshold', '600').style, width: 120 }} />
                            </div>
                            {formErr.threshold && (
                              <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{formErr.threshold}</p>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <input {...inp('rate', '20')} style={{ ...inp('rate', '20').style, width: 80 }} />
                              <span style={{ color: MUTED, fontSize: 12 }}>%</span>
                            </div>
                            {formErr.rate && (
                              <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{formErr.rate}</p>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px', color: MUTED, fontSize: 12 }}>—</td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={handleSaveEdit} style={{
                              padding: '5px 12px', background: 'rgba(34,197,94,0.12)',
                              border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4,
                              color: GREEN, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                            }}>Save</button>
                            <button onClick={cancelEdit} style={{
                              padding: '5px 12px', background: 'transparent',
                              border: `1px solid ${BORDER}`, borderRadius: 4,
                              color: MUTED, fontSize: 11, cursor: 'pointer',
                            }}>Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        {/* Display row */}
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{ color: color, fontWeight: 700, fontSize: 15 }}>
                            ${tier.threshold.toLocaleString()}+
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span style={{
                            padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 800,
                            background: `${color}18`, border: `1px solid ${color}40`, color,
                          }}>{tier.rate}%</span>
                        </td>
                        <td style={{ padding: '12px 16px', color: DIM, fontSize: 12 }}>
                          {example800}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button onClick={() => startEdit(tier)} style={{
                              padding: '4px 10px', background: 'transparent',
                              border: `1px solid ${BORDER}`, borderRadius: 4,
                              color: MUTED, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
                            }}
                              onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = BLUE }}
                              onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
                            >Edit</button>
                            {deleteId === tier.id ? (
                              <>
                                <button onClick={() => handleDelete(tier.id)} style={{
                                  padding: '4px 10px', background: 'rgba(239,68,68,0.15)',
                                  border: '1px solid rgba(239,68,68,0.4)', borderRadius: 4,
                                  color: '#fca5a5', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                }}>Confirm</button>
                                <button onClick={() => setDeleteId(null)} style={{
                                  padding: '4px 10px', background: 'transparent',
                                  border: `1px solid ${BORDER}`, borderRadius: 4,
                                  color: MUTED, fontSize: 11, cursor: 'pointer',
                                }}>Cancel</button>
                              </>
                            ) : (
                              <button onClick={() => setDeleteId(tier.id)} style={{
                                padding: '4px 10px', background: 'transparent',
                                border: `1px solid ${BORDER}`, borderRadius: 4,
                                color: MUTED, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
                              }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
                              >Delete</button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                )
              })}

              {/* Add row */}
              {addMode && (
                <tr style={{ borderTop: `1px solid ${BORDER}`, background: 'rgba(37,99,235,0.04)' }}>
                  <td style={{ padding: '10px 16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ color: MUTED, fontSize: 12 }}>$</span>
                        <input {...inp('threshold', '600')} style={{ ...inp('threshold', '600').style, width: 120 }} />
                      </div>
                      {formErr.threshold && (
                        <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{formErr.threshold}</p>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <input {...inp('rate', '20')} style={{ ...inp('rate', '20').style, width: 80 }} />
                        <span style={{ color: MUTED, fontSize: 12 }}>%</span>
                      </div>
                      {formErr.rate && (
                        <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{formErr.rate}</p>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: '10px 16px', color: MUTED, fontSize: 12 }}>—</td>
                  <td style={{ padding: '10px 16px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={handleAddSave} style={{
                        padding: '5px 12px', background: 'rgba(34,197,94,0.12)',
                        border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4,
                        color: GREEN, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}>Add</button>
                      <button onClick={cancelEdit} style={{
                        padding: '5px 12px', background: 'transparent',
                        border: `1px solid ${BORDER}`, borderRadius: 4,
                        color: MUTED, fontSize: 11, cursor: 'pointer',
                      }}>Cancel</button>
                    </div>
                  </td>
                </tr>
              )}

            </tbody>
          </table>
        </div>

        {/* Spare Rate section */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            padding: '10px 16px', background: BG,
            borderBottom: `1px solid ${BORDER}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ color: MUTED, fontWeight: 600, fontSize: 10, letterSpacing: 0.5 }}>
                NC SPARE COMMISSION RATE
              </span>
              <p style={{ color: DIM, fontSize: 11, margin: '2px 0 0' }}>
                Applied to spare generated on New Collection sales (fixed %, regardless of day tier)
              </p>
            </div>
            {!spareRateEdit && (
              <button
                onClick={() => setSpareRateEdit(true)}
                style={{
                  padding: '5px 12px', background: 'transparent',
                  border: `1px solid ${BORDER}`, borderRadius: 4,
                  color: MUTED, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = BLUE }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
              >Edit</button>
            )}
          </div>

          <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {spareRateEdit ? (
              <>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input
                      value={spareRate}
                      onChange={e => { setSpareRate(e.target.value); setSpareRateErr('') }}
                      placeholder="30"
                      autoFocus
                      style={{
                        width: 80, padding: '8px 10px', background: BG,
                        border: `1px solid ${spareRateErr ? RED : BORDER}`,
                        borderRadius: 4, color: TEXT, fontSize: 14, outline: 'none',
                      }}
                    />
                    <span style={{ color: MUTED, fontSize: 14 }}>%</span>
                  </div>
                  {spareRateErr && (
                    <p style={{ color: RED, fontSize: 10, marginTop: 4 }}>{spareRateErr}</p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSaveSpareRate} style={{
                    padding: '6px 14px', background: 'rgba(34,197,94,0.12)',
                    border: '1px solid rgba(34,197,94,0.3)', borderRadius: 4,
                    color: GREEN, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}>Save</button>
                  <button onClick={handleCancelSpareRate} style={{
                    padding: '6px 14px', background: 'transparent',
                    border: `1px solid ${BORDER}`, borderRadius: 4,
                    color: MUTED, fontSize: 12, cursor: 'pointer',
                  }}>Cancel</button>
                </div>
              </>
            ) : (
              <>
                <span style={{
                  padding: '6px 18px', borderRadius: 12, fontSize: 18, fontWeight: 800,
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                  color: AMBER,
                }}>{spareRate}%</span>
                <span style={{ color: MUTED, fontSize: 12 }}>
                  Example: spare $100 → commission {fmt$(parseFloat(spareRate || 0))}
                </span>
                {parseFloat(spareRate) === DEFAULT_SPARE_RATE && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600,
                    background: 'rgba(71,85,105,0.2)', border: `1px solid ${BORDER}`, color: MUTED,
                  }}>default</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Empty state */}
        {tiers.length === 0 && !addMode && (
          <div style={{
            textAlign: 'center', padding: 40,
            background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
          }}>
            <p style={{ color: TEXT, fontSize: 14, fontWeight: 600, marginBottom: 6 }}>No tiers configured</p>
            <p style={{ color: MUTED, fontSize: 12, marginBottom: 16 }}>
              Without tiers, no commission will be calculated for New Collection items.
            </p>
            <button onClick={handleReset} style={{
              padding: '8px 18px', background: 'rgba(37,99,235,0.12)',
              border: '1px solid rgba(37,99,235,0.4)', borderRadius: 6,
              color: BLUE, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>Restore Default Tiers</button>
          </div>
        )}

      </div>
    </div>
  )
}
