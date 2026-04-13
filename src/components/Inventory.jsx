import { useState, useMemo } from 'react'
import { PRODUCTS, CATEGORIES, EMPLOYEES } from '../data/mockData'
import { BUSINESS_SHORT, COLORS, LOCATIONS_CFG } from '../config/branding'

const LOCATIONS = LOCATIONS_CFG.map(l => l.name)
const PRIMARY   = COLORS.primary

const LOSS_REASONS = ['Damaged', 'Lost', 'Tester', 'Other']

// Mock pending transfers (from storage/other locations)
const MOCK_TRANSFERS = [
  { id: 66,  sentFrom: 'Storage Las Vegas', sentAt: '9/18/2024 6:23:57 PM',  sentBy: 'Vinicius',  comment: '', status: 'Sent' },
  { id: 264, sentFrom: 'Storage Las Vegas', sentAt: '12/16/2024 9:10:15 PM', sentBy: 'Vinicius',  comment: '', status: 'Sent' },
  { id: 266, sentFrom: 'Storage Las Vegas', sentAt: '12/18/2024 6:11:54 PM', sentBy: 'Matheus Sa', comment: '', status: 'Sent' },
]

// ── PIN Gate ──────────────────────────────────────────────────────────────────
function InventoryPinGate({ onUnlock, onClose }) {
  const [employee, setEmployee] = useState(EMPLOYEES[0].name)
  const [pin, setPin]           = useState('')
  const [shake, setShake]       = useState(false)

  const press = (digit) => {
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      const emp = EMPLOYEES.find(e => e.name === employee)
      if (emp && emp.pin === next) {
        onUnlock(emp)
      } else {
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10,
        width: 380, padding: 28, textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: 26, marginBottom: 8 }}>📦</div>
        <h2 style={{ color: '#f1f5f9', fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          Inventory Management
        </h2>
        <p style={{ color: '#475569', fontSize: 12, marginBottom: 20 }}>
          Sign in to access inventory
        </p>

        <select value={employee} onChange={e => { setEmployee(e.target.value); setPin('') }}
          style={{
            width: '100%', padding: '9px 12px', background: '#0f172a',
            border: '1px solid #1e293b', borderRadius: 6,
            color: '#f1f5f9', fontSize: 13, marginBottom: 16, cursor: 'pointer', outline: 'none',
          }}>
          {EMPLOYEES.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
        </select>

        <div style={{
          display: 'flex', justifyContent: 'center', gap: 14, marginBottom: 6,
          transform: shake ? 'translateX(4px)' : 'none',
          transition: shake ? 'transform 0.07s' : 'none'
        }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width: 13, height: 13, borderRadius: '50%',
              background: i < pin.length ? (shake ? '#ef4444' : PRIMARY) : '#1e293b',
              border: `2px solid ${i < pin.length ? (shake ? '#ef4444' : PRIMARY) : '#263354'}`,
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
                padding: '13px 0', background: !k ? 'transparent' : '#0f172a',
                border: !k ? 'none' : '1px solid #1e293b', borderRadius: 7,
                color: '#f1f5f9', fontSize: k === '⌫' ? 15 : 18,
                fontWeight: 600, cursor: !k ? 'default' : 'pointer', opacity: !k ? 0 : 1,
                transition: 'background 0.1s',
              }}
            >{k}</button>
          ))}
        </div>
        <button onClick={onClose} style={{
          width: '100%', padding: '10px', background: 'transparent',
          border: '1px solid #1e293b', borderRadius: 6, color: '#64748b', fontSize: 13, cursor: 'pointer',
          transition: 'all 0.15s',
        }}>Cancel</button>
      </div>
    </div>
  )
}

// ── Main Inventory ────────────────────────────────────────────────────────────
export default function Inventory({ onClose }) {
  const [signedIn, setSignedIn]         = useState(null) // employee object
  const [products, setProducts]         = useState(PRODUCTS)
  const [tab, setTab]                   = useState('byItem')
  const [location, setLocation]         = useState(LOCATIONS[0])
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
  const [transfers, setTransfers]       = useState(MOCK_TRANSFERS)

  // Submit Count (By Item)
  const [countSaved, setCountSaved]     = useState(false)

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
    setProducts(prev => prev.map(p => {
      const val = editingCount[p.id]
      if (val === undefined || val === '') return p
      const n = parseInt(val)
      if (isNaN(n)) return p
      return { ...p, qty: Math.max(0, p.qty + n) }
    }))
    setEditingCount({})
    setUpdateComment('')
    setUpdateSaved(true)
    setTimeout(() => setUpdateSaved(false), 2200)
  }

  const handleCountChange = (id, val) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== id) return p
      const n = parseInt(val)
      if (isNaN(n) || n < 0) return p
      return { ...p, qty: n }
    }))
    setCountSaved(false)
  }

  const handleCountSubmit = () => {
    setCountSaved(true)
    setTimeout(() => setCountSaved(false), 2000)
  }

  const handleReportLoss = () => {
    if (!selectedProduct || !lossReason) return
    setProducts(prev => prev.map(p =>
      p.id === selectedProduct.id ? { ...p, qty: Math.max(0, p.qty - lossQty) } : p
    ))
    setLossLog(prev => [{
      timestamp: new Date().toLocaleString(),
      barcode: selectedProduct.barcode,
      name: selectedProduct.name,
      desc: selectedProduct.description || '',
      size: selectedProduct.size || '',
      qty: lossQty,
      reason: lossReason,
      reportedBy: signedIn.name,
    }, ...prev])
    setSelectedProduct(null)
    setLossQty(0)
    setLossReason('')
    setLossComment('')
  }

  const handleReceiveTransfer = (id) => {
    setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'Received' } : t))
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const tabBtn = (id, label) => (
    <button key={id} onClick={() => setTab(id)} style={{
      padding: '8px 14px', background: 'transparent',
      border: 'none', borderBottom: tab === id ? '2px solid #2563eb' : '2px solid transparent',
      color: tab === id ? '#93c5fd' : '#475569',
      fontSize: 12, cursor: 'pointer', fontWeight: tab === id ? 600 : 400, whiteSpace: 'nowrap',
      transition: 'color 0.15s',
    }}>{label}</button>
  )

  const TH = ({ children, w }) => (
    <th style={{
      padding: '7px 10px', background: '#0f172a', textAlign: 'left',
      color: '#475569', fontWeight: 600, fontSize: 11,
      width: w, borderRight: '1px solid #1e293b', whiteSpace: 'nowrap', letterSpacing: 0.3,
    }}>{children}</th>
  )
  const TD = ({ children, center, color }) => (
    <td style={{
      padding: '7px 10px', fontSize: 12,
      color: color || '#94a3b8', textAlign: center ? 'center' : 'left',
      borderRight: '1px solid #1e293b',
    }}>{children}</td>
  )

  const stockColor = (qty) => qty <= 0 ? '#ef4444' : qty <= 2 ? '#ef4444' : qty <= 5 ? '#f59e0b' : '#22c55e'

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#020817', zIndex: 1000,
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 20px', background: '#0a0f1e',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
      }}>
        <span style={{ fontSize: 18 }}>📦</span>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>
          Inventory — {BUSINESS_SHORT}
        </h2>
        <span style={{ color: '#334155', fontSize: 12 }}>
          Signed in as: <span style={{ color: '#22c55e' }}>{signedIn.name}</span>
        </span>
        <button onClick={onClose} style={{
          marginLeft: 'auto', padding: '5px 14px', background: 'transparent',
          border: '1px solid #1e293b', borderRadius: 5, color: '#64748b', fontSize: 12, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
        >✕ Close</button>
      </div>

      {/* Location + Tabs */}
      <div style={{
        padding: '6px 20px 0', background: '#0a0f1e',
        borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'flex-end', gap: 0, flexShrink: 0
      }}>
        <div style={{ marginRight: 20, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: 0.4 }}>LOCATION:</span>
          <select value={location} onChange={e => setLocation(e.target.value)}
            style={{ padding: '5px 10px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: '#f1f5f9', fontSize: 12, outline: 'none' }}>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        {tabBtn('byItem',    '📋 By Item')}
        {tabBtn('byCategory','🗂 By Category')}
        {tabBtn('update',    '🔄 Update')}
        {tabBtn('report',    '⚠ Damage/Loss')}
        {tabBtn('transfer',  '📥 Transfer')}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#020817' }}>

        {/* ══ VIEW BY ITEM ══════════════════════════════════════════════════ */}
        {tab === 'byItem' && (
          <>
            {/* Toolbar */}
            <div style={{
              padding: '8px 16px', background: '#0a0f1e', borderBottom: '1px solid #1e293b',
              display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0
            }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search product or barcode..."
                style={{ padding: '6px 12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: '#f1f5f9', fontSize: 13, width: 240 }} />
              <span style={{ color: '#555', fontSize: 18 }}>⊞</span>
              <span style={{ color: '#475569', fontSize: 12, flex: 1 }}>
                Current Location: <strong style={{ color: '#94a3b8' }}>{location}</strong>
              </span>
              <button onClick={handleCountSubmit} style={{
                padding: '6px 16px', background: countSaved ? '#22c55e' : PRIMARY,
                border: 'none', borderRadius: 4, color: '#fff', fontSize: 13,
                fontWeight: 600, cursor: 'pointer'
              }}>{countSaved ? '✓ Saved' : 'Submit Count'}</button>
              <button style={{ padding: '6px 12px', background: 'transparent', border: '1px solid #1e293b', borderRadius: 5, color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                🖨 Print
              </button>
            </div>

            {/* Table */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <TH w={50}>ID</TH>
                    <TH w={120}>Category</TH>
                    <TH w={140}>Barcode</TH>
                    <TH>Product Name</TH>
                    <TH>Desc.</TH>
                    <TH w={90}>Size</TH>
                    <TH w={60}>Color</TH>
                    <TH w={80}>Quantity</TH>
                    <TH w={90}>Count</TH>
                  </tr>
                  {/* Filter row */}
                  <tr style={{ background: '#0f172a' }}>
                    {['Equals:','Equals:','Contains:','Contains:','Contains:','Contains:','Contains:','Equals:','Equals:'].map((f,i) => (
                      <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#334155', borderRight: '1px solid #1e293b' }}>
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
                      <TD color="#666">{p.id}</TD>
                      <TD color="#aaa">{p.category}</TD>
                      <TD color="#555"><span style={{ fontFamily: 'monospace' }}>{p.barcode}</span></TD>
                      <TD><span style={{ color: '#e0e0e0', fontWeight: 500 }}>{p.name}</span></TD>
                      <TD color="#666">{p.description || ''}</TD>
                      <TD color="#888">{p.size || ''}</TD>
                      <TD color="#666">—</TD>
                      <TD center>
                        <span style={{
                          color: stockColor(p.qty), fontWeight: 700,
                          background: `${stockColor(p.qty)}20`, padding: '2px 8px', borderRadius: 4
                        }}>{p.qty}</span>
                      </TD>
                      <TD center>
                        <input type="number" min="0" defaultValue={p.qty}
                          onChange={e => handleCountChange(p.id, e.target.value)}
                          style={{
                            width: 56, padding: '3px 6px', background: '#0f172a',
                            border: '1px solid #1e293b', borderRadius: 4,
                            color: '#f1f5f9', fontSize: 12, textAlign: 'center', outline: 'none'
                          }} />
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
            <div style={{ padding: '10px 16px', background: '#0a0f1e', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
              <span style={{ color: '#475569', fontSize: 12 }}>
                Current Location: <strong style={{ color: '#94a3b8' }}>{location}</strong>
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
                <tr style={{ background: '#0f172a' }}>
                  {['Equals:','Equals:','Equals:','Equals:'].map((f,i) => (
                    <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#334155', borderRight: '1px solid #1e293b' }}>▽ {f}</td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categorySummary.map((cat, i) => (
                  <tr key={cat.id}
                    style={{ borderBottom: '1px solid #1e293b', background: i === 0 ? '#2a2810' : 'transparent', cursor: 'pointer' }}
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
              padding: '8px 16px', background: '#0a0f1e', borderBottom: '1px solid #1e293b',
              display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap'
            }}>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..."
                style={{ padding: '6px 12px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: '#f1f5f9', fontSize: 13, width: 200, outline: 'none' }} />
              <span style={{ color: '#555', fontSize: 18 }}>⊞</span>
              <span style={{ color: '#475569', fontSize: 12 }}>
                Current Location: <strong style={{ color: '#94a3b8' }}>{location}</strong>
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" defaultChecked /> Show products in the inventory at this location
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={showNotIn} onChange={e => setShowNotIn(e.target.checked)} /> Show products that are not in the inventory at this location
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
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
                  <tr style={{ background: '#0f172a' }}>
                    {['Equals:','Contains:','Equals:','Contains:','Contains:','Contains:','Contains:','Equals:','Equals:'].map((f,i) => (
                      <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#334155', borderRight: '1px solid #1e293b' }}>▽ {f}</td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#0a0f1e'}
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
                            width: 70, padding: '3px 6px', background: editingCount[p.id] ? 'rgba(37,99,235,0.15)' : '#0f172a',
                            border: `1px solid ${editingCount[p.id] ? PRIMARY : '#1e293b'}`,
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
                style={{ width: 240, padding: '6px 10px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: '#f1f5f9', fontSize: 12, outline: 'none' }} />
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
            <div style={{ padding: '16px 20px', background: '#0a0f1e', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
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
                  style={{ width: 80, padding: '5px 8px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />

                <span style={{ color: '#aaa', fontSize: 13 }}>Select Reason:</span>
                <select value={lossReason} onChange={e => setLossReason(e.target.value)}
                  style={{ width: 220, padding: '6px 10px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: lossReason ? '#f1f5f9' : '#475569', fontSize: 13, cursor: 'pointer', outline: 'none' }}>
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
                  background: (!selectedProduct || !lossReason) ? '#0f172a' : '#ef4444',
                  border: `1px solid ${(!selectedProduct || !lossReason) ? '#1e293b' : 'transparent'}`,
                  borderRadius: 6, color: (!selectedProduct || !lossReason) ? '#334155' : '#fff',
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
                    <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
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
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                <tr>
                  <TH w={60}>ID</TH>
                  <TH>Sent From</TH>
                  <TH>Sent At</TH>
                  <TH>Sent By</TH>
                  <TH>Comment</TH>
                  <TH w={90}>Status</TH>
                  <TH w={140}>Receive Transfer</TH>
                </tr>
                <tr style={{ background: '#0f172a' }}>
                  {['Equals:','Contains:','Equals:','Contains:','Contains:','Contains:',''].map((f,i) => (
                    <td key={i} style={{ padding: '4px 10px', fontSize: 10, color: '#334155', borderRight: '1px solid #1e293b' }}>
                      {f ? `▽ ${f}` : ''}
                    </td>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: '#444', fontSize: 13 }}>No pending transfers</td></tr>
                )}
                {transfers.map((t, i) => (
                  <tr key={t.id}
                    style={{ borderBottom: '1px solid #1e293b', background: i === 0 ? '#2a2810' : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#282828'}
                    onMouseLeave={e => e.currentTarget.style.background = i === 0 ? '#2a2810' : 'transparent'}
                  >
                    <TD center color="#666">{t.id}</TD>
                    <TD color="#aaa">{t.sentFrom}</TD>
                    <TD color="#888">{t.sentAt}</TD>
                    <TD color="#e0e0e0">{t.sentBy}</TD>
                    <TD color="#666">{t.comment || '—'}</TD>
                    <TD>
                      <span style={{
                        color: t.status === 'Received' ? '#4caf50' : '#f39c12',
                        fontWeight: 600
                      }}>{t.status}</span>
                    </TD>
                    <TD>
                      {t.status !== 'Received' ? (
                        <button onClick={() => handleReceiveTransfer(t.id)} style={{
                          padding: '5px 12px', background: '#2563eb', border: 'none',
                          borderRadius: 5, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600
                        }}>📥 Receive Transfer</button>
                      ) : (
                        <span style={{ color: '#4caf50', fontSize: 12 }}>✓ Received</span>
                      )}
                    </TD>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Product Picker Modal */}
      {showProductPicker && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{
            background: '#0a0f1e', border: '1px solid #1e293b', borderRadius: 10,
            width: 600, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,0.7)'
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>Select Product</span>
              <input placeholder="Search..." autoFocus
                onChange={e => setSearch(e.target.value)}
                style={{ flex: 1, padding: '5px 10px', background: '#0f172a', border: '1px solid #1e293b', borderRadius: 5, color: '#f1f5f9', fontSize: 13, outline: 'none' }} />
              <button onClick={() => setShowProductPicker(false)} style={{ background: 'none', border: 'none', color: '#475569', fontSize: 20, cursor: 'pointer' }}>×</button>
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
                  <span style={{ color: '#334155', fontSize: 11, marginLeft: 10, fontFamily: 'monospace' }}>{p.barcode}</span>
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
