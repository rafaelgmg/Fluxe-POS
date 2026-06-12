import { useState, useMemo, useEffect } from 'react'
import { CATEGORIES } from '../data/mockData'
import { loadActiveEmployees } from '../utils/usersStorage'
import { BUSINESS_SHORT, COLORS, LOCATIONS_CFG } from '../config/branding'
import { verifyEmployeePin } from '../services/supabaseAuth'
import { fetchProducts, getLocationUUID, fetchPendingTransfers } from '../services/supabaseRead'
import { writeStockAdjustment, sendTransfer, receiveTransfer } from '../services/supabaseWrite'
import { addDailyCount } from '../utils/dailyCountsStorage'
import { localId } from '../domain/utils/ids'

const LOCATIONS = LOCATIONS_CFG.map(l => l.name)
const PRIMARY   = COLORS.primary

// ── Design tokens for PIN gate — resolved at runtime ─────────────────────────
const _PANEL  = 'var(--c-bg-panel)'
const _CARD   = 'var(--c-bg-card)'
const _BORDER = 'var(--c-border)'
const _BORMD  = 'var(--c-border-md)'
const _MUTED  = 'var(--c-text-muted)'
const _TEXT   = 'var(--c-text)'

const LOSS_REASONS = ['Damaged', 'Lost', 'Tester', 'Other']

// ── PIN Gate ──────────────────────────────────────────────────────────────────
function InventoryPinGate({ onUnlock, onClose }) {
  const employees = loadActiveEmployees()
  const [employee, setEmployee] = useState(employees[0]?.name ?? '')
  const [pin, setPin]           = useState('')
  const [shake, setShake]       = useState(false)

  const press = async (digit) => {
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      const result = await verifyEmployeePin(employee, next)
      if (result) {
        onUnlock(result)
      } else {
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: _PANEL, border: `1px solid ${_BORDER}`, borderRadius: 10,
        width: 380, padding: 28, textAlign: 'center',
        boxShadow: 'var(--c-shadow-card)',
      }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>📦</div>
        <h2 style={{ color: _TEXT, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          Inventory Management
        </h2>
        <p style={{ color: _MUTED, fontSize: 12, marginBottom: 20 }}>
          Sign in to access inventory
        </p>

        <select value={employee} onChange={e => { setEmployee(e.target.value); setPin('') }}
          style={{
            width: '100%', padding: '9px 12px', background: _CARD,
            border: `1px solid ${_BORDER}`, borderRadius: 6,
            color: _TEXT, fontSize: 13, marginBottom: 16, cursor: 'pointer', outline: 'none',
          }}>
          {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>

        <div style={{
          display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 6,
          transform: shake ? 'translateX(4px)' : 'none',
          transition: shake ? 'transform 0.07s' : 'none'
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 13, height: 13, borderRadius: '50%',
              background: i < pin.length ? (shake ? '#ef4444' : PRIMARY) : _BORDER,
              border: `2px solid ${i < pin.length ? (shake ? '#ef4444' : PRIMARY) : _BORMD}`,
              transition: 'background 0.12s',
              boxShadow: i < pin.length && !shake ? `0 0 6px ${PRIMARY}` : 'none',
            }} />
          ))}
        </div>
        {shake && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 4 }}>Incorrect PIN</p>}
        <div style={{ height: shake ? 4 : 18 }} />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginBottom: 14 }}>
          {['7','8','9','4','5','6','1','2','3','','0','⌫'].map((k, i) => (
            <button key={i}
              onClick={() => {
                if (!k) return
                if (k === '⌫') setPin(p => p.slice(0, -1))
                else press(k)
              }}
              disabled={!k}
              style={{
                padding: '13px 0', background: !k ? 'transparent' : _CARD,
                border: !k ? 'none' : `1px solid ${_BORDER}`, borderRadius: 7,
                color: _TEXT, fontSize: k === '⌫' ? 15 : 18,
                fontWeight: 600, cursor: !k ? 'default' : 'pointer', opacity: !k ? 0 : 1,
                transition: 'background 0.1s',
              }}
            >{k}</button>
          ))}
        </div>
        <button onClick={onClose} style={{
          width: '100%', padding: '10px', background: 'transparent',
          border: `1px solid ${_BORDER}`, borderRadius: 6, color: _MUTED, fontSize: 13, cursor: 'pointer',
          transition: 'all 0.15s',
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main Inventory ────────────────────────────────────────────────────────────
export default function Inventory({ onClose, products: liveProducts = [] }) {
  const [signedIn, setSignedIn]         = useState(null) // employee object
  const [products, setProducts]         = useState(liveProducts)
  const [tab, setTab]                   = useState('byItem')
  const [location, setLocation]         = useState(LOCATIONS[0])

  useEffect(() => {
    if (liveProducts.length > 0) setProducts(liveProducts)
  }, [liveProducts])

  const [loadingStock, setLoadingStock] = useState(false)

  // Re-fetch stock from Supabase on sign-in AND whenever location changes
  // fetchProducts() returns all locations in one call — locId switch picks the right slice
  useEffect(() => {
    if (!signedIn) return
    setLoadingStock(true)
    fetchProducts()
      .then(remote => { if (remote) setProducts(remote) })
      .finally(() => setLoadingStock(false))
  }, [signedIn, location])

  // Fetch pending transfers for current location whenever sign-in or location changes
  useEffect(() => {
    if (!signedIn) return
    const locUUID = getLocationUUID(LOCATIONS_CFG.find(l => l.name === location)?.id)
    if (!locUUID) return
    fetchPendingTransfers(locUUID).then(rows => { if (rows) setTransfers(rows) })
  }, [signedIn, location])
  const [search, setSearch]             = useState('')

  // By Item / Update Inventory
  const [editingCount, setEditingCount] = useState({})   // id → qty to add/remove string
  const [showNotIn, setShowNotIn]       = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [updateComment, setUpdateComment] = useState('')
  const [updateSaved, setUpdateSaved]   = useState(false)

  // Report Damage/Loss
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [lossQty, setLossQty]           = useState(0)
  const [lossReason, setLossReason]     = useState('')
  const [lossComment, setLossComment]   = useState('')
  const [lossLog, setLossLog]           = useState([])

  // Inventory Transfer
  const [transfers,        setTransfers]        = useState([])
  const [showNewTransfer,  setShowNewTransfer]  = useState(false)
  const [ntProduct,        setNtProduct]        = useState(null)   // selected product
  const [ntQty,            setNtQty]            = useState(1)
  const [ntDest,           setNtDest]           = useState('')     // destination locId
  const [ntNote,           setNtNote]           = useState('')
  const [ntSearch,         setNtSearch]         = useState('')
  const [ntSending,        setNtSending]        = useState(false)

  // Daily Count submission (By Item tab) — absolute qty per product, not delta
  const [pendingCounts, setPendingCounts]   = useState({})  // productId → absolute qty string
  const [countSubmitted, setCountSubmitted] = useState(false)
  const [countSubmitMsg, setCountSubmitMsg] = useState('')

  // ── Filtered products (hooks ALWAYS before any return) ───────────────────
  const filtered = useMemo(() => {
    return products.filter(p => {
      if (!search) return true
      const q = search.toLowerCase()
      return p.name.toLowerCase().includes(q) || p.barcode.includes(q)
    })
  }, [products, search])

  // ── Category summary ──────────────────────────────────────────────────────
  const categorySummary = useMemo(() => {
    return CATEGORIES.map((cat, i) => ({
      id: i + 1,
      name: cat,
      qty: products.filter(p => p.category === cat).reduce((s, p) => s + p.qty, 0),
      count: products.filter(p => p.category === cat).length,
    }))
  }, [products])

  // ── PIN gate (after all hooks) ────────────────────────────────────────────
  if (!signedIn) {
    return <InventoryPinGate onUnlock={emp => setSignedIn(emp)} onClose={onClose} />
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleSubmitCount = () => {
    const entries = Object.entries(editingCount).filter(([, v]) => v !== '')
    if (!entries.length) return

    const locationUUID = getLocationUUID(locId)
    const stockChanges = []

    setProducts(prev => prev.map(p => {
      const val = editingCount[p.id]
      if (val === undefined || val === '') return p
      const n = parseInt(val)
      if (isNaN(n)) return p
      const qtyBefore   = locQty(p)
      const qtyAfter    = Math.max(0, qtyBefore + n)
      const newQtyByLoc = locId && p.qtyByLoc
        ? { ...p.qtyByLoc, [locId]: qtyAfter }
        : p.qtyByLoc
      stockChanges.push({ productId: p.id, productName: p.name, barcode: p.barcode, locationUUID, locationName: location, qtyBefore, qtyAfter })
      return { ...p, qty: Math.max(0, p.qty + n), qtyByLoc: newQtyByLoc }
    }))

    // Fire-and-forget — local state already updated
    if (locationUUID && stockChanges.length > 0) {
      writeStockAdjustment(stockChanges, {
        type:          'adjustment',
        note:          updateComment || 'Manual inventory update',
        performedById: signedIn?.id || null,
      })
    }

    setEditingCount({})
    setUpdateComment('')
    setUpdateSaved(true)
    setTimeout(() => setUpdateSaved(false), 2200)
  }

  const handleCountChange = (id, val) => {
    setPendingCounts(prev => ({ ...prev, [id]: val }))
    setCountSubmitted(false)
  }

  const handleCountSubmit = () => {
    const entries = Object.entries(pendingCounts).filter(([, v]) => v !== '')
    if (!entries.length) {
      setCountSubmitMsg('Enter at least one count before submitting.')
      setCountSubmitted(true)
      setTimeout(() => setCountSubmitted(false), 3000)
      return
    }

    const items = entries.map(([pid, val]) => {
      const p        = products.find(pr => pr.id === pid)
      if (!p) return null
      const counted  = Math.max(0, parseInt(val))
      const systemQty = locQty(p)
      return {
        productId:   p.id,
        barcode:     p.barcode,
        productName: p.name,
        category:    p.category || '',
        description: p.description || '',
        size:        p.size || '',
        systemQty,
        countedQty:  isNaN(counted) ? systemQty : counted,
        difference:  isNaN(counted) ? 0 : counted - systemQty,
        itemStatus:  'pending',
      }
    }).filter(Boolean)

    const hasDiff = items.some(it => it.difference !== 0)

    addDailyCount({
      id:            localId('dc'),
      locationId:    locId   || '',
      locationName:  location,
      submittedBy:   signedIn.name,
      submittedById: signedIn.id || null,
      submittedAt:   new Date().toISOString(),
      status:        hasDiff ? 'count_error' : 'ok',
      reviewedBy:    null,
      reviewedAt:    null,
      appliedBy:     null,
      appliedAt:     null,
      notes:         '',
      items,
    })

    setPendingCounts({})
    setCountSubmitMsg(hasDiff ? 'Count submitted for admin review. Differences found.' : 'Count submitted. No differences found.')
    setCountSubmitted(true)
    setTimeout(() => setCountSubmitted(false), 4000)
  }

  const handleReportLoss = () => {
    if (!selectedProduct || !lossReason) return

    const locationUUID = getLocationUUID(locId)
    const qtyBefore    = locQty(selectedProduct)
    const qtyAfter     = Math.max(0, qtyBefore - lossQty)

    setProducts(prev => prev.map(p => {
      if (p.id !== selectedProduct.id) return p
      const newQtyByLoc = locId && p.qtyByLoc
        ? { ...p.qtyByLoc, [locId]: qtyAfter }
        : p.qtyByLoc
      return { ...p, qty: Math.max(0, p.qty - lossQty), qtyByLoc: newQtyByLoc }
    }))

    // Fire-and-forget — local state already updated
    if (locationUUID) {
      writeStockAdjustment(
        [{ productId: selectedProduct.id, productName: selectedProduct.name, barcode: selectedProduct.barcode, locationUUID, locationName: location, qtyBefore, qtyAfter }],
        {
          type:          'removal',
          note:          `${lossReason}${lossComment ? ` — ${lossComment}` : ''}`,
          performedById: signedIn?.id || null,
        }
      )
    }

    setLossLog(prev => [{
      timestamp: new Date().toLocaleString(),
      barcode:    selectedProduct.barcode,
      name:       selectedProduct.name,
      desc:       selectedProduct.description || '',
      size:       selectedProduct.size || '',
      qty:        lossQty,
      reason:     lossReason,
      reportedBy: signedIn.name,
    }, ...prev])
    setSelectedProduct(null)
    setLossQty(0)
    setLossReason('')
    setLossComment('')
  }

  const handleReceiveTransfer = async (transfer) => {
    // Optimistic UI update
    setTransfers(prev => prev.map(t => t.id === transfer.id ? { ...t, status: 'received' } : t))
    // Update destination inventory locally
    setProducts(prev => prev.map(p => {
      if (p.id !== transfer.product_id) return p
      const locUUID   = transfer.to_location_id
      const locKey    = LOCATIONS_CFG.find(l => getLocationUUID(l.id) === locUUID)?.id
      const newQtyByLoc = locKey && p.qtyByLoc
        ? { ...p.qtyByLoc, [locKey]: (p.qtyByLoc[locKey] || 0) + transfer.qty }
        : p.qtyByLoc
      return { ...p, qty: p.qty + transfer.qty, qtyByLoc: newQtyByLoc }
    }))
    // Fire-and-forget Supabase write
    receiveTransfer(transfer)
  }

  const handleSendTransfer = async () => {
    if (!ntProduct || ntQty < 1 || !ntDest) return
    setNtSending(true)
    const fromLocId   = LOCATIONS_CFG.find(l => l.name === location)?.id
    const fromUUID    = getLocationUUID(fromLocId)
    const toLocCfg    = LOCATIONS_CFG.find(l => l.id === ntDest)
    const toUUID      = getLocationUUID(ntDest)

    // Optimistic UI: deduct from current location's stock
    setProducts(prev => prev.map(p => {
      if (p.id !== ntProduct.id) return p
      const newQtyByLoc = fromLocId && p.qtyByLoc
        ? { ...p.qtyByLoc, [fromLocId]: Math.max(0, (p.qtyByLoc[fromLocId] || 0) - ntQty) }
        : p.qtyByLoc
      return { ...p, qty: Math.max(0, p.qty - ntQty), qtyByLoc: newQtyByLoc }
    }))

    // Fire-and-forget Supabase write
    sendTransfer({
      productId:        ntProduct.id,
      productName:      ntProduct.name,
      barcode:          ntProduct.barcode,
      qty:              ntQty,
      fromLocationUUID: fromUUID,
      fromLocationName: location,
      toLocationUUID:   toUUID,
      toLocationName:   toLocCfg?.name || ntDest,
      sentBy:           signedIn?.name || '',
      note:             ntNote,
    })

    setNtProduct(null); setNtQty(1); setNtNote(''); setNtSearch('')
    setShowNewTransfer(false)
    setNtSending(false)
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} style={{
      padding: '8px 14px', background: 'transparent',
      border: 'none', borderBottom: tab === id ? '2px solid #3b82f6' : '2px solid transparent',
      color: tab === id ? '#93c5fd' : '#94a3b8',
      fontSize: 12, cursor: 'pointer', fontWeight: tab === id ? 600 : 400, whiteSpace: 'nowrap',
      transition: 'color 0.15s',
    }}>{label}</button>
  )

  const TH = ({ children, w }) => (
    <th style={{
      padding: '7px 10px', background: '#111d30', textAlign: 'left',
      color: '#94a3b8', fontWeight: 600, fontSize: 11,
      width: w, borderRight: '1px solid #253349', whiteSpace: 'nowrap', letterSpacing: 0.3,
    }}>{children}</th>
  )
  const TD = ({ children, center, color }) => (
    <td style={{
      padding: '7px 10px', fontSize: 12,
      color: color || '#cbd0e0', textAlign: center ? 'center' : 'left',
      borderRight: '1px solid #253349',
    }}>{children}</td>
  )

  const stockColor = (qty) => qty <= 0 ? '#ef4444' : qty <= 2 ? '#ef4444' : qty <= 5 ? '#f59e0b' : '#22c55e'
  const locId = LOCATIONS_CFG.find(l => l.name === location)?.id

  // Resolve qty for the current location.
  // If qtyByLoc has any entries (Supabase data loaded), use it — default to 0 for this location
  // rather than falling back to the global total, which would hide location differences.
  // If qtyByLoc is empty (offline / no Supabase data), fall back to p.qty as before.
  const locQty = (p) => {
    const byLoc = p.qtyByLoc || {}
    if (Object.keys(byLoc).length > 0) return byLoc[locId] ?? 0
    return p.qty
  }

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 20px', background: '#0d1526',
        borderBottom: '1px solid #253349',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
      }}>
        <span style={{ fontSize: 18 }}>📦</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
          Inventory — {BUSINESS_SHORT}
        </h2>
        <span style={{ color: '#415569', fontSize: 12 }}>
          Signed in as: <span style={{ color: '#22c55e' }}>{signedIn.name}</span>
        </span>
        <button onClick={onClose} style={{
          marginLeft: 'auto', padding: '5px 14px', background: 'transparent',
          border: '1px solid #253349', borderRadius: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
        >✕ Close</button>
      </div>

      {/* Location + Tabs */}
      <div style={{
        padding: '6px 20px 0', background: '#0d1526',
        borderBottom: '1px solid #253349', display: 'flex', alignItems: 'flex-end', gap: 0, flexShrink: 0
      }}>
        <div style={{ marginRight: 20, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>LOCATION:</span>
          <select value={location} onChange={e => { setLocation(e.target.value); setPendingCounts({}) }}
            style={{ padding: '5px 10px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: '#f1f5f9', fontSize: 12, outline: 'none' }}>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          {loadingStock && <span style={{ color: '#3b82f6', fontSize: 11 }}>loading…</span>}
        </div>
        {tabBtn('byItem',    '📋 By Item')}
        {tabBtn('byCategory','🗂 By Category')}
        {tabBtn('update',    '🔄 Update')}
        {tabBtn('report',    '⚠ Damage/Loss')}
        {tabBtn('transfer',  '📥 Transfer')}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#030e1e' }}>

        {/* ══ VIEW BY ITEM ══════════════════════════════════════════════════ */}
        {tab === 'byItem' && (
          <>
            {/* Toolbar */}
            <div style={{
              padding: '8px 16px', background: '#0d1526', borderBottom: '1px solid #253349',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
            }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search product or barcode..."
                style={{ padding: '6px 12px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: '#f1f5f9', fontSize: 13, width: 240 }} />
              <span style={{ color: '#555', fontSize: 18 }}>⊞</span>
              <span style={{ color: '#94a3b8', fontSize: 12, flex: 1 }}>
                Current Location: <strong style={{ color: '#cbd0e0' }}>{location}</strong>
              </span>
              {countSubmitted && (
                <span style={{
                  fontSize: 12, color: countSubmitMsg.includes('admin') ? '#f59e0b' : '#22c55e',
                  background: countSubmitMsg.includes('admin') ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                  border: `1px solid ${countSubmitMsg.includes('admin') ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`,
                  borderRadius: 4, padding: '4px 10px',
                }}>{countSubmitMsg}</span>
              )}
              <button onClick={handleCountSubmit} style={{
                padding: '6px 16px',
                background: countSubmitted ? '#22c55e' : PRIMARY,
                border: 'none', borderRadius: 4, color: '#fff', fontSize: 13,
                fontWeight: 600, cursor: 'pointer'
              }}>{countSubmitted ? '✓ Submitted' : 'Submit Count'}</button>
              <button style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #253349', borderRadius: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                🖨 Print
              </button>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <TH w={120}>Category</TH>
                    <TH w={140}>Barcode</TH>
                    <TH>Product Name</TH>
                    <TH>Desc.</TH>
                    <TH w={80}>Size</TH>
                    <TH w={90}>System Qty</TH>
                    <TH w={90}>Counted</TH>
                    <TH w={90}>Difference</TH>
                  </tr>
                  <tr style={{ background: '#111d30' }}>
                    {['Equals:','Contains:','Contains:','Contains:','Contains:','Equals:','Equals:','Equals:'].map((f,i) => (
                      <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#415569', borderRight: '1px solid #253349' }}>
                        ▽ {f}
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)', transition: 'all 0.2s ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.05)'; e.currentTarget.style.borderBottomColor = 'rgba(37,99,235,0.12)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderBottomColor = 'rgba(30,41,59,0.5)' }}
                    >
                      <TD color="#aaa">{p.category}</TD>
                      <TD color="#555"><span style={{ fontFamily: 'monospace' }}>{p.barcode}</span></TD>
                      <TD><span style={{ color: '#e0e0e0', fontWeight: 500 }}>{p.name}</span></TD>
                      <TD color="#666">{p.description || ''}</TD>
                      <TD color="#888">{p.size || ''}</TD>
                      <TD center>
                        {(() => {
                          const sysQty = locQty(p)
                          return <span style={{ color: stockColor(sysQty), fontWeight: 700, background: `${stockColor(sysQty)}20`, padding: '2px 8px', borderRadius: 4 }}>{sysQty}</span>
                        })()}
                      </TD>
                      <TD center>
                        <input
                          type="number" min="0"
                          value={pendingCounts[p.id] ?? ''}
                          placeholder="—"
                          onChange={e => handleCountChange(p.id, e.target.value)}
                          style={{
                            width: 56, padding: '3px 6px', background: '#111d30',
                            border: `1px solid ${pendingCounts[p.id] !== undefined ? '#3b82f6' : '#253349'}`,
                            borderRadius: 4, color: '#f1f5f9', fontSize: 12, textAlign: 'center', outline: 'none'
                          }}
                        />
                      </TD>
                      <TD center>
                        {(() => {
                          const raw = pendingCounts[p.id]
                          if (raw === undefined || raw === '') return <span style={{ color: '#415569' }}>—</span>
                          const sysQty = locQty(p)
                          const counted = parseInt(raw)
                          if (isNaN(counted)) return <span style={{ color: '#415569' }}>—</span>
                          const diff = counted - sysQty
                          const color = diff === 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#f59e0b'
                          return <span style={{ color, fontWeight: 700, background: `${color}15`, padding: '2px 8px', borderRadius: 4 }}>{diff > 0 ? `+${diff}` : diff}</span>
                        })()}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ══ VIEW BY CATEGORY ════════════════════════════════════════════ */}
        {tab === 'byCategory' && (
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ padding: '10px 16px', background: '#0d1526', borderBottom: '1px solid #253349', flexShrink: 0 }}>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                Current Location: <strong style={{ color: '#cbd0e0' }}>{location}</strong>
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <TH w={120}>Category ID</TH>
                  <TH>Category</TH>
                  <TH w={120}>Quantity</TH>
                  <TH w={100}>Count</TH>
                </tr>
                <tr style={{ background: '#111d30' }}>
                  {['Equals:','Equals:','Equals:','Equals:'].map((f,i) => (
                    <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#415569', borderRight: '1px solid #253349' }}>▽ {f}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categorySummary.map((cat, i) => (
                  <tr key={cat.id}
                    style={{ borderBottom: '1px solid #253349', background: i === 0 ? '#2a2810' : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#282828'}
                    onMouseLeave={e => e.currentTarget.style.background = i === 0 ? '#2a2810' : 'transparent'}
                  >
                    <TD center color="#666">{cat.id}</TD>
                    <TD><span style={{ color: cat.qty < 0 ? '#e74c3c' : '#e0e0e0', fontWeight: 500 }}>{cat.name}</span></TD>
                    <TD center>
                      <span style={{ color: cat.qty < 0 ? '#e74c3c' : cat.qty === 0 ? '#888' : '#4caf50', fontWeight: 700 }}>
                        {cat.qty}
                      </span>
                    </TD>
                    <TD center color="#666">{cat.count}</TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ══ UPDATE INVENTORY ════════════════════════════════════════════ */}
        {tab === 'update' && (
          <>
            <div style={{
              padding: '8px 16px', background: '#0d1526', borderBottom: '1px solid #253349',
              display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap'
            }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                style={{ padding: '6px 12px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: '#f1f5f9', fontSize: 13, width: 200, outline: 'none' }} />
              <span style={{ color: '#555', fontSize: 18 }}>⊞</span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>
                Current Location: <strong style={{ color: '#cbd0e0' }}>{location}</strong>
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked /> Show products in the inventory at this location
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={showNotIn} onChange={e => setShowNotIn(e.target.checked)} /> Show products that are not in the inventory at this location
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} /> Show inactive products
              </label>
              <button style={{ marginLeft: 'auto', padding: '6px 14px', background: PRIMARY, border: 'none', borderRadius: 5, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                + New Transfer
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <TH w={50}>ID</TH>
                    <TH w={130}>Barcode</TH>
                    <TH w={110}>Category</TH>
                    <TH>Product Name</TH>
                    <TH>Desc.</TH>
                    <TH w={80}>Size</TH>
                    <TH w={60}>Color</TH>
                    <TH w={110}>Current Quantity</TH>
                    <TH w={140}>Quantity To Add/Remove</TH>
                  </tr>
                  <tr style={{ background: '#111d30' }}>
                    {['Equals:','Contains:','Equals:','Contains:','Contains:','Contains:','Contains:','Equals:','Equals:'].map((f,i) => (
                      <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#415569', borderRight: '1px solid #253349' }}>▽ {f}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #253349' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#0d1526'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <TD color="#666">{p.id}</TD>
                      <TD color="#555"><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.barcode}</span></TD>
                      <TD color="#aaa">{p.category}</TD>
                      <TD><span style={{ color: '#e0e0e0', fontWeight: 500 }}>{p.name}</span></TD>
                      <TD color="#666">{p.description || ''}</TD>
                      <TD color="#888">{p.size || ''}</TD>
                      <TD color="#666">—</TD>
                      <TD center>
                        <span style={{ color: stockColor(p.qty), fontWeight: 700 }}>{p.qty}</span>
                      </TD>
                      <TD center>
                        <input type="number"
                          value={editingCount[p.id] ?? ''}
                          onChange={e => setEditingCount(prev => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="0"
                          style={{
                            width: 70, padding: '3px 6px', background: editingCount[p.id] ? 'rgba(37,99,235,0.15)' : '#111d30',
                            border: `1px solid ${editingCount[p.id] ? PRIMARY : '#253349'}`,
                            borderRadius: 4, color: '#f1f5f9', fontSize: 12, textAlign: 'center', outline: 'none'
                          }} />
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div style={{
              padding: '10px 16px', background: '#252525', borderTop: '1px solid #2a2a2a',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
            }}>
              <span style={{ color: '#888', fontSize: 12 }}>Comments:</span>
              <input value={updateComment} onChange={e => setUpdateComment(e.target.value)}
                style={{ width: 240, padding: '6px 10px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: '#f1f5f9', fontSize: 12, outline: 'none' }} />
              <button onClick={handleSubmitCount} style={{
                marginLeft: 'auto', padding: '8px 22px', background: updateSaved ? '#22c55e' : PRIMARY,
                border: 'none', borderRadius: 4, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer'
              }}>
                {updateSaved ? '✓ Updated' : 'Update Inventory'}
              </button>
            </div>
          </>
        )}

        {/* ══ REPORT TESTER / DAMAGE / LOSS ══════════════════════════════ */}
        {tab === 'report' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Form */}
            <div style={{ padding: '16px 20px', background: '#0d1526', borderBottom: '1px solid #253349', flexShrink: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 16px', alignItems: 'center', maxWidth: 520 }}>
                <span style={{ color: '#aaa', fontSize: 13 }}>Select Product:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <button onClick={() => setShowProductPicker(true)} style={{
                    padding: '6px 14px', background: PRIMARY, border: 'none', borderRadius: 4,
                    color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer'
                  }}>Open Products List</button>
                  <span style={{ color: '#555', fontSize: 18 }}>⊞</span>
                  <span style={{ color: selectedProduct ? '#e0e0e0' : '#555', fontSize: 13 }}>
                    {selectedProduct ? `${selectedProduct.name} — ${selectedProduct.barcode}` : 'No product selected.'}
                  </span>
                </div>

                <span style={{ color: '#aaa', fontSize: 13 }}>Select Quantity:</span>
                <input type="number" min="0" value={lossQty} onChange={e => setLossQty(parseInt(e.target.value) || 0)}
                  style={{ width: 80, padding: '5px 8px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />

                <span style={{ color: '#aaa', fontSize: 13 }}>Select Reason:</span>
                <select value={lossReason} onChange={e => setLossReason(e.target.value)}
                  style={{ width: 220, padding: '6px 10px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: lossReason ? '#f1f5f9' : '#94a3b8', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
                  <option value="">Select reason...</option>
                  {LOSS_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>

                <span style={{ color: '#aaa', fontSize: 13 }}>Comments:</span>
                <input value={lossComment} onChange={e => setLossComment(e.target.value)}
                  style={{ padding: '5px 10px', background: '#2c2c2c', border: '1px solid #444', borderRadius: 4, color: '#fff', fontSize: 13 }} />
              </div>

              <button
                onClick={handleReportLoss}
                disabled={!selectedProduct || !lossReason}
                style={{
                  marginTop: 16, padding: '8px 24px',
                  background: (!selectedProduct || !lossReason) ? '#111d30' : '#ef4444',
                  border: `1px solid ${(!selectedProduct || !lossReason) ? '#253349' : 'transparent'}`,
                  borderRadius: 6, color: (!selectedProduct || !lossReason) ? '#415569' : '#fff',
                  fontSize: 13, fontWeight: 700, cursor: (!selectedProduct || !lossReason) ? 'not-allowed' : 'pointer'
                }}>
                Report Loss
              </button>
            </div>

            {/* Log table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <TH>Timestamp</TH>
                    <TH w={130}>Barcode</TH>
                    <TH>Product Name</TH>
                    <TH>Desc.</TH>
                    <TH w={80}>Size</TH>
                    <TH w={60}>Color</TH>
                    <TH w={70}>Quantity</TH>
                    <TH w={90}>Reason</TH>
                    <TH w={100}>Reported By</TH>
                  </tr>
                </thead>
                <tbody>
                  {lossLog.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#444', fontSize: 13 }}>No reports yet</td></tr>
                  )}
                  {lossLog.map((l, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #253349' }}>
                      <TD color="#888">{l.timestamp}</TD>
                      <TD color="#555"><span style={{ fontFamily: 'monospace', fontSize: 11 }}>{l.barcode}</span></TD>
                      <TD><span style={{ color: '#e0e0e0' }}>{l.name}</span></TD>
                      <TD color="#666">{l.desc}</TD>
                      <TD color="#888">{l.size}</TD>
                      <TD color="#666">—</TD>
                      <TD center color="#f39c12">{l.qty}</TD>
                      <TD>
                        <span style={{
                          background: l.reason === 'Damaged' ? '#2a1a1a' : l.reason === 'Lost' ? '#2a2a1a' : '#1a2a1a',
                          color: l.reason === 'Damaged' ? '#e74c3c' : l.reason === 'Lost' ? '#f39c12' : '#4caf50',
                          padding: '2px 7px', borderRadius: 3, fontSize: 11
                        }}>{l.reason}</span>
                      </TD>
                      <TD color="#aaa">{l.reportedBy}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ RECEIVE INVENTORY TRANSFER ══════════════════════════════════ */}
        {tab === 'transfer' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              padding: '8px 16px', background: '#0d1526', borderBottom: '1px solid #253349',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
            }}>
              <span style={{ color: '#94a3b8', fontSize: 12, flex: 1 }}>
                Incoming transfers for: <strong style={{ color: '#cbd0e0' }}>{location}</strong>
              </span>
              <button onClick={() => { setNtDest(LOCATIONS_CFG.find(l => l.name !== location)?.id || ''); setShowNewTransfer(true) }} style={{
                padding: '6px 14px', background: PRIMARY, border: 'none', borderRadius: 5,
                color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600,
              }}>+ New Transfer</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <TH>Product</TH>
                    <TH w={60}>Qty</TH>
                    <TH>From</TH>
                    <TH>Sent At</TH>
                    <TH>Sent By</TH>
                    <TH>Note</TH>
                    <TH w={80}>Status</TH>
                    <TH w={150}>Action</TH>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#415569', fontSize: 13 }}>
                      No pending transfers for {location}
                    </td></tr>
                  )}
                  {transfers.map(t => (
                    <tr key={t.id} style={{ borderBottom: '1px solid #253349' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#0d1526'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <TD>
                        <span style={{ color: '#e0e0e0', fontWeight: 500 }}>{t.product_name}</span>
                        <span style={{ color: '#415569', fontSize: 10, marginLeft: 6, fontFamily: 'monospace' }}>{t.barcode}</span>
                      </TD>
                      <TD center><span style={{ color: '#22c55e', fontWeight: 700 }}>{t.qty}</span></TD>
                      <TD color="#aaa">{t.from_location_name}</TD>
                      <TD color="#888">{t.sent_at ? new Date(t.sent_at).toLocaleString() : '—'}</TD>
                      <TD color="#e0e0e0">{t.sent_by || '—'}</TD>
                      <TD color="#666">{t.note || '—'}</TD>
                      <TD>
                        <span style={{ color: t.status === 'received' ? '#22c55e' : '#f59e0b', fontWeight: 600 }}>
                          {t.status}
                        </span>
                      </TD>
                      <TD>
                        {t.status !== 'received' ? (
                          <button onClick={() => handleReceiveTransfer(t)} style={{
                            padding: '5px 12px', background: '#3b82f6', border: 'none',
                            borderRadius: 5, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600,
                          }}>📥 Receive</button>
                        ) : (
                          <span style={{ color: '#22c55e', fontSize: 12 }}>✓ Received</span>
                        )}
                      </TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* New Transfer Modal */}
      {showNewTransfer && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100,
        }}>
          <div style={{
            background: '#0d1526', border: '1px solid #253349', borderRadius: 10,
            width: 520, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
              <span style={{ fontSize: 20 }}>📦</span>
              <h2 style={{ color: '#f1f5f9', fontSize: 16, fontWeight: 700 }}>New Transfer</h2>
              <button onClick={() => setShowNewTransfer(false)} style={{
                marginLeft: 'auto', background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer',
              }}>×</button>
            </div>

            {/* From */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>FROM</label>
              <div style={{ padding: '8px 12px', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#cbd0e0', fontSize: 13 }}>
                {location}
              </div>
            </div>

            {/* To */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>TO</label>
              <select value={ntDest} onChange={e => setNtDest(e.target.value)} style={{
                width: '100%', padding: '8px 12px', background: '#111d30', border: '1px solid #253349',
                borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none', cursor: 'pointer',
              }}>
                {LOCATIONS_CFG.filter(l => l.name !== location).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>

            {/* Product */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>PRODUCT</label>
              {ntProduct ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#111d30', border: '1px solid #3b82f6', borderRadius: 6 }}>
                  <span style={{ color: '#f1f5f9', fontSize: 13, flex: 1 }}>{ntProduct.name}</span>
                  <span style={{ color: '#415569', fontSize: 11, fontFamily: 'monospace' }}>{ntProduct.barcode}</span>
                  <button onClick={() => setNtProduct(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              ) : (
                <>
                  <input value={ntSearch} onChange={e => setNtSearch(e.target.value)}
                    placeholder="Search product..."
                    style={{ width: '100%', padding: '8px 12px', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                  {ntSearch && (
                    <div style={{ maxHeight: 180, overflowY: 'auto', background: '#111d30', border: '1px solid #253349', borderTop: 'none', borderRadius: '0 0 6px 6px' }}>
                      {products.filter(p => p.name.toLowerCase().includes(ntSearch.toLowerCase()) || p.barcode.includes(ntSearch)).slice(0, 20).map(p => (
                        <div key={p.id} onClick={() => { setNtProduct(p); setNtSearch('') }}
                          style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid rgba(30,41,59,0.5)' }}
                          onMouseEnter={e => e.currentTarget.style.background = 'rgba(37,99,235,0.08)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ color: '#f1f5f9', fontSize: 13 }}>{p.name}</span>
                          <span style={{ color: '#415569', fontSize: 11, marginLeft: 8, fontFamily: 'monospace' }}>{p.barcode}</span>
                          <span style={{ color: stockColor(locQty(p)), fontSize: 11, marginLeft: 8 }}>
                            Qty: {locQty(p)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Qty */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>QTY</label>
              <input type="number" min="1" value={ntQty} onChange={e => setNtQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 100, padding: '8px 12px', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
            </div>

            {/* Note */}
            <div style={{ marginBottom: 22 }}>
              <label style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5 }}>NOTE (optional)</label>
              <input value={ntNote} onChange={e => setNtNote(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', background: '#111d30', border: '1px solid #253349', borderRadius: 6, color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowNewTransfer(false)} style={{
                flex: 1, padding: '10px', background: 'transparent', border: '1px solid #253349',
                borderRadius: 6, color: '#94a3b8', fontSize: 13, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={handleSendTransfer} disabled={!ntProduct || ntQty < 1 || !ntDest || ntSending} style={{
                flex: 2, padding: '10px', background: (!ntProduct || !ntDest) ? '#111d30' : PRIMARY,
                border: `1px solid ${(!ntProduct || !ntDest) ? '#253349' : 'transparent'}`,
                borderRadius: 6, color: (!ntProduct || !ntDest) ? '#415569' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: (!ntProduct || !ntDest) ? 'not-allowed' : 'pointer',
              }}>
                {ntSending ? 'Sending...' : '📤 Send Transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{
            background: '#0d1526', border: '1px solid #253349', borderRadius: 10,
            width: 600, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #253349', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>Select Product</span>
              <input placeholder="Search..." autoFocus
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, padding: '5px 10px', background: '#111d30', border: '1px solid #253349', borderRadius: 5, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
              <button onClick={() => setShowProductPicker(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ overflowY: 'auto' }}>
              {filtered.map(p => (
                <div key={p.id}
                  onClick={() => { setSelectedProduct(p); setShowProductPicker(false); setSearch('') }}
                  style={{ padding: '10px 16px', borderBottom: '1px solid rgba(30,41,59,0.5)', cursor: 'pointer', transition: 'all 0.2s ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.06)'; e.currentTarget.style.borderBottomColor = 'rgba(37,99,235,0.15)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderBottomColor = 'rgba(30,41,59,0.5)' }}
                >
                  <span style={{ color: '#f1f5f9', fontSize: 13 }}>{p.name}</span>
                  <span style={{ color: '#415569', fontSize: 11, marginLeft: 10, fontFamily: 'monospace' }}>{p.barcode}</span>
                  <span style={{ color: stockColor(p.qty), fontSize: 12, marginLeft: 10 }}>Qty: {p.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
