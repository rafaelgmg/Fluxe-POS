/**
 * ReorderTab.jsx — Reorder List
 * Dashboard App > Reorder
 *
 * READ-ONLY. Shows products where suggestedReorder > 0 (external purchase needed).
 * Allows editing order qty before Copy or CSV export.
 * Does NOT modify stock, create purchase orders, or write to Supabase.
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

function fmt1(n) {
  if (!isFinite(n) || n === 0) return '0'
  return n < 1 ? n.toFixed(2) : n % 1 === 0 ? String(n) : n.toFixed(1)
}

function rowKey(row) {
  return `${row.product.id}__${row.location.id}`
}

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

// ── Copy text builder ─────────────────────────────────────────────────────────
function buildCopyText(rows, overrides) {
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const lines = [`Reorder List — ${date}`, '']

  const suppliers = {}
  for (const row of rows) {
    const sup = row.supplier || '(No Supplier)'
    if (!suppliers[sup]) suppliers[sup] = []
    suppliers[sup].push(row)
  }

  for (const [sup, supRows] of Object.entries(suppliers)) {
    lines.push(`Supplier: ${sup}`)
    for (const row of supRows) {
      const qty = overrides[rowKey(row)] ?? row.suggestedReorder
      lines.push(`- ${row.product.name} x${qty}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim()
}

// ── CSV builder ───────────────────────────────────────────────────────────────
function buildCSV(rows, overrides) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  const headers = [
    'Product', 'Barcode', 'Category', 'Supplier', 'Location',
    'Retail Stock', 'WH Stock', 'Total Stock',
    '30d Sold', 'Avg/Day', 'Lead Time (days)', 'Urgency', 'Order Qty',
  ]
  const csvRows = rows.map(row => {
    const qty = overrides[rowKey(row)] ?? row.suggestedReorder
    return [
      esc(row.product.name),
      row.product.barcode || '',
      esc(row.product.category || ''),
      esc(row.supplier || ''),
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
  a.download = `reorder-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Reorder card ──────────────────────────────────────────────────────────────
function ReorderCard({ row, qty, onQtyChange }) {
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
    <div style={{
      background: C.card, borderRadius: 12, padding: '12px 14px',
      border: `1px solid ${row.urgency === 'critical' ? `${C.red}40` : row.urgency === 'warning' ? `${C.amber}30` : C.border}`,
      boxShadow: row.urgency === 'critical' ? `0 2px 8px ${C.red}12` : '0 1px 3px rgba(0,0,0,0.04)',
    }}>

      {/* Row 1: name + urgency */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {row.product.name}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {row.product.category}{row.product.size ? ` · ${row.product.size}` : ''}
            {row.supplier ? <> · <span style={{ color: C.sub }}>🏭 {row.supplier}</span></> : ''}
          </div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, flexShrink: 0,
          background: `${urgColor}12`, border: `1px solid ${urgColor}30`, color: urgColor,
        }}>
          {URGENCY_ICON[row.urgency]} {row.urgency.toUpperCase()}
        </span>
      </div>

      {/* Row 2: location + stock */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: C.muted }}>📍 {row.location.name}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: row.retailStock === 0 ? C.red : C.amber }}>
          Retail: {row.retailStock}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.purple }}>WH: {row.warehouseStock}</span>
        <span style={{ fontSize: 10, color: C.sub }}>Total: {row.totalStock}</span>
      </div>

      {/* Row 3: velocity + lead time */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.muted }}>
          30d sold: <strong style={{ color: C.text }}>{row.sold30d}</strong>
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>
          avg: <strong style={{ color: C.text }}>{fmt1(row.avgDailySales)}/day</strong>
        </span>
        <span style={{ fontSize: 10, color: C.muted }}>
          lead: <strong style={{ color: C.text }}>{row.leadTime}d</strong>
        </span>
      </div>

      {/* Row 4: order qty controls */}
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
              type="number"
              min={1}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => e.key === 'Enter' && commit()}
              style={{
                width: 52, textAlign: 'center', padding: '3px 4px',
                border: `1.5px solid ${C.orange}`, borderRadius: 6,
                fontSize: 16, fontWeight: 800, color: C.text, outline: 'none',
              }}
            />
          ) : (
            <button
              onClick={() => { setDraft(String(qty)); setEditing(true) }}
              title="Tap to edit"
              style={{
                minWidth: 32, textAlign: 'center',
                fontSize: 18, fontWeight: 900, color: C.text,
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px',
                borderBottom: `1.5px dashed ${C.dim}`,
              }}
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

// ── Main ReorderTab ───────────────────────────────────────────────────────────
export default function ReorderTab() {
  const [products,      setProducts]      = useState(() => loadAllProducts())
  const [sales,         setSales]         = useState(() => loadLocalSalesLast30())
  const [loading,       setLoading]       = useState(true)
  const [fetchedAt,     setFetchedAt]     = useState(null)
  const [qtyOverrides,  setQtyOverrides]  = useState({})
  const [copied,        setCopied]        = useState(false)

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
        else            setSales(loadLocalSalesLast30())
        setFetchedAt(new Date())
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // Full forecast — reuses forecastEngine, zero duplication of logic
  const allForecast = useMemo(() => computeForecast({
    products, sales,
    retailLocations:    retailLocs,
    warehouseLocations: warehouseLocs,
  }), [products, sales, retailLocs, warehouseLocs])

  // Reorder rows: only where external purchase is needed
  const reorderRows = useMemo(
    () => allForecast.filter(r => r.suggestedReorder > 0),
    [allForecast]
  )

  // Filter option lists
  const suppliers = useMemo(() => {
    const s = new Set(reorderRows.map(r => r.supplier).filter(Boolean))
    return [...s].sort()
  }, [reorderRows])

  const categories = useMemo(() => {
    const c = new Set(reorderRows.map(r => r.product.category).filter(Boolean))
    return [...c].sort()
  }, [reorderRows])

  // Apply filters
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reorderRows.filter(r => {
      if (urgencyFilter  !== 'all' && r.urgency           !== urgencyFilter)  return false
      if (supplierFilter !== 'all' && (r.supplier || '')  !== supplierFilter) return false
      if (catFilter      !== 'all' && r.product.category  !== catFilter)      return false
      if (locFilter      !== 'all' && r.location.id       !== locFilter)      return false
      if (q && !r.product.name?.toLowerCase().includes(q) &&
               !r.supplier?.toLowerCase().includes(q) &&
               !r.product.category?.toLowerCase().includes(q)) return false
      return true
    })
  }, [reorderRows, urgencyFilter, supplierFilter, catFilter, locFilter, search])

  const totalOrderQty = useMemo(
    () => filtered.reduce((s, r) => s + (qtyOverrides[rowKey(r)] ?? r.suggestedReorder), 0),
    [filtered, qtyOverrides]
  )

  const criticalCount = reorderRows.filter(r => r.urgency === 'critical').length
  const warningCount  = reorderRows.filter(r => r.urgency === 'warning').length

  const handleQtyChange = (row, qty) =>
    setQtyOverrides(prev => ({ ...prev, [rowKey(row)]: qty }))

  const handleCopy = () => {
    const text = buildCopyText(filtered, qtyOverrides)
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2200)
    })
  }

  const handleExport = () => triggerCSVDownload(buildCSV(filtered, qtyOverrides))

  const clearFilters = () => {
    setSearch(''); setUrgencyFilter('all')
    setSupplierFilter('all'); setCatFilter('all'); setLocFilter('all')
  }

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif" }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.text }}>Reorder List</div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>
            {loading ? '⟳ Loading…' : fetchedAt
              ? `Updated ${fetchedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
              : 'Local data'}
            {reorderRows.length > 0 && ` · ${reorderRows.length} item${reorderRows.length !== 1 ? 's' : ''} to order`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {criticalCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${C.red}12`, color: C.red, border: `1px solid ${C.red}30` }}>
              🔴 {criticalCount}
            </span>
          )}
          {warningCount > 0 && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: `${C.amber}12`, color: C.amber, border: `1px solid ${C.amber}30` }}>
              🟡 {warningCount}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
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
          {copied ? '✓ Copied!' : '📋 Copy List'}
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

      {/* Summary strip */}
      {filtered.length > 0 && (
        <div style={{
          display: 'flex', gap: 14, marginBottom: 12, padding: '8px 12px',
          background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 11,
        }}>
          <span style={{ color: C.muted }}>
            Showing <strong style={{ color: C.text }}>{filtered.length}</strong> products
          </span>
          <span style={{ color: C.muted }}>
            Total units: <strong style={{ color: C.orange }}>{totalOrderQty}</strong>
          </span>
        </div>
      )}

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
          { id: 'all',      label: `All (${reorderRows.length})`,  color: C.muted },
          { id: 'critical', label: `Critical (${criticalCount})`,  color: C.red   },
          { id: 'warning',  label: `Warning (${warningCount})`,    color: C.amber },
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
        {suppliers.length > 0 && (
          <select value={supplierFilter} onChange={e => setSupplierFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${supplierFilter !== 'all' ? C.blue : C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}>
            <option value="all">All suppliers</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {categories.length > 0 && (
          <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${catFilter !== 'all' ? C.blue : C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {retailLocs.length > 1 && (
          <select value={locFilter} onChange={e => setLocFilter(e.target.value)} style={{
            padding: '6px 10px', borderRadius: 8, border: `1px solid ${locFilter !== 'all' ? C.blue : C.border}`,
            background: C.card, color: C.text, fontSize: 11, fontWeight: 600, cursor: 'pointer', outline: 'none', flexShrink: 0,
          }}>
            <option value="all">All locations</option>
            {retailLocs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
      </div>

      {/* Results */}
      {loading && reorderRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0', color: C.muted, fontSize: 13 }}>⟳ Loading…</div>

      ) : reorderRows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: C.muted }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: 0.3 }}>✅</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 }}>No reorders needed</div>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            Warehouse stock covers all retail deficits right now.
          </div>
        </div>

      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: C.muted }}>
          <div style={{ fontSize: 13, marginBottom: 10 }}>No items match your filters.</div>
          <button
            onClick={clearFilters}
            style={{ padding: '6px 14px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.muted, fontSize: 12, cursor: 'pointer' }}
          >
            Clear filters
          </button>
        </div>

      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(row => (
            <ReorderCard
              key={rowKey(row)}
              row={row}
              qty={qtyOverrides[rowKey(row)] ?? row.suggestedReorder}
              onQtyChange={qty => handleQtyChange(row, qty)}
            />
          ))}
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}
