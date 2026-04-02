import { useState } from 'react'
import { PRODUCTS, CATEGORIES } from '../data/mockData'

const LOCATIONS = ['Perfume Passage', 'Miracle Mall 01']

export default function Inventory({ onClose }) {
  const [products, setProducts]       = useState(PRODUCTS)
  const [location, setLocation]       = useState('Miracle Mall 01')
  const [view, setView]               = useState('item')   // 'item' | 'category'
  const [search, setSearch]           = useState('')
  const [filterCat, setFilterCat]     = useState('All')
  const [editingCount, setEditingCount] = useState({})     // id → new count string
  const [damageModal, setDamageModal] = useState(null)     // product
  const [damageNote, setDamageNote]   = useState('')
  const [damageQty, setDamageQty]     = useState(1)
  const [transferModal, setTransferModal] = useState(null) // product
  const [transferQty, setTransferQty] = useState(1)
  const [saved, setSaved]             = useState(false)
  const [log, setLog]                 = useState([])

  const filtered = products.filter(p => {
    const matchCat = filterCat === 'All' || p.category === filterCat
    const matchSearch = search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search)
    return matchCat && matchSearch
  })

  // Group by category for category view
  const byCategory = CATEGORIES.reduce((acc, cat) => {
    const items = filtered.filter(p => p.category === cat)
    if (items.length) acc[cat] = items
    return acc
  }, {})

  const handleCountChange = (id, val) => {
    setEditingCount(prev => ({ ...prev, [id]: val }))
  }

  const handleSubmitCount = () => {
    const updates = Object.entries(editingCount)
    if (updates.length === 0) return
    setProducts(prev => prev.map(p => {
      const newCount = editingCount[p.id]
      if (newCount === undefined || newCount === '') return p
      const n = parseInt(newCount)
      if (isNaN(n) || n < 0) return p
      return { ...p, qty: n }
    }))
    setLog(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      action: `Count updated for ${updates.length} product(s)`,
      by: 'Rafael'
    }])
    setEditingCount({})
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDamage = () => {
    setProducts(prev => prev.map(p =>
      p.id === damageModal.id ? { ...p, qty: Math.max(0, p.qty - damageQty) } : p
    ))
    setLog(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      action: `Damage/Loss: ${damageModal.name} — ${damageQty} unit(s). Note: ${damageNote || '—'}`,
      by: 'Rafael'
    }])
    setDamageModal(null); setDamageNote(''); setDamageQty(1)
  }

  const handleTransfer = () => {
    setProducts(prev => prev.map(p =>
      p.id === transferModal.id ? { ...p, qty: Math.max(0, p.qty - transferQty) } : p
    ))
    setLog(prev => [...prev, {
      time: new Date().toLocaleTimeString(),
      action: `Transfer: ${transferModal.name} — ${transferQty} unit(s) → ${location === LOCATIONS[0] ? LOCATIONS[1] : LOCATIONS[0]}`,
      by: 'Rafael'
    }])
    setTransferModal(null); setTransferQty(1)
  }

  const stockColor = (qty) => qty <= 0 ? '#e74c3c' : qty <= 2 ? '#e74c3c' : qty <= 5 ? '#f39c12' : '#4caf50'

  const ProductRow = ({ p }) => (
    <tr style={{ borderBottom: '1px solid #2a2a2a' }}
      onMouseEnter={e => e.currentTarget.style.background = '#2f2f2f'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '8px 12px', color: '#888', fontSize: 11 }}>{p.id}</td>
      <td style={{ padding: '8px 12px', color: '#aaa', fontSize: 12 }}>{p.category}</td>
      {/* barcode: exibe APENAS o barcode limpo — minPrice nunca mostrado */}
      <td style={{ padding: '8px 12px', color: '#666', fontSize: 11, fontFamily: 'monospace' }}>{p.barcode}</td>
      <td style={{ padding: '8px 12px' }}>
        <p style={{ color: '#e0e0e0', fontSize: 13, fontWeight: 500 }}>{p.name}</p>
        {p.description && <p style={{ color: '#666', fontSize: 11 }}>{p.description}</p>}
      </td>
      <td style={{ padding: '8px 12px', color: '#888', fontSize: 12 }}>{p.size}</td>
      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
        <span style={{
          color: stockColor(p.qty), fontSize: 14, fontWeight: 700,
          background: `${stockColor(p.qty)}22`, padding: '2px 8px', borderRadius: 4
        }}>{p.qty}</span>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <input
          type="number" min="0"
          value={editingCount[p.id] ?? ''}
          onChange={e => handleCountChange(p.id, e.target.value)}
          placeholder="—"
          style={{
            width: 54, padding: '4px 6px', background: editingCount[p.id] !== undefined ? '#1a4a6a' : '#2c2c2c',
            border: `1px solid ${editingCount[p.id] !== undefined ? '#2980b9' : '#555'}`,
            borderRadius: 4, color: '#fff', fontSize: 12, textAlign: 'center'
          }}
        />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => { setDamageModal(p); setDamageNote(''); setDamageQty(1) }}
            style={{ padding: '4px 8px', background: '#c0392b', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}>
            ⚠ Damage
          </button>
          <button onClick={() => { setTransferModal(p); setTransferQty(1) }}
            style={{ padding: '4px 8px', background: '#2980b9', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}>
            ↔ Transfer
          </button>
        </div>
      </td>
    </tr>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
    }}>
      <div style={{
        background: '#323232', border: '1px solid #555', borderRadius: 8,
        width: '95vw', maxWidth: 1100, height: '92vh', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 20px', background: '#3d3d3d', borderBottom: '1px solid #555',
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
        }}>
          <span style={{ fontSize: 20 }}>📦</span>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#fff' }}>Inventory Management — Perfume Passage</h2>

          <select value={location} onChange={e => setLocation(e.target.value)}
            style={{ padding: '6px 10px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 13 }}>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={handleSubmitCount} style={{
              padding: '6px 16px', background: saved ? '#27ae60' : '#2980b9',
              border: 'none', borderRadius: 4, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600
            }}>
              {saved ? '✓ Saved' : '💾 Submit Count'}
            </button>
            <button style={{ padding: '6px 14px', background: '#555', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
              🖨️ Print
            </button>
            <button onClick={onClose} style={{ padding: '6px 14px', background: '#444', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>
              ✕ Close
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{
          padding: '8px 20px', background: '#2c2c2c', borderBottom: '1px solid #444',
          display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0
        }}>
          {/* View toggle */}
          {[{ id: 'item', label: '📋 By Item' }, { id: 'category', label: '🗂 By Category' }].map(v => (
            <button key={v.id} onClick={() => setView(v.id)} style={{
              padding: '6px 14px', background: view === v.id ? '#2980b9' : '#3d3d3d',
              border: 'none', borderRadius: 4, color: view === v.id ? '#fff' : '#888',
              fontSize: 12, cursor: 'pointer', fontWeight: view === v.id ? 600 : 400
            }}>{v.label}</button>
          ))}

          <div style={{ width: 1, height: 20, background: '#444' }} />

          {/* Search */}
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search product or barcode..."
            style={{
              padding: '6px 12px', background: '#3d3d3d', border: '1px solid #555',
              borderRadius: 4, color: '#fff', fontSize: 13, width: 240
            }} />

          {/* Category filter */}
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
            style={{ padding: '6px 10px', background: '#3d3d3d', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 12 }}>
            <option value="All">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <span style={{ color: '#555', fontSize: 12, marginLeft: 'auto' }}>
            {filtered.length} products
          </span>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {view === 'item' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#3d3d3d', borderBottom: '1px solid #555' }}>
                  {['ID', 'Category', 'Barcode', 'Product', 'Size', 'Qty', 'New Count', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => <ProductRow key={p.id} p={p} />)}
              </tbody>
            </table>
          )}

          {view === 'category' && Object.entries(byCategory).map(([cat, items]) => (
            <div key={cat}>
              <div style={{
                padding: '8px 16px', background: '#2c2c2c',
                borderBottom: '1px solid #3a3a3a', display: 'flex', alignItems: 'center', gap: 10
              }}>
                <span style={{ color: '#f59e0b', fontWeight: 700, fontSize: 13 }}>{cat}</span>
                <span style={{ color: '#555', fontSize: 12 }}>{items.length} items</span>
                <span style={{ marginLeft: 'auto', color: '#888', fontSize: 12 }}>
                  Total qty: <strong style={{ color: '#ccc' }}>{items.reduce((s, p) => s + p.qty, 0)}</strong>
                </span>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <tbody>
                  {items.map(p => <ProductRow key={p.id} p={p} />)}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Activity log */}
        {log.length > 0 && (
          <div style={{
            padding: '8px 20px', background: '#2c2c2c', borderTop: '1px solid #444',
            display: 'flex', gap: 16, overflowX: 'auto', flexShrink: 0
          }}>
            {[...log].reverse().slice(0, 4).map((l, i) => (
              <div key={i} style={{ fontSize: 11, color: '#666', whiteSpace: 'nowrap' }}>
                <span style={{ color: '#4caf50' }}>{l.time}</span> — {l.action}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Damage/Loss Modal */}
      {damageModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{ background: '#3d3d3d', border: '1px solid #555', borderRadius: 8, width: 360, padding: 24 }}>
            <h3 style={{ color: '#fff', marginBottom: 16 }}>⚠ Report Damage / Loss</h3>
            <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>{damageModal.name}</p>
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>Quantity</label>
              <input type="number" min="1" max={damageModal.qty} value={damageQty}
                onChange={e => setDamageQty(parseInt(e.target.value) || 1)}
                style={{ width: '100%', padding: '8px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 14 }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>Notes</label>
              <input value={damageNote} onChange={e => setDamageNote(e.target.value)}
                placeholder="Describe what happened..."
                style={{ width: '100%', padding: '8px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 13 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleDamage} style={{ flex: 1, padding: '10px', background: '#c0392b', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Confirm
              </button>
              <button onClick={() => setDamageModal(null)} style={{ flex: 1, padding: '10px', background: '#555', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Modal */}
      {transferModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100
        }}>
          <div style={{ background: '#3d3d3d', border: '1px solid #555', borderRadius: 8, width: 360, padding: 24 }}>
            <h3 style={{ color: '#fff', marginBottom: 16 }}>↔ Inventory Transfer</h3>
            <p style={{ color: '#aaa', fontSize: 13, marginBottom: 4 }}>{transferModal.name}</p>
            <p style={{ color: '#666', fontSize: 12, marginBottom: 16 }}>
              {location} → {location === LOCATIONS[0] ? LOCATIONS[1] : LOCATIONS[0]}
            </p>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>Quantity to transfer</label>
              <input type="number" min="1" max={transferModal.qty} value={transferQty}
                onChange={e => setTransferQty(parseInt(e.target.value) || 1)}
                style={{ width: '100%', padding: '8px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 14 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleTransfer} style={{ flex: 1, padding: '10px', background: '#2980b9', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Transfer
              </button>
              <button onClick={() => setTransferModal(null)} style={{ flex: 1, padding: '10px', background: '#555', border: 'none', borderRadius: 6, color: '#fff', fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
