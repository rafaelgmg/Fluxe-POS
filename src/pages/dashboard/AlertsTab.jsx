/**
 * AlertsTab.jsx — Inventory Alerts Center
 * Dashboard App > More > Alerts
 *
 * READ-ONLY aggregator. Sources:
 *   - computeForecast()     → Transfer Needed, Reorder Needed, Out of Stock, Low Stock
 *   - fetchTransferDrafts() → deduplicate transfer alerts already drafted
 *   - fetchDailyCounts()    → Count Submitted, Count Discrepancy (last 48h)
 *
 * SAFE: never modifies stock. Transfer drafts created only on explicit user tap.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { loadAllProducts }          from '../../utils/productsStorage'
import {
  fetchProducts,
  fetchSalesInRange,
  fetchTransferDrafts,
  getLocationUUID,
  getLocationUUIDByName,
} from '../../services/supabaseRead'
import { createTransferDraft }      from '../../services/supabaseWrite'
import { computeForecast }          from '../../services/forecastEngine'
import { fetchDailyCounts }         from '../../services/supabaseDailyCounts'
import { getRetailLocations, getWarehouseLocations } from '../../utils/locationHelpers'

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', sub: '#374151', muted: '#6B7280', dim: '#9CA3AF',
  green: '#10B981', blue: '#3B82F6', purple: '#8B5CF6',
  amber: '#F59E0B', red: '#EF4444', orange: '#F97316',
}

const SEV = {
  critical: { color: C.red,    bg: `${C.red}14`,   border: `${C.red}35`,   label: 'CRITICAL' },
  warning:  { color: C.amber,  bg: `${C.amber}12`,  border: `${C.amber}35`, label: 'WARNING'  },
  info:     { color: C.blue,   bg: `${C.blue}10`,   border: `${C.blue}28`,  label: 'INFO'     },
}

const FILTERS = [
  { id: 'all',      label: 'All',       icon: '🔔' },
  { id: 'stock',    label: 'Stock',     icon: '📦' },
  { id: 'transfer', label: 'Transfers', icon: '↔'  },
  { id: 'reorder',  label: 'Reorder',   icon: '🛍️' },
  { id: 'counts',   label: 'Counts',    icon: '📋' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function loadLocalSales90() {
  try {
    const raw = localStorage.getItem('fluxe-sales-v1')
    if (!raw) return []
    const cutoff = Date.now() - 90 * 86_400_000
    return JSON.parse(raw).filter(s => {
      if (s.status === 'voided') return false
      const ts = new Date(s.timestamp || s.completedAt || s.createdAt || 0).getTime()
      return ts >= cutoff
    })
  } catch { return [] }
}

function fmtTs(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

// ── Alert generation ────────────────────────────────────────────────────────────
function buildAlerts({ forecastRows, drafts, recentCounts }) {
  const list = []
  let seq = 0
  const nid = () => `a${++seq}`

  // draft dedup key: productId || toLocationUUID
  const draftSet = new Set(drafts.map(d => `${d.productId}||${d.toLocationId}`))

  // 1. Out of Stock
  for (const row of forecastRows) {
    if (!row.product || row.product.status === 'inactive') continue
    if (row.retailStock === 0) {
      list.push({
        id: nid(), type: 'out_of_stock', severity: 'critical', category: 'stock',
        icon: '🚫', title: 'Out of Stock',
        product: row.product, location: row.location, stock: 0, row,
      })
    }
  }

  // 2. Low Stock (0 < stock <= reorderPoint)
  for (const row of forecastRows) {
    if (!row.product || row.product.status === 'inactive') continue
    const threshold = row.reorderPoint ?? row.product?.reorderPoint ?? null
    if (threshold == null || threshold <= 0) continue
    if (row.retailStock > 0 && row.retailStock <= threshold) {
      list.push({
        id: nid(), type: 'low_stock', severity: 'warning', category: 'stock',
        icon: '📉', title: 'Low Stock',
        product: row.product, location: row.location,
        stock: row.retailStock, threshold, row,
      })
    }
  }

  // 3. Transfer Needed (skip if draft already exists for this product → location)
  for (const row of forecastRows) {
    if (row.suggestedTransfer <= 0) continue
    const toUUID = getLocationUUID(row.location.id) || getLocationUUIDByName(row.location.name) || null
    if (toUUID && draftSet.has(`${row.product.id}||${toUUID}`)) continue
    list.push({
      id: nid(), type: 'transfer_needed',
      severity: row.urgency === 'critical' ? 'critical' : 'warning',
      category: 'transfer', icon: '↔', title: 'Transfer Needed',
      product: row.product, location: row.location,
      suggestedQty: row.suggestedTransfer, row,
    })
  }

  // 4. Reorder Needed
  for (const row of forecastRows) {
    if (row.suggestedReorder <= 0) continue
    list.push({
      id: nid(), type: 'reorder_needed',
      severity: row.urgency === 'critical' ? 'critical' : 'warning',
      category: 'reorder', icon: '🛍️', title: 'Reorder Needed',
      product: row.product, location: row.location,
      supplier: row.supplier, suggestedQty: row.suggestedReorder, row,
    })
  }

  // 5. Count Submitted (no discrepancy)
  for (const count of recentCounts) {
    const hasError = (count.items || []).some(i =>
      Math.abs((i.countedQty ?? i.counted ?? 0) - (i.systemQty ?? i.system ?? 0)) !== 0
    )
    if (!hasError) {
      list.push({
        id: nid(), type: 'count_submitted', severity: 'info', category: 'counts',
        icon: '✅', title: 'Count Submitted', count,
        ts: count.submittedAt || count.createdAt,
      })
    }
  }

  // 6. Count Discrepancy
  for (const count of recentCounts) {
    const errors = (count.items || []).filter(i => {
      const counted = i.countedQty ?? i.counted ?? null
      const system  = i.systemQty  ?? i.system  ?? null
      return counted !== null && system !== null && counted !== system
    })
    if (errors.length > 0) {
      list.push({
        id: nid(), type: 'count_error', severity: 'warning', category: 'counts',
        icon: '⚠️', title: 'Count Discrepancy',
        count, errors, ts: count.submittedAt || count.createdAt,
      })
    }
  }

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 }
  return list.sort((a, b) => order[a.severity] - order[b.severity])
}

// ── TransferAction — inline qty stepper + create draft button ─────────────────
function TransferAction({ alert, warehouseLoc, onDismiss, addDraft }) {
  const [qty,     setQty]     = useState(alert.suggestedQty || 1)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState(null)

  const create = async () => {
    setLoading(true); setError(null)
    try {
      const fromUUID = getLocationUUIDByName(warehouseLoc?.name) || getLocationUUID(warehouseLoc?.id)
      const toUUID   = getLocationUUID(alert.location.id)        || getLocationUUIDByName(alert.location.name)
      if (!fromUUID || !toUUID) {
        setError('UUIDs not ready — retry in a moment')
        return
      }
      const draftId = await createTransferDraft({
        productId:        alert.product.id,
        productName:      alert.product.name,
        barcode:          alert.product.barcode || '',
        qty,
        fromLocationUUID: fromUUID,
        fromLocationName: warehouseLoc?.name || '',
        toLocationUUID:   toUUID,
        toLocationName:   alert.location.name,
        note:             'Created from Alerts',
      })
      if (draftId) {
        addDraft({ id: draftId, productId: alert.product.id, toLocationId: toUUID, status: 'draft' })
        onDismiss(alert.id)
      }
    } catch (e) {
      setError(e.message || 'Failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {/* Qty stepper */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden',
      }}>
        <button
          onClick={() => setQty(q => Math.max(1, q - 1))}
          style={{ width: 32, height: 32, background: C.bg, border: 'none', fontSize: 16, cursor: 'pointer', color: C.text }}
        >−</button>
        <span style={{ width: 32, textAlign: 'center', fontSize: 13, fontWeight: 700, color: C.text }}>{qty}</span>
        <button
          onClick={() => setQty(q => q + 1)}
          style={{ width: 32, height: 32, background: C.bg, border: 'none', fontSize: 16, cursor: 'pointer', color: C.text }}
        >+</button>
      </div>

      <button
        onClick={create}
        disabled={loading}
        style={{
          padding: '6px 14px', borderRadius: 8, border: 'none', cursor: loading ? 'default' : 'pointer',
          background: loading ? C.dim : C.blue, color: '#fff',
          fontSize: 12, fontWeight: 700, opacity: loading ? 0.7 : 1,
          transition: 'opacity 0.15s',
        }}
      >{loading ? '…' : 'Create Draft'}</button>

      {error && <span style={{ fontSize: 11, color: C.red }}>{error}</span>}
    </div>
  )
}

// ── AlertCard ──────────────────────────────────────────────────────────────────
function AlertCard({ alert, warehouseLoc, onNavigate, onDismiss, addDraft }) {
  const sev = SEV[alert.severity]

  let body = null
  switch (alert.type) {
    case 'out_of_stock':
      body = (
        <div style={{ fontSize: 13, color: C.sub }}>
          <strong>{alert.product.name}</strong>
          <span style={{ color: C.muted }}> · {alert.location.name}</span>
          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: C.red }}>Stock: 0 units</div>
        </div>
      )
      break

    case 'low_stock':
      body = (
        <div style={{ fontSize: 13, color: C.sub }}>
          <strong>{alert.product.name}</strong>
          <span style={{ color: C.muted }}> · {alert.location.name}</span>
          <div style={{ marginTop: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 700, color: C.amber }}>Stock: {alert.stock}</span>
            <span style={{ color: C.muted }}> / threshold: {alert.threshold}</span>
          </div>
        </div>
      )
      break

    case 'transfer_needed':
      body = (
        <div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            <strong>{alert.product.name}</strong>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {warehouseLoc?.name || 'Warehouse'} → {alert.location.name}
              <span style={{ color: C.amber, marginLeft: 8, fontWeight: 600 }}>
                Suggested: {alert.suggestedQty} units
              </span>
            </div>
          </div>
          <TransferAction
            alert={alert}
            warehouseLoc={warehouseLoc}
            onDismiss={onDismiss}
            addDraft={addDraft}
          />
        </div>
      )
      break

    case 'reorder_needed':
      body = (
        <div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 8 }}>
            <strong>{alert.product.name}</strong>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              Supplier: <span style={{ fontWeight: 600 }}>{alert.supplier || 'Unknown'}</span>
              <span style={{ color: C.amber, marginLeft: 8, fontWeight: 600 }}>
                Suggested: {alert.suggestedQty} units
              </span>
            </div>
          </div>
          <button
            onClick={() => onNavigate('purchase')}
            style={{
              padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${C.purple}40`, background: `${C.purple}10`,
              color: C.purple, fontSize: 12, fontWeight: 700,
            }}
          >View Purchase Plan</button>
        </div>
      )
      break

    case 'count_submitted':
      body = (
        <div style={{ fontSize: 13, color: C.sub }}>
          <strong>{alert.count.locationName || alert.count.location || 'Location'}</strong>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
            By: {alert.count.submittedBy || '—'}
            {alert.ts && <span style={{ marginLeft: 8 }}>{fmtTs(alert.ts)}</span>}
          </div>
          {alert.count.status && (
            <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: C.blue }}>
              Status: {alert.count.status}
            </div>
          )}
        </div>
      )
      break

    case 'count_error': {
      const { errors } = alert
      body = (
        <div>
          <div style={{ fontSize: 13, color: C.sub, marginBottom: 6 }}>
            <strong>{alert.count.locationName || alert.count.location || 'Location'}</strong>
            <span style={{ color: C.muted }}>
              {' '}· {errors.length} item{errors.length !== 1 ? 's' : ''} with discrepancy
            </span>
            {alert.ts && (
              <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{fmtTs(alert.ts)}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {errors.slice(0, 3).map((item, i) => {
              const counted = item.countedQty ?? item.counted ?? 0
              const system  = item.systemQty  ?? item.system  ?? 0
              const delta   = counted - system
              return (
                <div
                  key={i}
                  style={{
                    fontSize: 11, color: C.muted,
                    background: C.bg, borderRadius: 6, padding: '4px 8px',
                  }}
                >
                  {item.productName || 'Item'}:
                  <span style={{
                    fontWeight: 700, marginLeft: 4,
                    color: delta < 0 ? C.red : C.amber,
                  }}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                  <span style={{ marginLeft: 4 }}>(counted {counted}, system {system})</span>
                </div>
              )
            })}
            {errors.length > 3 && (
              <div style={{ fontSize: 11, color: C.dim }}>+{errors.length - 3} more</div>
            )}
          </div>
        </div>
      )
      break
    }

    default: break
  }

  return (
    <div style={{
      background: C.card, borderRadius: 14,
      border: `1px solid ${sev.border}`,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Severity stripe */}
      <div style={{
        background: sev.bg, padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 15 }}>{alert.icon}</span>
        <span style={{ flex: 1, fontSize: 12, fontWeight: 800, color: sev.color }}>{alert.title}</span>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
          padding: '2px 7px', borderRadius: 20,
          background: sev.color, color: '#fff',
        }}>{sev.label}</span>
      </div>
      {/* Body */}
      <div style={{ padding: '10px 14px 12px' }}>{body}</div>
    </div>
  )
}

// ── Summary chip ───────────────────────────────────────────────────────────────
function Chip({ label, count, color }) {
  if (!count) return null
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: `${color}14`, border: `1px solid ${color}30`,
      borderRadius: 20, padding: '3px 10px',
    }}>
      <span style={{ fontSize: 12, fontWeight: 800, color }}>{count}</span>
      <span style={{ fontSize: 11, color, opacity: 0.8 }}>{label}</span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AlertsTab({ onNavigate }) {
  const [products,     setProducts]     = useState(() => loadAllProducts())
  const [sales,        setSales]        = useState(() => loadLocalSales90())
  const [loading,      setLoading]      = useState(true)
  const [fetchedAt,    setFetchedAt]    = useState(null)
  const [drafts,       setDrafts]       = useState([])
  const [recentCounts, setRecentCounts] = useState([])
  const [dismissedIds, setDismissedIds] = useState(new Set())
  const [filter,       setFilter]       = useState('all')

  const retailLocs   = useMemo(() => getRetailLocations(),    [])
  const warehouseLocs= useMemo(() => getWarehouseLocations(), [])
  const warehouseLoc = warehouseLocs[0] || null

  useEffect(() => {
    const from = new Date(Date.now() - 90 * 86_400_000)
    const to   = new Date()
    Promise.all([
      fetchProducts(),
      fetchSalesInRange(from, to),
      fetchTransferDrafts(),
      fetchDailyCounts(),
    ]).then(([rp, rs, rd, rc]) => {
      if (rp?.length)  setProducts(rp)
      if (rs?.length)  setSales(rs)
      if (rd?.length)  setDrafts(rd)
      if (rc?.length) {
        const cutoff = Date.now() - 48 * 3_600_000
        setRecentCounts(rc.filter(c =>
          new Date(c.submittedAt || c.createdAt || 0).getTime() >= cutoff
        ))
      }
      setFetchedAt(new Date())
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const forecastRows = useMemo(() => {
    if (!products.length) return []
    return computeForecast({
      products, sales,
      retailLocations:    retailLocs,
      warehouseLocations: warehouseLocs,
      salesWindowDays:    90,
    })
  }, [products, sales, retailLocs, warehouseLocs])

  const allAlerts = useMemo(() =>
    buildAlerts({ forecastRows, drafts, recentCounts })
  , [forecastRows, drafts, recentCounts])

  const visibleAlerts = useMemo(() => {
    const active = allAlerts.filter(a => !dismissedIds.has(a.id))
    if (filter === 'all') return active
    return active.filter(a => a.category === filter)
  }, [allAlerts, dismissedIds, filter])

  const counts = useMemo(() => {
    const active = allAlerts.filter(a => !dismissedIds.has(a.id))
    return {
      total:    active.length,
      critical: active.filter(a => a.severity === 'critical').length,
      stock:    active.filter(a => a.category === 'stock').length,
      transfer: active.filter(a => a.category === 'transfer').length,
      reorder:  active.filter(a => a.category === 'reorder').length,
      counts:   active.filter(a => a.category === 'counts').length,
    }
  }, [allAlerts, dismissedIds])

  const catCount = { all: counts.total, stock: counts.stock, transfer: counts.transfer, reorder: counts.reorder, counts: counts.counts }

  const dismiss  = useCallback(id => setDismissedIds(prev => new Set([...prev, id])), [])
  const addDraft = useCallback(d  => setDrafts(prev => [...prev, d]), [])

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Inventory Alerts</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
              {loading
                ? '⟳ Loading…'
                : fetchedAt
                  ? `Updated ${fmtTs(fetchedAt.toISOString())}`
                  : 'No data yet'}
            </div>
          </div>
        </div>
        {/* Summary chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <Chip label="Critical"  count={counts.critical} color={C.red}    />
          <Chip label="Transfers" count={counts.transfer} color={C.amber}  />
          <Chip label="Reorder"   count={counts.reorder}  color={C.purple} />
          <Chip label="Stock"     count={counts.stock}    color={C.orange} />
        </div>
      </div>

      {/* Filter pills */}
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto',
        paddingBottom: 4, marginBottom: 14, scrollbarWidth: 'none',
      }}>
        {FILTERS.map(f => {
          const active = filter === f.id
          const n = catCount[f.id] || 0
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
                border: `1.5px solid ${active ? C.blue : C.border}`,
                background: active ? `${C.blue}12` : C.card,
                fontSize: 12, fontWeight: 700,
                color: active ? C.blue : C.sub,
                transition: 'all 0.15s',
              }}
            >
              <span>{f.icon}</span>
              {f.label}
              {n > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 800,
                  background: active ? C.blue : C.dim,
                  color: '#fff', borderRadius: 10, padding: '1px 5px',
                }}>{n}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 14 }}>
          Loading alerts…
        </div>
      ) : visibleAlerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>No alerts</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            {filter !== 'all' ? 'No alerts in this category.' : 'Inventory looks good.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleAlerts.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              warehouseLoc={warehouseLoc}
              onNavigate={onNavigate}
              onDismiss={dismiss}
              addDraft={addDraft}
            />
          ))}
        </div>
      )}
    </div>
  )
}
