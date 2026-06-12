/**
 * InventoryTab.jsx
 * Inventory Control module for the Fluxe Dashboard App (owner mobile view).
 * Features: KPI overview, product search + low-stock alerts, pending Daily Counts
 * review with admin actions, and owner inventory adjustments with mandatory reason.
 */

import { useState, useMemo, useCallback } from 'react'
import { loadAllProducts, saveAllProducts } from '../../utils/productsStorage'
import {
  loadDailyCounts,
  updateDailyCount,
  updateDailyCountItem,
  deriveCountStatus,
} from '../../utils/dailyCountsStorage'
import { writeStockAdjustment } from '../../services/supabaseWrite'
import { getLocationUUID } from '../../services/supabaseRead'

// ── Constants ─────────────────────────────────────────────────────────────────
const LOW_STOCK = 3

const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', sub: '#374151', muted: '#6B7280', dim: '#9CA3AF',
  green: '#10B981', blue: '#3B82F6', purple: '#8B5CF6',
  amber: '#F59E0B', red: '#EF4444',
}

const LOCS = [
  { id: 'all',    name: 'All Locations',  icon: '🌐' },
  { id: 'loc_01', name: 'Miracle Mall 01', icon: '🎰' },
  { id: 'loc_02', name: 'Perfume Passage', icon: '🏪' },
]

const REASONS = [
  'New Order Received',
  'Inventory Correction',
  'Damage / Loss',
  'Manual Adjustment',
  'Other',
]

const STATUS_MAP = {
  ok:          { label: 'OK',          bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  color: '#10B981' },
  count_error: { label: 'Count Error', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   color: '#EF4444' },
  reviewed:    { label: 'Reviewed',    bg: 'rgba(59,130,246,0.12)',  border: 'rgba(59,130,246,0.3)',  color: '#3B82F6' },
  partial:     { label: 'Partial',     bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.3)',  color: '#8B5CF6' },
  applied:     { label: 'Applied',     bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  color: '#10B981' },
  rejected:    { label: 'Rejected',    bg: 'rgba(107,114,128,0.12)', border: 'rgba(107,114,128,0.3)', color: '#6B7280' },
}

// ── Small components ──────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || STATUS_MAP.ok
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 0.4, padding: '2px 8px',
      borderRadius: 10, background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>{s.label}</span>
  )
}

function SectionLabel({ children, count }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 8 }}>
      {children}{count !== undefined ? ` (${count})` : ''}
    </div>
  )
}

// ── Product Detail Bottom Sheet ───────────────────────────────────────────────
function ProductDetailModal({ product, locQty, onAdjust, onClose }) {
  const loc01 = locQty(product, 'loc_01')
  const loc02 = locQty(product, 'loc_02')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 3000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: C.bg, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        padding: '8px 24px 32px', boxShadow: '0 -4px 32px rgba(0,0,0,0.25)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '10px auto 18px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text, marginBottom: 3 }}>{product.name}</div>
            <div style={{ fontSize: 12, color: C.muted }}>
              {product.category}{product.size ? ` · ${product.size}` : ''}{product.description ? ` · ${product.description}` : ''}
            </div>
            {product.barcode && (
              <div style={{ fontSize: 11, color: C.dim, fontFamily: 'monospace', marginTop: 3 }}>{product.barcode}</div>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.muted, lineHeight: 1, padding: 0, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{ marginBottom: 20 }}>
          <SectionLabel>STOCK BY LOCATION</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'Miracle Mall 01', qty: loc01 },
              { name: 'Perfume Passage', qty: loc02 },
            ].map(row => (
              <div key={row.name} style={{
                display: 'flex', alignItems: 'center',
                background: C.card, borderRadius: 10, padding: '13px 16px',
                border: `1px solid ${row.qty === 0 ? C.red + '40' : row.qty <= LOW_STOCK ? C.amber + '40' : C.border}`,
              }}>
                <span style={{ flex: 1, fontSize: 13, color: C.text }}>📍 {row.name}</span>
                <span style={{
                  fontSize: 24, fontWeight: 900,
                  color: row.qty === 0 ? C.red : row.qty <= LOW_STOCK ? C.amber : C.green,
                }}>{row.qty}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', alignItems: 'center',
              background: C.card, borderRadius: 10, padding: '10px 16px',
              border: `1px solid ${C.border}`,
            }}>
              <span style={{ flex: 1, fontSize: 13, color: C.muted, fontWeight: 600 }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 900, color: C.text }}>{loc01 + loc02}</span>
            </div>
          </div>
        </div>

        <button onClick={() => onAdjust(product)} style={{
          width: '100%', padding: 14, borderRadius: 12, fontSize: 14, fontWeight: 700,
          background: C.blue, color: '#fff', border: 'none', cursor: 'pointer',
        }}>
          ✏ Adjust Inventory
        </button>
      </div>
    </div>
  )
}

// ── Inventory Adjustment Bottom Sheet ────────────────────────────────────────
function AdjustmentModal({ product, locFilter, locQty, onClose, onDone }) {
  const needLocPick = locFilter === 'all'
  const [adjLoc, setAdjLoc] = useState(needLocPick ? 'loc_01' : locFilter)
  const [delta,  setDelta]  = useState(0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [err,    setErr]    = useState('')

  const currentQty = locQty(product, adjLoc)
  const newQty     = Math.max(0, currentQty + delta)

  async function submit() {
    if (!reason) { setErr('Select a reason to continue.'); return }
    if (delta === 0) { setErr('Qty change cannot be 0.'); return }
    setSaving(true)
    setErr('')
    try {
      const products     = loadAllProducts()
      const locationUUID = getLocationUUID(adjLoc)
      const locName      = LOCS.find(l => l.id === adjLoc)?.name || adjLoc
      const updated      = products.map(p => {
        if (p.id !== product.id) return p
        const qtyBefore   = p.qtyByLoc?.[adjLoc] ?? p.qty
        const qtyAfter    = Math.max(0, qtyBefore + delta)
        const newQtyByLoc = p.qtyByLoc ? { ...p.qtyByLoc, [adjLoc]: qtyAfter } : p.qtyByLoc
        return { ...p, qty: Math.max(0, p.qty + (qtyAfter - qtyBefore)), qtyByLoc: newQtyByLoc }
      })
      saveAllProducts(updated)
      if (locationUUID) {
        await writeStockAdjustment(
          [{ productId: product.id, productName: product.name, barcode: product.barcode, locationUUID, locationName: locName, qtyBefore: currentQty, qtyAfter: newQty }],
          { type: 'adjustment', note: `${reason} — via Dashboard Mobile`, performedById: null }
        )
      }
      onDone(`Adjusted: ${product.name} (${delta > 0 ? '+' : ''}${delta}) at ${locName}`)
      onClose()
    } catch (e) {
      setErr(e.message || 'Unexpected error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 3000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }} onClick={onClose}>
      <div style={{
        background: C.bg, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480,
        padding: '8px 24px 32px', boxShadow: '0 -4px 32px rgba(0,0,0,0.25)',
        maxHeight: '92dvh', overflowY: 'auto',
      }} onClick={e => e.stopPropagation()}>
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '10px auto 18px' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Adjust Inventory</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: C.muted, padding: 0 }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 18 }}>{product.name}</div>

        {needLocPick && (
          <div style={{ marginBottom: 16 }}>
            <SectionLabel>LOCATION</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {LOCS.filter(l => l.id !== 'all').map(l => (
                <button key={l.id} onClick={() => setAdjLoc(l.id)} style={{
                  flex: 1, padding: '9px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', border: `1px solid ${adjLoc === l.id ? C.blue : C.border}`,
                  background: adjLoc === l.id ? `${C.blue}15` : C.card,
                  color: adjLoc === l.id ? C.blue : C.muted,
                }}>{l.icon} {l.name.split(' ')[0]}</button>
              ))}
            </div>
          </div>
        )}

        <div style={{
          background: C.card, borderRadius: 12, padding: '16px 20px', marginBottom: 16,
          textAlign: 'center', border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 6, letterSpacing: 0.5 }}>CURRENT → NEW</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: C.text, lineHeight: 1 }}>
            {currentQty}
            <span style={{ color: C.muted, fontSize: 22, margin: '0 10px' }}>→</span>
            <span style={{ color: newQty === 0 ? C.red : newQty <= LOW_STOCK ? C.amber : C.green }}>
              {newQty}
            </span>
          </div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>
            {LOCS.find(l => l.id === adjLoc)?.name}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginBottom: 18 }}>
          <button onClick={() => setDelta(d => d - 1)} style={{
            width: 48, height: 48, borderRadius: 14, fontSize: 26, fontWeight: 900,
            border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', color: C.red,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>−</button>
          <input
            type="number"
            value={delta}
            onChange={e => setDelta(parseInt(e.target.value) || 0)}
            style={{
              width: 90, textAlign: 'center', padding: '10px 8px',
              borderRadius: 10, border: `1px solid ${C.border}`,
              fontSize: 20, fontWeight: 800, color: C.text, background: C.card, outline: 'none',
            }}
          />
          <button onClick={() => setDelta(d => d + 1)} style={{
            width: 48, height: 48, borderRadius: 14, fontSize: 26, fontWeight: 900,
            border: `1px solid ${C.border}`, background: C.card, cursor: 'pointer', color: C.green,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>+</button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <SectionLabel>REASON (REQUIRED)</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {REASONS.map(r => (
              <button key={r} onClick={() => setReason(r)} style={{
                padding: '11px 14px', borderRadius: 10, fontSize: 13, textAlign: 'left',
                cursor: 'pointer', border: `1px solid ${reason === r ? C.blue : C.border}`,
                background: reason === r ? `${C.blue}15` : C.card,
                color: reason === r ? C.blue : C.text, fontWeight: reason === r ? 700 : 400,
              }}>{r}</button>
            ))}
          </div>
        </div>

        {err && (
          <div style={{ color: C.red, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>⚠ {err}</div>
        )}

        <button onClick={submit} disabled={saving} style={{
          width: '100%', padding: 15, borderRadius: 12, fontSize: 15, fontWeight: 700,
          background: saving ? C.dim : C.blue, color: '#fff', border: 'none',
          cursor: saving ? 'wait' : 'pointer',
        }}>
          {saving ? 'Saving…' : 'Apply Adjustment'}
        </button>
      </div>
    </div>
  )
}

// ── Count Review Bottom Sheet ─────────────────────────────────────────────────
function CountReviewModal({ count: initialCount, onClose, onDone }) {
  const [count,  setCount]  = useState(initialCount)
  const [saving, setSaving] = useState(false)

  function reload() {
    const fresh = loadDailyCounts().find(c => c.id === initialCount.id)
    if (fresh) setCount(fresh)
  }

  async function applyFix(item) {
    if (saving) return
    setSaving(true)
    try {
      const products      = loadAllProducts()
      const locationUUID  = getLocationUUID(count.locationId)
      const updated = products.map(p => {
        if (p.id !== item.productId) return p
        const qtyBefore   = p.qtyByLoc?.[count.locationId] ?? p.qty
        const qtyAfter    = item.countedQty
        const newQtyByLoc = p.qtyByLoc ? { ...p.qtyByLoc, [count.locationId]: qtyAfter } : p.qtyByLoc
        return { ...p, qty: Math.max(0, p.qty + (qtyAfter - qtyBefore)), qtyByLoc: newQtyByLoc }
      })
      saveAllProducts(updated)
      const prod      = products.find(p => p.id === item.productId)
      const qtyBefore = prod ? (prod.qtyByLoc?.[count.locationId] ?? prod.qty) : item.systemQty
      if (locationUUID) {
        await writeStockAdjustment(
          [{ productId: item.productId, productName: item.productName, barcode: item.barcode, locationUUID, locationName: count.locationName, qtyBefore, qtyAfter: item.countedQty }],
          { type: 'adjustment', note: `Daily count ${count.countNumber} — approved via Dashboard`, performedById: null }
        )
      }
      updateDailyCountItem(count.id, item.productId, {
        itemStatus: 'applied',
        appliedAt: new Date().toISOString(),
        appliedBy: 'Dashboard Owner',
      })
      const fresh     = loadDailyCounts().find(c => c.id === count.id)
      const newStatus = deriveCountStatus(fresh)
      updateDailyCount(count.id, {
        status: newStatus,
        appliedBy: 'Dashboard Owner',
        appliedAt: new Date().toISOString(),
      })
      reload()
    } catch (e) {
      console.warn('[InventoryTab] applyFix error:', e)
    } finally {
      setSaving(false)
    }
  }

  async function fixAll() {
    const pending = count.items.filter(it => it.difference !== 0 && it.itemStatus !== 'applied')
    for (const item of pending) await applyFix(item)
    onDone(`All fixes applied: ${count.countNumber}`)
  }

  function markReviewed() {
    updateDailyCount(count.id, {
      status: 'reviewed',
      reviewedBy: 'Dashboard Owner',
      reviewedAt: new Date().toISOString(),
    })
    reload()
  }

  function reject() {
    updateDailyCount(count.id, {
      status: 'rejected',
      reviewedBy: 'Dashboard Owner',
      reviewedAt: new Date().toISOString(),
    })
    onDone(`Count ${count.countNumber} rejected.`)
    onClose()
  }

  const diffItems    = count.items.filter(it => it.difference !== 0)
  const pendingItems = diffItems.filter(it => it.itemStatus !== 'applied')

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 3000,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{
        background: C.bg, borderRadius: '20px 20px 0 0', width: '100%',
        maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 -4px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ width: 40, height: 4, background: C.border, borderRadius: 2, margin: '10px auto 0' }} />

        {/* Header */}
        <div style={{ padding: '14px 20px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{count.countNumber}</span>
            <StatusBadge status={count.status} />
            <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.muted, padding: 0 }}>✕</button>
          </div>
          <div style={{ fontSize: 12, color: C.muted }}>
            📍 {count.locationName} · 👤 {count.submittedBy} · {new Date(count.submittedAt).toLocaleDateString()}
          </div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {count.items.length} items
            {diffItems.length > 0 && (
              <span style={{ color: C.red, fontWeight: 700 }}> · ⚠ {diffItems.length} difference{diffItems.length !== 1 ? 's' : ''}</span>
            )}
          </div>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
          {count.items.map(item => {
            const diff    = item.difference || 0
            const applied = item.itemStatus === 'applied'
            return (
              <div key={item.productId} style={{
                background: C.card, borderRadius: 10, padding: '11px 14px', marginBottom: 8,
                border: `1px solid ${diff === 0 ? C.border : diff < 0 ? C.red + '40' : C.amber + '40'}`,
                opacity: applied ? 0.55 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.productName}
                    </div>
                    <div style={{ display: 'flex', gap: 10, fontSize: 11, color: C.muted, marginTop: 3 }}>
                      <span>System: {item.systemQty}</span>
                      <span>Counted: {item.countedQty}</span>
                      <span style={{
                        fontWeight: 700,
                        color: diff === 0 ? C.green : diff < 0 ? C.red : C.amber,
                      }}>{diff === 0 ? '✓ OK' : diff > 0 ? `+${diff}` : String(diff)}</span>
                    </div>
                  </div>
                  {diff !== 0 && !applied && (
                    <button onClick={() => applyFix(item)} disabled={saving} style={{
                      padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                      background: `${C.green}15`, color: C.green, border: `1px solid ${C.green}40`,
                      cursor: saving ? 'wait' : 'pointer', flexShrink: 0,
                    }}>{saving ? '…' : 'Fix'}</button>
                  )}
                  {applied && (
                    <span style={{ fontSize: 11, color: C.green, fontWeight: 700, flexShrink: 0 }}>✓ Fixed</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Action bar */}
        <div style={{ padding: '12px 16px 28px', borderTop: `1px solid ${C.border}`, display: 'flex', gap: 8, flexShrink: 0 }}>
          {pendingItems.length > 0 && (
            <button onClick={fixAll} disabled={saving} style={{
              flex: 2, padding: '13px 10px', borderRadius: 10, fontSize: 13, fontWeight: 700,
              background: C.green, color: '#fff', border: 'none', cursor: 'pointer',
            }}>⚡ Fix All ({pendingItems.length})</button>
          )}
          {!['reviewed', 'rejected', 'applied'].includes(count.status) && (
            <button onClick={markReviewed} style={{
              flex: 1, padding: '13px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: `${C.blue}15`, color: C.blue, border: `1px solid ${C.blue}40`, cursor: 'pointer',
            }}>Reviewed</button>
          )}
          {count.status !== 'rejected' && count.status !== 'applied' && (
            <button onClick={reject} style={{
              flex: 1, padding: '13px 8px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}30`, cursor: 'pointer',
            }}>Reject</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Tab ──────────────────────────────────────────────────────────────────
export default function InventoryTab() {
  const [products, setProducts]               = useState(() => loadAllProducts())
  const [counts,   setCounts]                 = useState(() => loadDailyCounts())
  const [locFilter, setLocFilter]             = useState('all')
  const [search,   setSearch]                 = useState('')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedCount,   setSelectedCount]   = useState(null)
  const [adjProduct, setAdjProduct]           = useState(null)
  const [message,  setMessage]                = useState(null)
  const [showAllNotifs, setShowAllNotifs]     = useState(false)

  const reload = useCallback(() => {
    setProducts(loadAllProducts())
    setCounts(loadDailyCounts())
  }, [])

  function flash(text, color = C.green) {
    setMessage({ text, color })
    setTimeout(() => setMessage(null), 3500)
  }

  const locQty = useCallback((p, locId) => {
    const byLoc = p.qtyByLoc || {}
    if (Object.keys(byLoc).length > 0) return byLoc[locId] ?? 0
    return p.qty
  }, [])

  const productQty = useCallback((p) => {
    if (locFilter === 'all') {
      const byLoc = p.qtyByLoc || {}
      if (Object.keys(byLoc).length > 0) {
        return Object.values(byLoc).reduce((s, v) => s + (v || 0), 0)
      }
      return p.qty
    }
    return locQty(p, locFilter)
  }, [locFilter, locQty])

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const active = products.filter(p => p.status !== 'inactive')
    let totalUnits = 0, lowStock = 0, outOfStock = 0
    for (const p of active) {
      const qty = productQty(p)
      totalUnits += qty
      if (qty === 0) outOfStock++
      else if (qty <= LOW_STOCK) lowStock++
    }
    const pendingCounts = counts.filter(c => !['applied', 'rejected'].includes(c.status)).length
    const countErrors   = counts.filter(c => c.status === 'count_error').length
    return { total: active.length, totalUnits, lowStock, outOfStock, pendingCounts, countErrors }
  }, [products, counts, productQty])

  // ── Product list ───────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim()
    return products.filter(p => {
      if (p.status === 'inactive') return false
      if (!q) return true
      return (
        p.name?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
      )
    })
  }, [products, search])

  const sortedProducts = useMemo(() => [...filteredProducts].sort((a, b) => {
    const qa = productQty(a), qb = productQty(b)
    const pa = qa === 0 ? 0 : qa <= LOW_STOCK ? 1 : 2
    const pb = qb === 0 ? 0 : qb <= LOW_STOCK ? 1 : 2
    if (pa !== pb) return pa - pb
    return (a.name || '').localeCompare(b.name || '')
  }), [filteredProducts, productQty])

  // ── Pending counts ─────────────────────────────────────────────────────────
  const visibleCounts = useMemo(() =>
    counts.filter(c => {
      if (['applied', 'rejected'].includes(c.status)) return false
      if (locFilter !== 'all' && c.locationId !== locFilter) return false
      return true
    }),
  [counts, locFilter])

  // ── Notifications ──────────────────────────────────────────────────────────
  const notifications = useMemo(() => {
    const out = []
    for (const c of counts.filter(c => c.status === 'count_error'))
      out.push({ type: 'count_error', icon: '⚠', text: `Count Error: ${c.countNumber} — ${c.locationName}`, count: c })
    for (const c of counts.filter(c => !['applied', 'rejected', 'count_error'].includes(c.status)))
      out.push({ type: 'pending', icon: '📋', text: `Pending Count: ${c.countNumber} — ${c.locationName}`, count: c })
    for (const p of products.filter(p => p.status !== 'inactive' && productQty(p) === 0).slice(0, 10))
      out.push({ type: 'out_of_stock', icon: '🔴', text: `Out of Stock: ${p.name}`, product: p })
    for (const p of products.filter(p => {
      const q = productQty(p)
      return p.status !== 'inactive' && q > 0 && q <= LOW_STOCK
    }).slice(0, 10))
      out.push({ type: 'low_stock', icon: '🟡', text: `Low Stock (${productQty(p)} left): ${p.name}`, product: p })
    return out
  }, [counts, products, productQty])

  const shownNotifs = showAllNotifs ? notifications : notifications.slice(0, 4)

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* Flash */}
      {message && (
        <div style={{
          background: `${message.color}18`, border: `1px solid ${message.color}40`,
          borderRadius: 10, padding: '10px 14px', marginBottom: 14,
          fontSize: 13, color: message.color, fontWeight: 600,
        }}>{message.text}</div>
      )}

      {/* Location + refresh */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        {LOCS.map(l => (
          <button key={l.id} onClick={() => setLocFilter(l.id)} style={{
            padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
            border: `1px solid ${locFilter === l.id ? C.blue : C.border}`,
            background: locFilter === l.id ? `${C.blue}15` : C.card,
            color: locFilter === l.id ? C.blue : C.muted, whiteSpace: 'nowrap',
          }}>{l.icon} {l.id === 'all' ? 'All' : l.name.split(' ')[0]}</button>
        ))}
        <button onClick={reload} style={{
          padding: '6px 10px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
          border: `1px solid ${C.border}`, background: C.card, color: C.muted, marginLeft: 'auto',
        }}>↻</button>
      </div>

      {/* KPI Grid (2 rows × 3 cols) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Products',      value: kpis.total,         icon: '📦', color: C.blue,   alert: false },
          { label: 'Total Units',   value: kpis.totalUnits,    icon: '🔢', color: C.purple, alert: false },
          { label: 'Low Stock',     value: kpis.lowStock,      icon: '🟡', color: C.amber,  alert: kpis.lowStock > 0 },
          { label: 'Out of Stock',  value: kpis.outOfStock,    icon: '🔴', color: C.red,    alert: kpis.outOfStock > 0 },
          { label: 'Pending',       value: kpis.pendingCounts, icon: '📋', color: C.blue,   alert: false },
          { label: 'Count Errors',  value: kpis.countErrors,   icon: '⚠', color: C.red,    alert: kpis.countErrors > 0 },
        ].map(k => (
          <div key={k.label} style={{
            background: C.card, borderRadius: 12, padding: '11px 6px', textAlign: 'center',
            border: `1px solid ${k.alert ? k.color + '45' : C.border}`,
          }}>
            <div style={{ fontSize: 16, marginBottom: 2 }}>{k.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: k.color, lineHeight: 1 }}>{k.value}</div>
            <div style={{ fontSize: 8, fontWeight: 700, color: C.muted, marginTop: 3, letterSpacing: 0.3, lineHeight: 1.3 }}>
              {k.label.toUpperCase()}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <span style={{
          position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
          fontSize: 14, opacity: 0.4, pointerEvents: 'none',
        }}>🔍</span>
        <input
          placeholder="Name, barcode, or category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 36px 10px 34px',
            background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
            fontSize: 13, color: C.text, outline: 'none',
          }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 16, padding: 0,
          }}>✕</button>
        )}
      </div>

      {/* Notifications */}
      {notifications.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <SectionLabel>ALERTS ({notifications.length})</SectionLabel>
            {notifications.length > 4 && (
              <button onClick={() => setShowAllNotifs(v => !v)} style={{
                background: 'none', border: 'none', fontSize: 11, color: C.blue,
                cursor: 'pointer', padding: 0, marginBottom: 8,
              }}>
                {showAllNotifs ? 'Show less ▲' : `+${notifications.length - 4} more ▼`}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shownNotifs.map((n, i) => (
              <div key={i} onClick={() => {
                if (n.count) setSelectedCount(n.count)
                else if (n.product) setSelectedProduct(n.product)
              }} style={{
                background: C.card, borderRadius: 8, padding: '9px 12px',
                border: `1px solid ${n.type === 'out_of_stock' || n.type === 'count_error' ? C.red + '35' : C.amber + '35'}`,
                fontSize: 12, color: C.text, display: 'flex', alignItems: 'center', gap: 8,
                cursor: (n.count || n.product) ? 'pointer' : 'default',
              }}>
                <span style={{ fontSize: 14 }}>{n.icon}</span>
                <span style={{ flex: 1 }}>{n.text}</span>
                {(n.count || n.product) && (
                  <span style={{ color: C.blue, fontSize: 11, flexShrink: 0 }}>→</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Daily Counts */}
      {visibleCounts.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <SectionLabel count={visibleCounts.length}>PENDING COUNTS</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {visibleCounts.map(c => {
              const diffs = c.items.filter(it => it.difference !== 0).length
              return (
                <div key={c.id} onClick={() => setSelectedCount(c)} style={{
                  background: C.card, borderRadius: 10, padding: '12px 14px',
                  border: `1px solid ${c.status === 'count_error' ? C.red + '40' : C.border}`,
                  cursor: 'pointer',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{c.countNumber}</span>
                    <StatusBadge status={c.status} />
                    <span style={{ marginLeft: 'auto', color: C.blue, fontSize: 11 }}>Review →</span>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted }}>
                    📍 {c.locationName} · 👤 {c.submittedBy} · {new Date(c.submittedAt).toLocaleDateString()}
                  </div>
                  {diffs > 0 && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 3, fontWeight: 600 }}>
                      ⚠ {diffs} difference{diffs !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Product List */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <SectionLabel count={filteredProducts.length}>PRODUCTS</SectionLabel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sortedProducts.slice(0, 60).map(p => {
          const qty   = productQty(p)
          const isOut = qty === 0
          const isLow = qty > 0 && qty <= LOW_STOCK
          return (
            <div key={p.id} onClick={() => setSelectedProduct(p)} style={{
              background: C.card, borderRadius: 10, padding: '11px 14px',
              border: `1px solid ${isOut ? C.red + '40' : isLow ? C.amber + '40' : C.border}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: C.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{p.name}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  {p.category}{p.size ? ` · ${p.size}` : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{
                  fontSize: 22, fontWeight: 900, lineHeight: 1,
                  color: isOut ? C.red : isLow ? C.amber : C.green,
                }}>{qty}</div>
                {isOut && <div style={{ fontSize: 8, fontWeight: 700, color: C.red, letterSpacing: 0.5 }}>OUT</div>}
                {isLow && <div style={{ fontSize: 8, fontWeight: 700, color: C.amber, letterSpacing: 0.5 }}>LOW</div>}
              </div>
            </div>
          )
        })}

        {sortedProducts.length === 0 && (
          <div style={{ textAlign: 'center', padding: 44, color: C.muted, fontSize: 14 }}>
            {search ? `No results for "${search}"` : 'No products found'}
          </div>
        )}

        {sortedProducts.length > 60 && (
          <div style={{ textAlign: 'center', padding: '10px 0 4px', fontSize: 12, color: C.muted }}>
            Showing 60 of {sortedProducts.length} — search to filter
          </div>
        )}
      </div>

      {/* Modals */}
      {selectedProduct && !adjProduct && (
        <ProductDetailModal
          product={selectedProduct}
          locQty={locQty}
          onAdjust={p => { setAdjProduct(p); setSelectedProduct(null) }}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {adjProduct && (
        <AdjustmentModal
          product={adjProduct}
          locFilter={locFilter}
          locQty={locQty}
          onClose={() => setAdjProduct(null)}
          onDone={msg => { reload(); flash(msg) }}
        />
      )}

      {selectedCount && (
        <CountReviewModal
          count={selectedCount}
          onClose={() => { setSelectedCount(null); reload() }}
          onDone={msg => { reload(); flash(msg); setSelectedCount(null) }}
        />
      )}
    </div>
  )
}
