import { useState } from 'react'
import { PRODUCTS } from '../data/mockData'
import { parseBarcode, buildBarcode } from '../utils/parseBarcode'

export default function AdminPanel({ onClose }) {
  const [products, setProducts] = useState(
    PRODUCTS.map(p => ({ ...p, rawBarcode: p.rawBarcode || p.barcode }))
  )
  const [tab, setTab]             = useState('products')
  const [migLog, setMigLog]       = useState([])
  const [migDone, setMigDone]     = useState(false)
  const [search, setSearch]       = useState('')
  const [editing, setEditing]     = useState(null)   // product being edited
  const [editForm, setEditForm]   = useState({})

  // --- Migrate Barcodes ---
  const handleMigrate = () => {
    const logs = []
    const updated = products.map(p => {
      const { cleanBarcode, minPrice } = parseBarcode(p.rawBarcode)
      if (minPrice !== null && p.minPrice !== minPrice) {
        logs.push(`✓ ${p.name}: barcode "${p.rawBarcode}" → minPrice $${minPrice}`)
        return { ...p, barcode: cleanBarcode, minPrice }
      }
      if (minPrice === null) {
        logs.push(`— ${p.name}: no minPrice in barcode "${p.rawBarcode}"`)
      }
      return { ...p, barcode: cleanBarcode }
    })
    setProducts(updated)
    setMigLog(logs)
    setMigDone(true)
  }

  // --- Edit product ---
  const openEdit = (p) => {
    setEditing(p.id)
    setEditForm({
      name:        p.name,
      description: p.description,
      size:        p.size,
      category:    p.category,
      systemPrice: p.systemPrice,
      costPrice:   p.costPrice || 0,
      cleanBarcode: p.barcode,
      minPrice:    p.minPrice,
    })
  }

  const saveEdit = () => {
    const rawBarcode = buildBarcode(editForm.cleanBarcode, editForm.minPrice)
    setProducts(prev => prev.map(p =>
      p.id === editing ? {
        ...p,
        name:        editForm.name,
        description: editForm.description,
        size:        editForm.size,
        category:    editForm.category,
        systemPrice: parseFloat(editForm.systemPrice) || p.systemPrice,
        costPrice:   parseFloat(editForm.costPrice)   || 0,
        minPrice:    parseFloat(editForm.minPrice)     || p.minPrice,
        barcode:     editForm.cleanBarcode,
        rawBarcode,
      } : p
    ))
    setEditing(null)
  }

  const filtered = products.filter(p =>
    search === '' ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode.includes(search)
  )

  const TABS = [
    { id: 'products',  label: '📦 Products'      },
    { id: 'migrate',   label: '🔄 Migrate Barcodes' },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
    }}>
      <div style={{
        background: '#323232', border: '2px solid #f59e0b', borderRadius: 8,
        width: '95vw', maxWidth: 1000, height: '92vh', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 20px', background: '#2c2010', borderBottom: '1px solid #f59e0b',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <span style={{ fontSize: 20 }}>⚙️</span>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: '#f59e0b' }}>Admin Panel</h2>
          <span style={{ color: '#888', fontSize: 12 }}>— Managers only</span>
          <button onClick={onClose} style={{
            marginLeft: 'auto', padding: '6px 14px', background: '#555',
            border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer'
          }}>✕ Close</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '10px 20px 0', background: '#2c2c2c', flexShrink: 0 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 16px', background: tab === t.id ? '#323232' : 'transparent',
              border: tab === t.id ? '1px solid #555' : '1px solid transparent',
              borderBottom: tab === t.id ? '1px solid #323232' : '1px solid #555',
              borderRadius: '6px 6px 0 0', color: tab === t.id ? '#fff' : '#888',
              fontSize: 13, cursor: 'pointer', fontWeight: tab === t.id ? 600 : 400, marginBottom: -1
            }}>{t.label}</button>
          ))}
          <div style={{ flex: 1, borderBottom: '1px solid #555' }} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ---- PRODUCTS TAB ---- */}
          {tab === 'products' && (
            <>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search product..."
                  style={{ padding: '7px 12px', background: '#3d3d3d', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 13, flex: 1 }} />
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#3d3d3d' }}>
                    {['Product', 'Barcode (limpo)', 'Raw Barcode', 'Min Price', 'Cost Price', 'System Price', 'Qty', ''].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    editing === p.id ? (
                      /* Inline edit row */
                      <tr key={p.id} style={{ background: '#1a2a3a', borderBottom: '2px solid #2980b9' }}>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                            style={{ width: '100%', padding: '4px 8px', background: '#2c2c2c', border: '1px solid #2980b9', borderRadius: 3, color: '#fff', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input value={editForm.cleanBarcode} onChange={e => setEditForm(f => ({ ...f, cleanBarcode: e.target.value }))}
                            style={{ width: 140, padding: '4px 8px', background: '#2c2c2c', border: '1px solid #2980b9', borderRadius: 3, color: '#fff', fontSize: 11, fontFamily: 'monospace' }} />
                        </td>
                        <td style={{ padding: '8px 12px', color: '#555', fontSize: 11, fontFamily: 'monospace' }}>
                          {buildBarcode(editForm.cleanBarcode, editForm.minPrice)}
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type="number" value={editForm.minPrice} onChange={e => setEditForm(f => ({ ...f, minPrice: e.target.value }))}
                            style={{ width: 70, padding: '4px 8px', background: '#2c2c2c', border: '1px solid #e74c3c', borderRadius: 3, color: '#e74c3c', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type="number" value={editForm.costPrice} onChange={e => setEditForm(f => ({ ...f, costPrice: e.target.value }))}
                            style={{ width: 70, padding: '4px 8px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 3, color: '#f39c12', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <input type="number" value={editForm.systemPrice} onChange={e => setEditForm(f => ({ ...f, systemPrice: e.target.value }))}
                            style={{ width: 70, padding: '4px 8px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 3, color: '#4caf50', fontSize: 12 }} />
                        </td>
                        <td style={{ padding: '8px 12px', color: '#ccc' }}>{p.qty}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button onClick={saveEdit} style={{ padding: '4px 10px', background: '#27ae60', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}>Save</button>
                            <button onClick={() => setEditing(null)} style={{ padding: '4px 10px', background: '#555', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={p.id} style={{ borderBottom: '1px solid #2a2a2a' }}
                        onMouseEnter={e => e.currentTarget.style.background = '#2f2f2f'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '8px 12px', color: '#e0e0e0', fontSize: 13 }}>{p.name}</td>
                        <td style={{ padding: '8px 12px', color: '#666', fontSize: 11, fontFamily: 'monospace' }}>{p.barcode}</td>
                        <td style={{ padding: '8px 12px', color: '#444', fontSize: 11, fontFamily: 'monospace' }}>{p.rawBarcode}</td>
                        {/* minPrice visível APENAS no Admin */}
                        <td style={{ padding: '8px 12px', color: '#e74c3c', fontSize: 13, fontWeight: 700 }}>${p.minPrice}</td>
                        <td style={{ padding: '8px 12px', color: '#f39c12', fontSize: 13 }}>${p.costPrice || '—'}</td>
                        <td style={{ padding: '8px 12px', color: '#4caf50', fontSize: 13 }}>${p.systemPrice}</td>
                        <td style={{ padding: '8px 12px', color: '#ccc', fontSize: 13 }}>{p.qty}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <button onClick={() => openEdit(p)} style={{ padding: '4px 10px', background: '#2980b9', border: 'none', borderRadius: 4, color: '#fff', fontSize: 11, cursor: 'pointer' }}>
                            ✏ Edit
                          </button>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </>
          )}

          {/* ---- MIGRATE BARCODES TAB ---- */}
          {tab === 'migrate' && (
            <div style={{ maxWidth: 700 }}>
              <div style={{
                background: '#2c2010', border: '1px solid #f59e0b', borderRadius: 8,
                padding: 20, marginBottom: 20
              }}>
                <h3 style={{ color: '#f59e0b', marginBottom: 8 }}>🔄 Migrate Barcodes</h3>
                <p style={{ color: '#aaa', fontSize: 13, lineHeight: 1.7, marginBottom: 16 }}>
                  Este botão lê todos os raw barcodes existentes, extrai o <strong style={{ color: '#e74c3c' }}>minPrice</strong> embutido
                  (formato: <code style={{ background: '#333', padding: '1px 6px', borderRadius: 3 }}>barcode.minPrice</code>),
                  e salva na coluna <code style={{ background: '#333', padding: '1px 6px', borderRadius: 3 }}>min_price</code> de cada produto.
                  <br />Produtos sem ponto no barcode são registrados mas não alterados.
                </p>
                <button onClick={handleMigrate} style={{
                  padding: '12px 28px', background: migDone ? '#27ae60' : '#f59e0b',
                  border: 'none', borderRadius: 6, color: '#000', fontSize: 14,
                  fontWeight: 700, cursor: 'pointer'
                }}>
                  {migDone ? '✓ Migração concluída' : '▶ Executar Migração'}
                </button>
              </div>

              {migLog.length > 0 && (
                <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 16 }}>
                  <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                    Log — {migLog.length} produtos processados
                  </p>
                  <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {migLog.map((line, i) => (
                      <p key={i} style={{
                        color: line.startsWith('✓') ? '#4caf50' : '#555',
                        fontSize: 12, fontFamily: 'monospace', marginBottom: 4, lineHeight: 1.5
                      }}>{line}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
