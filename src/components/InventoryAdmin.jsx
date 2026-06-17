import { useState, useMemo, useEffect } from 'react'
import { CATEGORIES } from '../data/mockData'
import { LOCATIONS_CFG } from '../config/branding'
import BarcodeModal, { BarcodeIconButton } from './BarcodeModal'
import { loadAllProducts, saveAllProducts } from '../utils/productsStorage'
import { loadInventoryHistory, saveInventoryHistory } from '../utils/inventoryHistoryStorage'
import { loadAllSales } from '../utils/salesStorage'
import { localId } from '../domain/utils/ids'
import { fetchProducts, fetchInventoryMovements, fetchRecentTransfers, getLocationUUID } from '../services/supabaseRead'
import { sendTransfer, receiveTransfer } from '../services/supabaseWrite'
import DailyCountsAdmin from './DailyCountsAdmin'

function addEntry(setHistory, entry) {
  setHistory(prev => {
    const updated = [{ ...entry, id: localId('inv'), timestamp: new Date().toISOString() }, ...prev]
    saveInventoryHistory(updated)
    return updated
  })
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const AMBER  = '#f59e0b'
const MUTED  = 'var(--c-text-muted)'
const TEXT   = 'var(--c-text)'
const DIM    = 'var(--c-text-sub)'
const GREEN_COLOR = '#22c55e'

const fmt$   = (n) => `$${(n || 0).toFixed(2)}`
const fmtTs  = (ts) => new Date(ts).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true })

const TYPE_LABELS = { adjustment: 'Adjustment', transfer: 'Transfer', product_update: 'Product Update', removal: 'Removal', count_set: 'Count Set', status_change: 'Status Change' }
const TYPE_COLORS = { adjustment: BLUE, transfer: '#8b5cf6', product_update: AMBER, removal: RED, count_set: GREEN_COLOR, status_change: 'var(--c-text-muted)' }

// ─── Adjust Stock Modal ───────────────────────────────────────────────────────
// locId + locName come from parent (active location) — no location picker here
function AdjustStockModal({ product, locId, locName, onConfirm, onClose }) {
  const [mode, setMode] = useState('add')   // 'add' | 'remove'
  const [qty, setQty]   = useState('')
  const [note, setNote] = useState('')
  const [err, setErr]   = useState('')

  const current = product.qtyByLoc?.[locId] ?? 0

  const handleConfirm = () => {
    const n = parseInt(qty)
    if (!qty || isNaN(n) || n <= 0) { setErr('Enter a valid quantity'); return }
    if (mode === 'remove' && n > current) { setErr(`Only ${current} units available at ${locName}`); return }
    setErr('')
    onConfirm({ mode, locId, locName, qty: n, note })
  }

  const inp = { padding: '8px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, width: 400, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <p style={{ color: TEXT, fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Adjust Stock</p>
        <p style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>{product.name}</p>
        {/* Location indicator — read-only, set by active location selector */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(37,99,235,0.1)', border: `1px solid rgba(37,99,235,0.25)`, borderRadius: 4, marginBottom: 20 }}>
          <span style={{ fontSize: 10 }}>📍</span>
          <span style={{ color: BLUE, fontSize: 11, fontWeight: 700 }}>{locName}</span>
          <span style={{ color: MUTED, fontSize: 11 }}>· current: <strong style={{ color: TEXT }}>{current}</strong></span>
        </div>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {[['add','+ Add Stock',GREEN],['remove','− Remove Stock',RED]].map(([m,label,color]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: '9px', borderRadius: 6, fontWeight: 700, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
              background: mode === m ? `rgba(${m==='add'?'34,197,94':'239,68,68'},0.12)` : 'transparent',
              border: `1px solid ${mode === m ? color : BORDER}`, color: mode === m ? color : MUTED,
            }}>{label}</button>
          ))}
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: 12 }}>
          <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>QUANTITY</label>
          <input type="number" min="1" value={qty} onChange={e => { setQty(e.target.value); setErr('') }} style={{ ...inp, borderColor: err ? RED : BORDER }}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = err ? RED : BORDER }}
          />
          {err && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{err}</p>}
        </div>

        {/* Note */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>NOTE (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for adjustment" style={inp}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = BORDER }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleConfirm} style={{
            flex: 2, padding: '11px', background: mode === 'add' ? GREEN : RED,
            border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>Confirm {mode === 'add' ? 'Add' : 'Remove'}</button>
          <button onClick={onClose} style={{
            flex: 1, padding: '11px', background: 'transparent', border: `1px solid ${BORDER}`,
            borderRadius: 6, color: MUTED, fontSize: 13, cursor: 'pointer',
          }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Set Count Modal ──────────────────────────────────────────────────────────
// locId + locName come from parent (active location) — no location picker here
function SetCountModal({ product, locId, locName, onConfirm, onClose }) {
  const [count, setCount] = useState('')
  const [note, setNote]   = useState('')
  const [err, setErr]     = useState('')

  const current = product.qtyByLoc?.[locId] ?? product.qty ?? 0

  const handleConfirm = () => {
    const n = parseInt(count)
    if (count === '' || isNaN(n) || n < 0) { setErr('Enter a valid count (0 or more)'); return }
    setErr('')
    onConfirm({ locId, locName, count: n, note })
  }

  const inp = { padding: '8px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(3px)' }}>
      <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, width: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <p style={{ color: TEXT, fontWeight: 800, fontSize: 15, marginBottom: 2 }}>Set Exact Count</p>
        <p style={{ color: MUTED, fontSize: 12, marginBottom: 4 }}>{product.name}</p>
        {/* Location indicator — read-only */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'rgba(37,99,235,0.1)', border: `1px solid rgba(37,99,235,0.25)`, borderRadius: 4, marginBottom: 20 }}>
          <span style={{ fontSize: 10 }}>📍</span>
          <span style={{ color: BLUE, fontSize: 11, fontWeight: 700 }}>{locName}</span>
          <span style={{ color: MUTED, fontSize: 11 }}>· current: <strong style={{ color: TEXT }}>{current}</strong></span>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>NEW COUNT</label>
          <input type="number" min="0" value={count} onChange={e => { setCount(e.target.value); setErr('') }} style={{ ...inp, borderColor: err ? RED : BORDER }}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = err ? RED : BORDER }}
          />
          {err && <p style={{ color: RED, fontSize: 10, marginTop: 3 }}>{err}</p>}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>NOTE (optional)</label>
          <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Physical count, audit, etc." style={inp}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = BORDER }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleConfirm} style={{ flex: 2, padding: '11px', background: BLUE, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Set Count</button>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ─── Deactivate Confirmation Modal ───────────────────────────────────────────
function DeactivateModal({ product, sales = [], onConfirm, onClose }) {
  const totalStock  = Object.values(product.qtyByLoc || {}).reduce((s, v) => s + (parseInt(v) || 0), 0)
  const hasStock    = totalStock > 0
  const prodSales   = sales.filter(s => s.items?.some(i => i.barcode === product.barcode || i.name === product.name))
  const totalSold   = prodSales.reduce((s, sale) => s + (sale.items?.find(i => i.barcode === product.barcode || i.name === product.name)?.qty || 0), 0)
  const lastSale    = prodSales.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0]
  const lastSaleDate = lastSale ? new Date(lastSale.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, backdropFilter: 'blur(4px)' }}>
      <div style={{ background: PANEL, border: `1px solid rgba(239,68,68,0.3)`, borderRadius: 12, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>⛔</div>
          <div>
            <p style={{ color: TEXT, fontWeight: 800, fontSize: 16, marginBottom: 3 }}>Deactivate Product?</p>
            <p style={{ color: '#fca5a5', fontSize: 12 }}>{product.name}</p>
          </div>
        </div>

        {/* Body */}
        <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
          This product will be <strong style={{ color: RED }}>removed from active sales</strong> and hidden from sellers.
          All past sales, reports, and inventory history will be preserved.
        </p>

        {/* Stats */}
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 14px', marginBottom: hasStock ? 0 : 20, display: 'flex', gap: 24 }}>
          <div>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>TOTAL SOLD</p>
            <p style={{ color: TEXT, fontSize: 18, fontWeight: 800 }}>{totalSold}</p>
          </div>
          <div>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>LAST SALE</p>
            <p style={{ color: TEXT, fontSize: 13, fontWeight: 600 }}>{lastSaleDate}</p>
          </div>
          <div>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 3 }}>IN STOCK</p>
            <p style={{ color: hasStock ? AMBER : MUTED, fontSize: 18, fontWeight: 800 }}>{totalStock}</p>
          </div>
        </div>

        {/* Stock warning */}
        {hasStock && (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '10px 14px', margin: '12px 0 20px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 14, flexShrink: 0 }}>⚠️</span>
            <p style={{ color: AMBER, fontSize: 12, lineHeight: 1.5 }}>
              This product still has <strong>{totalStock} unit{totalStock !== 1 ? 's' : ''} in stock</strong>. Are you sure you want to deactivate it?
            </p>
          </div>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-text-muted)'; e.currentTarget.style.color = TEXT }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >Cancel</button>
          <button onClick={onConfirm} style={{ flex: 2, padding: '11px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: '#fca5a5', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = RED; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#fca5a5' }}
          >Confirm Deactivation</button>
        </div>
      </div>
    </div>
  )
}

// ─── Edit Product Panel ───────────────────────────────────────────────────────
const REORDER_STATUS_OPTIONS = [
  { value: 'reorderable',    label: 'Reorderable'     },
  { value: 'do_not_reorder', label: 'Do Not Reorder'  },
  { value: 'seasonal',       label: 'Seasonal'        },
  { value: 'discontinued',   label: 'Discontinued'    },
  { value: 'test_product',   label: 'Test Product'    },
]

function EditProductPanel({ product, onSave, onClose, onDeactivate, onReactivate }) {
  const [form, setForm] = useState({
    name:              product.name              || '',
    description:       product.description       || '',
    size:              product.size              || '',
    barcode:           product.barcode           || '',
    category:          product.category          || CATEGORIES[0],
    costPrice:         product.costPrice         || '',
    systemPrice:       product.systemPrice       || '',
    minPrice:          product.minPrice          || '',
    supplierName:      product.supplierName      || '',
    reorderStatus:     product.reorderStatus     || 'reorderable',
    coreProduct:       product.coreProduct       ?? false,
    minStockTarget:    product.minStockTarget  != null ? String(product.minStockTarget)  : '',
    reorderPoint:      product.reorderPoint    != null ? String(product.reorderPoint)    : '',
    targetDaysOfStock: product.targetDaysOfStock != null ? String(product.targetDaysOfStock) : '14',
    leadTimeDays:      product.leadTimeDays      != null ? String(product.leadTimeDays)      : '7',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const inp = { padding: '7px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl = (t) => <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 4 }}>{t}</label>

  const handleSave = () => {
    onSave({
      ...form,
      costPrice:         parseFloat(form.costPrice)   || 0,
      systemPrice:       parseFloat(form.systemPrice) || 0,
      minPrice:          parseFloat(form.minPrice)    || 0,
      minStockTarget:    form.minStockTarget    !== '' ? parseInt(form.minStockTarget,    10) : null,
      reorderPoint:      form.reorderPoint      !== '' ? parseInt(form.reorderPoint,      10) : null,
      targetDaysOfStock: form.targetDaysOfStock !== '' ? parseInt(form.targetDaysOfStock, 10) : 14,
      leadTimeDays:      form.leadTimeDays      !== '' ? parseInt(form.leadTimeDays,      10) : 7,
    })
  }

  return (
    <div style={{ width: 340, background: PANEL, borderLeft: `2px solid ${BLUE}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ padding: '12px 16px', background: CARD, borderBottom: `1px solid ${BLUE}44`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ color: BLUE, fontWeight: 700, fontSize: 13, flex: 1 }}>✏️ Edit Product</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>{lbl('PRODUCT NAME')}<input value={form.name} onChange={e => set('name', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} /></div>
        <div>{lbl('DESCRIPTION')}<input value={form.description} onChange={e => set('description', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} /></div>
        <div>{lbl('SIZE')}<input value={form.size} onChange={e => set('size', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} /></div>
        <div>{lbl('BARCODE / SKU')}<input value={form.barcode} onChange={e => set('barcode', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} /></div>
        <div>
          {lbl('CATEGORY')}
          <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>{lbl('COST ($)')}<input type="number" value={form.costPrice} onChange={e => set('costPrice', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} /></div>
          <div>{lbl('PRICE ($)')}<input type="number" value={form.systemPrice} onChange={e => set('systemPrice', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} /></div>
        </div>
        <div>
          {lbl('MIN PRICE ($) — hidden from sellers')}
          <input type="number" value={form.minPrice} onChange={e => set('minPrice', e.target.value)} style={{ ...inp, borderColor: 'rgba(245,158,11,0.4)' }} onFocus={e => { e.target.style.borderColor = AMBER }} onBlur={e => { e.target.style.borderColor = 'rgba(245,158,11,0.4)' }} />
        </div>

        {/* ── Reorder Settings ─────────────────────────────────── */}
        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: 14, marginTop: 2 }}>
          {/* Section header + status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>📦 REORDER SETTINGS</span>
            {form.reorderStatus === 'discontinued' && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: RED }}>DISCONTINUED</span>
            )}
            {form.reorderStatus === 'test_product' && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: 0.3, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: AMBER }}>TEST PRODUCT</span>
            )}
          </div>

          {/* Reorder Status */}
          <div style={{ marginBottom: 10 }}>
            {lbl('REORDER STATUS')}
            <select value={form.reorderStatus} onChange={e => set('reorderStatus', e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {REORDER_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Core Product toggle */}
          <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div>
              {lbl('CORE PRODUCT')}
              <span style={{ color: DIM, fontSize: 10 }}>Always keep in stock</span>
            </div>
            <button
              type="button"
              onClick={() => set('coreProduct', !form.coreProduct)}
              style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                background: form.coreProduct ? BLUE : 'rgba(100,116,139,0.25)',
                position: 'relative', flexShrink: 0, transition: 'background 0.2s',
              }}
            >
              <span style={{
                position: 'absolute', top: 3,
                left: form.coreProduct ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                display: 'block',
              }} />
            </button>
          </div>

          {/* Min Stock Target + Reorder Point */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              {lbl('MIN STOCK TARGET')}
              <input type="number" min="0" value={form.minStockTarget} placeholder="—" onChange={e => set('minStockTarget', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
            </div>
            <div>
              {lbl('REORDER POINT')}
              <input type="number" min="0" value={form.reorderPoint} placeholder="—" onChange={e => set('reorderPoint', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
            </div>
          </div>

          {/* Target Days + Lead Time */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            <div>
              {lbl('TARGET DAYS OF STOCK')}
              <input type="number" min="1" value={form.targetDaysOfStock} onChange={e => set('targetDaysOfStock', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
            </div>
            <div>
              {lbl('LEAD TIME (DAYS)')}
              <input type="number" min="0" value={form.leadTimeDays} onChange={e => set('leadTimeDays', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
            </div>
          </div>

          {/* Supplier */}
          <div>
            {lbl('SUPPLIER')}
            <input value={form.supplierName} placeholder="Supplier name…" onChange={e => set('supplierName', e.target.value)} style={inp} onFocus={e => { e.target.style.borderColor = BLUE }} onBlur={e => { e.target.style.borderColor = BORDER }} />
          </div>
        </div>
      </div>

      <div style={{ padding: 14, borderTop: `1px solid ${BORDER}`, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={handleSave} style={{ width: '100%', padding: '11px', background: BLUE, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', boxShadow: '0 0 16px rgba(37,99,235,0.25)' }}>💾 Save Changes</button>

        {/* Deactivate / Reactivate */}
        {product.status === 'inactive' ? (
          <button onClick={onReactivate} style={{
            width: '100%', padding: '9px', background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6,
            color: '#86efac', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.18)'; e.currentTarget.style.borderColor = GREEN }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)' }}
            title="Re-enable this product for sales"
          >✅ Reactivate Product</button>
        ) : (
          <button onClick={onDeactivate} style={{
            width: '100%', padding: '9px', background: 'transparent',
            border: `1px solid rgba(239,68,68,0.25)`, borderRadius: 6,
            color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)' }}
          >⛔ Deactivate Product</button>
        )}
      </div>
    </div>
  )
}

// ─── Management View ──────────────────────────────────────────────────────────
function ManagementView({ products, setProducts, setHistory, filterHistory, sales }) {
  const [activeLoc, setActiveLoc]     = useState(LOCATIONS_CFG[0].id)
  const [statusFilter, setStatusFilter] = useState('active')   // 'active' | 'inactive' | 'all'
  const [search, setSearch]           = useState('')
  const [filterCat, setFilterCat]     = useState('All')
  const [showBarcode, setShowBarcode] = useState(false)
  const [adjusting, setAdjusting]     = useState(null)
  const [counting, setCounting]       = useState(null)
  const [editing, setEditing]         = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(null)
  const [deactivating, setDeactivating] = useState(null)      // product pending deactivation modal
  const [toast, setToast]             = useState('')

  const activeLocName = LOCATIONS_CFG.find(l => l.id === activeLoc)?.name || activeLoc
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(p => {
      const matchStatus = statusFilter === 'all' || (statusFilter === 'inactive' ? p.status === 'inactive' : p.status !== 'inactive')
      const matchCat    = filterCat === 'All' || p.category === filterCat
      const matchSearch = !q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)
      return matchStatus && matchCat && matchSearch
    })
  }, [products, search, filterCat, statusFilter])

  const counts = useMemo(() => ({
    active:   products.filter(p => p.status !== 'inactive').length,
    inactive: products.filter(p => p.status === 'inactive').length,
    all:      products.length,
  }), [products])

  const updateProduct = (id, patch) => {
    setProducts(prev => {
      const updated = prev.map(p => p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)
      saveAllProducts(updated)
      return updated
    })
  }

  const handleDeactivate = () => {
    const p = deactivating
    updateProduct(p.id, { status: 'inactive' })
    addEntry(setHistory, { type: 'status_change', productId: p.id, productName: p.name, barcode: p.barcode, locationId: '', locationName: 'All', before: 0, after: 0, delta: 0, note: 'Product deactivated' })
    showToast(`${p.name} deactivated`)
    setDeactivating(null)
    setEditing(null)
  }

  const handleReactivate = (p) => {
    updateProduct(p.id, { status: 'active' })
    addEntry(setHistory, { type: 'status_change', productId: p.id, productName: p.name, barcode: p.barcode, locationId: '', locationName: 'All', before: 0, after: 0, delta: 0, note: 'Product reactivated' })
    showToast(`${p.name} reactivated`)
    setEditing(null)
  }

  const handleAdjust = (result) => {
    const p = adjusting
    const prev_qty = p.qtyByLoc?.[result.locId] ?? 0
    const delta = result.mode === 'add' ? result.qty : -result.qty
    const newLocQty = Math.max(0, prev_qty + delta)
    const newQtyByLoc = { ...(p.qtyByLoc || {}), [result.locId]: newLocQty }
    const newTotal = Object.values(newQtyByLoc).reduce((s, v) => s + (parseInt(v) || 0), 0)
    updateProduct(p.id, { qty: newTotal, qtyByLoc: newQtyByLoc })
    addEntry(setHistory, { type: 'adjustment', productId: p.id, productName: p.name, barcode: p.barcode, locationId: result.locId, locationName: result.locName, before: prev_qty, after: newLocQty, delta, note: result.note || '' })
    showToast(`${result.mode === 'add' ? '+' : ''}${delta} units at ${result.locName}`)
    setAdjusting(null)
  }

  const handleSetCount = (result) => {
    const p = counting
    const prev_qty = p.qtyByLoc?.[result.locId] ?? 0
    const newQtyByLoc = { ...(p.qtyByLoc || {}), [result.locId]: result.count }
    const newTotal = Object.values(newQtyByLoc).reduce((s, v) => s + (parseInt(v) || 0), 0)
    updateProduct(p.id, { qty: newTotal, qtyByLoc: newQtyByLoc })
    addEntry(setHistory, { type: 'count_set', productId: p.id, productName: p.name, barcode: p.barcode, locationId: result.locId, locationName: result.locName, before: prev_qty, after: result.count, delta: result.count - prev_qty, note: result.note || '' })
    showToast(`Count set to ${result.count} at ${result.locName}`)
    setCounting(null)
  }

  const handleEdit = (data) => {
    addEntry(setHistory, { type: 'product_update', productId: editing.id, productName: data.name, barcode: data.barcode, locationId: '', locationName: 'All', before: 0, after: 0, delta: 0, note: 'Updated product fields' })
    updateProduct(editing.id, data)
    showToast(`${data.name} updated`)
    setEditing(null)
  }

  const handleRemove = (p) => {
    const totalQty = Object.values(p.qtyByLoc || {}).reduce((s, v) => s + (parseInt(v) || 0), p.qty || 0)
    addEntry(setHistory, { type: 'removal', productId: p.id, productName: p.name, barcode: p.barcode, locationId: '', locationName: 'All', before: totalQty, after: 0, delta: -totalQty, note: 'Product removed from inventory' })
    setProducts(prev => {
      const updated = prev.filter(x => x.id !== p.id)
      saveAllProducts(updated)
      return updated
    })
    setConfirmRemove(null)
    showToast(`${p.name} removed`)
  }

  const thS = { padding: '7px 10px', color: MUTED, fontWeight: 600, fontSize: 10, background: CARD, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', letterSpacing: 0.4, textAlign: 'left' }
  const tdS = (extra = {}) => ({ padding: '8px 10px', fontSize: 12, color: DIM, borderBottom: `1px solid rgba(30,41,59,0.4)`, verticalAlign: 'middle', ...extra })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Location selector bar */}
      <div style={{ background: CARD, borderBottom: `1px solid ${BORDER}`, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
        <span style={{ color: 'var(--c-text-dim)', fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginRight: 4 }}>LOCATION</span>
        {LOCATIONS_CFG.map(loc => {
          const locQty = filtered.reduce((s, p) => s + (p.qtyByLoc?.[loc.id] ?? 0), 0)
          const isActive = activeLoc === loc.id
          return (
            <button key={loc.id} onClick={() => { setActiveLoc(loc.id); setEditing(null) }} style={{
              padding: '10px 16px', background: isActive ? PANEL : 'transparent',
              border: 'none', borderBottom: isActive ? `2px solid ${BLUE}` : '2px solid transparent',
              color: isActive ? TEXT : MUTED, fontSize: 12, fontWeight: isActive ? 700 : 400,
              cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>📍 {loc.name}</span>
              <span style={{
                padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                background: isActive ? 'rgba(37,99,235,0.15)' : 'rgba(30,41,59,0.5)',
                color: isActive ? BLUE : 'var(--c-text-muted)',
              }}>{locQty}</span>
            </button>
          )
        })}
        <span style={{ marginLeft: 'auto', color: 'var(--c-text-dim)', fontSize: 10 }}>
          All locations · {products.reduce((s, p) => s + (p.qty || 0), 0)} total units
        </span>
      </div>

      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or barcode..."
          style={{ padding: '6px 12px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, width: 220, outline: 'none' }}
          onFocus={e => { e.target.style.borderColor = BLUE }}
          onBlur={e => { e.target.style.borderColor = BORDER }}
        />
        <BarcodeIconButton active={showBarcode} onClick={() => setShowBarcode(true)} />
        {showBarcode && (
          <BarcodeModal
            onConfirm={(code) => { setSearch(code); setShowBarcode(false) }}
            onClose={() => setShowBarcode(false)}
          />
        )}
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ padding: '6px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, cursor: 'pointer', outline: 'none' }}>
          <option value="All">All Categories</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 2, background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 2 }}>
          {[
            { id: 'active',   label: 'Active',   color: GREEN },
            { id: 'inactive', label: 'Inactive', color: RED   },
            { id: 'all',      label: 'All',      color: MUTED },
          ].map(({ id, label, color }) => (
            <button key={id} onClick={() => { setStatusFilter(id); setEditing(null) }} style={{
              padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              background: statusFilter === id ? `${color}18` : 'transparent',
              color: statusFilter === id ? color : 'var(--c-text-muted)',
              outline: statusFilter === id ? `1px solid ${color}40` : 'none',
            }}>
              {label} <span style={{ opacity: 0.7 }}>{counts[id]}</span>
            </button>
          ))}
        </div>

        <span style={{ color: MUTED, fontSize: 12 }}>{filtered.length} shown</span>
        {/* Active location stock badge */}
        <span style={{ marginLeft: 'auto', padding: '4px 12px', background: 'rgba(37,99,235,0.1)', border: `1px solid rgba(37,99,235,0.2)`, borderRadius: 4, color: BLUE, fontSize: 11, fontWeight: 600 }}>
          📍 {activeLocName}: {filtered.reduce((s, p) => s + (p.qtyByLoc?.[activeLoc] ?? 0), 0)} units
        </span>
      </div>

      {/* Table + edit panel */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 780 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={thS}>#</th>
                <th style={thS}>Category</th>
                <th style={thS}>Barcode</th>
                <th style={thS}>Product Name</th>
                <th style={thS}>Size</th>
                <th style={{ ...thS, textAlign: 'right' }}>Cost</th>
                <th style={{ ...thS, textAlign: 'right' }}>Price</th>
                <th style={{ ...thS, textAlign: 'right', color: BLUE }}>Stock · {activeLocName}</th>
                <th style={thS}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)' }}>No products found</td></tr>
              )}
              {filtered.map((p, i) => {
                const isEditing = editing?.id === p.id
                const locQty = p.qtyByLoc?.[activeLoc] ?? 0
                const isLow = locQty <= 3
                return (
                  <tr key={p.id}
                    style={{ background: isEditing ? 'rgba(37,99,235,0.08)' : i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)', transition: 'background 0.15s', cursor: 'default' }}
                    onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'rgba(37,99,235,0.04)' }}
                    onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)' }}
                  >
                    <td style={tdS({ color: 'var(--c-text-dim)', fontSize: 11 })}>{i + 1}</td>
                    <td style={tdS({ fontSize: 11 })}><span style={{ padding: '2px 7px', borderRadius: 4, background: CARD, border: `1px solid ${BORDER}`, color: DIM, fontSize: 10 }}>{p.category}</span></td>
                    <td style={tdS({ fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-dim)' })}>{p.barcode}</td>
                    <td style={tdS({ maxWidth: 220 })}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ color: p.status === 'inactive' ? MUTED : TEXT, fontWeight: 500, fontSize: 12 }}>{p.name}</span>
                        {p.status === 'inactive' && (
                          <span style={{ padding: '1px 6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, color: '#f87171', fontSize: 9, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0 }}>INACTIVE</span>
                        )}
                      </div>
                    </td>
                    <td style={tdS({ color: MUTED })}>{p.size || '—'}</td>
                    <td style={tdS({ textAlign: 'right', color: MUTED })}>{fmt$(p.costPrice)}</td>
                    <td style={tdS({ textAlign: 'right', color: TEXT })}>{fmt$(p.systemPrice)}</td>
                    <td style={tdS({ textAlign: 'right', fontWeight: 700, color: isLow ? RED : GREEN })}>
                      {locQty}
                      {isLow && <span style={{ marginLeft: 4, fontSize: 9, color: RED }}>LOW</span>}
                    </td>
                    <td style={tdS()}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'nowrap' }}>
                        {[
                          ['✏️', 'Edit',    BLUE,       () => { setEditing(isEditing ? null : p) }],
                          ['±',  'Adjust',  '#8b5cf6',  () => setAdjusting(p)],
                          ['🔢', 'Count',   AMBER,      () => setCounting(p)],
                          ['📋', 'History', DIM,        () => filterHistory(p.id)],
                          ['🗑️', 'Remove',  RED,        () => setConfirmRemove(p)],
                        ].map(([icon, label, color, action]) => (
                          <button key={label} onClick={action} title={label} style={{
                            padding: '4px 7px', background: 'transparent',
                            border: `1px solid ${BORDER}`, borderRadius: 4, color, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                          }}
                            onMouseEnter={e => { e.currentTarget.style.background = `${color}15`; e.currentTarget.style.borderColor = color }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = BORDER }}
                          >{icon}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Edit panel */}
        {editing && (
          <EditProductPanel
            product={editing}
            onSave={handleEdit}
            onClose={() => setEditing(null)}
            onDeactivate={() => setDeactivating(editing)}
            onReactivate={() => handleReactivate(editing)}
          />
        )}
      </div>

      {/* Modals — locId/locName injected from active location, no picker inside */}
      {adjusting && <AdjustStockModal product={adjusting} locId={activeLoc} locName={activeLocName} onConfirm={handleAdjust} onClose={() => setAdjusting(null)} />}
      {counting  && <SetCountModal    product={counting}  locId={activeLoc} locName={activeLocName} onConfirm={handleSetCount} onClose={() => setCounting(null)} />}

      {/* Confirm remove */}
      {confirmRemove && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1200, backdropFilter: 'blur(3px)' }}>
          <div style={{ background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 10, width: 380, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Remove Product?</p>
            <p style={{ color: MUTED, fontSize: 13, marginBottom: 4 }}>{confirmRemove.name}</p>
            <p style={{ color: '#fca5a5', fontSize: 12, marginBottom: 20 }}>This will remove it from inventory. Sales history is preserved.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => handleRemove(confirmRemove)} style={{ flex: 2, padding: '11px', background: RED, border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Yes, Remove</button>
              <button onClick={() => setConfirmRemove(null)} style={{ flex: 1, padding: '11px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate confirmation modal */}
      {deactivating && (
        <DeactivateModal
          product={deactivating}
          sales={sales}
          onConfirm={handleDeactivate}
          onClose={() => setDeactivating(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 20px', color: TEXT, fontSize: 13, fontWeight: 500, zIndex: 1300, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── Transfers View ───────────────────────────────────────────────────────────
function TransfersView({ products, setProducts }) {
  const [fromLoc, setFromLoc]       = useState(LOCATIONS_CFG[0].id)
  const [toLoc, setToLoc]           = useState(LOCATIONS_CFG[1]?.id || LOCATIONS_CFG[0].id)
  const [search, setSearch]         = useState('')
  const [selected, setSelected]     = useState(null)
  const [qty, setQty]               = useState('')
  const [note, setNote]             = useState('')
  const [err, setErr]               = useState('')
  const [toast, setToast]           = useState('')
  const [recentTransfers, setRecentTransfers] = useState([])
  const [sending, setSending]       = useState(false)

  useEffect(() => {
    fetchRecentTransfers().then(rows => { if (rows) setRecentTransfers(rows) })
  }, [])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2400) }

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return products.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)).slice(0, 8)
  }, [products, search])

  const fromName = LOCATIONS_CFG.find(l => l.id === fromLoc)?.name || fromLoc
  const toName   = LOCATIONS_CFG.find(l => l.id === toLoc)?.name   || toLoc
  const availableAtFrom = selected ? (selected.qtyByLoc?.[fromLoc] ?? 0) : 0

  const handleTransfer = async () => {
    if (!selected) { setErr('Select a product'); return }
    if (fromLoc === toLoc) { setErr('Source and destination must be different'); return }
    const n = parseInt(qty)
    if (!qty || isNaN(n) || n <= 0) { setErr('Enter a valid quantity'); return }
    if (n > availableAtFrom) { setErr(`Only ${availableAtFrom} units available at ${fromName}`); return }
    setErr('')
    setSending(true)

    // Optimistic local update — both sides immediately
    setProducts(prev => prev.map(p => {
      if (p.id !== selected.id) return p
      const newQtyByLoc = {
        ...(p.qtyByLoc || {}),
        [fromLoc]: Math.max(0, (p.qtyByLoc?.[fromLoc] ?? 0) - n),
        [toLoc]:   (p.qtyByLoc?.[toLoc] ?? 0) + n,
      }
      return { ...p, qty: Object.values(newQtyByLoc).reduce((s, v) => s + (parseInt(v) || 0), 0), qtyByLoc: newQtyByLoc }
    }))

    // Optimistic entry for immediate display
    const optimistic = {
      id:                 `local-${Date.now()}`,
      product_name:       selected.name,
      barcode:            selected.barcode,
      qty:                n,
      from_location_name: fromName,
      to_location_name:   toName,
      sent_by:            '',
      sent_at:            new Date().toISOString(),
      status:             'received',
      note:               note || '',
    }
    setRecentTransfers(prev => [optimistic, ...prev])

    // Fire-and-forget: send (deduct origin + create record + movement) then receive (add destination)
    const fromUUID = getLocationUUID(fromLoc)
    const toUUID   = getLocationUUID(toLoc)
    sendTransfer({
      productId:        selected.id,
      productName:      selected.name,
      barcode:          selected.barcode,
      qty:              n,
      fromLocationUUID: fromUUID,
      fromLocationName: fromName,
      toLocationUUID:   toUUID,
      toLocationName:   toName,
      sentBy:           '',
      note:             note || '',
    }).then(transferId => {
      if (transferId) receiveTransfer({ id: transferId, product_id: selected.id, to_location_id: toUUID, qty: n })
    })

    showToast(`Transferred ${n}× ${selected.name} from ${fromName} to ${toName}`)
    setSelected(null); setSearch(''); setQty(''); setNote('')
    setSending(false)
  }

  const inp = { padding: '8px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }
  const lbl = (t) => <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, display: 'block', marginBottom: 5 }}>{t}</label>

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 600 }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Transfer Stock</p>
        <p style={{ color: MUTED, fontSize: 12, marginBottom: 24 }}>Move units between locations. Both location stocks update immediately.</p>

        {/* From / To */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'end', marginBottom: 20 }}>
          <div>
            {lbl('FROM LOCATION')}
            <select value={fromLoc} onChange={e => setFromLoc(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {LOCATIONS_CFG.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <span style={{ color: MUTED, fontSize: 20, paddingBottom: 2 }}>→</span>
          <div>
            {lbl('TO LOCATION')}
            <select value={toLoc} onChange={e => setToLoc(e.target.value)} style={{ ...inp, cursor: 'pointer' }}>
              {LOCATIONS_CFG.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        {/* Product search */}
        <div style={{ marginBottom: 16, position: 'relative' }}>
          {lbl('PRODUCT')}
          {selected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'rgba(37,99,235,0.08)', border: `1px solid ${BLUE}`, borderRadius: 6 }}>
              <span style={{ flex: 1, color: TEXT, fontSize: 13, fontWeight: 600 }}>{selected.name}</span>
              <span style={{ color: DIM, fontSize: 12 }}>Available at {fromName}: <strong style={{ color: availableAtFrom > 0 ? GREEN : RED }}>{availableAtFrom}</strong></span>
              <button onClick={() => { setSelected(null); setSearch('') }} style={{ background: 'none', border: 'none', color: MUTED, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ) : (
            <>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product by name or barcode..." style={inp}
                onFocus={e => { e.target.style.borderColor = BLUE }}
                onBlur={e => { e.target.style.borderColor = BORDER }}
              />
              {searchResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: PANEL, border: `1px solid ${BORDER}`, borderRadius: 6, zIndex: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.4)', marginTop: 2 }}>
                  {searchResults.map(p => (
                    <button key={p.id} onClick={() => { setSelected(p); setSearch('') }} style={{
                      display: 'block', width: '100%', padding: '10px 14px', background: 'transparent',
                      border: 'none', borderBottom: `1px solid ${BORDER}`, cursor: 'pointer', textAlign: 'left', transition: 'background 0.1s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.08)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <span style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                      <span style={{ color: MUTED, fontSize: 11, marginLeft: 10 }}>{p.barcode}</span>
                      <span style={{ float: 'right', color: DIM, fontSize: 11 }}>{fromName}: {p.qtyByLoc?.[fromLoc] ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Quantity */}
        <div style={{ marginBottom: 16 }}>
          {lbl('QUANTITY TO TRANSFER')}
          <input type="number" min="1" value={qty} onChange={e => { setQty(e.target.value); setErr('') }} style={{ ...inp, borderColor: err ? RED : BORDER }}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = err ? RED : BORDER }}
          />
        </div>

        {/* Note */}
        <div style={{ marginBottom: 20 }}>
          {lbl('NOTE (optional)')}
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for transfer..." style={inp}
            onFocus={e => { e.target.style.borderColor = BLUE }}
            onBlur={e => { e.target.style.borderColor = BORDER }}
          />
        </div>

        {err && <p style={{ color: RED, fontSize: 12, marginBottom: 12 }}>⚠️ {err}</p>}

        <button onClick={handleTransfer} disabled={sending} style={{
          width: '100%', padding: '13px', background: sending ? '#1e3a6e' : BLUE, border: 'none', borderRadius: 6,
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: sending ? 'not-allowed' : 'pointer',
          boxShadow: '0 0 20px rgba(37,99,235,0.25)', transition: 'all 0.2s ease',
        }}
          onMouseEnter={e => { if (!sending) e.currentTarget.style.background = '#1d4ed8' }}
          onMouseLeave={e => { if (!sending) e.currentTarget.style.background = BLUE }}
        >{sending ? 'Sending...' : '→ Confirm Transfer'}</button>

        {/* Recent transfers — sourced from Supabase inventory_transfers */}
        {recentTransfers.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 12 }}>RECENT TRANSFERS</p>
            <div style={{ borderRadius: 8, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>
              {recentTransfers.slice(0, 8).map(t => (
                <div key={t.id} style={{ padding: '10px 14px', borderBottom: `1px solid rgba(30,41,59,0.4)`, display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ fontSize: 16 }}>→</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: TEXT, fontSize: 12, fontWeight: 600 }}>{t.product_name}</p>
                    <p style={{ color: MUTED, fontSize: 11 }}>{t.from_location_name} → {t.to_location_name} · {t.qty} units</p>
                  </div>
                  <span style={{
                    color: t.status === 'received' ? GREEN : AMBER,
                    fontSize: 10, fontWeight: 600, marginRight: 8,
                  }}>{t.status}</span>
                  <span style={{ color: 'var(--c-text-dim)', fontSize: 10 }}>{fmtTs(t.sent_at)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)', background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 20px', color: TEXT, fontSize: 13, fontWeight: 500, zIndex: 1300, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}

// ─── History View ─────────────────────────────────────────────────────────────
function HistoryView({ history, filterProductId, clearFilter }) {
  const [search, setSearch]       = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterLoc, setFilterLoc] = useState('all')
  const [fromDate, setFromDate]   = useState('')
  const [toDate, setToDate]       = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const from = fromDate ? new Date(fromDate) : null
    const to   = toDate   ? new Date(toDate + 'T23:59:59') : null
    return history.filter(h => {
      const matchProd = !filterProductId || h.productId === filterProductId
      const matchSearch = !q || (h.productName || '').toLowerCase().includes(q) || (h.barcode || '').includes(q)
      const matchType = filterType === 'all' || h.type === filterType
      const matchLoc  = filterLoc  === 'all' || h.locationId === filterLoc
      const d = new Date(h.timestamp)
      const matchDate = (!from || d >= from) && (!to || d <= to)
      return matchProd && matchSearch && matchType && matchLoc && matchDate
    })
  }, [history, search, filterType, filterLoc, fromDate, toDate, filterProductId])

  const thS = { padding: '7px 10px', color: MUTED, fontWeight: 600, fontSize: 10, background: CARD, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', letterSpacing: 0.4, textAlign: 'left' }
  const tdS = (extra = {}) => ({ padding: '8px 10px', fontSize: 12, color: DIM, borderBottom: `1px solid rgba(30,41,59,0.4)`, ...extra })

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        {filterProductId && (
          <button onClick={clearFilter} style={{ padding: '5px 10px', background: 'rgba(37,99,235,0.12)', border: `1px solid ${BLUE}`, borderRadius: 4, color: BLUE, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>
            ← All Products
          </button>
        )}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product..."
          style={{ padding: '6px 12px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, width: 200, outline: 'none' }}
          onFocus={e => { e.target.style.borderColor = BLUE }}
          onBlur={e => { e.target.style.borderColor = BORDER }}
        />
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '6px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          <option value="all">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ padding: '6px 10px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          <option value="all">All Locations</option>
          {LOCATIONS_CFG.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} style={{ padding: '5px 8px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, colorScheme: 'dark', outline: 'none' }} />
        <span style={{ color: MUTED, fontSize: 11 }}>–</span>
        <input type="date" value={toDate} onChange={e => setToDate(e.target.value)} style={{ padding: '5px 8px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 12, colorScheme: 'dark', outline: 'none' }} />
        <span style={{ color: MUTED, fontSize: 12 }}>{filtered.length} entries</span>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {['Timestamp','Type','Product','Barcode','Location','Before','After','Delta','Note'].map(h => (
                <th key={h} style={{ ...thS, textAlign: ['Before','After','Delta'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: 'var(--c-text-dim)' }}>No history entries</td></tr>
            )}
            {filtered.map((h, i) => {
              const color = TYPE_COLORS[h.type] || DIM
              return (
                <tr key={h.id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--c-bg-stripe)' }}>
                  <td style={tdS({ fontSize: 11, color: 'var(--c-text-dim)' })}>{fmtTs(h.timestamp)}</td>
                  <td style={tdS()}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${color}18`, border: `1px solid ${color}40`, color }}>{TYPE_LABELS[h.type] || h.type}</span>
                  </td>
                  <td style={tdS({ color: TEXT, fontWeight: 500 })}>{h.productName}</td>
                  <td style={tdS({ fontFamily: 'monospace', fontSize: 10, color: 'var(--c-text-dim)' })}>{h.barcode || '—'}</td>
                  <td style={tdS()}>{h.type === 'transfer' ? `${h.fromLocationName} → ${h.toLocationName}` : h.locationName}</td>
                  <td style={tdS({ textAlign: 'right' })}>{h.before ?? '—'}</td>
                  <td style={tdS({ textAlign: 'right' })}>{h.after ?? '—'}</td>
                  <td style={tdS({ textAlign: 'right', fontWeight: 700, color: h.delta > 0 ? GREEN : h.delta < 0 ? RED : MUTED })}>
                    {h.delta > 0 ? `+${h.delta}` : h.delta}
                  </td>
                  <td style={tdS({ color: MUTED, maxWidth: 200 })}>{h.note || '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
const VIEWS = [
  { id: 'management',   label: '📦 Management'    },
  { id: 'transfers',    label: '↔ Transfers'      },
  { id: 'history',      label: '📋 History'        },
  { id: 'daily-counts', label: '🔢 Daily Counts'  },
]

export default function InventoryAdmin({ onClose, defaultView = 'management', currentUser = null }) {
  const [view, setView]           = useState(defaultView)
  const [products, setProducts]   = useState(loadAllProducts)
  const [history,  setHistory]    = useState(loadInventoryHistory)
  const [sales]                   = useState(loadAllSales)   // read-only — for DeactivateModal stats
  const [historyProductFilter, setHistoryProductFilter] = useState(null)

  // Phase 4: hydrate from Supabase (localStorage is already rendered above).
  // Uses barcode-keyed merge (same as useProducts) to avoid duplicates when a product
  // was added locally between mount and fetch completion.
  useEffect(() => {
    let cancelled = false
    fetchProducts().then(remote => {
      if (!remote || cancelled) return
      setProducts(current => {
        const localMap  = Object.fromEntries(current.map(p => [p.barcode, p]))
        const merged    = remote.map(p => ({ ...p, category: localMap[p.barcode]?.category || p.category || '' }))
        const remoteSet = new Set(remote.map(p => p.barcode))
        current.forEach(p => { if (!remoteSet.has(p.barcode)) merged.push(p) })
        return merged
      })
    })
    fetchInventoryMovements().then(remote => { if (!cancelled && remote) setHistory(remote) })
    return () => { cancelled = true }
  }, [])

  const goToHistory = (productId) => {
    setHistoryProductFilter(productId)
    setView('history')
  }

  const tabStyle = (id) => ({
    padding: '9px 18px', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: view === id ? 700 : 400,
    background: view === id ? PANEL : 'transparent',
    color: view === id ? TEXT : MUTED,
    borderBottom: view === id ? `2px solid ${BLUE}` : '2px solid transparent',
    transition: 'all 0.2s ease',
    textShadow: view === id ? `0 0 10px ${BLUE}80` : 'none',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: BG, zIndex: 1000, display: 'flex', flexDirection: 'column', fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ height: 48, background: PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer', padding: '4px 10px', transition: 'all 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.color = TEXT; e.currentTarget.style.borderColor = 'var(--c-text-muted)' }}
          onMouseLeave={e => { e.currentTarget.style.color = MUTED; e.currentTarget.style.borderColor = BORDER }}
        >← Back</button>
        <span style={{ fontSize: 16 }}>📦</span>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>Inventory</span>
        <span style={{ color: 'var(--c-text-dim)', fontSize: 12 }}>|</span>

        {/* Tabs */}
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => setView(v.id)} style={tabStyle(v.id)}>{v.label}</button>
        ))}

        {/* Stats */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: MUTED, fontSize: 11 }}>
            <strong style={{ color: TEXT }}>{products.length}</strong> products ·{' '}
            <strong style={{ color: TEXT }}>{products.reduce((s, p) => s + (p.qty || 0), 0)}</strong> total units
          </span>
          <span style={{ padding: '3px 8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 4, color: RED, fontSize: 10, fontWeight: 700 }}>
            {products.filter(p => (p.qty || 0) <= 3).length} LOW STOCK
          </span>
        </div>
      </div>

      {/* Content */}
      {view === 'management' && (
        <ManagementView
          products={products}
          setProducts={setProducts}
          setHistory={setHistory}
          filterHistory={goToHistory}
          sales={sales}
        />
      )}
      {view === 'transfers' && (
        <TransfersView
          products={products}
          setProducts={setProducts}
        />
      )}
      {view === 'history' && (
        <HistoryView
          history={history}
          filterProductId={historyProductFilter}
          clearFilter={() => setHistoryProductFilter(null)}
        />
      )}
      {view === 'daily-counts' && (
        <DailyCountsAdmin currentUser={currentUser} />
      )}
    </div>
  )
}
