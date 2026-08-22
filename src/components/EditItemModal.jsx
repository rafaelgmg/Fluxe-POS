import { useState, useEffect } from 'react'
import { loadLocationConfig, loadLocationConfigById } from '../utils/locationConfig'

const BLUE  = '#3b82f6'
const AMBER = '#f59e0b'
const GREEN = '#22c55e'
const RED   = '#ef4444'

export default function EditItemModal({ product, onAdd, onExchange, onCancel, location, locationId }) {
  const [priceInput,    setPriceInput]    = useState(String(product._cartPrice ?? product.systemPrice))
  const [qty,           setQty]           = useState(String(product._cartQty ?? 1))
  const [activeField,   setActiveField]   = useState('price')
  const [error,         setError]         = useState('')
  const [priceTouched,  setPriceTouched]  = useState(false)
  const [qtyTouched,    setQtyTouched]    = useState(false)
  const [showDiscount,  setShowDiscount]  = useState(false)
  const [discType,      setDiscType]      = useState('pct')
  const [discInput,     setDiscInput]     = useState('0')
  const [discTouched,   setDiscTouched]   = useState(false)
  const [showExchange,  setShowExchange]  = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      if (showDiscount || showExchange) { e.stopPropagation(); return }
      const numMap = {
        'Numpad0':'0','Numpad1':'1','Numpad2':'2','Numpad3':'3','Numpad4':'4',
        'Numpad5':'5','Numpad6':'6','Numpad7':'7','Numpad8':'8','Numpad9':'9',
        'NumpadDecimal':'.','NumpadEnter':'Enter','Enter':'Enter',
        'Digit0':'0','Digit1':'1','Digit2':'2','Digit3':'3','Digit4':'4',
        'Digit5':'5','Digit6':'6','Digit7':'7','Digit8':'8','Digit9':'9',
      }
      const mapped = numMap[e.code]
      if (mapped) {
        e.stopPropagation(); e.preventDefault()
        if (mapped === 'Enter') { handleAdd(); return }
        handleNumpad(mapped)
      } else if (e.key === 'Backspace') {
        e.stopPropagation(); handleNumpad('Clear')
      } else if (e.key === 'Escape') {
        e.stopPropagation(); onCancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [priceInput, qty, activeField, priceTouched, qtyTouched, showDiscount, showExchange])

  const price    = parseFloat(priceInput) || 0
  const qtyNum   = parseInt(qty) || 1
  const subtotal = price * qtyNum

  const handleNumpad = (val) => {
    setError('')
    if (activeField === 'price') {
      if (val === 'Clear') { setPriceInput('0'); setPriceTouched(false); return }
      if (!priceTouched) {
        setPriceTouched(true)
        if (val === '.') { setPriceInput('0.'); return }
        setPriceInput(val); return
      }
      if (val === '.' && priceInput.includes('.')) return
      if (priceInput === '0' && val !== '.') { setPriceInput(val); return }
      if (priceInput.split('.')[1]?.length >= 2) return
      setPriceInput(prev => prev + val)
    } else {
      if (val === 'Clear') { setQty(''); setQtyTouched(false); return }
      if (val === '.') return
      if (!qtyTouched) {
        setQtyTouched(true)
        setQty(val)
        return
      }
      const next = qty + val
      if (parseInt(next) > 99) return
      setQty(next)
    }
  }

  const handleAdd = () => {
    const resolvedQty = parseInt(qty) || 1

    // Enforce minimum price restriction if enabled for this location
    const locCfg = locationId
      ? loadLocationConfigById(locationId)
      : loadLocationConfig(location)
    if (locCfg?.minPriceRestriction && product.minPrice > 0 && price < product.minPrice) {
      setError(`Minimum price is $${product.minPrice.toFixed(2)}. Cannot sell below minimum.`)
      return
    }

    const discount = product.systemPrice - price
    onAdd({
      product, qty: resolvedQty, salePrice: price,
      systemPrice: product.systemPrice,
      discount:    discount > 0 ? discount : 0,
      subtotal:    price * resolvedQty,
      spare:       (price - (product.minPrice ?? 0)) * resolvedQty,
    })
  }

  const applyDiscount = () => {
    const val = parseFloat(discInput) || 0
    let newPrice = discType === 'pct'
      ? product.systemPrice * (1 - val / 100)
      : product.systemPrice - val
    newPrice = Math.max(0, newPrice)
    setPriceInput(newPrice.toFixed(2))
    setPriceTouched(true)
    setShowDiscount(false)
    setDiscInput('0')
    setDiscTouched(false)
  }

  const handleDiscNumpad = (val) => {
    if (val === 'Clear') { setDiscInput('0'); setDiscTouched(false); return }
    if (!discTouched) {
      setDiscTouched(true)
      if (val === '.') { setDiscInput('0.'); return }
      setDiscInput(val); return
    }
    if (val === '.' && discInput.includes('.')) return
    if (discInput === '0' && val !== '.') { setDiscInput(val); return }
    if (discInput.split('.')[1]?.length >= 2) return
    setDiscInput(prev => prev + val)
  }

  const numBtnStyle = (active = false) => ({
    padding: '13px 0',
    background: active ? `${BLUE}22` : 'var(--c-bg-card)',
    border: `1px solid ${active ? BLUE : 'var(--c-border)'}`,
    borderRadius: 6,
    color: active ? BLUE : 'var(--c-text)',
    fontSize: 16, fontWeight: 600, cursor: 'pointer', transition: 'all 0.1s',
  })

  const fieldStyle = (active) => ({
    width: '100%', padding: '9px 12px',
    background: active ? `${BLUE}12` : 'var(--c-bg-card)',
    border: `1px solid ${active ? BLUE : 'var(--c-border)'}`,
    borderRadius: 6, color: 'var(--c-text)', fontSize: 16, cursor: 'pointer',
    outline: 'none', boxSizing: 'border-box',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 10,
        width: 500, padding: 24, position: 'relative',
        boxShadow: 'var(--c-shadow-card)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{
            width: 34, height: 34, background: 'rgba(37,99,235,0.15)',
            border: '1px solid rgba(37,99,235,0.3)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16
          }}>🏷️</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>Add to Cart</h2>
          <button onClick={onCancel} style={{
            marginLeft: 'auto', background: 'transparent',
            border: '1px solid var(--c-border)', borderRadius: 6,
            color: 'var(--c-text-muted)', width: 28, height: 28, fontSize: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
        </div>

        <div style={{ display: 'flex', gap: 20 }}>
          {/* Left: product info */}
          <div style={{ flex: 1 }}>
            <div style={{
              width: 72, height: 72, background: 'var(--c-bg-card)', borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 28, marginBottom: 12, border: '1px solid var(--c-border)',
              boxShadow: `0 0 20px ${BLUE}20`,
            }}>🧴</div>

            <p style={{ color: 'var(--c-text-muted)', fontSize: 13, marginBottom: 4, fontFamily: "'Courier New', Courier, monospace" }}>
              {product.barcode}
              {product.minPrice != null && (
                <span style={{ color: 'var(--c-text-muted)', marginLeft: 4 }}>
                  .{product.minPrice}
                </span>
              )}
            </p>
            <p style={{ color: BLUE, fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
              {product.name}
            </p>
            {product.description && (
              <p style={{ color: 'var(--c-text-muted)', fontSize: 12, marginBottom: 12 }}>{product.description}</p>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => setShowExchange(true)} style={{
                padding: '7px 12px', background: `${RED}15`,
                border: `1px solid ${RED}40`, borderRadius: 6,
                color: RED, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}>🔄 Exchange</button>
              <button onClick={() => { setDiscInput('0'); setDiscTouched(false); setShowDiscount(true) }} style={{
                padding: '7px 12px', background: `${AMBER}15`,
                border: `1px solid ${AMBER}40`, borderRadius: 6,
                color: AMBER, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}>% Discount</button>
            </div>

            {/* Price */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>
                PRICE PER ITEM
              </label>
              <input readOnly value={priceInput}
                onFocus={() => setActiveField('price')}
                onClick={() => setActiveField('price')}
                style={fieldStyle(activeField === 'price')} />
              {error && <p style={{ color: RED, fontSize: 11, marginTop: 3 }}>{error}</p>}
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>
                QUANTITY
              </label>
              <input readOnly value={qty}
                onFocus={() => setActiveField('qty')}
                onClick={() => setActiveField('qty')}
                style={fieldStyle(activeField === 'qty')} />
            </div>

            {/* Subtotal */}
            <div>
              <label style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 5, letterSpacing: 0.5 }}>
                SUBTOTAL
              </label>
              <input readOnly value={subtotal.toFixed(2)} style={{
                width: '100%', padding: '9px 12px', background: `${GREEN}10`,
                border: `1px solid ${GREEN}30`, borderRadius: 6,
                color: GREEN, fontSize: 16, fontWeight: 700, outline: 'none', boxSizing: 'border-box',
              }} />
            </div>
          </div>

          {/* Right: numpad */}
          <div style={{ width: 180 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {['7','8','9','4','5','6','1','2','3','0','.','Clear'].map(k => (
                <button key={k} onClick={() => handleNumpad(k)} style={{
                  ...numBtnStyle(false),
                  gridColumn: k === 'Clear' ? 'span 3' : 'auto',
                  padding: k === 'Clear' ? '9px' : '13px',
                  fontSize: k === 'Clear' ? 11 : 16,
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-bg-card)'; e.currentTarget.style.borderColor = 'var(--c-border)' }}
                >{k}</button>
              ))}
            </div>
            <button onClick={handleAdd} style={{
              width: '100%', padding: '12px', background: BLUE,
              border: 'none', borderRadius: 6, color: '#fff',
              fontSize: 15, fontWeight: 700, marginBottom: 8, cursor: 'pointer',
              transition: 'background 0.15s',
              boxShadow: `0 0 20px ${BLUE}40`,
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
              onMouseLeave={e => { e.currentTarget.style.background = BLUE }}
            >Add to Cart</button>
            <button onClick={onCancel} style={{
              width: '100%', padding: '10px', background: 'transparent',
              border: '1px solid var(--c-border)', borderRadius: 6,
              color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-muted)' }}
            >Cancel</button>
          </div>
        </div>

        {/* ── DISCOUNT MODAL ─────────────────────────────────────────────────── */}
        {showDiscount && (
          <div style={{
            position: 'absolute', inset: 0, background: 'var(--c-overlay)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}>
            <div style={{
              background: 'var(--c-bg-panel)', border: `1px solid ${AMBER}40`, borderRadius: 10,
              padding: 24, width: 320,
              boxShadow: `0 0 40px ${AMBER}20`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{
                  width: 30, height: 30, background: `${AMBER}20`,
                  border: `1px solid ${AMBER}40`, borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14
                }}>%</div>
                <h3 style={{ color: 'var(--c-text)', fontSize: 15, fontWeight: 700 }}>Add Discount</h3>
                <button onClick={() => setShowDiscount(false)} style={{
                  marginLeft: 'auto', background: 'transparent', border: '1px solid var(--c-border)',
                  borderRadius: 5, color: 'var(--c-text-muted)', width: 26, height: 26, fontSize: 15, cursor: 'pointer'
                }}>×</button>
              </div>

              <p style={{ color: 'var(--c-text-muted)', fontSize: 12, marginBottom: 10, letterSpacing: 0.3 }}>SELECT DISCOUNT TYPE</p>
              <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
                {[['pct','%','f59e0b'],['dollar','$','2563eb']].map(([type, sym, col]) => (
                  <button key={type}
                    onClick={() => { setDiscType(type); setDiscInput('0'); setDiscTouched(false) }}
                    style={{
                      flex: 1, padding: '13px 0',
                      border: `2px solid ${discType === type ? `#${col}` : 'var(--c-border)'}`,
                      borderRadius: 6, background: discType === type ? `#${col}20` : 'var(--c-bg-card)',
                      color: discType === type ? 'var(--c-text)' : 'var(--c-text-muted)',
                      fontSize: 22, fontWeight: 800, cursor: 'pointer', transition: 'all 0.2s ease',
                    }}>{sym}</button>
                ))}
              </div>

              <p style={{ color: 'var(--c-text-muted)', fontSize: 12, marginBottom: 8 }}>ENTER VALUE</p>
              <input readOnly value={discInput} style={{
                width: '100%', padding: '9px 12px', background: 'var(--c-bg-card)',
                border: `1px solid ${AMBER}50`, borderRadius: 6,
                color: AMBER, fontSize: 20, fontWeight: 700,
                marginBottom: 12, boxSizing: 'border-box', outline: 'none',
              }} />

              {parseFloat(discInput) > 0 && (
                <p style={{ color: GREEN, fontSize: 12, marginBottom: 12, textAlign: 'center' }}>
                  New price: ${discType === 'pct'
                    ? Math.max(0, product.systemPrice * (1 - parseFloat(discInput) / 100)).toFixed(2)
                    : Math.max(0, product.systemPrice - parseFloat(discInput)).toFixed(2)}
                </p>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 14 }}>
                {['7','8','9','4','5','6','1','2','3','0','.','Clear'].map(k => (
                  <button key={k} onClick={() => handleDiscNumpad(k)} style={{
                    padding: '9px 0', background: 'var(--c-bg-card)', border: '1px solid var(--c-border)',
                    borderRadius: 5, color: 'var(--c-text)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}>{k}</button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={applyDiscount} style={{
                  flex: 1, padding: '11px', background: BLUE, border: 'none',
                  borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>Apply</button>
                <button onClick={() => setShowDiscount(false)} style={{
                  flex: 1, padding: '11px', background: 'transparent',
                  border: '1px solid var(--c-border)', borderRadius: 6,
                  color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
                }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ── EXCHANGE MODAL ─────────────────────────────────────────────────── */}
        {showExchange && (
          <div style={{
            position: 'absolute', inset: 0, background: 'var(--c-overlay)',
            borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
          }}>
            <div style={{
              background: 'var(--c-bg-panel)', border: `1px solid ${RED}40`, borderRadius: 10,
              padding: 28, width: 320, textAlign: 'center',
            }}>
              <div style={{ fontSize: 26, marginBottom: 8 }}>🔄</div>
              <h3 style={{ color: 'var(--c-text)', fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                Exchange — {product.name}
              </h3>
              <p style={{ color: 'var(--c-text-muted)', fontSize: 13, marginBottom: 22 }}>
                What would you like to do?
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                <button onClick={() => { setShowExchange(false); onExchange({ type: 'return', product }) }} style={{
                  padding: '16px', background: `${GREEN}10`,
                  border: `1px solid ${GREEN}30`, borderRadius: 8,
                  color: 'var(--c-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}>
                  <span style={{ fontSize: 22 }}>📦</span>
                  <div>
                    <p style={{ color: GREEN, fontWeight: 700, marginBottom: 2 }}>Return to Inventory</p>
                    <p style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 400 }}>
                      Product returns · Spare +${product.systemPrice.toFixed(2)}
                    </p>
                  </div>
                </button>
                <button onClick={() => { setShowExchange(false); onExchange({ type: 'damage', product }) }} style={{
                  padding: '16px', background: `${RED}10`,
                  border: `1px solid ${RED}30`, borderRadius: 8,
                  color: 'var(--c-text)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}>
                  <span style={{ fontSize: 22 }}>⚠️</span>
                  <div>
                    <p style={{ color: RED, fontWeight: 700, marginBottom: 2 }}>Report as Damaged</p>
                    <p style={{ color: 'var(--c-text-muted)', fontSize: 11, fontWeight: 400 }}>
                      Product written off · No spare added
                    </p>
                  </div>
                </button>
              </div>

              <button onClick={() => setShowExchange(false)} style={{
                width: '100%', padding: '10px', background: 'transparent',
                border: '1px solid var(--c-border)', borderRadius: 6,
                color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
