import { useState, useEffect, useRef } from 'react'
import { PRODUCTS, CATEGORIES, PRODUCT_BY_BARCODE } from './data/mockData'
import { parseBarcode } from './utils/parseBarcode'
import LoginModal from './components/LoginModal'
import EditItemModal from './components/EditItemModal'
import Cart from './components/Cart'
import PaymentModal from './components/PaymentModal'
import EndOfDayReport from './components/EndOfDayReport'
import UserReport from './components/UserReport'
import Competition from './components/Competition'
import ClockInOut from './components/ClockInOut'
import Inventory from './components/Inventory'
import AdminPanel from './components/AdminPanel'

const LOCATION = 'Miracle Mall 01'

export default function App() {
  const [currentUser, setCurrentUser]   = useState(null)
  const [selectedCategory, setCategory] = useState('All')
  const [cart, setCart]                 = useState([])
  const [search, setSearch]             = useState('')

  const [showLogin, setShowLogin]       = useState(false)
  const [showEdit, setShowEdit]         = useState(false)
  const [showPayment, setShowPayment]   = useState(false)
  const [pendingProduct, setPendingProduct] = useState(null)
  const [frozenSales, setFrozenSales]   = useState([])
  const [saleComplete, setSaleComplete] = useState(null)
  const [showEndOfDay, setShowEndOfDay]     = useState(false)
  const [showUserReport, setShowUserReport] = useState(false)
  const [showCompetition, setShowCompetition] = useState(false)
  const [showClockInOut, setShowClockInOut] = useState(false)
  const [showInventory, setShowInventory]   = useState(false)
  const [showAdmin, setShowAdmin]           = useState(false)

  const barcodeRef = useRef('')
  const barcodeTimer = useRef(null)

  // Global keydown: capture barcode scanner input
  useEffect(() => {
    const handleKey = (e) => {
      // Ignore if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return

      if (e.key === 'Enter') {
        const code = barcodeRef.current.trim()
        if (code) handleBarcodeScanned(code)
        barcodeRef.current = ''
        clearTimeout(barcodeTimer.current)
      } else if (e.key.length === 1) {
        barcodeRef.current += e.key
        clearTimeout(barcodeTimer.current)
        barcodeTimer.current = setTimeout(() => { barcodeRef.current = '' }, 300)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentUser])

  const handleBarcodeScanned = (rawCode) => {
    const { cleanBarcode, minPrice } = parseBarcode(rawCode)
    // Busca pelo barcode limpo; se o scanner emitir minPrice embutido, extrai silenciosamente
    const product = PRODUCT_BY_BARCODE[cleanBarcode]
    if (!product) return
    // Se o scanner enviou um minPrice embutido, sobrescreve o do cadastro (prioridade ao físico)
    const productWithPrice = minPrice !== null ? { ...product, minPrice } : product
    openEditModal(productWithPrice)
  }

  const openEditModal = (product) => {
    if (!currentUser) {
      setPendingProduct(product)
      setShowLogin(true)
    } else {
      setPendingProduct(product)
      setShowEdit(true)
    }
  }

  const handleLogin = (employee) => {
    setCurrentUser(employee)
    setShowLogin(false)
    if (pendingProduct) setShowEdit(true)
  }

  const handleAddToCart = (item) => {
    setCart(prev => [...prev, item])
    setShowEdit(false)
    setPendingProduct(null)
  }

  const handleRemoveFromCart = (idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const handleCompleteSale = () => {
    if (!currentUser) { setShowLogin(true); return }
    setShowPayment(true)
  }

  const handleConfirmPayment = ({ method, total, subtotal, tax }) => {
    const invoice = {
      number: Math.floor(60000 + Math.random() * 9999),
      timestamp: new Date(),
      location: LOCATION,
      employee: currentUser.name,
      items: cart,
      subtotal,
      tax,
      total,
      paymentMethod: method,
      totalSpare: cart.reduce((s, i) => s + i.spare, 0),
    }
    setSaleComplete(invoice)
    setCart([])
    setShowPayment(false)
    setCurrentUser(null)
  }

  const handleFreezeSale = () => {
    if (cart.length === 0) return
    setFrozenSales(prev => [...prev, { user: currentUser?.name, items: cart, time: new Date() }])
    setCart([])
  }

  // Filtered products
  const filtered = PRODUCTS.filter(p => {
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory
    const matchSearch = search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search)
    return matchCat && matchSearch
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#2c2c2c' }}>

      {/* TOP BAR */}
      <div style={{
        height: 48, background: '#1e1e1e', borderBottom: '1px solid #333',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20, flexShrink: 0
      }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: '#f59e0b', letterSpacing: 1 }}>
          PERFUME PASSAGE
        </span>
        <span style={{ color: '#555', fontSize: 12 }}>|</span>
        <span style={{ color: '#888', fontSize: 13 }}>{LOCATION}</span>

        {/* Nav icons */}
        {[
          { icon: '⏰', label: 'Clock In/Out',  action: () => setShowClockInOut(true) },
          { icon: '📦', label: 'Inventory',      action: () => setShowInventory(true)  },
          { icon: '📊', label: 'End of Day',     action: () => setShowEndOfDay(true)   },
          { icon: '👤', label: 'My Report',      action: () => setShowUserReport(true) },
          { icon: '🏆', label: 'Competition',    action: () => setShowCompetition(true)},
          { icon: '⚙️', label: 'Admin',          action: () => setShowAdmin(true)      },
        ].map(item => (
          <button key={item.label} onClick={item.action || undefined} style={{
            background: 'none', border: 'none', color: item.action ? '#e0e0e0' : '#555',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, fontSize: 10, cursor: item.action ? 'pointer' : 'default',
            padding: '4px 8px', borderRadius: 4
          }}
            onMouseEnter={e => { if (item.action) e.currentTarget.style.background = '#333' }}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {currentUser && (
            <span style={{ color: '#4caf50', fontSize: 13 }}>
              👤 {currentUser.name}
            </span>
          )}
          <span style={{ color: '#555', fontSize: 12 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* CATEGORY SIDEBAR */}
        <div style={{
          width: 110, background: '#323232', borderRight: '1px solid #333',
          display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0
        }}>
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '14px 8px', border: 'none', borderBottom: '1px solid #3a3a3a',
                background: selectedCategory === cat ? '#2980b9' : 'transparent',
                color: selectedCategory === cat ? '#fff' : '#aaa',
                fontSize: 12, fontWeight: selectedCategory === cat ? 700 : 400,
                cursor: 'pointer', textAlign: 'center', lineHeight: 1.3
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* PRODUCT LIST */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Search bar */}
          <div style={{
            padding: '8px 12px', background: '#323232', borderBottom: '1px solid #333',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product or scan barcode..."
              style={{
                flex: 1, padding: '7px 12px', background: '#3d3d3d',
                border: '1px solid #444', borderRadius: 4, color: '#fff', fontSize: 13
              }}
            />
            <span style={{ color: '#555', fontSize: 12 }}>
              {filtered.length} items
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '52px 1fr 180px 70px 60px 50px 60px',
            padding: '7px 12px', background: '#3d3d3d',
            borderBottom: '1px solid #333', fontSize: 11, color: '#888', flexShrink: 0
          }}>
            <span>Photo</span>
            <span>Product</span>
            <span>Barcode</span>
            <span>Size</span>
            <span style={{ textAlign: 'right' }}>Qty</span>
            <span></span>
            <span style={{ textAlign: 'center' }}>Add</span>
          </div>

          {/* Product rows */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.map(product => (
              <div
                key={product.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '52px 1fr 180px 70px 60px 50px 60px',
                  padding: '8px 12px', borderBottom: '1px solid #3d3d3d',
                  alignItems: 'center', cursor: 'pointer',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#3d3d3d'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {/* Photo */}
                <div style={{
                  width: 36, height: 36, background: '#4a4a4a', borderRadius: 4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                }}>🧴</div>

                {/* Name + desc */}
                <div>
                  <p style={{ fontSize: 13, color: '#e0e0e0', fontWeight: 500 }}>{product.name}</p>
                  {product.description && (
                    <p style={{ fontSize: 11, color: '#666' }}>{product.description}</p>
                  )}
                </div>

                {/* Barcode */}
                <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                  {product.barcode}
                </span>

                {/* Size */}
                <span style={{ fontSize: 12, color: '#888' }}>{product.size}</span>

                {/* Qty */}
                <span style={{
                  textAlign: 'right', fontSize: 13,
                  color: product.qty <= 2 ? '#e74c3c' : product.qty <= 5 ? '#f39c12' : '#aaa'
                }}>
                  {product.qty}
                </span>

                {/* Stock indicator */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%', margin: '0 auto',
                  background: product.qty <= 2 ? '#e74c3c' : product.qty <= 5 ? '#f39c12' : '#27ae60'
                }} />

                {/* Add button */}
                <button
                  onClick={() => openEditModal(product)}
                  style={{
                    padding: '5px 10px', background: '#2980b9', border: 'none',
                    borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', margin: '0 auto', display: 'block'
                  }}
                >
                  Add
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* CART */}
        <Cart
          items={cart}
          onRemove={handleRemoveFromCart}
          onCompleteSale={handleCompleteSale}
          currentUser={currentUser}
          onFreezeSale={handleFreezeSale}
        />
      </div>

      {/* BOTTOM STATUS BAR */}
      <div style={{
        height: 32, background: '#1e1e1e', borderTop: '1px solid #333',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
        fontSize: 11, color: '#555', flexShrink: 0
      }}>
        <span>POS v1.0 — Perfume Passage</span>
        <span>•</span>
        <span>{LOCATION}</span>
        {frozenSales.length > 0 && (
          <>
            <span>•</span>
            <span style={{ color: '#f39c12' }}>❄️ {frozenSales.length} frozen sale(s)</span>
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* MODALS */}
      {showLogin && (
        <LoginModal
          onLogin={handleLogin}
          onCancel={() => { setShowLogin(false); setPendingProduct(null) }}
        />
      )}

      {showEdit && pendingProduct && (
        <EditItemModal
          product={pendingProduct}
          onAdd={handleAddToCart}
          onCancel={() => { setShowEdit(false); setPendingProduct(null) }}
        />
      )}

      {showPayment && (
        <PaymentModal
          items={cart}
          currentUser={currentUser}
          onConfirm={handleConfirmPayment}
          onCancel={() => setShowPayment(false)}
        />
      )}

      {showEndOfDay    && <EndOfDayReport onClose={() => setShowEndOfDay(false)}    />}
      {showUserReport  && <UserReport    onClose={() => setShowUserReport(false)}   />}
      {showCompetition && <Competition   onClose={() => setShowCompetition(false)}  />}
      {showClockInOut  && <ClockInOut    onClose={() => setShowClockInOut(false)}   />}
      {showInventory   && <Inventory     onClose={() => setShowInventory(false)}    />}
      {showAdmin       && <AdminPanel    onClose={() => setShowAdmin(false)}        />}

      {/* SALE COMPLETE TOAST */}
      {saleComplete && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          background: '#27ae60', borderRadius: 8, padding: '16px 28px',
          color: '#fff', fontSize: 15, fontWeight: 600, zIndex: 2000,
          display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
        }}>
          <span style={{ fontSize: 22 }}>✅</span>
          Sale #{saleComplete.number} complete — ${saleComplete.total.toFixed(2)} — {saleComplete.employee}
          <button
            onClick={() => setSaleComplete(null)}
            style={{
              marginLeft: 12, background: 'rgba(255,255,255,0.2)', border: 'none',
              borderRadius: 4, color: '#fff', padding: '4px 10px', cursor: 'pointer'
            }}
          >
            OK
          </button>
        </div>
      )}
    </div>
  )
}
