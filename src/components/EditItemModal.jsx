import { useState, useEffect } from 'react'

export default function EditItemModal({ product, onAdd, onCancel }) {
  const [priceInput, setPriceInput] = useState(String(product.systemPrice))
  const [qty, setQty] = useState(1)
  const [activeField, setActiveField] = useState('price') // 'price' or 'qty'
  const [error, setError] = useState('')
  const [priceTouched, setPriceTouched] = useState(false)

  // Captura teclado numérico físico
  useEffect(() => {
    const onKey = (e) => {
      // Mapeia teclas numéricas (teclado normal + numpad)
      const numMap = {
        'Numpad0':'0','Numpad1':'1','Numpad2':'2','Numpad3':'3','Numpad4':'4',
        'Numpad5':'5','Numpad6':'6','Numpad7':'7','Numpad8':'8','Numpad9':'9',
        'NumpadDecimal':'.', 'NumpadEnter':'Enter', 'Enter':'Enter',
        'Digit0':'0','Digit1':'1','Digit2':'2','Digit3':'3','Digit4':'4',
        'Digit5':'5','Digit6':'6','Digit7':'7','Digit8':'8','Digit9':'9',
      }
      const mapped = numMap[e.code]
      if (mapped) {
        e.stopPropagation()
        e.preventDefault()
        if (mapped === 'Enter') { handleAdd(); return }
        handleNumpad(mapped)
      } else if (e.key === 'Backspace') {
        e.stopPropagation()
        handleNumpad('Clear')
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true) // capture phase — before App.jsx
    return () => window.removeEventListener('keydown', onKey, true)
  }, [priceInput, qty, activeField, priceTouched])

  const price = parseFloat(priceInput) || 0
  const subtotal = price * qty

  const handleNumpad = (val) => {
    setError('')
    if (activeField === 'price') {
      if (val === 'Clear') { setPriceInput('0'); setPriceTouched(false); return }
      if (!priceTouched) {
        setPriceTouched(true)
        if (val === '.') { setPriceInput('0.'); return }
        setPriceInput(val)
        return
      }
      if (val === '.' && priceInput.includes('.')) return
      if (priceInput === '0' && val !== '.') { setPriceInput(val); return }
      if (priceInput.split('.')[1]?.length >= 2) return
      setPriceInput(prev => prev + val)
    } else {
      if (val === 'Clear') { setQty(1); return }
      if (val === '.') return
      const newQty = parseInt(String(qty) + val)
      if (newQty > 99) return
      setQty(newQty)
    }
  }

  const handleAdd = () => {
    const spare = price - product.minPrice
    const discount = product.systemPrice - price
    onAdd({
      product,
      qty,
      salePrice: price,
      systemPrice: product.systemPrice,
      discount: discount > 0 ? discount : 0,
      subtotal: price * qty,
      spare: spare * qty,
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#3d3d3d', border: '1px solid #555', borderRadius: 8,
        width: 500, padding: 24
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, background: '#c0392b', borderRadius: 6,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
          }}>🏷️</div>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff' }}>Edit an existing item</h2>
          <button onClick={onCancel} style={{
            marginLeft: 'auto', background: '#2980b9', border: 'none',
            borderRadius: 4, color: '#fff', width: 28, height: 28, fontSize: 16, cursor: 'pointer'
          }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Left: product info */}
          <div style={{ flex: 1 }}>
            {/* Product image placeholder */}
            <div style={{
              width: 80, height: 80, background: '#4a4a4a', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 30, marginBottom: 12, border: '1px solid #444'
            }}>🧴</div>

            {/* Barcode + Min Price */}
            <p style={{ color: '#888', fontSize: 11, marginBottom: 4, fontFamily: 'monospace' }}>
              ▐▌▐▌ {product.barcode}{product.minPrice > 0 ? `.${product.minPrice.toFixed(2)}` : ''}
            </p>

            {/* Name */}
            <p style={{ color: '#4fc3f7', fontWeight: 600, fontSize: 15, marginBottom: 4 }}>
              {product.name}
            </p>
            {product.description && (
              <p style={{ color: '#aaa', fontSize: 12, marginBottom: 12 }}>{product.description}</p>
            )}

            {/* Exchange / Discount buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button style={{
                padding: '8px 14px', background: '#c0392b', border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600
              }}>🔄 Exchange</button>
              <button style={{
                padding: '8px 14px', background: '#f39c12', border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600
              }}>% Discount</button>
            </div>

            {/* Price input */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Price per item
              </label>
              <input
                readOnly
                value={`${priceInput}`}
                onFocus={() => setActiveField('price')}
                onClick={() => setActiveField('price')}
                style={{
                  width: '100%', padding: '8px 12px', background: activeField === 'price' ? '#1a4a6a' : '#2c2c2c',
                  border: `1px solid ${activeField === 'price' ? '#2980b9' : '#555'}`,
                  borderRadius: 4, color: '#fff', fontSize: 16, cursor: 'pointer'
                }}
              />
              {error && <p style={{ color: '#e74c3c', fontSize: 11, marginTop: 3 }}>{error}</p>}
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Quantity
              </label>
              <input
                readOnly
                value={qty}
                onFocus={() => setActiveField('qty')}
                onClick={() => setActiveField('qty')}
                style={{
                  width: '100%', padding: '8px 12px', background: activeField === 'qty' ? '#1a4a6a' : '#2c2c2c',
                  border: `1px solid ${activeField === 'qty' ? '#2980b9' : '#555'}`,
                  borderRadius: 4, color: '#fff', fontSize: 16, cursor: 'pointer'
                }}
              />
            </div>

            {/* Subtotal */}
            <div>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 4 }}>
                Subtotal
              </label>
              <input
                readOnly
                value={subtotal.toFixed(2)}
                style={{
                  width: '100%', padding: '8px 12px', background: '#2c2c2c',
                  border: '1px solid #555', borderRadius: 4, color: '#4caf50', fontSize: 16
                }}
              />
            </div>
          </div>

          {/* Right: numpad */}
          <div style={{ width: 180 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {['7','8','9','4','5','6','1','2','3','0','.','Clear'].map((k) => (
                <button
                  key={k}
                  onClick={() => handleNumpad(k)}
                  style={{
                    gridColumn: k === 'Clear' ? 'span 3' : 'auto',
                    padding: k === 'Clear' ? '10px' : '14px',
                    background: k === 'Clear' ? '#555' : '#4a4a4a',
                    border: '1px solid #555', borderRadius: 6,
                    color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer'
                  }}
                >
                  {k}
                </button>
              ))}
            </div>

            {/* Add / Cancel */}
            <button
              onClick={handleAdd}
              style={{
                width: '100%', padding: '12px', background: '#27ae60',
                border: 'none', borderRadius: 6, color: '#fff',
                fontSize: 16, fontWeight: 700, marginBottom: 8
              }}
            >
              Add
            </button>
            <button
              onClick={onCancel}
              style={{
                width: '100%', padding: '12px', background: '#555',
                border: 'none', borderRadius: 6, color: '#fff', fontSize: 16
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
