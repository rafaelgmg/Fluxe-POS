/**
 * ForecastTab.jsx — Inventory Forecast & Reorder Suggestions
 * Dashboard App > Inventory > Forecast
 *
 * READ-ONLY forecast engine. Transfer drafts create a pending record only;
 * no stock is moved until the draft is explicitly Completed.
 */

import { useState, useMemo, useEffect, useCallback } from 'react'
import { loadAllProducts } from '../../utils/productsStorage'
import {
  fetchProducts,
  fetchSalesInRange,
  fetchTransferDrafts,
  getLocationUUID,
  getLocationUUIDByName,
} from '../../services/supabaseRead'
import { getRetailLocations, getWarehouseLocations } from '../../utils/locationHelpers'
import { computeForecast, forecastSummary } from '../../services/forecastEngine'
import {
  createTransferDraft,
  completeDraftTransfer,
  cancelTransferDraft,
} from '../../services/supabaseWrite'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', sub: '#374151', muted: '#6B7280', dim: '#9CA3AF',
  green: '#10B981', blue: '#3B82F6', purple: '#8B5CF6',
  amber: '#F59E0B', red: '#EF4444', orange: '#F97316',
}

const URGENCY_CFG = {
  critical: { label: 'Critical', color: C.red,   bg: `${C.red}12`,   border: `${C.red}30`,   icon: '🔴' },
  warning:  { label: 'Warning',  color: C.amber, bg: `${C.amber}12`, border: `${C.amber}30`, icon: '🟡' },
  monitor:  { label: 'Monitor',  color: C.blue,  bg: `${C.blue}12`,  border: `${C.blue}30`,  icon: '👁' },
  healthy:  { label: 'Healthy',  color: C.green, bg: `${C.green}12`, border: `${C.green}30`, icon: '✅' },
}

const ACTION_CFG = {
  transfer: { label: 'TRANSFER', color: C.purple, bg: `${C.purple}15` },
  reorder:  { label: 'REORDER',  color: C.amber,  bg: `${C.amber}15`  },
  monitor:  { label: 'MONITOR',  color: C.blue,   bg: `${C.blue}12`   },
  ok:       { label: 'OK',       color: C.green,  bg: `${C.green}12`  },
}

function fmt1(n) {
  if (!isFinite(n)) return '∞'
  return n % 1 === 0 ? String(n) : n.toFixed(1)
}

function fmtDays(d) {
  if (!isFinite(d)) return '∞ days'
  if (d < 1) return '< 1 day'
  return `${Math.floor(d)}d`
}

function fmtDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

// ── Local sales fallback ──────────────────────────────────────────────────────
function loadLocalSalesLast30() {
  try {
    const raw = localStorage.getItem('fluxe-sales-v1')
    if (!raw) return []
    const cutoff = Date.now() - 30 * 86_400_000
    return JSON.parse(raw).filter(s => {
      if (s.status === 'voided') return false
      const ts = new Date(s.timestamp || s.completedAt || s.createdAt).getTime()
      return ts >= cutoff
    })
  } catch { return [] }
}

// ── Summary card ─────────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, color, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 0, background: C.card, borderRadius: 12, padding: '10px 8px',
      border: `1.5px solid ${active ? color : C.border}`,
      textAlign: 'center', cursor: 'pointer',
      boxShadow: active ? `0 2px 8px ${color}25` : 'none',
      transition: 'all 0.15s',
    }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 700, color: active ? color : C.muted, marginTop: 3, letterSpacing: 0.3, lineHeight: 1.3 }}>
        {label.toUpperCase()}
      </div>
    </button>
  )
}

// ── Pending transfer drafts ───────────────────────────────────────────────────
function PendingTransfers({ drafts, onComplete, onCancel, submitting }) {
  if (!drafts.length) return null
  return (
    <div style={{ marginBottom: 14, background: `${C.purple}08`, border: `1px solid ${C.purple}25`, borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px 8px', borderBottom: `1px solid ${C.purple}20`, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.purple }}>↔ Pending Transfers</span>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: C.purple, color: '#fff' }}>
          {drafts.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {drafts.map((draft, i) => (
          <div key={draft.id} style={{
            padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
            borderTop: i > 0 ? `1px solid ${C.purple}15` : 'none',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {draft.productName}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
                {draft.fromLocationName} → {draft.toLocationName}
                <span style={{ marginLeft: 6, fontWeight: 700, color: C.purple }}>×{draft.qty}</span>
              </div>
              {draft.createdAt && (
                <div style={{ fontSize: 9, color: C.dim, marginTop: 1 }}>{fmtDate(draft.createdAt)}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
              <button
                disabled={submitting}
                onClick={() => onComplete(draft)}
                style={{
                  padding: '5px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer', border: 'none',
                  background: submitting ? C.border : C.green, color: submitting ? C.muted : '#fff',
                }}
              >
                ✓ Complete
              </button>
              <button
                disabled={submitting}
                onClick={() => onCancel(draft.id)}
                style={{
                  padding: '5px 8px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                  cursor: submitting ? 'default' : 'pointer',
                  background: 'transparent', color: submitting ? C.dim : C.red,
                  border: `1px solid ${submitting ? C.dim : `${C.red}40`}`,
                }}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Transfer draft creation modal ─────────────────────────────────────────────
function TransferDraftModal({ row, warehouseLocs, onConfirm, onClose, submitting }) {
  const [qty,    setQty]    = useState(row.suggestedTransfer || 1)
  const [fromId, setFromId] = useState(warehouseLocs[0]?.id || '')
  const [note,   setNote]   = useState('')

  const fromLoc = warehouseLocs.find(l => l.id === fromId) || warehouseLocs[0]
  const maxQty  = row.warehouseStock

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, background: C.card,
          borderRadius: '16px 16px 0 0', padding: '20px 18px 32px',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Create Transfer Draft</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 20, lineHeight: 1, padding: 0 }}
          >✕</button>
        </div>

        {/* Product */}
        <div style={{ padding: '10px 12px', background: C.bg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{row.product.name}</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            {row.product.category}{row.product.size ? ` · ${row.product.size}` : ''}
            {row.product.barcode ? ` · #${row.product.barcode}` : ''}
          </div>
        </div>

        {/* From / To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 20px 1fr', gap: 6, marginBottom: 14, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 4 }}>FROM</div>
            {warehouseLocs.length > 1 ? (
              <select
                value={fromId}
                onChange={e => setFromId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12, fontWeight: 600, background: C.card, color: C.text, outline: 'none' }}
              >
                {warehouseLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            ) : (
              <div style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.purple}40`, background: `${C.purple}08`, fontSize: 12, fontWeight: 700, color: C.purple }}>
                📦 {fromLoc?.name || '—'}
              </div>
            )}
          </div>
          <div style={{ textAlign: 'center', color: C.dim, fontSize: 14, marginTop: 14 }}>→</div>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 4 }}>TO</div>
            <div style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.blue}40`, background: `${C.blue}08`, fontSize: 12, fontWeight: 700, color: C.blue }}>
              📍 {row.location.name}
            </div>
          </div>
        </div>

        {/* Qty */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 4 }}>
            QUANTITY
            <span style={{ fontWeight: 400, color: C.dim, marginLeft: 4 }}>(max {maxQty} in warehouse)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setQty(q => Math.max(1, q - 1))}
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 18, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
            >−</button>
            <input
              type="number"
              min={1}
              max={maxQty}
              value={qty}
              onChange={e => setQty(Math.max(1, Math.min(maxQty, parseInt(e.target.value) || 1)))}
              style={{ flex: 1, textAlign: 'center', padding: '8px', border: `1.5px solid ${C.purple}60`, borderRadius: 8, fontSize: 18, fontWeight: 700, color: C.text, outline: 'none' }}
            />
            <button
              onClick={() => setQty(q => Math.min(maxQty, q + 1))}
              style={{ width: 36, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, fontSize: 18, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}
            >+</button>
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, marginBottom: 4 }}>NOTE (optional)</div>
          <input
            type="text"
            placeholder="e.g. Low stock at kiosk"
            value={note}
            onChange={e => setNote(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.text, outline: 'none', background: C.card, boxSizing: 'border-box' }}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 13, fontWeight: 700, color: C.muted, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            disabled={submitting || qty < 1}
            onClick={() => onConfirm({ fromLoc: fromLoc || warehouseLocs[0], qty, note })}
            style={{
              flex: 2, padding: '12px', borderRadius: 10, border: 'none',
              background: submitting ? C.border : C.purple,
              color: submitting ? C.muted : '#fff',
              fontSize: 13, fontWeight: 800, cursor: submitting ? 'default' : 'pointer',
            }}
          >
            {submitting ? '⟳ Creating…' : '↔ Create Draft'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Forecast row card ─────────────────────────────────────────────────────────
function ForecastCard({ row, onCreateTransfer }) {
  const [expanded, setExpanded] = useState(false)
  const urg = URGENCY_CFG[row.urgency]
  const act = ACTION_CFG[row.action]

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      style={{
        background: C.card, borderRadius: 12, padding: '12px 14px', cursor: 'pointer',
        border: `1px solid ${row.urgency === 'critical' ? `${C.red}40` : row.urgency === 'warning' ? `${C.amber}30` : C.border}`,
        boxShadow: row.urgency === 'critical' ? `0 2px 8px ${C.red}15` : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s',
      }}
    >
      {/* Row 1: product name + urgency badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.product.name}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {row.product.category}{row.product.size ? ` · ${row.product.size}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignItems: 'center' }}>
          {row.coreProduct && (
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: `${C.purple}15`, color: C.purple, border: `1px solid ${C.purple}30` }}>CORE</span>
          )}
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: urg.bg, border: `1px solid ${urg.border}`, color: urg.color }}>
            {urg.icon} {urg.label.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Row 2: stock + location */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.muted, fontWeight: 700 }}>📍 {row.location.name}</span>
        <span style={{ fontSize: 10, color: C.dim }}>·</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: row.retailStock === 0 ? C.red : row.retailStock <= 3 ? C.amber : C.green }}>
          Retail: {row.retailStock}
        </span>
        {row.warehouseStock > 0 && (
          <>
            <span style={{ fontSize: 10, color: C.dim }}>·</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: C.purple }}>WH: {row.warehouseStock}</span>
          </>
        )}
        {row.reorderStatus === 'seasonal' && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 5, background: `${C.amber}15`, color: C.amber, fontWeight: 700, border: `1px solid ${C.amber}30` }}>SEASONAL</span>
        )}
      </div>

      {/* Row 3: metrics strip */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {[
          { label: '30d sold',  value: String(row.sold30d) },
          { label: 'avg/day',   value: fmt1(row.avgDailySales) },
          { label: 'days left', value: fmtDays(row.daysUntilStockout), urgent: row.urgency === 'critical' },
        ].map(m => (
          <div key={m.label} style={{
            flex: 1, background: m.urgent ? `${C.red}08` : C.bg, borderRadius: 8, padding: '6px 4px', textAlign: 'center',
            border: `1px solid ${m.urgent ? `${C.red}25` : C.border}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: m.urgent ? C.red : C.text, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: 8, color: C.muted, marginTop: 2, fontWeight: 600, letterSpacing: 0.3 }}>{m.label.toUpperCase()}</div>
          </div>
        ))}
      </div>

      {/* Row 4: action suggestion + Create Draft button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: act.bg, borderRadius: 8, padding: '7px 10px' }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: act.color, flexShrink: 0 }}>{act.label}</span>
          {row.action === 'transfer' && (
            <span style={{ fontSize: 12, color: C.sub }}>
              Move <strong>{row.suggestedTransfer}</strong> unit{row.suggestedTransfer !== 1 ? 's' : ''} from Storage
            </span>
          )}
          {row.action === 'reorder' && (
            <span style={{ fontSize: 12, color: C.sub }}>
              Order <strong>{row.suggestedReorder}</strong> unit{row.suggestedReorder !== 1 ? 's' : ''}
              {row.supplier ? ` · ${row.supplier}` : ''}
            </span>
          )}
          {row.action === 'monitor' && (
            <span style={{ fontSize: 11, color: C.muted }}>
              {row.reorderStatus === 'seasonal' ? 'Seasonal — review manually' : 'Low velocity — monitor'}
            </span>
          )}
          {row.action === 'ok' && (
            <span style={{ fontSize: 11, color: C.muted }}>~{fmtDays(row.daysUntilStockout)} remaining</span>
          )}
        </div>
        {row.action === 'transfer' && onCreateTransfer && (
          <button
            onClick={e => { e.stopPropagation(); onCreateTransfer(row) }}
            style={{
              padding: '5px 10px', borderRadius: 7, border: 'none',
              background: C.purple, color: '#fff', fontSize: 11, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            + Draft
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
            {[
              ['7d sold',      String(row.sold7d)],
              ['14d sold',     String(row.sold14d)],
              ['Target stock', String(row.targetStock)],
              ['Total stock',  String(row.totalStock)],
              ['Lead time',    `${row.leadTime}d`],
              ['Reorder pt.',  row.reorderPoint != null ? String(row.reorderPoint) : '—'],
              ['Min target',   row.minStockTarget != null ? String(row.minStockTarget) : '—'],
              ['Supplier',     row.supplier || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                <span style={{ color: C.muted }}>{k}</span>
                <span style={{ color: C.text, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          {(row.suggestedTransfer > 0 && row.suggestedReorder > 0) && (
            <div style={{ marginTop: 8, padding: '6px 10px', background: `${C.amber}10`, borderRadius: 6, fontSize: 11, color: C.amber }}>
              ⚠ Partial warehouse coverage: transfer {row.suggestedTransfer} + order {row.suggestedReorder} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main ForecastTab ──────────────────────────────────────────────────────────
export default function ForecastTab() {
  const [products,   setProducts]   = useState(() => loadAllProducts())
  const [sales,      setSales]      = useState(() => loadLocalSalesLast30())
  const [loading,    setLoading]    = useState(true)
  const [fetchedAt,  setFetchedAt]  = useState(null)
  const [drafts,     setDrafts]     = useState([])
  const [draftModal, setDraftModal] = useState(null)  // ForecastRow | null
  const [submitting, setSubmitting] = useState(false)

  // Filters
  const [urgencyFilter, setUrgencyFilter] = useState('all')
  const [locFilter,     setLocFilter]     = useState('all')
  const [catFilter,     setCatFilter]     = useState('all')
  const [search,        setSearch]        = useState('')

  const retailLocs    = useMemo(() => getRetailLocations(),    [])
  const warehouseLocs = useMemo(() => getWarehouseLocations(), [])

  // Fetch fresh data + drafts on mount
  useEffect(() => {
    const from = new Date(Date.now() - 30 * 86_400_000)
    const to   = new Date()
    Promise.all([
      fetchProducts(),
      fetchSalesInRange(from, to),
      fetchTransferDrafts(),
    ]).then(([remoteProducts, remoteSales, remoteDrafts]) => {
      if (remoteProducts?.length) setProducts(remoteProducts)
      if (remoteSales?.length)    setSales(remoteSales)
      else                        setSales(loadLocalSalesLast30())
      if (remoteDrafts?.length)   setDrafts(remoteDrafts)
      setFetchedAt(new Date())
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // Forecast computation
  const allRows = useMemo(() => computeForecast({
    products,
    sales,
    retailLocations:    retailLocs,
    warehouseLocations: warehouseLocs,
  }), [products, sales, retailLocs, warehouseLocs])

  const summary = useMemo(() => forecastSummary(allRows), [allRows])

  const categories = useMemo(() => {
    const cats = new Set(allRows.map(r => r.product.category).filter(Boolean))
    return [...cats].sort()
  }, [allRows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return allRows.filter(r => {
      if (urgencyFilter !== 'all' && r.urgency !== urgencyFilter) return false
      if (locFilter     !== 'all' && r.location.id !== locFilter) return false
      if (catFilter     !== 'all' && r.product.category !== catFilter) return false
      if (q && !r.product.name?.toLowerCase().includes(q) &&
               !r.supplier?.toLowerCase().includes(q) &&
               !r.product.category?.toLowerCase().includes(q)) return false
      return true
    })
  }, [allRows, urgencyFilter, locFilter, catFilter, search])

  const hasWarehouse = warehouseLocs.length > 0

  // ── Transfer draft handlers ─────────────────────────────────────────────────

  const handleCreateDraft = useCallback(async ({ fromLoc, qty, note }) => {
    if (!draftModal) return
    setSubmitting(true)
    try {
      const row = draftModal

      // Resolve UUIDs: name-based first (covers dynamic warehouse), fallback to legacy ID
      const fromUUID = getLocationUUIDByName(fromLoc.name) || getLocationUUID(fromLoc.id)
      const toUUID   = getLocationUUID(row.location.id)    || getLocationUUIDByName(row.location.name)

      if (!fromUUID || !toUUID) {
        console.warn('[ForecastTab] Could not resolve location UUIDs', { fromLoc, toLoc: row.location })
        return
      }

      const draftId = await createTransferDraft({
        productId:        row.product.id,
        productName:      row.product.name,
        barcode:          row.product.barcode || '',
        qty,
        fromLocationUUID: fromUUID,
        fromLocationName: fromLoc.name,
        toLocationUUID:   toUUID,
        toLocationName:   row.location.name,
        note,
      })

      if (draftId) {
        // Optimistically prepend to local list
        setDrafts(prev => [{
          id:               draftId,
          productId:        row.product.id,
          productName:      row.product.name,
          barcode:          row.product.barcode || '',
          qty,
          fromLocationId:   fromUUID,
          fromLocationName: fromLoc.name,
          toLocationId:     toUUID,
          toLocationName:   row.location.name,
          status:           'draft',
          createdBy:        'Dashboard Owner',
          note,
          createdAt:        new Date().toISOString(),
        }, ...prev])
        setDraftModal(null)
      }
    } finally {
      setSubmitting(false)
    }
  }, [draftModal])

  const handleCompleteDraft = useCallback(async (draft) => {
    setSubmitting(true)
    try {
      // completeDraftTransfer expects snake_case fields matching the DB row
      const ok = await completeDraftTransfer({
        id:                 draft.id,
        product_id:         draft.productId,
        from_location_id:   draft.fromLocationId,
        to_location_id:     draft.toLocationId,
        qty:                draft.qty,
        product_name:       draft.productName,
        barcode:            draft.barcode,
        from_location_name: draft.fromLocationName,
        to_location_name:   draft.toLocationName,
        created_by:         draft.createdBy,
      })
      if (ok) setDrafts(prev => prev.filter(d => d.id !== draft.id))
    } finally {
      setSubmitting(false)
    }
  }, [])

  const handleCancelDraft = useCallback(async (draftId) => {
    setSubmitting(true)
    try {
      const ok = await cancelTransferDraft(draftId)
      if (ok) setDrafts(prev => prev.filter(d => d.id !== draftId))
    } finally {
      setSubmitting(false)
    }
  }, [])

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Forecast & Reorder</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {loading ? '⟳ Loading…' : fetchedAt
              ? `Updated ${fetchedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
              : 'Local data'}
            {' · '}{sales.length} sales (30d)
            {!hasWarehouse && ' · No warehouse configured'}
          </div>
        </div>
        {!hasWarehouse && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '3px 7px', borderRadius: 6, background: `${C.amber}15`, color: C.amber, border: `1px solid ${C.amber}30` }}>
            WH: None
          </span>
        )}
      </div>

      {/* Pending Transfer Drafts */}
      <PendingTransfers
        drafts={drafts}
        onComplete={handleCompleteDraft}
        onCancel={handleCancelDraft}
        submitting={submitting}
      />

      {/* Summary cards — 2 × 2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        <SummaryCard icon="🔴" label="Critical"        value={summary.critical}       color={C.red}    active={urgencyFilter === 'critical'} onClick={() => setUrgencyFilter(v => v === 'critical' ? 'all' : 'critical')} />
        <SummaryCard icon="🟡" label="Warning"         value={summary.warning}        color={C.amber}  active={urgencyFilter === 'warning'}  onClick={() => setUrgencyFilter(v => v === 'warning'  ? 'all' : 'warning')} />
        <SummaryCard icon="↔"  label="Transfer Needed" value={summary.transferNeeded} color={C.purple} active={false}                        onClick={() => {}} />
        <SummaryCard icon="📦" label="Reorder Needed"  value={summary.reorderNeeded}  color={C.orange} active={false}                        onClick={() => {}} />
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 10 }}>
        <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, opacity: 0.4, pointerEvents: 'none' }}>🔍</span>
        <input
          placeholder="Search product, supplier, category…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '9px 32px', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 13, color: C.text, outline: 'none', boxSizing: 'border-box' }}
        />
        {search && (
          <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 15, padding: 0 }}>✕</button>
        )}
      </div>

      {/* Filter pills — urgency */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {[
          { id: 'all',      label: `All (${allRows.length})`,        color: C.muted },
          { id: 'critical', label: `Critical (${summary.critical})`, color: C.red   },
          { id: 'warning',  label: `Warning (${summary.warning})`,   color: C.amber },
          { id: 'monitor',  label: `Monitor (${summary.monitor})`,   color: C.blue  },
        ].map(f => (
          <button key={f.id} onClick={() => setUrgencyFilter(f.id)} style={{
            padding: '5px 12px', borderRadius: 16, fontSize: 11, fontWeight: 700,
            whiteSpace: 'nowrap', cursor: 'pointer', border: '1px solid', flexShrink: 0,
            borderColor: urgencyFilter === f.id ? f.color : C.border,
            background:  urgencyFilter === f.id ? `${f.color}18` : C.card,
            color:       urgencyFilter === f.id ? f.color : C.muted,
          }}>{f.label}</button>
        ))}
      </div>

      {/* Filter row — location + category */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{
          padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
          background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none',
        }}>
          <option value="all">All locations</option>
          {retailLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        {categories.length > 0 && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none',
          }}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* No warehouse notice */}
      {!hasWarehouse && allRows.some(r => r.action === 'reorder') && (
        <div style={{ marginBottom: 12, padding: '10px 12px', background: `${C.amber}10`, border: `1px solid ${C.amber}30`, borderRadius: 10, fontSize: 11, color: C.amber }}>
          <strong>No warehouse configured.</strong> All suggestions are direct reorders. Add a Warehouse location in Admin → Locations to enable transfer suggestions.
        </div>
      )}

      {/* Results count */}
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>
        {filtered.length} item{filtered.length !== 1 ? 's' : ''} · tap to expand
      </div>

      {/* Forecast cards */}
      {loading && allRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13 }}>⟳ Loading forecast…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>All clear</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            {search || urgencyFilter !== 'all' || locFilter !== 'all'
              ? 'No items match your filters.'
              : 'No products need attention right now. Check back after more sales data is recorded.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((row, i) => (
            <ForecastCard
              key={`${row.product.id}-${row.location.id}-${i}`}
              row={row}
              onCreateTransfer={hasWarehouse ? () => setDraftModal(row) : null}
            />
          ))}
        </div>
      )}

      <div style={{ height: 24 }} />

      {/* Transfer Draft Modal */}
      {draftModal && (
        <TransferDraftModal
          row={draftModal}
          warehouseLocs={warehouseLocs}
          onConfirm={handleCreateDraft}
          onClose={() => { if (!submitting) setDraftModal(null) }}
          submitting={submitting}
        />
      )}
    </div>
  )
}
