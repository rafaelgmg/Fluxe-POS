/**
 * CategoriesScreen.jsx
 * Admin → Products → Categories
 * Full CRUD for product categories with persistence.
 */

import { useState, useMemo } from 'react'
import {
  loadCategories,
  saveCategories,
  nextCategoryId,
  COMMISSION_TYPES,
} from '../utils/categoriesStorage'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const MUTED  = '#64748b'
const DIM    = '#a8b8cc'
const TEXT   = '#f1f5f9'
const PURPLE = '#8b5cf6'

// ── Shared input style ─────────────────────────────────────────────────────────
const inputStyle = (err) => ({
  width: '100%', padding: '8px 10px', background: CARD,
  border: `1px solid ${err ? RED : BORDER}`, borderRadius: 6,
  color: TEXT, fontSize: 13, outline: 'none', boxSizing: 'border-box',
})

// ── Edit Panel ─────────────────────────────────────────────────────────────────
function EditPanel({ cat, onSave, onClose }) {
  const [name,           setName]           = useState(cat.name)
  const [status,         setStatus]         = useState(cat.status)
  const [commissionRate,          setCommissionRate]          = useState(cat.commissionRate ?? '')
  const [commissionType,          setCommissionType]          = useState(cat.commissionType ?? null)
  const [spareCommissionEnabled,  setSpareCommissionEnabled]  = useState(cat.spareCommissionEnabled ?? false)
  const [notes,                   setNotes]                   = useState(cat.notes ?? '')
  const [nameErr,                 setNameErr]                 = useState(false)

  // tier_nc doesn't use a rate — it reads from the day tier table
  const rateRequired = commissionType && commissionType !== 'none' && commissionType !== 'tier_nc'
  // spare split toggle only makes sense for pct_subtotal
  const showSpareSplit = commissionType === 'pct_subtotal'

  const handleSave = () => {
    if (!name.trim()) { setNameErr(true); return }
    onSave({
      ...cat,
      name:                  name.trim(),
      status,
      commissionRate:        rateRequired && commissionRate !== '' ? parseFloat(commissionRate) : null,
      commissionType:        commissionType || null,
      spareCommissionEnabled: showSpareSplit ? spareCommissionEnabled : false,
      notes:                 notes.trim(),
    })
  }

  const lbl = (text, dim) => (
    <label style={{ color: dim ? '#415569' : MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>
      {text}
    </label>
  )

  return (
    <div style={{
      width: 300, flexShrink: 0,
      background: PANEL, borderLeft: `1px solid ${BORDER}`,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 18px', borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>
            {cat.id ? 'Edit Category' : 'New Category'}
          </p>
          {cat.id && <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>ID #{cat.id}</p>}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: `1px solid ${BORDER}`, borderRadius: 5,
          color: MUTED, fontSize: 16, cursor: 'pointer', width: 26, height: 26,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>×</button>
      </div>

      {/* Form */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 18px' }}>

        {/* Name */}
        <div style={{ marginBottom: 14 }}>
          {lbl('CATEGORY NAME')}
          <input
            value={name}
            onChange={e => { setName(e.target.value); setNameErr(false) }}
            placeholder="e.g. Men's Brands"
            autoFocus
            style={inputStyle(nameErr)}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = nameErr ? RED : BORDER }}
          />
          {nameErr && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>Name is required</p>}
        </div>

        {/* Status */}
        <div style={{ marginBottom: 14 }}>
          {lbl('STATUS')}
          <div style={{ display: 'flex', gap: 8 }}>
            {['active', 'inactive'].map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                style={{
                  flex: 1, padding: '7px', border: `1px solid ${status === s ? (s === 'active' ? GREEN : RED) : BORDER}`,
                  borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: status === s ? 700 : 400,
                  background: status === s ? (s === 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)') : CARD,
                  color: status === s ? (s === 'active' ? GREEN : RED) : MUTED,
                  textTransform: 'capitalize', transition: 'all 0.15s',
                }}
              >{s}</button>
            ))}
          </div>
          {status === 'inactive' && (
            <p style={{ color: AMBER, fontSize: 10, marginTop: 5 }}>
              Inactive categories won't appear for new products or POS filter.
            </p>
          )}
        </div>

        {/* Commission */}
        <div style={{
          marginBottom: 14, padding: '12px 14px',
          background: 'rgba(139,92,246,0.04)', border: `1px solid rgba(139,92,246,0.15)`,
          borderRadius: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            {lbl('COMMISSION RULE')}
            <span style={{
              fontSize: 9, fontWeight: 700, color: PURPLE,
              background: 'rgba(139,92,246,0.15)', padding: '1px 6px', borderRadius: 4, letterSpacing: 0.5,
            }}>READY — configure to activate</span>
          </div>

          {/* Type selector */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ color: MUTED, fontSize: 10, display: 'block', marginBottom: 4 }}>TYPE</label>
            <select
              value={commissionType ?? ''}
              onChange={e => { setCommissionType(e.target.value || null); if (!e.target.value) setCommissionRate('') }}
              style={{ ...inputStyle(false), cursor: 'pointer' }}
            >
              {COMMISSION_TYPES.map(t => (
                <option key={String(t.value)} value={t.value ?? ''}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Rate input — hidden for tier_nc (rate comes from day tier table) */}
          {rateRequired && (
            <div style={{ marginBottom: 8 }}>
              <label style={{ color: MUTED, fontSize: 10, display: 'block', marginBottom: 4 }}>
                {commissionType === 'fixed_per_unit' ? 'AMOUNT ($ per unit)' : 'RATE (%)'}
              </label>
              <input
                type="number" min="0" step="0.1"
                value={commissionRate}
                onChange={e => setCommissionRate(e.target.value)}
                placeholder={commissionType === 'fixed_per_unit' ? '3.00' : '5'}
                style={inputStyle(false)}
                onFocus={e => { e.target.style.borderColor = PURPLE }}
                onBlur={e => { e.target.style.borderColor = BORDER }}
              />
            </div>
          )}

          {/* Preview */}
          {commissionType === 'tier_nc' && (
            <div style={{
              fontSize: 11, color: PURPLE, background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, padding: '8px 10px',
              lineHeight: 1.6,
            }}>
              <strong>Rate is automatic</strong> — uses the day tier table:<br />
              $600+ → 20% · $1000+ → 25% · $1500+ → 30%<br />
              <span style={{ color: '#64748b' }}>Configure tiers in Admin → Users → Commission Settings</span>
            </div>
          )}
          {rateRequired && commissionRate && (
            <div style={{
              fontSize: 11, color: PURPLE, background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.2)', borderRadius: 6, padding: '6px 10px',
            }}>
              {commissionType === 'pct_spare'      && `${commissionRate}% of the spare on each item`}
              {commissionType === 'pct_subtotal'   && !spareCommissionEnabled && `${commissionRate}% of the sale subtotal per item`}
              {commissionType === 'pct_subtotal'   && spareCommissionEnabled  && `${commissionRate}% of product value + spare rate% of spare`}
              {commissionType === 'fixed_per_unit' && `$${commissionRate} per unit sold`}
            </div>
          )}

          {/* Spare split toggle — only for pct_subtotal */}
          {showSpareSplit && (
            <div style={{
              marginTop: 8, padding: '10px 12px',
              background: spareCommissionEnabled ? 'rgba(245,158,11,0.06)' : 'rgba(15,23,42,0.4)',
              border: `1px solid ${spareCommissionEnabled ? 'rgba(245,158,11,0.3)' : BORDER}`,
              borderRadius: 6,
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <div
                  onClick={() => setSpareCommissionEnabled(v => !v)}
                  style={{
                    width: 34, height: 18, borderRadius: 9, cursor: 'pointer', flexShrink: 0,
                    background: spareCommissionEnabled ? AMBER : '#253349',
                    border: `1px solid ${spareCommissionEnabled ? AMBER : BORDER}`,
                    position: 'relative', transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2,
                    left: spareCommissionEnabled ? 17 : 2,
                    width: 12, height: 12, borderRadius: '50%',
                    background: '#fff', transition: 'left 0.2s',
                  }} />
                </div>
                <div>
                  <p style={{ color: spareCommissionEnabled ? AMBER : MUTED, fontSize: 11, fontWeight: 700, margin: 0 }}>
                    Also pay spare commission
                  </p>
                  <p style={{ color: '#64748b', fontSize: 10, margin: '2px 0 0' }}>
                    Spare will use the NC spare rate (configured in Commission Settings)
                  </p>
                </div>
              </label>
            </div>
          )}
          {(!commissionType || commissionType === 'none') && (
            <p style={{ color: '#415569', fontSize: 10, lineHeight: 1.4, marginTop: 4 }}>
              Select a type to configure commission for this category.
            </p>
          )}
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 14 }}>
          {lbl('NOTES')}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Internal notes..."
            rows={3}
            style={{ ...inputStyle(false), resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
          />
        </div>

        {/* Created */}
        {cat.createdAt && (
          <p style={{ color: '#415569', fontSize: 10 }}>
            Created: {new Date(cat.createdAt).toLocaleDateString('en-US')}
          </p>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 18px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
        <button
          onClick={handleSave}
          style={{
            flex: 1, padding: '9px', background: BLUE, border: 'none',
            borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
          onMouseLeave={e => { e.currentTarget.style.background = BLUE }}
        >Save</button>
        <button
          onClick={onClose}
          style={{
            flex: 1, padding: '9px', background: 'transparent',
            border: `1px solid ${BORDER}`, borderRadius: 6,
            color: MUTED, fontSize: 13, cursor: 'pointer',
          }}
        >Cancel</button>
      </div>
    </div>
  )
}

// ── Main CategoriesScreen ──────────────────────────────────────────────────────
export default function CategoriesScreen({ onBack }) {
  const [cats,      setCats]      = useState(() => loadCategories())
  const [search,    setSearch]    = useState('')
  const [addName,   setAddName]   = useState('')
  const [addErr,    setAddErr]    = useState('')
  const [editing,   setEditing]   = useState(null)   // category object being edited
  const [selected,  setSelected]  = useState(null)   // selected id in list
  const [statusTab, setStatusTab] = useState('all')  // 'all' | 'active' | 'inactive'
  const [saved,     setSaved]     = useState(false)

  const persist = (updated) => {
    setCats(updated)
    saveCategories(updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  // ── Filtered list ────────────────────────────────────────────────────────────
  const displayed = useMemo(() => {
    let list = [...cats].sort((a, b) => a.sortIndex - b.sortIndex)
    if (statusTab === 'active')   list = list.filter(c => c.status !== 'inactive')
    if (statusTab === 'inactive') list = list.filter(c => c.status === 'inactive')
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(c => c.name.toLowerCase().includes(q))
    }
    return list
  }, [cats, search, statusTab])

  const counts = useMemo(() => ({
    all:      cats.length,
    active:   cats.filter(c => c.status !== 'inactive').length,
    inactive: cats.filter(c => c.status === 'inactive').length,
  }), [cats])

  // ── Add ──────────────────────────────────────────────────────────────────────
  const handleAdd = () => {
    const name = addName.trim()
    if (!name) { setAddErr('Enter a category name'); return }
    if (cats.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      setAddErr('Category already exists')
      return
    }
    const next = [...cats, {
      id:             nextCategoryId(cats),
      name,
      status:         'active',
      sortIndex:      cats.length,
      commissionRate: null,
      commissionType: null,
      notes:          '',
      createdAt:      new Date().toISOString(),
    }]
    persist(next)
    setAddName('')
    setAddErr('')
  }

  const handleAddKey = (e) => { if (e.key === 'Enter') handleAdd() }

  // ── Save edit ────────────────────────────────────────────────────────────────
  const handleSaveEdit = (updated) => {
    persist(cats.map(c => c.id === updated.id ? updated : c))
    setEditing(null)
    setSelected(updated.id)
  }

  // ── Soft delete (inactive) ───────────────────────────────────────────────────
  const handleDeactivate = (id) => {
    persist(cats.map(c => c.id === id ? { ...c, status: 'inactive' } : c))
    if (editing?.id === id) setEditing(null)
  }

  const handleReactivate = (id) => {
    persist(cats.map(c => c.id === id ? { ...c, status: 'active' } : c))
  }

  // ── Reorder ──────────────────────────────────────────────────────────────────
  const move = (id, dir) => {
    const sorted = [...cats].sort((a, b) => a.sortIndex - b.sortIndex)
    const idx = sorted.findIndex(c => c.id === id)
    const target = idx + dir
    if (target < 0 || target >= sorted.length) return
    const updated = sorted.map((c, i) => {
      if (i === idx)     return { ...c, sortIndex: sorted[target].sortIndex }
      if (i === target)  return { ...c, sortIndex: sorted[idx].sortIndex }
      return c
    })
    persist(updated)
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: BG, overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: '12px 20px', background: PANEL,
        borderBottom: `1px solid ${BORDER}`,
        display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'rgba(30,41,59,0.6)', border: `1px solid ${BORDER}`,
          borderRadius: 6, color: DIM, padding: '5px 12px',
          cursor: 'pointer', fontSize: 12,
        }}>← Back</button>

        <div style={{
          width: 30, height: 30, borderRadius: 7, fontSize: 15,
          background: 'rgba(37,99,235,0.12)', border: `1px solid rgba(37,99,235,0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>🗂️</div>

        <div>
          <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Product Categories</p>
          <p style={{ color: MUTED, fontSize: 11 }}>Manage categories used across Products, Inventory and POS</p>
        </div>

        {saved && (
          <span style={{
            marginLeft: 'auto', fontSize: 12, color: GREEN,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
            padding: '4px 12px', borderRadius: 6,
          }}>✓ Saved</span>
        )}
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: list ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${BORDER}`,
            display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0,
          }}>
            {/* Search */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search categories..."
              style={{
                padding: '7px 12px', background: CARD, border: `1px solid ${BORDER}`,
                borderRadius: 6, color: TEXT, fontSize: 13, outline: 'none',
              }}
              onFocus={e => { e.target.style.borderColor = BLUE }}
              onBlur={e => { e.target.style.borderColor = BORDER }}
            />

            {/* Add category row */}
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <input
                  value={addName}
                  onChange={e => { setAddName(e.target.value); setAddErr('') }}
                  onKeyDown={handleAddKey}
                  placeholder="New category name..."
                  style={{
                    ...inputStyle(!!addErr), width: '100%',
                    padding: '7px 12px',
                  }}
                  onFocus={e => { e.target.style.borderColor = BLUE }}
                  onBlur={e => { e.target.style.borderColor = addErr ? RED : BORDER }}
                />
                {addErr && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{addErr}</p>}
              </div>
              <button
                onClick={handleAdd}
                style={{
                  padding: '7px 18px', background: GREEN, border: 'none',
                  borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', flexShrink: 0,
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#16a34a' }}
                onMouseLeave={e => { e.currentTarget.style.background = GREEN }}
              >+ Add</button>
            </div>

            {/* Status tabs */}
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                { key: 'all',      label: `All (${counts.all})`           },
                { key: 'active',   label: `Active (${counts.active})`     },
                { key: 'inactive', label: `Inactive (${counts.inactive})` },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setStatusTab(key)} style={{
                  padding: '4px 12px', border: `1px solid ${statusTab === key ? BLUE : BORDER}`,
                  borderRadius: 20, fontSize: 11, cursor: 'pointer',
                  background: statusTab === key ? 'rgba(37,99,235,0.12)' : 'transparent',
                  color: statusTab === key ? '#93c5fd' : MUTED,
                  fontWeight: statusTab === key ? 700 : 400,
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>
          </div>

          {/* Category list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {displayed.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                No categories found
              </div>
            )}

            {displayed.map((cat, idx) => {
              const isSelected = selected === cat.id
              const isInactive = cat.status === 'inactive'
              const isFirst    = idx === 0
              const isLast     = idx === displayed.length - 1

              return (
                <div
                  key={cat.id}
                  onClick={() => setSelected(isSelected ? null : cat.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px',
                    borderBottom: `1px solid ${BORDER}`,
                    borderLeft: `3px solid ${isSelected ? BLUE : 'transparent'}`,
                    background: isSelected ? 'rgba(37,99,235,0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.12s',
                    opacity: isInactive ? 0.55 : 1,
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(37,99,235,0.03)' }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                >
                  {/* Folder icon */}
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {isInactive ? '📁' : '🗂️'}
                  </span>

                  {/* Name + badge */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>{cat.name}</span>
                    {isInactive && (
                      <span style={{
                        marginLeft: 8, fontSize: 9, fontWeight: 700, color: RED,
                        background: 'rgba(239,68,68,0.12)', padding: '1px 6px', borderRadius: 4,
                        textTransform: 'uppercase', letterSpacing: 0.5,
                      }}>Inactive</span>
                    )}
                    {cat.commissionType && cat.commissionType !== 'none' && (
                      <span style={{
                        marginLeft: 6, fontSize: 9, color: PURPLE,
                        background: 'rgba(139,92,246,0.1)', padding: '1px 6px', borderRadius: 4,
                      }}>
                        {cat.commissionType === 'tier_nc'        && 'tier%'}
                        {cat.commissionType === 'pct_spare'      && `${cat.commissionRate}% spare`}
                        {cat.commissionType === 'pct_subtotal'   && `${cat.commissionRate}% subtotal${cat.spareCommissionEnabled ? ' +spare' : ''}`}
                        {cat.commissionType === 'fixed_per_unit' && `$${cat.commissionRate}/unit`}
                      </span>
                    )}
                  </div>

                  {/* Actions — show on selection */}
                  <div
                    style={{
                      display: 'flex', gap: 4, flexShrink: 0,
                      opacity: isSelected ? 1 : 0,
                      transition: 'opacity 0.15s',
                      pointerEvents: isSelected ? 'auto' : 'none',
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    {/* Reorder */}
                    <button
                      disabled={isFirst}
                      onClick={() => move(cat.id, -1)}
                      title="Move up"
                      style={{
                        padding: '3px 7px', background: CARD, border: `1px solid ${BORDER}`,
                        borderRadius: 4, color: isFirst ? '#415569' : DIM,
                        cursor: isFirst ? 'default' : 'pointer', fontSize: 11,
                      }}
                    >▲</button>
                    <button
                      disabled={isLast}
                      onClick={() => move(cat.id, 1)}
                      title="Move down"
                      style={{
                        padding: '3px 7px', background: CARD, border: `1px solid ${BORDER}`,
                        borderRadius: 4, color: isLast ? '#415569' : DIM,
                        cursor: isLast ? 'default' : 'pointer', fontSize: 11,
                      }}
                    >▼</button>

                    {/* Edit */}
                    <button
                      onClick={() => setEditing(cat)}
                      style={{
                        padding: '3px 10px', background: 'rgba(37,99,235,0.1)',
                        border: `1px solid rgba(37,99,235,0.3)`, borderRadius: 4,
                        color: '#93c5fd', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                      }}
                    >Edit</button>

                    {/* Activate / Deactivate */}
                    {isInactive ? (
                      <button
                        onClick={() => handleReactivate(cat.id)}
                        style={{
                          padding: '3px 10px', background: 'rgba(34,197,94,0.1)',
                          border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 4,
                          color: GREEN, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        }}
                      >Activate</button>
                    ) : (
                      <button
                        onClick={() => handleDeactivate(cat.id)}
                        title="Deactivate (products using this category are not affected)"
                        style={{
                          padding: '3px 10px', background: 'rgba(239,68,68,0.08)',
                          border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 4,
                          color: RED, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                        }}
                      >Deactivate</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer note */}
          <div style={{
            padding: '10px 16px', borderTop: `1px solid ${BORDER}`,
            fontSize: 11, color: '#415569', flexShrink: 0,
          }}>
            {counts.active} active · {counts.inactive} inactive · Deactivating a category does not affect existing products.
          </div>
        </div>

        {/* ── Right: edit panel ── */}
        {editing && (
          <EditPanel
            cat={editing}
            onSave={handleSaveEdit}
            onClose={() => setEditing(null)}
          />
        )}
      </div>
    </div>
  )
}
