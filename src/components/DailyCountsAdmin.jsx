/**
 * DailyCountsAdmin.jsx
 * Admin view for reviewing and applying inventory daily count submissions.
 * Accessed via Admin → Inventory → Daily Counts.
 */

import { useState, useMemo } from 'react'
import { LOCATIONS_CFG } from '../config/branding'
import { loadAllProducts, saveAllProducts } from '../utils/productsStorage'
import { loadDailyCounts, updateDailyCount, updateDailyCountItem, deriveCountStatus } from '../utils/dailyCountsStorage'
import { writeStockAdjustment } from '../services/supabaseWrite'
import { getLocationUUID } from '../services/supabaseRead'

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const AMBER  = '#f59e0b'
const PURPLE = '#a78bfa'
const MUTED  = 'var(--c-text-muted)'
const DIM    = 'var(--c-text-sub)'
const TEXT   = 'var(--c-text)'

const inp = () => ({
  padding: '7px 10px', background: CARD, border: `1px solid ${BORDER}`,
  borderRadius: 6, color: TEXT, fontSize: 12, outline: 'none', width: '100%',
})

// ── Status badge ──────────────────────────────────────────────────────────────
const STATUS_MAP = {
  ok:          { label: 'OK',           bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  color: GREEN  },
  count_error: { label: 'Count Error',  bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: RED    },
  reviewed:    { label: 'Reviewed',     bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.3)', color: BLUE   },
  partial:     { label: 'Partial',      bg: 'rgba(167,139,250,0.12)',border: 'rgba(167,139,250,0.3)',color: PURPLE },
  applied:     { label: 'Applied',      bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  color: GREEN  },
  rejected:    { label: 'Rejected',     bg: 'rgba(100,116,139,0.12)',border: 'rgba(100,116,139,0.3)',color: MUTED  },
}

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.ok
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: '3px 8px',
      borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>{s.label}</span>
  )
}

function DiffBadge({ diff }) {
  if (diff === 0) return <span style={{ color: GREEN }}>0</span>
  const color = diff < 0 ? RED : AMBER
  return <span style={{ color, fontWeight: 700 }}>{diff > 0 ? `+${diff}` : diff}</span>
}

const th = (extra = {}) => ({
  padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
  letterSpacing: 0.6, color: MUTED, background: PANEL,
  borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', ...extra,
})
const td = (extra = {}) => ({
  padding: '9px 12px', fontSize: 12, color: TEXT,
  borderBottom: `1px solid ${BORDER}`, verticalAlign: 'middle', ...extra,
})

// ── Open Count Modal ──────────────────────────────────────────────────────────
function OpenCountModal({ count: initialCount, currentUser, onClose }) {
  const [count, setCount]       = useState(initialCount)
  const [saving, setSaving]     = useState(false)
  const [message, setMessage]   = useState('')

  function reload() {
    const fresh = loadDailyCounts().find(c => c.id === initialCount.id)
    if (fresh) setCount(fresh)
  }

  function flash(msg, color = GREEN) {
    setMessage({ text: msg, color })
    setTimeout(() => setMessage(''), 3000)
  }

  async function applyFix(item) {
    if (saving) return
    setSaving(true)
    try {
      const products     = loadAllProducts()
      const locCfg       = LOCATIONS_CFG.find(l => l.id === count.locationId)
      const locationUUID = getLocationUUID(count.locationId)

      const updated = products.map(p => {
        if (p.id !== item.productId) return p
        const qtyBefore = p.qtyByLoc?.[count.locationId] ?? p.qty
        const qtyAfter  = item.countedQty
        const newQtyByLoc = p.qtyByLoc
          ? { ...p.qtyByLoc, [count.locationId]: qtyAfter }
          : p.qtyByLoc
        return { ...p, qty: Math.max(0, p.qty + (qtyAfter - qtyBefore)), qtyByLoc: newQtyByLoc }
      })
      saveAllProducts(updated)

      const prod     = products.find(p => p.id === item.productId)
      const qtyBefore = prod ? (prod.qtyByLoc?.[count.locationId] ?? prod.qty) : item.systemQty

      if (locationUUID) {
        await writeStockAdjustment(
          [{ productId: item.productId, productName: item.productName, barcode: item.barcode, locationUUID, locationName: count.locationName, qtyBefore, qtyAfter: item.countedQty }],
          { type: 'count_adjustment', note: `Daily count ${count.countNumber} — approved by ${currentUser?.name || 'Admin'}`, performedById: currentUser?.id || null }
        )
      }

      updateDailyCountItem(count.id, item.productId, { itemStatus: 'applied', appliedAt: new Date().toISOString(), appliedBy: currentUser?.name || 'Admin' })

      const fresh = loadDailyCounts().find(c => c.id === count.id)
      const newStatus = deriveCountStatus(fresh)
      updateDailyCount(count.id, { status: newStatus, appliedBy: currentUser?.name || 'Admin', appliedAt: new Date().toISOString() })
      reload()
      flash(`Fixed: ${item.productName}`)
    } catch (e) {
      flash(`Error: ${e.message}`, RED)
    } finally {
      setSaving(false)
    }
  }

  async function fixAll() {
    if (saving) return
    const pending = count.items.filter(it => it.difference !== 0 && it.itemStatus !== 'applied')
    for (const item of pending) await applyFix(item)
    flash('All differences applied.')
  }

  function markReviewed() {
    updateDailyCount(count.id, { status: 'reviewed', reviewedBy: currentUser?.name || 'Admin', reviewedAt: new Date().toISOString() })
    reload()
    flash('Marked as reviewed.')
  }

  function reject() {
    updateDailyCount(count.id, { status: 'rejected', reviewedBy: currentUser?.name || 'Admin', reviewedAt: new Date().toISOString() })
    reload()
    flash('Count rejected.')
  }

  const diffCount = count.items.filter(it => it.difference !== 0).length
  const pendingFixes = count.items.filter(it => it.difference !== 0 && it.itemStatus !== 'applied').length

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 2000,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 20px', overflowY: 'auto',
    }}>
      <div style={{
        background: BG, border: `1px solid ${BORDER}`, borderRadius: 12,
        width: '100%', maxWidth: 960, boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ color: TEXT, fontWeight: 800, fontSize: 16 }}>{count.countNumber}</span>
              <StatusBadge status={count.status} />
            </div>
            <div style={{ display: 'flex', gap: 20, fontSize: 11, color: MUTED }}>
              <span>📍 {count.locationName}</span>
              <span>👤 {count.submittedBy}</span>
              <span>🕐 {new Date(count.submittedAt).toLocaleString()}</span>
              <span>📦 {count.items.length} items</span>
              {diffCount > 0 && <span style={{ color: RED }}>⚠ {diffCount} difference{diffCount !== 1 ? 's' : ''}</span>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 12, cursor: 'pointer', padding: '6px 14px' }}>
            ✕ Close
          </button>
        </div>

        {/* Action bar */}
        <div style={{ padding: '12px 24px', background: PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 8, alignItems: 'center' }}>
          {message && (
            <span style={{ fontSize: 12, color: message.color || GREEN, marginRight: 8, fontWeight: 600 }}>
              {typeof message === 'string' ? message : message.text}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {count.status !== 'reviewed' && count.status !== 'applied' && count.status !== 'rejected' && (
              <button onClick={markReviewed} style={{ padding: '6px 14px', background: 'rgba(59,130,246,0.12)', border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 6, color: BLUE, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Mark as Reviewed
              </button>
            )}
            {pendingFixes > 0 && count.status !== 'rejected' && (
              <button onClick={fixAll} disabled={saving} style={{ padding: '6px 14px', background: saving ? CARD : 'rgba(34,197,94,0.12)', border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 6, color: GREEN, fontSize: 12, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600 }}>
                {saving ? 'Applying…' : `Fix All (${pendingFixes})`}
              </button>
            )}
            {count.status !== 'rejected' && count.status !== 'applied' && (
              <button onClick={reject} style={{ padding: '6px 14px', background: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 6, color: RED, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                Reject Count
              </button>
            )}
          </div>
        </div>

        {/* Items table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={th()}>Barcode</th>
                <th style={th()}>Category</th>
                <th style={th()}>Product Name</th>
                <th style={th()}>Desc.</th>
                <th style={th()}>Size</th>
                <th style={th({ textAlign: 'center' })}>System Qty</th>
                <th style={th({ textAlign: 'center' })}>Counted</th>
                <th style={th({ textAlign: 'center' })}>Difference</th>
                <th style={th({ textAlign: 'center' })}>Status</th>
                <th style={th({ textAlign: 'center' })}>Action</th>
              </tr>
            </thead>
            <tbody>
              {count.items.map((item, i) => {
                const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                const isApplied = item.itemStatus === 'applied'
                return (
                  <tr key={item.productId} style={{ background: rowBg }}>
                    <td style={td({ fontFamily: 'monospace', color: DIM, fontSize: 11 })}>{item.barcode}</td>
                    <td style={td({ color: MUTED })}>{item.category}</td>
                    <td style={td({ fontWeight: 600 })}>{item.productName}</td>
                    <td style={td({ color: MUTED, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })}>{item.description || '—'}</td>
                    <td style={td({ color: MUTED })}>{item.size || '—'}</td>
                    <td style={td({ textAlign: 'center', fontWeight: 700, color: MUTED })}>{item.systemQty}</td>
                    <td style={td({ textAlign: 'center', fontWeight: 700 })}>{item.countedQty}</td>
                    <td style={td({ textAlign: 'center' })}><DiffBadge diff={item.difference} /></td>
                    <td style={td({ textAlign: 'center' })}>
                      {item.difference === 0
                        ? <span style={{ fontSize: 10, color: GREEN }}>✓ Match</span>
                        : isApplied
                          ? <span style={{ fontSize: 10, color: GREEN, fontWeight: 700 }}>✓ Applied</span>
                          : <span style={{ fontSize: 10, color: AMBER }}>Pending</span>
                      }
                    </td>
                    <td style={td({ textAlign: 'center' })}>
                      {item.difference !== 0 && !isApplied && count.status !== 'rejected' && (
                        <button
                          onClick={() => applyFix(item)}
                          disabled={saving}
                          style={{
                            padding: '4px 12px', background: saving ? CARD : 'rgba(34,197,94,0.1)',
                            border: `1px solid rgba(34,197,94,0.3)`, borderRadius: 4,
                            color: GREEN, fontSize: 11, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 600,
                          }}
                        >Fix</button>
                      )}
                      {(item.difference === 0 || isApplied) && (
                        <span style={{ color: MUTED, fontSize: 11 }}>—</span>
                      )}
                      {count.status === 'rejected' && item.difference !== 0 && !isApplied && (
                        <span style={{ color: MUTED, fontSize: 11 }}>Rejected</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        {(count.reviewedBy || count.appliedBy) && (
          <div style={{ padding: '12px 24px', borderTop: `1px solid ${BORDER}`, display: 'flex', gap: 20, fontSize: 11, color: MUTED }}>
            {count.reviewedBy && <span>Reviewed by: <strong style={{ color: TEXT }}>{count.reviewedBy}</strong> · {count.reviewedAt ? new Date(count.reviewedAt).toLocaleString() : ''}</span>}
            {count.appliedBy  && <span>Applied by: <strong style={{ color: TEXT }}>{count.appliedBy}</strong> · {count.appliedAt  ? new Date(count.appliedAt).toLocaleString()  : ''}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function DailyCountsAdmin({ currentUser }) {
  const [counts, setCounts]       = useState(loadDailyCounts)
  const [openCount, setOpenCount] = useState(null)

  // Filters
  const [fromDate,     setFromDate]     = useState('')
  const [toDate,       setToDate]       = useState('')
  const [filterLoc,    setFilterLoc]    = useState('all')
  const [filterUser,   setFilterUser]   = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  function refresh() {
    setCounts(loadDailyCounts())
    if (openCount) {
      const fresh = loadDailyCounts().find(c => c.id === openCount.id)
      if (fresh) setOpenCount(fresh)
    }
  }

  const filtered = useMemo(() => {
    return counts.filter(c => {
      if (filterLoc !== 'all' && c.locationId !== filterLoc) return false
      if (filterUser && !c.submittedBy.toLowerCase().includes(filterUser.toLowerCase())) return false
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      if (fromDate) {
        const d = new Date(c.submittedAt); d.setHours(0,0,0,0)
        if (d < new Date(fromDate)) return false
      }
      if (toDate) {
        const d = new Date(c.submittedAt); d.setHours(23,59,59,999)
        if (d > new Date(toDate + 'T23:59:59')) return false
      }
      return true
    })
  }, [counts, fromDate, toDate, filterLoc, filterUser, filterStatus])

  // Stats
  const pendingCount  = counts.filter(c => c.status === 'count_error').length
  const totalToday    = counts.filter(c => new Date(c.submittedAt).toDateString() === new Date().toDateString()).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: BG, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Stats bar */}
      <div style={{ padding: '12px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 20, alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { label: 'Total', value: counts.length, color: TEXT },
            { label: 'Today', value: totalToday, color: BLUE },
            { label: 'Pending Review', value: pendingCount, color: pendingCount > 0 ? RED : MUTED },
            { label: 'Applied', value: counts.filter(c => c.status === 'applied').length, color: GREEN },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', padding: '4px 14px', background: CARD, borderRadius: 8, border: `1px solid ${BORDER}` }}>
              <p style={{ color: s.color, fontWeight: 800, fontSize: 18, margin: 0 }}>{s.value}</p>
              <p style={{ color: MUTED, fontSize: 10, margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
        <button onClick={refresh} style={{ marginLeft: 'auto', padding: '6px 14px', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 12, cursor: 'pointer' }}>
          ⟳ Refresh
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '10px 20px', background: PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ color: MUTED, fontSize: 11, whiteSpace: 'nowrap' }}>From</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ ...inp(), width: 140 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <label style={{ color: MUTED, fontSize: 11, whiteSpace: 'nowrap' }}>To</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ ...inp(), width: 140 }} />
        </div>
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ ...inp(), width: 180 }}>
          <option value="all">All Locations</option>
          {LOCATIONS_CFG.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...inp(), width: 160 }}>
          <option value="all">All Statuses</option>
          <option value="ok">OK</option>
          <option value="count_error">Count Error</option>
          <option value="reviewed">Reviewed</option>
          <option value="partial">Partial</option>
          <option value="applied">Applied</option>
          <option value="rejected">Rejected</option>
        </select>
        <input
          placeholder="Submitted by…"
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
          style={{ ...inp(), width: 160 }}
        />
        {(fromDate || toDate || filterLoc !== 'all' || filterUser || filterStatus !== 'all') && (
          <button onClick={() => { setFromDate(''); setToDate(''); setFilterLoc('all'); setFilterUser(''); setFilterStatus('all') }}
            style={{ padding: '6px 12px', background: 'rgba(239,68,68,0.1)', border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 6, color: RED, fontSize: 11, cursor: 'pointer' }}>
            Clear
          </button>
        )}
        <span style={{ color: MUTED, fontSize: 11, marginLeft: 'auto' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 200, gap: 10 }}>
            <span style={{ fontSize: 32 }}>🔢</span>
            <p style={{ color: MUTED, fontSize: 13 }}>No daily counts found</p>
            <p style={{ color: DIM, fontSize: 11 }}>Employees submit counts from Inventory → By Item → Submit Count</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={th()}>Count #</th>
                <th style={th()}>Date / Time</th>
                <th style={th()}>Location</th>
                <th style={th()}>Submitted By</th>
                <th style={th({ textAlign: 'center' })}>Items</th>
                <th style={th({ textAlign: 'center' })}>Differences</th>
                <th style={th({ textAlign: 'center' })}>Status</th>
                <th style={th({ textAlign: 'center' })}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((count, i) => {
                const diffCount = count.items?.filter(it => it.difference !== 0).length || 0
                const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
                return (
                  <tr key={count.id} style={{ background: rowBg }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = rowBg}
                  >
                    <td style={td({ fontWeight: 700, color: BLUE, fontFamily: 'monospace' })}>{count.countNumber}</td>
                    <td style={td({ color: MUTED })}>{new Date(count.submittedAt).toLocaleString()}</td>
                    <td style={td()}>{count.locationName}</td>
                    <td style={td()}>{count.submittedBy}</td>
                    <td style={td({ textAlign: 'center', color: MUTED })}>{count.items?.length || 0}</td>
                    <td style={td({ textAlign: 'center' })}>
                      {diffCount === 0
                        ? <span style={{ color: GREEN, fontWeight: 700 }}>0</span>
                        : <span style={{ color: RED,   fontWeight: 700 }}>{diffCount}</span>
                      }
                    </td>
                    <td style={td({ textAlign: 'center' })}><StatusBadge status={count.status} /></td>
                    <td style={td({ textAlign: 'center' })}>
                      <button
                        onClick={() => setOpenCount(count)}
                        style={{
                          padding: '5px 14px', background: 'rgba(59,130,246,0.1)',
                          border: `1px solid rgba(59,130,246,0.3)`, borderRadius: 5,
                          color: BLUE, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                        }}
                      >Open Count</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {openCount && (
        <OpenCountModal
          count={openCount}
          currentUser={currentUser}
          onClose={() => { setOpenCount(null); refresh() }}
        />
      )}
    </div>
  )
}
