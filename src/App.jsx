import { useState, useEffect, useRef } from 'react'
import { PRODUCTS as INITIAL_PRODUCTS, PRODUCT_BY_BARCODE } from './data/mockData'
import { loadActiveCategoryNames, ensureCategoriesSeeded } from './utils/categoriesStorage'
import { getTaxRate, loadLocationConfig } from './utils/locationConfig'
import { parseBarcode } from './utils/parseBarcode'
import { printReceipt } from './utils/printReceipt'
import { useCRM } from './hooks/useCRM'
import { useSales, nextInvoiceNumber } from './hooks/useSales'
import { COLORS, DEFAULT_LOCATION, SYSTEM_NAME } from './config/branding'
import AccountLoginScreen from './components/AccountLoginScreen'
import LoginScreen from './components/LoginScreen'
import LoginModal from './components/LoginModal'
import EditItemModal from './components/EditItemModal'
import Cart from './components/Cart'
import PaymentModal from './components/PaymentModal'
import CustomerCaptureModal from './components/CustomerCaptureModal'
import CRMPanel from './components/CRMPanel'
import EndOfDayReport from './components/EndOfDayReport'
import UserReport from './components/UserReport'
import Competition from './components/Competition'
import ClockInOut from './components/ClockInOut'
import Inventory from './components/Inventory'
import AdminPanel from './components/AdminPanel'
import CashDrawer from './components/CashDrawer'
import Receipts from './components/Receipts'
import SellerSelectModal from './components/SellerSelectModal'
import FrozenSalesModal from './components/FrozenSalesModal'
import LockScreen from './components/LockScreen'
import BarcodeModal, { BarcodeIconButton } from './components/BarcodeModal'

const PRODUCTS_STORAGE_KEY = 'fluxe-products-v1'

function loadProducts() {
  try {
    const raw = localStorage.getItem(PRODUCTS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : INITIAL_PRODUCTS
  } catch { return INITIAL_PRODUCTS }
}

// Seed categories on first run (no-op if already seeded)
ensureCategoriesSeeded()

export default function App() {
  const [currentUser, setCurrentUser]   = useState(null)  // session user (LoginModal)
  const [saleEmployee, setSaleEmployee] = useState(null)  // seller confirmed for current sale
  const [products, setProducts]         = useState(loadProducts)
  const [selectedCategory, setCategory] = useState('All')
  const [cart, setCart]                 = useState([])
  const [cartError, setCartError]       = useState(null)   // out-of-stock block message
  const [search, setSearch]             = useState('')
  const [showBarcodeModal, setShowBarcodeModal] = useState(false)

  const [showLogin, setShowLogin]       = useState(false)
  const [showEdit, setShowEdit]         = useState(false)
  const [showPayment, setShowPayment]   = useState(false)
  const [pendingProduct, setPendingProduct] = useState(null)
  const [frozenSales, setFrozenSales]   = useState(() => {
    try { return JSON.parse(localStorage.getItem('fluxe-frozen-sales-v1') || '[]') } catch { return [] }
  })
  const [showFrozen, setShowFrozen] = useState(false)
  const [saleComplete, setSaleComplete] = useState(null)
  const [showEndOfDay, setShowEndOfDay]     = useState(false)
  const [showUserReport, setShowUserReport] = useState(false)
  const [showCompetition, setShowCompetition] = useState(false)
  const [showClockInOut, setShowClockInOut] = useState(false)
  const [showInventory, setShowInventory]   = useState(false)
  const [accountSession, setAccountSession] = useState(null) // null = show account login
  const [posSession, setPosSession]         = useState(null) // null = show location login
  const [showAdmin, setShowAdmin]           = useState(false)
  const [showCRM, setShowCRM]               = useState(false)
  const [showReceipts, setShowReceipts]     = useState(false)
  const [showCashDrawer, setShowCashDrawer] = useState(false)
  const [showSellerSelect, setShowSellerSelect] = useState(false)
  const [loginReason, setLoginReason]       = useState(null) // 'sale' | null
  const [pendingInvoice, setPendingInvoice] = useState(null) // invoice waiting for CRM capture
  const [editingCartIdx, setEditingCartIdx] = useState(null) // index of cart item being edited
  const [lockState, setLockState]           = useState(null) // null = unlocked | { lockedAt, lockedBy }
  const [showCaptureClient, setShowCaptureClient] = useState(false)
  const [showCaptureAuth,   setShowCaptureAuth]   = useState(false)
  const [captureEmployee,   setCaptureEmployee]   = useState(null) // vendedor autenticado no fluxo de captura
  const [showCRMAuth,       setShowCRMAuth]       = useState(false)

  const { customers, serverOnline, syncStatus, upsertCustomer, updateCustomer, archiveCustomer, restoreCustomer, deleteCustomer, addCustomer, patchCustomer, sendManualSMS, getSMSLog, getScheduled } = useCRM()
  const { sales, saveSale, updateSale } = useSales()

  // Tax rate from active location config (falls back to 8.5% if not configured)
  const taxRate = getTaxRate(posSession?.location)

  // Controle de acesso: somente 'manager' acessa o CRM global
  const isAdmin = currentUser?.role === 'manager'

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
    const base = PRODUCT_BY_BARCODE[cleanBarcode]
    if (!base) return
    // Use live product from state so qty reflects sales already made
    const live = products.find(p => p.barcode === cleanBarcode) || base
    const productWithPrice = minPrice !== null ? { ...live, minPrice } : live
    openEditModal(productWithPrice)
  }

  const openEditModal = (product) => {
    // ── blockSaleOutOfStock: check per-location preference ──────────────────
    const locCfg = loadLocationConfig(posSession?.location)
    if (locCfg?.blockSaleOutOfStock && (product.qty ?? 1) <= 0) {
      setCartError(`"${product.name}" is out of stock and cannot be added to this sale.`)
      setTimeout(() => setCartError(null), 4000)
      return
    }
    setEditingCartIdx(null)
    setPendingProduct(product)
    setShowEdit(true)
  }

  const handleEditCartItem = (idx) => {
    const item = cart[idx]
    if (!item || item.exchangeType) return // exchanges não são editáveis
    setEditingCartIdx(idx)
    setPendingProduct({ ...item.product, _cartPrice: item.salePrice })
    setShowEdit(true)
  }

  const handleLogin = (employee) => {
    setCurrentUser(employee)
    setShowLogin(false)
    if (loginReason === 'sale') {
      setLoginReason(null)
      setShowPayment(true)
    }
  }

  const handleAddToCart = (item) => {
    if (editingCartIdx !== null) {
      setCart(prev => prev.map((c, i) => i === editingCartIdx ? item : c))
      setEditingCartIdx(null)
    } else {
      setCart(prev => [...prev, item])
    }
    setShowEdit(false)
    setPendingProduct(null)
  }

  const handleExchange = ({ type, product }) => {
    setCart(prev => [...prev, {
      product,
      qty: -1,
      salePrice: 0,
      systemPrice: product.systemPrice,
      discount: product.systemPrice,
      subtotal: 0,
      spare: type === 'return' ? product.minPrice : 0,
      exchangeType: type,
    }])
    setShowEdit(false)
    setPendingProduct(null)
  }

  const handleRemoveFromCart = (idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }

  const handleCompleteSale = () => {
    setShowSellerSelect(true)
  }

  const handleSellerConfirm = (seller) => {
    setSaleEmployee(seller)           // seller for THIS sale only — never overwrites session user
    setShowSellerSelect(false)
    setShowPayment(true)
  }

  const handleConfirmPayment = ({
    method, total, subtotal, tax, tip = 0,
    // Cash
    amountReceived, changeDue,
    // Card
    cardBrand, cardLast4, authorizationNumber,
    // External
    externalRef,
    // Shared
    notes, linkedCustomerId, receiptAction = 'none',
  }) => {
    const invoice = {
      number:        nextInvoiceNumber(),
      timestamp:     new Date(),
      location:      posSession?.location || DEFAULT_LOCATION,
      employee:      saleEmployee.name,
      items:         cart,
      subtotal,
      tax,
      total,
      tip,
      status:        'normal',
      paymentMethod: method,
      totalSpare:    cart.reduce((s, i) => s + i.spare, 0),
      notes:         notes || '',
      linkedCustomerId: linkedCustomerId || null,
      receiptAction,
      // Cash details
      ...(method === 'cash' && { amountReceived, changeDue }),
      // Card details
      ...(method === 'card' && { cardBrand, cardLast4, authorizationNumber }),
      // External
      ...(method === 'external' && { externalRef }),
    }
    setShowPayment(false)
    setPendingInvoice(invoice)
  }

  const finalizeSale = (invoice) => {
    // Persist sale to localStorage + backend (both Skip and Save paths)
    saveSale(invoice)

    // Decrement stock for each item sold — per location and total
    const locId = posSession?.locationId || null
    setProducts(prev => {
      const updated = prev.map(p => {
        const soldQty = (invoice.items || [])
          .filter(i => (i.product?.barcode || i.barcode) === p.barcode)
          .reduce((sum, i) => sum + Math.max(0, i.qty), 0)
        if (soldQty === 0) return p
        const newQty = Math.max(0, p.qty - soldQty)
        const newQtyByLoc = locId && p.qtyByLoc
          ? { ...p.qtyByLoc, [locId]: Math.max(0, (p.qtyByLoc[locId] || 0) - soldQty) }
          : p.qtyByLoc
        return { ...p, qty: newQty, qtyByLoc: newQtyByLoc }
      })
      localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(updated))
      return updated
    })

    setSaleComplete(invoice)
    setCart([])
    setSaleEmployee(null)   // clear sale-specific seller; session user (currentUser) is preserved
    setPendingInvoice(null)

    // Auto-print based on receiptAction selected in PaymentModal
    if (invoice.receiptAction === 'print' || invoice.receiptAction === 'both') {
      setTimeout(() => printReceipt(invoice), 80)
    }
  }

  const handleCustomerSave = (formData) => {
    upsertCustomer(formData, pendingInvoice)
    finalizeSale(pendingInvoice)
  }

  const handleCustomerSkip = () => {
    finalizeSale(pendingInvoice)
  }

  // Autenticação do captador — independente do currentUser (suporta 2 vendedores simultâneos)
  const handleCaptureAuthSuccess = (employee) => {
    setCaptureEmployee(employee)
    setShowCaptureAuth(false)
    setShowCaptureClient(true)
  }

  // Captura standalone — capturedBy = vendedor autenticado neste fluxo específico
  const handleCaptureClientSave = (formData) => {
    if (!captureEmployee?.name) return  // guard: nunca salvar sem vendedor autenticado
    upsertCustomer({ ...formData, capturedLocation: posSession?.location || '' }, null, captureEmployee.name)
    setShowCaptureClient(false)
    setCaptureEmployee(null)
  }

  // ── Lock / Unlock ────────────────────────────────────────────────────────────
  const handleLock = () => {
    const entry = {
      lockedAt: new Date().toISOString(),
      lockedBy: currentUser?.name || null,
    }
    setLockState(entry)
    // Append to audit log
    try {
      const log = JSON.parse(localStorage.getItem('fluxe-lock-log-v1') || '[]')
      log.push({ id: Date.now(), ...entry, unlockedAt: null, unlockedBy: null })
      localStorage.setItem('fluxe-lock-log-v1', JSON.stringify(log.slice(-200)))
    } catch {}
  }

  const handleUnlock = ({ employee, unlockedAt }) => {
    // Update last log entry with unlock info
    try {
      const log = JSON.parse(localStorage.getItem('fluxe-lock-log-v1') || '[]')
      const last = log.findLast ? log.findLast(e => !e.unlockedAt) : [...log].reverse().find(e => !e.unlockedAt)
      if (last) { last.unlockedAt = unlockedAt; last.unlockedBy = employee.name }
      localStorage.setItem('fluxe-lock-log-v1', JSON.stringify(log))
    } catch {}
    setCurrentUser(employee)  // define sessão com role correto (ex: manager vê CRM)
    setLockState(null)
  }

  const persistFrozen = (updated) => {
    setFrozenSales(updated)
    try { localStorage.setItem('fluxe-frozen-sales-v1', JSON.stringify(updated)) } catch {}
  }

  const handleFreezeSale = () => {
    if (cart.length === 0) return
    const entry = {
      id:       Date.now(),
      user:     currentUser?.name || null,
      items:    cart,
      time:     new Date().toISOString(),
      subtotal: cart.reduce((s, i) => s + i.subtotal, 0),
    }
    persistFrozen([...frozenSales, entry])
    setCart([])
  }

  const handleResumeFrozen = (id) => {
    const sale = frozenSales.find(s => s.id === id)
    if (!sale) return
    if (cart.length > 0) {
      // Se já tem itens no carrinho, congela o atual antes de retomar
      const current = {
        id:       Date.now(),
        user:     currentUser?.name || null,
        items:    cart,
        time:     new Date().toISOString(),
        subtotal: cart.reduce((s, i) => s + i.subtotal, 0),
      }
      persistFrozen([...frozenSales.filter(s => s.id !== id), current])
    } else {
      persistFrozen(frozenSales.filter(s => s.id !== id))
    }
    setCart(sale.items)
    setShowFrozen(false)
  }

  const handleDiscardFrozen = (id) => {
    persistFrozen(frozenSales.filter(s => s.id !== id))
  }

  // Filtered products — inactive products are never shown to sellers
  const filtered = products.filter(p => {
    if (p.status === 'inactive') return false
    const matchCat = selectedCategory === 'All' || p.category === selectedCategory
    const matchSearch = search === '' ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.barcode.includes(search)
    return matchCat && matchSearch
  })

  if (!accountSession) {
    return <AccountLoginScreen onLogin={(session) => setAccountSession(session)} />
  }

  if (!posSession) {
    return (
      <LoginScreen
        onLogin={(session, employee) => {
          setPosSession(session)
          if (employee) setCurrentUser(employee)
        }}
        onBack={() => setAccountSession(null)}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'radial-gradient(ellipse at top, #0d1829 0%, #020817 60%)' }}>

      {/* TOP BAR */}
      <div style={{
        height: 50,
        background: 'linear-gradient(90deg, #0a0f1e 0%, #0d1524 100%)',
        borderBottom: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 4, flexShrink: 0,
        boxShadow: '0 2px 16px rgba(0,0,0,0.4)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
          <span style={{ fontWeight: 800, fontSize: 15, color: '#93c5fd', letterSpacing: 2 }}>
            Fluxe
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)',
            color: '#60a5fa', fontSize: 11, fontWeight: 600,
          }}>{posSession?.location || DEFAULT_LOCATION}</span>
        </div>

        {/* Nav icons */}
        {[
          { icon: '⏰', label: 'Clock',       action: () => setShowClockInOut(true)  },
          { icon: '📦', label: 'Inventory',   action: () => setShowInventory(true)   },
          { icon: '📊', label: 'End of Day',  action: () => setShowEndOfDay(true)    },
          { icon: '👤', label: 'My Report',   action: () => setShowUserReport(true)  },
          { icon: '🏆', label: 'Competition', action: () => setShowCompetition(true) },
          { icon: '🧾', label: 'Receipts',    action: () => setShowReceipts(true)    },
          { icon: '👥', label: 'CRM',         action: () => setShowCRMAuth(true)     },
          { icon: '➕', label: 'Capture',     action: () => setShowCaptureAuth(true) },
          { icon: '⚙️', label: 'Admin',       action: () => setShowAdmin(true)       },
        ].map(item => (
          <button key={item.label} onClick={item.action} style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: '#64748b',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, fontSize: 10, fontWeight: 500,
            padding: '5px 9px', borderRadius: 8,
            transition: 'all 0.2s ease',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(37,99,235,0.10)'
              e.currentTarget.style.borderColor = 'rgba(37,99,235,0.25)'
              e.currentTarget.style.color = '#93c5fd'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.color = '#64748b'
            }}
          >
            <span style={{ fontSize: 15 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        {/* Lock Station */}
        <button
          onClick={handleLock}
          title="Lock Station"
          style={{
            background: 'none', border: 'none', color: '#94a3b8',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, fontSize: 10, cursor: 'pointer',
            padding: '4px 8px', borderRadius: 4, transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#fca5a5'; e.currentTarget.style.boxShadow = '0 0 12px rgba(239,68,68,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.boxShadow = 'none' }}
        >
          <svg width="18" height="20" viewBox="0 0 18 20" fill="none">
            <path d="M4 9V6a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <rect x="1" y="9" width="16" height="10" rx="3" fill="currentColor" opacity="0.85"/>
            <circle cx="9" cy="14" r="2" fill="#0a0f1e"/>
            <rect x="8" y="15" width="2" height="2.5" rx="0.5" fill="#0a0f1e"/>
          </svg>
          Lock
        </button>

        {/* Cash Drawer — SVG icon */}
        <button
          onClick={() => setShowCashDrawer(true)}
          style={{
            background: 'none', border: 'none', color: '#94a3b8',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 2, fontSize: 10, cursor: 'pointer',
            padding: '4px 8px', borderRadius: 4, transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.12)'; e.currentTarget.style.color = '#93c5fd'; e.currentTarget.style.boxShadow = '0 0 12px rgba(37,99,235,0.15)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.boxShadow = 'none' }}
        >
          {/* Cash drawer SVG — top body + sliding drawer + handle */}
          <svg width="22" height="18" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Shadow/depth */}
            <rect x="1" y="2" width="20" height="15" rx="2" fill="#0f172a" />
            {/* Main body — top unit */}
            <rect x="0" y="1" width="20" height="9" rx="2" fill="#334155" />
            {/* Top highlight */}
            <rect x="0" y="1" width="20" height="2.5" rx="2" fill="#475569" />
            {/* Bill slot */}
            <rect x="4" y="4.5" width="9" height="1.2" rx="0.6" fill="#1e293b" />
            {/* Status LED */}
            <circle cx="17" cy="5" r="1.2" fill="#22c55e" />
            <circle cx="17" cy="5" r="0.6" fill="#86efac" />
            {/* Drawer face */}
            <rect x="0" y="11" width="20" height="6" rx="1.5" fill="#475569" />
            {/* Drawer top edge highlight */}
            <rect x="0" y="11" width="20" height="1.2" rx="1" fill="#64748b" />
            {/* Drawer handle */}
            <rect x="5.5" y="13" width="9" height="2" rx="1" fill="#1e293b" />
            <rect x="6" y="13.3" width="8" height="1" rx="0.5" fill="#334155" />
          </svg>
          Cash Drawer
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          {currentUser && (
            <span style={{ color: '#22c55e', fontSize: 13 }}>
              👤 {currentUser.name}
            </span>
          )}
          <span style={{ color: '#475569', fontSize: 12 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => setPosSession(null)}
            title="Switch location / Log out"
            style={{
              background: 'none', border: '1px solid #1e293b', borderRadius: 4,
              color: '#64748b', fontSize: 10, cursor: 'pointer',
              padding: '4px 8px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2, transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
          >
            <span style={{ fontSize: 14 }}>🔓</span>
            Switch
          </button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* CATEGORY SIDEBAR */}
        <div style={{
          width: 110, background: '#0a0f1e', borderRight: '1px solid #1e293b',
          display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0
        }}>
          {['All', ...loadActiveCategoryNames()].map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '14px 8px', border: 'none', borderBottom: '1px solid rgba(30,41,59,0.5)',
                background: selectedCategory === cat ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: selectedCategory === cat ? '#93c5fd' : '#64748b',
                fontSize: 13, fontWeight: selectedCategory === cat ? 700 : 400,
                cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
                transition: 'all 0.2s ease',
                borderLeft: selectedCategory === cat ? '2px solid #2563eb' : '2px solid transparent',
                boxShadow: selectedCategory === cat ? 'inset 0 0 20px rgba(37,99,235,0.08)' : 'none',
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
            padding: '8px 12px', background: '#0a0f1e', borderBottom: '1px solid #1e293b',
            display: 'flex', alignItems: 'center', gap: 10
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product or scan barcode..."
              style={{
                flex: 1, padding: '9px 14px', background: '#0f172a',
                border: '1px solid #1e293b', borderRadius: 6, color: '#f1f5f9', fontSize: 14,
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#2563eb' }}
              onBlur={e => { e.target.style.borderColor = '#1e293b' }}
            />
            <BarcodeIconButton
              active={showBarcodeModal}
              onClick={() => setShowBarcodeModal(true)}
            />
            <span style={{ color: '#334155', fontSize: 12 }}>
              {filtered.length} items
            </span>
          </div>

          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '52px 1fr 180px 70px 60px 50px 60px',
            padding: '9px 12px', background: '#0f172a',
            borderBottom: '1px solid #1e293b', fontSize: 12, color: '#475569',
            fontWeight: 600, letterSpacing: 0.4, flexShrink: 0
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
                  padding: '11px 12px', borderBottom: '1px solid rgba(30,41,59,0.6)',
                  alignItems: 'center', cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.05)'; e.currentTarget.style.borderBottomColor = 'rgba(37,99,235,0.15)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderBottomColor = 'rgba(30,41,59,0.6)' }}
              >
                {/* Photo */}
                <div style={{
                  width: 36, height: 36, background: '#0f172a', borderRadius: 6,
                  border: '1px solid #1e293b',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18
                }}>🧴</div>

                {/* Name + desc */}
                <div>
                  <p style={{ fontSize: 15, color: '#f1f5f9', fontWeight: 600 }}>{product.name}</p>
                  {product.description && (
                    <p style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>{product.description}</p>
                  )}
                </div>

                {/* Barcode */}
                <span style={{ fontSize: 15, color: '#475569', fontFamily: "'Courier New', Courier, monospace", letterSpacing: 0.5 }}>
                  {product.barcode}
                </span>

                {/* Size */}
                <span style={{ fontSize: 13, color: '#64748b' }}>{product.size}</span>

                {/* Qty */}
                <span style={{
                  textAlign: 'right', fontSize: 15, fontWeight: 700,
                  color: product.qty <= 2 ? '#ef4444' : product.qty <= 5 ? '#f59e0b' : '#94a3b8'
                }}>
                  {product.qty}
                </span>

                {/* Stock indicator */}
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', margin: '0 auto',
                  background: product.qty <= 2 ? '#ef4444' : product.qty <= 5 ? '#f59e0b' : '#22c55e',
                  boxShadow: product.qty <= 2 ? '0 0 6px #ef4444' : product.qty <= 5 ? '0 0 6px #f59e0b' : '0 0 6px #22c55e',
                }} />

                {/* Add button */}
                <button
                  onClick={() => openEditModal(product)}
                  style={{
                    padding: '7px 14px', background: '#2563eb', border: 'none',
                    borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', margin: '0 auto', display: 'block',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#2563eb' }}
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
          taxRate={taxRate}
          onRemove={handleRemoveFromCart}
          onCompleteSale={handleCompleteSale}
          currentUser={saleEmployee || currentUser}
          onFreezeSale={handleFreezeSale}
          onEditItem={handleEditCartItem}
        />
      </div>

      {/* BOTTOM STATUS BAR */}
      <div style={{
        height: 32, background: '#0a0f1e', borderTop: '1px solid #1e293b',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
        fontSize: 11, color: '#334155', flexShrink: 0
      }}>
        <span>{SYSTEM_NAME} v1.0</span>
        <span>•</span>
        <span>{posSession?.location || DEFAULT_LOCATION}</span>
        <span>•</span>
        <span style={{ color: serverOnline ? '#22c55e' : '#475569' }}>
          {serverOnline ? '● CRM online' : '○ CRM offline'}
        </span>
        {syncStatus === 'syncing' && <span style={{ color: '#f39c12' }}>⟳ syncing...</span>}
        {frozenSales.length > 0 && (
          <>
            <span>•</span>
            <span
              onClick={() => setShowFrozen(true)}
              style={{ color: '#f59e0b', cursor: 'pointer', userSelect: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#fbbf24' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#f59e0b' }}
            >
              ❄️ {frozenSales.length} frozen sale{frozenSales.length !== 1 ? 's' : ''} — click to resume
            </span>
          </>
        )}
        <span style={{ marginLeft: 'auto' }}>
          {new Date().toLocaleTimeString()}
        </span>
      </div>

      {/* MODALS */}
      {showSellerSelect && (
        <SellerSelectModal
          total={(() => { const sub = cart.reduce((s, i) => s + i.subtotal, 0); return sub + sub * taxRate })()}
          onConfirm={handleSellerConfirm}
          onCancel={() => setShowSellerSelect(false)}
        />
      )}

      {showLogin && (
        <LoginModal
          onLogin={handleLogin}
          onCancel={() => { setShowLogin(false); setPendingProduct(null) }}
        />
      )}

      {showBarcodeModal && (
        <BarcodeModal
          onConfirm={(code) => {
            setShowBarcodeModal(false)
            handleBarcodeScanned(code)
          }}
          onClose={() => setShowBarcodeModal(false)}
        />
      )}

      {showEdit && pendingProduct && (
        <EditItemModal
          product={pendingProduct}
          onAdd={handleAddToCart}
          onExchange={handleExchange}
          onCancel={() => { setShowEdit(false); setPendingProduct(null) }}
        />
      )}

      {showPayment && (
        <PaymentModal
          items={cart}
          taxRate={taxRate}
          currentUser={saleEmployee}
          customers={customers}
          locationPrefs={loadLocationConfig(posSession?.location) || {}}
          onConfirm={handleConfirmPayment}
          onCancel={() => setShowPayment(false)}
        />
      )}

      {showFrozen && (
        <FrozenSalesModal
          frozenSales={frozenSales}
          onResume={handleResumeFrozen}
          onDiscard={handleDiscardFrozen}
          onClose={() => setShowFrozen(false)}
        />
      )}

      {showEndOfDay    && <EndOfDayReport onClose={() => setShowEndOfDay(false)}   sales={sales} posSession={posSession} />}
      {showUserReport  && <UserReport    onClose={() => setShowUserReport(false)}  sales={sales} updateSale={updateSale} />}
      {showCompetition && <Competition   onClose={() => setShowCompetition(false)} sales={sales} posSession={posSession} />}
      {showClockInOut  && <ClockInOut    onClose={() => setShowClockInOut(false)}   />}
      {showInventory   && <Inventory     onClose={() => setShowInventory(false)}    />}
      {showAdmin       && <AdminPanel    onClose={() => setShowAdmin(false)}  sales={sales} updateSale={updateSale} customers={customers} onAddCustomer={addCustomer} onPatchCustomer={patchCustomer} onArchiveCustomer={archiveCustomer} />}
      {showReceipts    && <Receipts      onClose={() => setShowReceipts(false)}    posSession={posSession} />}
      {showCashDrawer  && <CashDrawer   onClose={() => setShowCashDrawer(false)} />}
      {showCRM && (
        <CRMPanel
          customers={customers}
          serverOnline={serverOnline}
          onSendSMS={sendManualSMS}
          onGetSMSLog={getSMSLog}
          onGetScheduled={getScheduled}
          onUpdateCustomer={updateCustomer}
          onArchiveCustomer={archiveCustomer}
          onRestoreCustomer={restoreCustomer}
          onDeleteCustomer={deleteCustomer}
          onClose={() => setShowCRM(false)}
        />
      )}

      {pendingInvoice && (
        <CustomerCaptureModal
          invoice={pendingInvoice}
          onSave={handleCustomerSave}
          onSkip={handleCustomerSkip}
        />
      )}

      {showCRMAuth && (
        <LoginModal
          title="CRM Access"
          subtitle="Manager PIN required"
          requiredRole="manager"
          onLogin={(employee) => {
            setCurrentUser(employee)
            setShowCRMAuth(false)
            setShowCRM(true)
          }}
          onCancel={() => setShowCRMAuth(false)}
        />
      )}

      {showCaptureAuth && (
        <LoginModal
          onLogin={handleCaptureAuthSuccess}
          onCancel={() => setShowCaptureAuth(false)}
        />
      )}

      {showCaptureClient && (
        <CustomerCaptureModal
          onSave={handleCaptureClientSave}
          onSkip={() => { setShowCaptureClient(false); setCaptureEmployee(null) }}
        />
      )}

      {/* OUT-OF-STOCK BLOCK TOAST */}
      {cartError && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          background: '#0f172a', border: '1px solid #ef4444', borderRadius: 10,
          padding: '14px 22px', color: '#f1f5f9', fontSize: 13, fontWeight: 600,
          zIndex: 2100, display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <span style={{ fontSize: 18 }}>🚫</span>
          <span>{cartError}</span>
        </div>
      )}

      {/* SALE COMPLETE TOAST */}
      {saleComplete && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          background: '#0f172a', border: '1px solid #22c55e', borderRadius: 10,
          padding: '16px 24px', color: '#f1f5f9', fontSize: 14, fontWeight: 600,
          zIndex: 2000, display: 'flex', alignItems: 'center', gap: 14,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }}>
          <span style={{ fontSize: 22 }}>✅</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Sale #{saleComplete.number} — ${saleComplete.total.toFixed(2)}
            </div>
            <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
              {saleComplete.employee} · {saleComplete.paymentMethod}
            </div>
          </div>
          <button
            onClick={() => printReceipt(saleComplete)}
            style={{
              marginLeft: 4, background: '#2563eb', border: 'none',
              borderRadius: 6, color: '#fff', padding: '8px 16px',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >
            🖨 Print
          </button>
          <button
            onClick={() => setSaleComplete(null)}
            style={{
              background: 'transparent', border: '1px solid #1e293b',
              borderRadius: 6, color: '#64748b', padding: '8px 14px',
              cursor: 'pointer', fontSize: 13,
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* LOCK SCREEN — renderizado sobre tudo, sem destruir o estado */}
      {lockState && (
        <LockScreen
          lockedAt={lockState.lockedAt}
          lockedBy={lockState.lockedBy}
          onUnlock={handleUnlock}
        />
      )}
    </div>
  )
}
