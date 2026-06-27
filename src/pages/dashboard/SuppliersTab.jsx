/**
 * SuppliersTab.jsx — Supplier Analytics
 * Dashboard App > More > Suppliers
 *
 * READ-ONLY analytics. Groups inventory + sales metrics by supplier.
 * No stock changes, no transfers, no purchase orders created.
 *
 * Data sources:
 *   products     → loadAllProducts() + fetchProducts()
 *   sales 90d    → localStorage fallback + fetchSalesInRange()
 *   forecast     → computeForecast() (unmodified)
 *   locations    → getRetailLocations() + getWarehouseLocations()
 */

import { useState, useMemo, useEffect } from 'react'
import { loadAllProducts } from '../../utils/productsStorage'
import { fetchProducts, fetchSalesInRange } from '../../services/supabaseRead'
import { getRetailLocations, getWarehouseLocations } from '../../utils/locationHelpers'
import { computeForecast } from '../../services/forecastEngine'

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:     '#F8FAFC', card:   '#FFFFFF', border: '#E5E7EB',
  text:   '#111827', sub:    '#374151', muted:  '#6B7280', dim: '#9CA3AF',
  green:  '#10B981', blue:   '#3B82F6', purple: '#8B5CF6',
  amber:  '#F59E0B', red:    '#EF4444', orange: '#F97316',
}

const URGENCY_CFG = {
  critical: { label: 'Critical', color: C.red,   bg: `${C.red}18`,   icon: '🔴' },
  warning:  { label: 'Warning',  color: C.amber, bg: `${C.amber}18`, icon: '🟡' },
  monitor:  { label: 'Monitor',  color: C.blue,  bg: `${C.blue}12`,  icon: '👁' },
  healthy:  { label: 'Healthy',  color: C.green, bg: `${C.green}12`, icon: '✅' },
}

const CONF_CFG = {
  high:   { color: C.green, label: 'High' },
  medium: { color: C.amber, label: 'Med'  },
  low:    { color: C.muted, label: 'Low'  },
}

const URGENCY_ORDER = { critical: 0, warning: 1, monitor: 2, healthy: 3 }
const UNKNOWN_SUP   = 'No Supplier'
const MS            = 86_400_000

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$    = n  => `$${(n || 0).toFixed(0)}`
const fmt$2   = n  => `$${(n || 0).toFixed(2)}`
const fmt1    = n  => !isFinite(n) || n === 0 ? '0' : n < 1 ? n.toFixed(2) : n % 1 === 0 ? String(n) : n.toFixed(1)
const fmtDays = d  => !isFinite(d) ? '∞' : d < 1 ? '<1d' : `${Math.floor(d)}d`

// ── Local sales fallback (90 days) ────────────────────────────────────────────
function loadLocalSales90() {
  try {
    const raw = localStorage.getItem('fluxe-sales-v1')
    if (!raw) return []
    const cutoff = Date.now() - 90 * MS
    return JSON.parse(raw).filter(s => {
      if (s.status === 'voided') return false
      const ts = new Date(s.timestamp || s.completedAt || s.createdAt).getTime()
      return ts >= cutoff
    })
  } catch { return [] }
}

// ── Core computation ──────────────────────────────────────────────────────────
function buildSupplierData(products, sales, forecastRows, retailLocs, warehouseLocs) {
  const now   = Date.now()
  const cut30 = now - 30 * MS

  // Index forecast rows by product.id — keep the most critical per product
  const fcastByPid = {}
  for (const row of forecastRows) {
    const pid = row.product.id
    if (!fcastByPid[pid]) {
      fcastByPid[pid] = row
    } else {
      const cur = fcastByPid[pid]
      if ((URGENCY_ORDER[row.urgency] ?? 4) < (URGENCY_ORDER[cur.urgency] ?? 4)) {
        fcastByPid[pid] = row
      }
    }
  }

  // Build velocity map from sales array: velMap[productId] = { sold30, sold90, revenue30 }
  const velMap = {}
  for (const sale of sales) {
    const ts      = new Date(sale.timestamp || sale.completedAt || sale.createdAt).getTime()
    const in30    = ts >= cut30
    for (const item of (sale.items || [])) {
      const pid = item.productId
      if (!pid) continue
      const qty = item.qty || 1
      const rev = (item.salePrice || 0) * qty
      if (!velMap[pid]) velMap[pid] = { sold30: 0, sold90: 0, revenue30: 0 }
      velMap[pid].sold90 += qty
      if (in30) { velMap[pid].sold30 += qty; velMap[pid].revenue30 += rev }
    }
  }

  // Build one row per product (aggregated across all locations)
  const productRows = products
    .filter(p => p.status !== 'inactive')
    .map(p => {
      const retailStock    = retailLocs.reduce((s, l) => s + (p.qtyByLoc?.[l.id] ?? 0), 0)
      const warehouseStock = warehouseLocs.reduce((s, l) => s + (p.qtyByLoc?.[l.id] ?? 0), 0)
      const currentStock   = retailStock + warehouseStock
      const vel            = velMap[p.id] || { sold30: 0, sold90: 0, revenue30: 0 }
      const avgDay         = vel.sold30 / 30
      const frow           = fcastByPid[p.id]
      const daysLeft       = frow?.daysUntilStockout ?? (avgDay > 0 ? retailStock / avgDay : Infinity)
      const suggestedReorder = frow?.suggestedReorder ?? 0
      const urgency          = frow?.urgency         ?? (retailStock === 0 && currentStock === 0 ? 'monitor' : 'healthy')
      const dataConfidence   = frow?.dataConfidence  ?? 'low'
      return {
        product: p,
        supplierName:    p.supplierName?.trim() || UNKNOWN_SUP,
        retailStock, warehouseStock, currentStock,
        sold30d:         vel.sold30,
        revenue30d:      vel.revenue30,
        avgDay, daysLeft, suggestedReorder, urgency, dataConfidence,
      }
    })

  // Group by supplier
  const supMap = new Map()
  for (const row of productRows) {
    if (!supMap.has(row.supplierName)) supMap.set(row.supplierName, [])
    supMap.get(row.supplierName).push(row)
  }

  // Build supplier summaries
  const suppliers = []
  for (const [name, rows] of supMap) {
    const unitsSold30d       = rows.reduce((s, r) => s + r.sold30d, 0)
    const revenue30d         = rows.reduce((s, r) => s + r.revenue30d, 0)
    const retailStock        = rows.reduce((s, r) => s + r.retailStock, 0)
    const warehouseStock     = rows.reduce((s, r) => s + r.warehouseStock, 0)
    const suggestedReorderUnits = rows.reduce((s, r) => s + r.suggestedReorder, 0)
    const criticalCount      = rows.filter(r => r.urgency === 'critical').length
    const warningCount       = rows.filter(r => r.urgency === 'warning').length
    const slowMovingCount    = rows.filter(r => r.avgDay < 0.033 && r.currentStock > 0).length
    const topProduct         = rows.reduce((best, r) => (!best || r.sold30d > best.sold30d) ? r : best, null)
    const sortedRows = [...rows].sort((a, b) => {
      const ud = (URGENCY_ORDER[a.urgency] ?? 4) - (URGENCY_ORDER[b.urgency] ?? 4)
      return ud !== 0 ? ud : b.sold30d - a.sold30d
    })
    suppliers.push({
      name,
      rows: sortedRows,
      totalProducts:    rows.length,
      unitsSold30d,     revenue30d,
      avgDailySales:    unitsSold30d / 30,
      retailStock,      warehouseStock,
      currentStock:     retailStock + warehouseStock,
      suggestedReorderUnits,
      criticalCount, warningCount, slowMovingCount,
      topProduct,
    })
  }

  // Sort: most critical first, then by revenue
  suppliers.sort((a, b) => {
    if (a.criticalCount !== b.criticalCount) return b.criticalCount - a.criticalCount
    if (a.warningCount  !== b.warningCount)  return b.warningCount  - a.warningCount
    return b.revenue30d - a.revenue30d
  })

  return suppliers
}

// ── Chip / badge helpers ──────────────────────────────────────────────────────
function Chip({ label, color, bg }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20,
      background: bg, color, fontSize: 11, fontWeight: 700,
    }}>
      {label}
    </span>
  )
}

function UrgencyBadge({ urgency }) {
  const cfg = URGENCY_CFG[urgency] || URGENCY_CFG.healthy
  return <Chip label={`${cfg.icon} ${cfg.label}`} color={cfg.color} bg={cfg.bg} />
}

function ConfBadge({ confidence }) {
  const cfg = CONF_CFG[confidence] || CONF_CFG.low
  return <Chip label={cfg.label} color={cfg.color} bg={`${cfg.color}18`} />
}

// ── Metric pill ───────────────────────────────────────────────────────────────
function Metric({ label, value, color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: C.muted, fontSize: 10, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
      <span style={{ color: color || C.text, fontSize: 15, fontWeight: 700 }}>{value}</span>
    </div>
  )
}

// ── Supplier summary card ─────────────────────────────────────────────────────
function SupplierCard({ sup, onClick }) {
  const hasAlert = sup.criticalCount > 0 || sup.warningCount > 0
  return (
    <div
      onClick={onClick}
      style={{
        background: C.card, border: `1px solid ${hasAlert ? (sup.criticalCount > 0 ? C.red : C.amber) : C.border}`,
        borderRadius: 12, padding: '18px 20px', cursor: 'pointer',
        borderLeft: `4px solid ${sup.criticalCount > 0 ? C.red : sup.warningCount > 0 ? C.amber : sup.unitsSold30d > 0 ? C.green : C.border}`,
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'}
      onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 8, flexWrap: 'wrap' }}>
        <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{sup.name}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {sup.criticalCount > 0 && <Chip label={`🔴 ${sup.criticalCount} critical`} color={C.red}   bg={`${C.red}12`} />}
          {sup.warningCount  > 0 && <Chip label={`🟡 ${sup.warningCount} warning`}  color={C.amber} bg={`${C.amber}12`} />}
        </div>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14 }}>
        <Metric label="Products"     value={sup.totalProducts} />
        <Metric label="30d Units"    value={sup.unitsSold30d} color={sup.unitsSold30d > 0 ? C.blue : C.muted} />
        <Metric label="30d Revenue"  value={fmt$(sup.revenue30d)} color={sup.revenue30d > 0 ? C.green : C.muted} />
        <Metric label="Total Stock"  value={sup.currentStock} />
      </div>

      {/* Stock breakdown + reorder */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: C.muted, fontSize: 12 }}>
            🏪 Retail <strong style={{ color: C.sub }}>{sup.retailStock}</strong>
          </span>
          <span style={{ color: C.muted, fontSize: 12 }}>
            🏭 Warehouse <strong style={{ color: C.sub }}>{sup.warehouseStock}</strong>
          </span>
          {sup.suggestedReorderUnits > 0 && (
            <span style={{ color: C.amber, fontSize: 12, fontWeight: 600 }}>
              ↩ Reorder {sup.suggestedReorderUnits} units
            </span>
          )}
          {sup.slowMovingCount > 0 && (
            <span style={{ color: C.muted, fontSize: 12 }}>
              🐌 {sup.slowMovingCount} slow
            </span>
          )}
        </div>
        {sup.topProduct && sup.topProduct.sold30d > 0 && (
          <span style={{ color: C.dim, fontSize: 11 }}>
            Top: <em>{sup.topProduct.product.name}</em> ({sup.topProduct.sold30d} units)
          </span>
        )}
      </div>
    </div>
  )
}

// ── Product detail table (inside a supplier) ──────────────────────────────────
function SupplierDetail({ sup, onBack, locationFilter, urgencyFilter, searchQ }) {
  const rows = useMemo(() => {
    let r = sup.rows
    if (urgencyFilter !== 'all') r = r.filter(row => row.urgency === urgencyFilter)
    if (searchQ) {
      const q = searchQ.toLowerCase()
      r = r.filter(row =>
        row.product.name?.toLowerCase().includes(q) ||
        row.product.barcode?.toLowerCase().includes(q) ||
        row.product.description?.toLowerCase().includes(q)
      )
    }
    return r
  }, [sup, urgencyFilter, searchQ])

  return (
    <div>
      {/* Back + header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, fontSize: 12, padding: '5px 12px', cursor: 'pointer' }}
        >
          ← Back
        </button>
        <div>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 16 }}>{sup.name}</span>
          <span style={{ color: C.muted, fontSize: 13, marginLeft: 8 }}>{rows.length} of {sup.totalProducts} products</span>
        </div>
      </div>

      {/* Summary strip */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18,
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 18px',
      }}>
        <Metric label="30d Units"      value={sup.unitsSold30d} color={C.blue} />
        <Metric label="30d Revenue"    value={fmt$(sup.revenue30d)} color={C.green} />
        <Metric label="Avg/Day"        value={fmt1(sup.avgDailySales)} />
        <Metric label="Retail Stock"   value={sup.retailStock} />
        <Metric label="Warehouse"      value={sup.warehouseStock} />
        <Metric label="Reorder Units"  value={sup.suggestedReorderUnits} color={sup.suggestedReorderUnits > 0 ? C.amber : C.muted} />
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 32 }}>No products match the current filters.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F3F4F6' }}>
                {['Product', 'Retail', 'WH', 'Total', '30d Sold', 'Avg/Day', 'Days Left', 'Reorder', 'Urgency', 'Confidence'].map(h => (
                  <th key={h} style={{ padding: '9px 12px', color: C.muted, fontWeight: 700, fontSize: 11, textAlign: 'left', whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}` }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const ucfg = URGENCY_CFG[row.urgency] || URGENCY_CFG.healthy
                return (
                  <tr key={row.product.id} style={{ background: i % 2 === 0 ? 'transparent' : '#F9FAFB', borderBottom: `1px solid ${C.border}` }}>
                    {/* Product */}
                    <td style={{ padding: '10px 12px', maxWidth: 200 }}>
                      <div style={{ color: C.text, fontWeight: 600, fontSize: 13 }}>{row.product.name}</div>
                      {row.product.barcode && <div style={{ color: C.dim, fontSize: 10, fontFamily: 'monospace' }}>{row.product.barcode}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', color: row.retailStock === 0 ? C.red : C.sub, fontWeight: row.retailStock === 0 ? 700 : 400, textAlign: 'center' }}>{row.retailStock}</td>
                    <td style={{ padding: '10px 12px', color: C.sub, textAlign: 'center' }}>{row.warehouseStock}</td>
                    <td style={{ padding: '10px 12px', color: C.sub, textAlign: 'center', fontWeight: 600 }}>{row.currentStock}</td>
                    <td style={{ padding: '10px 12px', color: row.sold30d > 0 ? C.blue : C.muted, textAlign: 'center', fontWeight: row.sold30d > 0 ? 600 : 400 }}>{row.sold30d}</td>
                    <td style={{ padding: '10px 12px', color: C.sub, textAlign: 'center' }}>{fmt1(row.avgDay)}</td>
                    <td style={{ padding: '10px 12px', color: !isFinite(row.daysLeft) ? C.muted : row.daysLeft < 7 ? C.red : row.daysLeft < 14 ? C.amber : C.green, textAlign: 'center', fontWeight: 600 }}>
                      {fmtDays(row.daysLeft)}
                    </td>
                    <td style={{ padding: '10px 12px', color: row.suggestedReorder > 0 ? C.amber : C.muted, textAlign: 'center', fontWeight: row.suggestedReorder > 0 ? 700 : 400 }}>
                      {row.suggestedReorder > 0 ? row.suggestedReorder : '—'}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ padding: '3px 8px', borderRadius: 6, background: ucfg.bg, color: ucfg.color, fontSize: 11, fontWeight: 700 }}>
                        {ucfg.icon} {ucfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <ConfBadge confidence={row.dataConfidence} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function SuppliersTab() {
  const [products,      setProducts]      = useState(() => loadAllProducts())
  const [sales,         setSales]         = useState(() => loadLocalSales90())
  const [loading,       setLoading]       = useState(true)

  // Filters
  const [searchQ,        setSearchQ]       = useState('')
  const [urgencyFilter,  setUrgencyFilter] = useState('all')
  const [selectedSup,    setSelectedSup]   = useState(null) // supplier name or null

  const retailLocs    = getRetailLocations()
  const warehouseLocs = getWarehouseLocations()

  // ── Fetch fresh data ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    const since = Date.now() - 90 * MS
    Promise.all([
      fetchProducts(),
      fetchSalesInRange({ start: new Date(since), end: new Date() }),
    ]).then(([prods, salesRows]) => {
      if (prods?.length)    setProducts(prods)
      if (salesRows?.length) setSales(salesRows.filter(s => s.status !== 'voided'))
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  // ── Forecast ────────────────────────────────────────────────────────────────
  const forecastRows = useMemo(() =>
    computeForecast({ products, sales, retailLocations: retailLocs, warehouseLocations: warehouseLocs, salesWindowDays: 90 }),
    [products, sales, retailLocs, warehouseLocs]
  )

  // ── Supplier data ───────────────────────────────────────────────────────────
  const suppliers = useMemo(() =>
    buildSupplierData(products, sales, forecastRows, retailLocs, warehouseLocs),
    [products, sales, forecastRows, retailLocs, warehouseLocs]
  )

  // ── Summary counts ──────────────────────────────────────────────────────────
  const totalCritical  = suppliers.reduce((s, x) => s + x.criticalCount, 0)
  const totalWarning   = suppliers.reduce((s, x) => s + x.warningCount,  0)
  const totalReorder   = suppliers.reduce((s, x) => s + x.suggestedReorderUnits, 0)
  const totalRevenue30 = suppliers.reduce((s, x) => s + x.revenue30d,    0)

  // ── Filtered list ───────────────────────────────────────────────────────────
  const filteredSuppliers = useMemo(() => {
    let list = suppliers
    if (urgencyFilter !== 'all') {
      list = list.filter(sup => {
        if (urgencyFilter === 'critical') return sup.criticalCount > 0
        if (urgencyFilter === 'warning')  return sup.warningCount  > 0
        if (urgencyFilter === 'reorder')  return sup.suggestedReorderUnits > 0
        if (urgencyFilter === 'slow')     return sup.slowMovingCount > 0
        return true
      })
    }
    if (searchQ) {
      const q = searchQ.toLowerCase()
      list = list.filter(sup =>
        sup.name.toLowerCase().includes(q) ||
        sup.rows.some(r =>
          r.product.name?.toLowerCase().includes(q) ||
          r.product.barcode?.toLowerCase().includes(q)
        )
      )
    }
    return list
  }, [suppliers, urgencyFilter, searchQ])

  // ── Active supplier object ──────────────────────────────────────────────────
  const activeSup = selectedSup ? suppliers.find(s => s.name === selectedSup) : null

  // ── Filter pills ────────────────────────────────────────────────────────────
  const FILTER_PILLS = [
    { id: 'all',      label: `All (${suppliers.length})` },
    { id: 'critical', label: `🔴 Critical${totalCritical > 0 ? ` (${totalCritical})` : ''}` },
    { id: 'warning',  label: `🟡 Warning${totalWarning > 0  ? ` (${totalWarning})`  : ''}` },
    { id: 'reorder',  label: `↩ Reorder${totalReorder > 0   ? ` (${totalReorder})`  : ''}` },
    { id: 'slow',     label: '🐌 Slow Moving' },
  ]

  const pillStyle = active => ({
    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${active ? C.blue : C.border}`,
    background: active ? `${C.blue}12` : C.card,
    color: active ? C.blue : C.muted,
    transition: 'all 0.15s',
  })

  const inp = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontSize: 13, padding: '8px 12px', outline: 'none', width: '100%', boxSizing: 'border-box',
  }

  // ── Render: detail view ─────────────────────────────────────────────────────
  if (activeSup) {
    return (
      <div style={{ padding: '20px 0' }}>
        <SupplierDetail
          sup={activeSup}
          onBack={() => setSelectedSup(null)}
          urgencyFilter={urgencyFilter}
          searchQ={searchQ}
        />
      </div>
    )
  }

  // ── Render: list view ───────────────────────────────────────────────────────
  return (
    <div style={{ padding: '20px 0' }}>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ color: C.text, fontSize: 18, fontWeight: 700, margin: 0 }}>Supplier Analytics</h2>
        <p style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>
          {loading ? 'Fetching data…' : `${suppliers.length} supplier${suppliers.length !== 1 ? 's' : ''} · 90d data`}
        </p>
      </div>

      {/* Summary chips */}
      {!loading && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          {totalCritical > 0 && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: `${C.red}12`, border: `1px solid ${C.red}30` }}>
              <span style={{ color: C.red, fontSize: 13, fontWeight: 700 }}>🔴 {totalCritical} critical item{totalCritical !== 1 ? 's' : ''}</span>
            </div>
          )}
          {totalWarning > 0 && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: `${C.amber}12`, border: `1px solid ${C.amber}30` }}>
              <span style={{ color: C.amber, fontSize: 13, fontWeight: 700 }}>🟡 {totalWarning} warning{totalWarning !== 1 ? 's' : ''}</span>
            </div>
          )}
          {totalReorder > 0 && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: `${C.orange}12`, border: `1px solid ${C.orange}30` }}>
              <span style={{ color: C.orange, fontSize: 13, fontWeight: 700 }}>↩ {totalReorder} units to reorder</span>
            </div>
          )}
          {totalRevenue30 > 0 && (
            <div style={{ padding: '8px 14px', borderRadius: 8, background: `${C.green}12`, border: `1px solid ${C.green}30` }}>
              <span style={{ color: C.green, fontSize: 13, fontWeight: 700 }}>💰 {fmt$2(totalRevenue30)} 30d revenue</span>
            </div>
          )}
        </div>
      )}

      {/* Search */}
      <div style={{ marginBottom: 14 }}>
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="Search supplier or product…"
          style={inp}
        />
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTER_PILLS.map(p => (
          <button key={p.id} onClick={() => setUrgencyFilter(p.id)} style={pillStyle(urgencyFilter === p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      {loading ? (
        <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 32 }}>Loading supplier data…</p>
      ) : filteredSuppliers.length === 0 ? (
        <p style={{ color: C.muted, fontSize: 13, textAlign: 'center', padding: 32 }}>No suppliers match the current filters.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredSuppliers.map(sup => (
            <SupplierCard
              key={sup.name}
              sup={sup}
              onClick={() => setSelectedSup(sup.name)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
