/**
 * PurchasePlanTab.jsx — Purchase Planning
 * Dashboard App > More > Purchase
 *
 * Groups products with suggestedReorder > 0 by supplier.
 * Allows editing quantities before Copy or CSV export.
 * READ-ONLY: no stock changes, no POs created, no Supabase writes.
 */

import { useState, useMemo, useEffect } from 'react'
import { loadAllProducts } from '../../utils/productsStorage'
import { fetchProducts, fetchSalesInRange } from '../../services/supabaseRead'
import { getRetailLocations, getWarehouseLocations } from '../../utils/locationHelpers'
import { computeForecast } from '../../services/forecastEngine'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: '#F8FAFC', card: '#FFFFFF', border: '#E5E7EB',
  text: '#111827', sub: '#374151', muted: '#6B7280', dim: '#9CA3AF',
  green: '#10B981', blue: '#3B82F6', purple: '#8B5CF6',
  amber: '#F59E0B', red: '#EF4444', orange: '#F97316',
}

const URGENCY_COLOR = { critical: C.red, warning: C.amber, monitor: C.blue, healthy: C.green }
const URGENCY_ICON  = { critical: '🔴', warning: '🟡', monitor: '👁', healthy: '✅' }

const UNKNOWN_SUP = 'Unknown Supplier'

function rowKey(row) { return `${row.product.id}__${row.location.id}` }

function fmt1(n) {
  if (!isFinite(n) || n === 0) return '0'
  return n < 1 ? n.toFixed(2) : n % 1 === 0 ? String(n) : n.toFixed(1)
}

function loadLocalSales30() {
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

// ── Group rows by supplier ────────────────────────────────────────────────────
function groupBySupplier(rows) {
  const map = {}
  for (const row of rows) {
    const key = row.supplier?.trim() || UNKNOWN_SUP
    if (!map[key]) map[key] = []
    map[key].push(row)
  }
  return Object.entries(map).sort(([a], [b]) => {
    if (a === UNKNOWN_SUP) return 1
    if (b === UNKNOWN_SUP) return -1
    return a.localeCompare(b)
  })
}

// ── Copy text ─────────────────────────────────────────────────────────────────
function buildCopyText(grouped, overrides) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const lines = [`PURCHASE PLAN — ${date}`, '']
  for (const [supplier, rows] of grouped) {
    lines.push(`Supplier: ${supplier}`)
    for (const row of rows) {
      const qty = overrides[rowKey(row)] ?? row.suggestedReorder
      lines.push(`- ${row.product.name} — Qty: ${qty}`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

// ── CSV ───────────────────────────────────────────────────────────────────────
function buildCSV(rows, overrides) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'Supplier', 'Product', 'Barcode', 'Category', 'Location',
    'Retail Stock', 'WH Stock', 'Total Stock',
    '30d Sold', 'Avg/Day', 'Lead Time (days)', 'Urgency', 'Order Qty',
  ]
  const csvRows = rows.map(row => {
    const qty = overrides[rowKey(row)] ?? row.suggestedReorder
    return [
      esc(row.supplier || ''),
      esc(row.product.name),
      row.product.barcode || '',
      esc(row.product.category || ''),
      esc(row.location.name),
      row.retailStock,
      row.warehouseStock,
      row.totalStock,
      row.sold30d,
      row.avgDailySales.toFixed(3),
      row.leadTime,
      row.urgency,
      qty,
    ].join(',')
  })
  return [headers.join(','), ...csvRows].join('\n')
}

function triggerCSVDownload(csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `purchase-plan-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Summary card ──────────────────────────────────────────────────────────────
function SummaryCard({ icon, label, value, color }) {
  return (
    <div style={{
      flex: 1, background: C.card, borderRadius: 12, padding: '11px 8px',
      border: `1px solid ${C.border}`, textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 8, fontWeight: 700, color: C.muted, marginTop: 3, letterSpacing: 0.3, lineHeight: 1.3 }}>
        {label.toUpperCase()}
      </div>
    </div>
  )
}

// ── Plan item card (inside supplier section) ──────────────────────────────────
function PlanItemCard({ row, qty, onQtyChange }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(String(qty))
  const urgColor = URGENCY_COLOR[row.urgency] || C.muted

  const commit = () => {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n > 0) onQtyChange(n)
    else setDraft(String(qty))
    setEditing(false)
  }

  return (
    <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}` }}>

      {/* Name + urgency */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.product.name}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {row.product.category}{row.product.size ? ` · ${row.product.size}` : ''}
            {row.product.barcode ? <span style={{ color: C.dim }}> · #{row.product.barcode}</span> : ''}
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 7, flexShrink: 0,
          background: `${urgColor}12`, border: `1px solid ${urgColor}30`, color: urgColor,
        }}>
          {URGENCY_ICON[row.urgency]} {row.urgency.toUpperCase()}
        </span>
      </div>

      {/* Stock */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 5, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.muted }}>📍 {row.location.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: row.retailStock === 0 ? C.red : C.amber }}>
          Retail: {row.retailStock}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.purple }}>WH: {row.warehouseStock}</span>
        <span style={{ fontSize: 10, color: C.sub }}>Total: {row.totalStock}</span>
      </div>

      {/* Velocity */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.muted }}>
          30d: <strong style={{ color: C.text }}>{row.sold30d}</strong>
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>
          avg: <strong style={{ color: C.text }}>{fmt1(row.avgDailySales)}/day</strong>
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>
          lead: <strong style={{ color: C.text }}>{row.leadTime}d</strong>
        </span>
      </div>

      {/* Order qty */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: `${C.orange}10`, borderRadius: 8, padding: '8px 10px',
        border: `1px solid ${C.orange}25`,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>ORDER QTY</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => onQtyChange(Math.max(1, qty - 1))}
            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.sub, fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
          >−</button>

          {editing ? (
            <input
              autoFocus
              type="number" min={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => e.key === 'Enter' && commit()}
              style={{ width: 52, textAlign: 'center', padding: '3px 4px', border: `1.5px solid ${C.orange}`, borderRadius: 6, fontSize: 16, fontWeight: 800, color: C.text, outline: 'none' }}
            />
          ) : (
            <button
              onClick={() => { setDraft(String(qty)); setEditing(true) }}
              title="Tap to edit"
              style={{ minWidth: 32, textAlign: 'center', fontSize: 18, fontWeight: 900, color: C.text, background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', borderBottom: `1.5px dashed ${C.dim}` }}
            >
              {qty}
            </button>
          )}

          <button
            onClick={() => onQtyChange(qty + 1)}
            style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${C.border}`, background: C.bg, color: C.sub, fontSize: 14, cursor: 'pointer', fontWeight: 700 }}
          >+</button>
        </div>
      </div>
    </div>
  )
}

// ── Supplier section (accordion) ──────────────────────────────────────────────
function SupplierSection({ supplier, rows, qtyOverrides, onQtyChange }) {
  const [open, setOpen] = useState(true)

  const totalUnits = rows.reduce((s, r) => s + (qtyOverrides[rowKey(r)] ?? r.suggestedReorder), 0)
  const hasCritical = rows.some(r => r.urgency === 'critical')
  const hasWarning  = !hasCritical && rows.some(r => r.urgency === 'warning')
  const isUnknown   = supplier === UNKNOWN_SUP

  return (
    <div style={{
      background: C.card, borderRadius: 14, overflow: 'hidden',
      border: `1px solid ${hasCritical ? `${C.red}35` : C.border}`,
      boxShadow: hasCritical ? `0 2px 8px ${C.red}10` : '0 1px 4px rgba(0,0,0,0.04)',
    }}>
      {/* Section header */}
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', padding: '13px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          background: hasCritical ? `${C.red}05` : C.card,
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 16, flexShrink: 0 }}>{isUnknown ? '❓' : '🏭'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: isUnknown ? C.muted : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {supplier}
            </span>
            {hasCritical && <span style={{ fontSize: 10, flexShrink: 0 }}>🔴</span>}
            {hasWarning  && <span style={{ fontSize: 10, flexShrink: 0 }}>🟡</span>}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {rows.length} item{rows.length !== 1 ? 's' : ''}
            {' · '}
            <span style={{ color: C.orange, fontWeight: 700 }}>{totalUnits} units to order</span>
          </div>
        </div>
        <span style={{ fontSize: 12, color: C.dim, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Items */}
      {open && rows.map(row => (
        <PlanItemCard
          key={rowKey(row)}
          row={row}
          qty={qtyOverrides[rowKey(row)] ?? row.suggestedReorder}
          onQtyChange={qty => onQtyChange(row, qty)}
        />
      ))}
    </div>
  )
}

// ── Main PurchasePlanTab ──────────────────────────────────────────────────────
export default function PurchasePlanTab() {
  const [products,     setProducts]     = useState(() => loadAllProducts())
  const [sales,        setSales]        = useState(() => loadLocalSales30())
  const [loading,      setLoading]      = useState(true)
  const [fetchedAt,    setFetchedAt]    = useState(null)
  const [qtyOverrides, setQtyOverrides] = useState({})
  const [copied,       setCopied]       = useState(false)

  const [search,         setSearch]         = useState('')
  const [urgencyFilter,  setUrgencyFilter]  = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [catFilter,      setCatFilter]      = useState('all')
  const [locFilter,      setLocFilter]      = useState('all')

  const retailLocs    = useMemo(() => getRetailLocations(),    [])
  const warehouseLocs = useMemo(() => getWarehouseLocations(), [])

  useEffect(() => {
    const from = new Date(Date.now() - 30 * 86_400_000)
    const to   = new Date()
    Promise.all([fetchProducts(), fetchSalesInRange(from, to)])
      .then(([rp, rs]) => {
        if (rp?.length) setProducts(rp)
        if (rs?.length) setSales(rs)
        else            setSales(loadLocalSales30())
        setFetchedAt(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Full forecast — reuses forecastEngine, zero changes to engine
  const allForecast = useMemo(() => computeForecast({
    products, sales,
    retailLocations:    retailLocs,
    warehouseLocations: warehouseLocs,
  }), [products, sales, retailLocs, warehouseLocs])

  // Only rows needing external purchase
  const reorderRows = useMemo(
    () => allForecast.filter(r => r.suggestedReorder > 0),
    [allForecast]
  )

  // Filter option lists
  const supplierOptions = useMemo(() => {
    const s = new Set(reorderRows.map(r => r.supplier?.trim() || UNKNOWN_SUP))
    return [...s].sort((a, b) => a === UNKNOWN_SUP ? 1 : b === UNKNOWN_SUP ? -1 : a.localeCompare(b))
  }, [reorderRows])

  const categories = useMemo(() => {
    const c = new Set(reorderRows.map(r => r.product.category).filter(Boolean))
    return [...c].sort()
  }, [reorderRows])

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reorderRows.filter(r => {
      const sup = r.supplier?.trim() || UNKNOWN_SUP
      if (urgencyFilter  !== 'all' && r.urgency          !== urgencyFilter)  return false
      if (supplierFilter !== 'all' && sup                !== supplierFilter) return false
      if (catFilter      !== 'all' && r.product.category !== catFilter)      return false
      if (locFilter      !== 'all' && r.location.id      !== locFilter)      return false
      if (q && !r.product.name?.toLowerCase().includes(q) &&
               !r.supplier?.toLowerCase().includes(q) &&
               !r.product.category?.toLowerCase().includes(q)) return false
      return true
    })
  }, [reorderRows, urgencyFilter, supplierFilter, catFilter, locFilter, search])

  const grouped = useMemo(() => groupBySupplier(filtered), [filtered])

  // Summary metrics
  const totalSuppliers = grouped.length
  const totalItems     = filtered.length
  const totalUnits     = filtered.reduce((s, r) => s + (qtyOverrides[rowKey(r)] ?? r.suggestedReorder), 0)
  const criticalItems  = filtered.filter(r => r.urgency === 'critical').length

  const handleQtyChange = (row, qty) =>
    setQtyOverrides(prev => ({ ...prev, [rowKey(row)]: qty }))

  const handleCopy = () => {
    const text = buildCopyText(grouped, qtyOverrides)
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    })
  }

  const handleExport = () => triggerCSVDownload(buildCSV(filtered, qtyOverrides))

  const clearFilters = () => {
    setSearch(''); setUrgencyFilter('all')
    setSupplierFilter('all'); setCatFilter('all'); setLocFilter('all')
  }

  const hasFilters = search || urgencyFilter !== 'all' || supplierFilter !== 'all' || catFilter !== 'all' || locFilter !== 'all'

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Purchase Planning</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {loading ? '⟳ Loading…' : fetchedAt
              ? `Updated ${fetchedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
              : 'Local data'}
            {reorderRows.length > 0 && ` · ${reorderRows.length} item${reorderRows.length !== 1 ? 's' : ''} across ${supplierOptions.length} supplier${supplierOptions.length !== 1 ? 's' : ''}`}
          </div>
        </div>
        {criticalItems > 0 && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}30` }}>
            🔴 {criticalItems} critical
          </span>
        )}
      </div>

      {/* Summary cards */}
      {reorderRows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
          <SummaryCard icon="🏭" label="Suppliers"    value={totalSuppliers} color={C.blue}   />
          <SummaryCard icon="📦" label="Items"        value={totalItems}     color={C.purple} />
          <SummaryCard icon="🔢" label="Total Units"  value={totalUnits}     color={C.orange} />
          <SummaryCard icon="🔴" label="Critical"     value={criticalItems}  color={C.red}    />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button
          disabled={filtered.length === 0}
          onClick={handleCopy}
          style={{
            flex: 1, padding: '11px 0', borderRadius: 10, border: 'none',
            background: filtered.length === 0 ? C.border : copied ? C.green : C.blue,
            color: filtered.length === 0 ? C.muted : '#fff',
            fontSize: 13, fontWeight: 700, cursor: filtered.length === 0 ? 'default' : 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {copied ? '✓ Copied!' : '📋 Copy Plan'}
        </button>
        <button
          disabled={filtered.length === 0}
          onClick={handleExport}
          style={{
            flex: 1, padding: '11px 0', borderRadius: 10,
            border: `1.5px solid ${filtered.length === 0 ? C.border : C.purple}`,
            background: filtered.length === 0 ? 'transparent' : `${C.purple}10`,
            color: filtered.length === 0 ? C.muted : C.purple,
            fontSize: 13, fontWeight: 700, cursor: filtered.length === 0 ? 'default' : 'pointer',
          }}
        >
          ⬇ Export CSV
        </button>
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

      {/* Urgency pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {[
          { id: 'all',      label: `All (${reorderRows.length})`,                                  color: C.muted },
          { id: 'critical', label: `Critical (${reorderRows.filter(r => r.urgency === 'critical').length})`, color: C.red   },
          { id: 'warning',  label: `Warning (${reorderRows.filter(r => r.urgency === 'warning').length})`,  color: C.amber },
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

      {/* Filter selects */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {supplierOptions.length > 1 && (
          <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8,
            border: `1px solid ${supplierFilter !== 'all' ? C.blue : C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}>
            <option value="all">All suppliers</option>
            {supplierOptions.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {categories.length > 1 && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8,
            border: `1px solid ${catFilter !== 'all' ? C.blue : C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {retailLocs.length > 1 && (
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8,
            border: `1px solid ${locFilter !== 'all' ? C.blue : C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}>
            <option value="all">All locations</option>
            {retailLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {hasFilters && (
          <button onClick={clearFilters} style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${C.border}`,
            background: C.bg, color: C.muted, fontSize: 11, cursor: 'pointer', flexShrink: 0,
          }}>✕ Clear</button>
        )}
      </div>

      {/* Content */}
      {loading && reorderRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13 }}>⟳ Loading…</div>

      ) : reorderRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>No purchases needed</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Warehouse stock covers all retail deficits right now.
          </div>
        </div>

      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: C.muted }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>No items match your filters.</div>
          <button
            onClick={clearFilters}
            style={{ padding: '7px 16px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, fontSize: 12, cursor: 'pointer' }}
          >
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {grouped.map(([supplier, rows]) => (
            <SupplierSection
              key={supplier}
              supplier={supplier}
              rows={rows}
              qtyOverrides={qtyOverrides}
              onQtyChange={handleQtyChange}
            />
          ))}
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}
