import { useState, useEffect, useRef } from 'react'
import { useTheme } from './theme/ThemeContext'
import { isDemoMode, seedDemoData, clearDemoData, DEMO_POS_SESSION } from './demo/demoSeed'
import { loadActiveCategoryNames, loadCategoriesAsync, saveCategories, ensureCategoriesSeeded, buildCategoryMap } from './utils/categoriesStorage'
import { getTaxRate, getTaxRateById, loadLocationConfig, loadLocationConfigById, resolveSpareRateForDay, resolveSpareRateForDayById, mergeLocationConfigsFromCloud } from './utils/locationConfig'
import { localId } from './domain/utils/ids'
import { loadFrozenSales, saveFrozenSales } from './utils/frozenSalesStorage'
import { appendLockEntry, resolveLastLockEntry } from './utils/lockLogStorage'
import { calcInvoiceCommission, getDayTier } from './utils/commissionEngine'
import { loadCommissionTiers, loadSpareRate } from './utils/commissionTiersStorage'
import { localDateKey } from './utils/dateUtils'
import { printReceipt } from './utils/printReceipt'
import { awaitOrgSession } from './services/supabaseAuth'
import { getNextInvoiceNumber, fetchLocationConfigs } from './services/supabaseRead'
import { fetchBonusRules } from './services/supabaseBonusRules'
import { fetchOrgSettings } from './services/supabaseOrgSettings'
import { loadUsersAsync, loadActiveEmployees } from './utils/usersStorage'
import { useCRM } from './hooks/useCRM'
import { useSales, nextInvoiceNumber } from './hooks/useSales'
import { useCart } from './hooks/useCart'
import { useProducts } from './hooks/useProducts'
import { COLORS, DEFAULT_LOCATION, SYSTEM_NAME, LOCATIONS_CFG } from './config/branding'
import ServiceApp from './components/service/ServiceApp'
import AccountLoginScreen    from './components/AccountLoginScreen'
import SetupScreen           from './components/SetupScreen'
import OrgOnboardingScreen   from './components/OrgOnboardingScreen'
import { isClientConfigured } from './services/clientConfig'
import LoginScreen from './components/LoginScreen'
import LoginModal from './components/LoginModal'
import EditItemModal from './components/EditItemModal'
import Cart from './components/Cart'
import PaymentModal from './components/PaymentModal'
import CustomerCaptureModal from './components/CustomerCaptureModal'
import SmsReceiptModal from './components/SmsReceiptModal'
import CRMPanel from './components/CRMPanel'
import EndOfDayReport from './components/EndOfDayReport'
import UserReport from './components/UserReport'
import Competition from './components/Competition'
import ClockInOut from './components/ClockInOut'
import Inventory from './components/Inventory'
import AdminPanel from './components/AdminPanel'
import CashDrawer, { triggerDrawerHardware } from './components/CashDrawer'
import Receipts from './components/Receipts'
import SellerSelectModal from './components/SellerSelectModal'
import FrozenSalesModal from './components/FrozenSalesModal'
import LockScreen from './components/LockScreen'
import BarcodeModal, { BarcodeIconButton } from './components/BarcodeModal'
import FluxeAssist from './components/FluxeAssist'
import Dashboard from './components/Dashboard'


// ── Demo mode URL activation ──────────────────────────────────────────────────
// ?demo=true  → seeds fake data + reloads (demo banner shown after reload)
// ?demo=clear → restores production data + reloads
;(() => {
  const params = new URLSearchParams(window.location.search)
  const demoParam = params.get('demo')
  if (demoParam === 'true') {
    seedDemoData()
    window.history.replaceState({}, '', window.location.pathname)
    window.location.reload()
  } else if (demoParam === 'clear') {
    clearDemoData()
    window.history.replaceState({}, '', window.location.pathname)
    window.location.reload()
  }
})()

// Seed categories on first run (no-op if already seeded)
ensureCategoriesSeeded()

// Phase 9: kick off machine account sign-in as early as possible.
// Module-level call starts before React renders — by the time useEffect()s
// fire, the token may already be ready. Fire-and-forget; app runs from
// localStorage if the sign-in hasn't completed yet.
awaitOrgSession().then(() => { fetchOrgSettings(); fetchBonusRules() })

export default function App() {
  const { mode, tokens, toggle } = useTheme()
  const [currentUser, setCurrentUser]   = useState(() =>
    isDemoMode() ? { id: 101, name: 'Alex Morgan', role: 'manager', photo: null } : null
  )
  const [saleEmployee, setSaleEmployee] = useState(null)  // seller confirmed for current sale
  const { products, setProducts, decrementStock } = useProducts()
  const [selectedCategory, setCategory]   = useState('All')
  const [categoryNames,    setCategoryNames] = useState(() => loadActiveCategoryNames())
  const [search, setSearch]             = useState('')
  const [showBarcodeModal, setShowBarcodeModal] = useState(false)
  const [viewMode,  setViewMode]  = useState(() => localStorage.getItem('fluxe-view-mode')  || 'list')
  const [sortOrder, setSortOrder] = useState(() => localStorage.getItem('fluxe-sort-order') || 'default')

  const setView = (v) => { setViewMode(v);  localStorage.setItem('fluxe-view-mode',  v) }
  const setSort = (v) => { setSortOrder(v); localStorage.setItem('fluxe-sort-order', v) }

  const [showLogin, setShowLogin]       = useState(false)
  const [showPayment, setShowPayment]   = useState(false)
  const [frozenSales, setFrozenSales]   = useState(loadFrozenSales)
  const [showFrozen, setShowFrozen] = useState(false)
  const [saleComplete, setSaleComplete] = useState(null)
  const [smsReceipt,   setSmsReceipt]   = useState(null)   // { invoice, phone } | null
  const [showDashboard, setShowDashboard]   = useState(false)
  const [showEndOfDay, setShowEndOfDay]     = useState(false)
  const [showUserReport, setShowUserReport] = useState(false)
  const [showCompetition, setShowCompetition] = useState(false)
  const [showClockInOut, setShowClockInOut] = useState(false)
  const [showInventory, setShowInventory]   = useState(false)
  const KIOSK_KEY = 'fluxe-kiosk-session-v1'
  const [accountSession, setAccountSession] = useState(() => {
    try {
      const saved = localStorage.getItem('fluxe-kiosk-session-v1')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })
  const [posSession, setPosSession]         = useState(() => {
    // In demo mode, bypass LoginScreen automatically
    if (isDemoMode()) {
      try {
        const saved = localStorage.getItem('fluxe-demo-pos-session')
        return saved ? JSON.parse(saved) : DEMO_POS_SESSION
      } catch { return DEMO_POS_SESSION }
    }
    return null
  })
  const [showAdmin, setShowAdmin]           = useState(false)
  const [showAdminAuth, setShowAdminAuth]   = useState(false)
  const [showCRM, setShowCRM]               = useState(false)
  const [showReceipts, setShowReceipts]     = useState(false)
  const [showCashDrawer, setShowCashDrawer] = useState(false)
  const [showSellerSelect, setShowSellerSelect] = useState(false)
  const [loginReason, setLoginReason]       = useState(null) // 'sale' | null
  const [pendingInvoice, setPendingInvoice] = useState(null) // invoice waiting for CRM capture
  const [lockState, setLockState]           = useState(null) // null = unlocked | { lockedAt, lockedBy }
  const [showCaptureClient, setShowCaptureClient] = useState(false)
  const [showCaptureAuth,   setShowCaptureAuth]   = useState(false)
  const [captureEmployee,   setCaptureEmployee]   = useState(null) // vendedor autenticado no fluxo de captura
  const [showCRMAuth,       setShowCRMAuth]       = useState(false)
  const [showAssist,        setShowAssist]         = useState(false)
  const [showAssistAuth,    setShowAssistAuth]     = useState(false)
  const [assistEmployee,    setAssistEmployee]     = useState(null)
  const [setupMode,         setSetupMode]          = useState(false)
  const [orgReady,          setOrgReady]           = useState(null) // null=checking, true=configured, false=needs setup

  const { customers, serverOnline, syncStatus, upsertCustomer, updateCustomer, archiveCustomer, restoreCustomer, deleteCustomer, addCustomer, patchCustomer, sendManualSMS, getSMSHistory, updateSmsConsent, getSMSLog, getScheduled } = useCRM(posSession, currentUser)
  const { sales, saveSale, updateSale, voidSale, refundSale } = useSales()
  const {
    cart,
    cartError,
    cartSubtotal,
    cartTotalSpare,
    showEdit,
    pendingProduct,
    editingCartIdx,
    openEditModal,
    closeEditModal,
    handleEditCartItem,
    handleBarcodeScanned,
    handleAddToCart,
    handleExchange,
    handleRemoveFromCart,
    clearCart,
    loadCartItems,
  } = useCart({ products, location: posSession?.location || DEFAULT_LOCATION })

  // After account login: verify org_settings exist in Supabase.
  // If not, show OrgOnboardingScreen so the client can configure their business.
  useEffect(() => {
    if (!accountSession) { setOrgReady(null); return }
    // Wait for machine account JWT before fetching — RLS requires authenticated token
    awaitOrgSession()
      .then(() => fetchOrgSettings())
      .then(settings => setOrgReady(settings !== null && (settings.locations?.length ?? 0) > 0))
      .catch(() => setOrgReady(true)) // On error, don't block the flow
  }, [accountSession]) // eslint-disable-line react-hooks/exhaustive-deps

  // Boot-time user sync: fetch from Supabase, merge with local PINs, save to localStorage.
  // Runs once on mount — all subsequent loadActiveEmployees() calls get fresh data.
  useEffect(() => { loadUsersAsync().catch(() => {}) }, [])

  // Boot-time location config sync: pull latest settings from Supabase and merge into
  // localStorage so all loadLocationConfig() callers get cross-device fresh data.
  useEffect(() => {
    fetchLocationConfigs()
      .then(rows => { if (rows) mergeLocationConfigsFromCloud(rows) })
      .catch(() => {})
  }, [])

  // Boot-time category sync: fetch from Supabase, merge into localStorage, update sidebar.
  // Ensures categories created on any device (kiosk/home) appear everywhere.
  useEffect(() => {
    loadCategoriesAsync()
      .then(cats => {
        if (!cats?.length) return
        setCategoryNames(
          cats
            .filter(c => c.status !== 'inactive')
            .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
            .map(c => c.name)
        )
      })
      .catch(() => {})
  }, [])

  // Tax rate — ID-first (stable), falls back to name lookup for legacy sessions without locationId
  const taxRate = posSession?.locationId
    ? getTaxRateById(posSession.locationId)
    : getTaxRate(posSession?.location)

  // Controle de acesso: somente 'manager' acessa o CRM global
  const isAdmin = currentUser?.role === 'manager' || currentUser?.role === 'admin'

  const barcodeRef = useRef('')
  const barcodeTimer = useRef(null)
  // Guard: prevents finalizeSale from running twice (double-click or React deferred commit)
  const finalizingRef = useRef(false)

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


  const handleLogin = (employee) => {
    setCurrentUser(employee)
    setShowLogin(false)
    if (loginReason === 'sale') {
      setLoginReason(null)
      setShowPayment(true)
    }
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
    // Split payments array (new)
    payments,
    // Cash (legacy / single)
    amountReceived, changeDue,
    // Card (legacy / single)
    cardBrand, cardLast4, authorizationNumber,
    // External (legacy / single)
    externalRef,
    // Check (legacy / single)
    checkNumber,
    // Shared
    notes, linkedCustomerId, receiptAction = 'none',
  }) => {
    const isSingle = !payments || payments.length <= 1

    // ── Commission snapshot ────────────────────────────────────────────────────
    // Captures the exact config and preliminary calculation at time of sale.
    // Commission is retroactive within the day — if more sales happen today the
    // tier may rise. The snapshot records both the rules (for accurate historical
    // recalculation) and the value at this moment (for audit / display).
    const commissionSnapshot = (() => {
      try {
        const now      = new Date()
        const location = posSession?.location || DEFAULT_LOCATION
        const empName  = saleEmployee.name

        // ── 1. Config in effect right now ──────────────────────────────────────
        const tiers       = loadCommissionTiers()
        const spareRate   = loadSpareRate()
        const categoryMap = buildCategoryMap()

        // Extract only categories that have commission configured
        // categoryId included so snapshots remain resolvable even after category renames
        const categoryRules = {}
        for (const [name, cat] of Object.entries(categoryMap)) {
          if (cat.commissionType && cat.commissionType !== 'none') {
            categoryRules[name] = {
              categoryId:            cat.id   ?? null,
              commissionType:        cat.commissionType,
              commissionRate:        cat.commissionRate ?? null,
              spareCommissionEnabled: cat.spareCommissionEnabled ?? false,
            }
          }
        }

        // ── 2. Day subtotal at this moment (prior sales + this invoice) ────────
        const todayStr = localDateKey(now)
        const isTodayValid = s => {
          // Exclude voided/deleted sales from commission calculation.
          // Handle both Supabase enum values ('voided') and legacy localStorage values ('deleted').
          if (s.status === 'voided' || s.status === 'deleted') return false
          if (s.employee !== empName) return false
          return localDateKey(s.timestamp) === todayStr
        }
        const priorSubtotal = sales.filter(isTodayValid).reduce((sum, s) => sum + (s.subtotal || 0), 0)
        const daySubtotalAtSale = priorSubtotal + subtotal

        // ── 3. Spare rate: may be tiered per location ──────────────────────────
        const priorSpare  = sales.filter(isTodayValid).reduce((sum, s) => sum + (s.totalSpare || 0), 0)
        const thisSpare   = cartTotalSpare
        const daySpareTotal = priorSpare + thisSpare
        const resolvedSpareRate = posSession?.locationId
          ? resolveSpareRateForDayById(posSession.locationId, daySpareTotal)
          : resolveSpareRateForDay(location, daySpareTotal)

        // ── 4. Tier and per-invoice commission at this moment ──────────────────
        const tierAtSale = getDayTier(daySubtotalAtSale)
        const { total: commissionAtSale, breakdown: itemBreakdown } = calcInvoiceCommission(
          { items: cart, status: 'normal' },
          categoryMap,
          tierAtSale.rate,
          resolvedSpareRate,
        )

        return {
          configAt:         now.toISOString(),       // when config was snapshotted
          employeeId:       saleEmployee.id ?? null, // stable ID — backend FK
          employeeSnapshot: saleEmployee.name,       // name at time of sale (display / audit)
          tiers,                                     // full tier table as it existed
          spareRate,                                 // global spare commission %
          categoryRules,                             // per-category rules in effect (each entry has categoryId)
          daySubtotalAtSale,                         // employee's subtotal today incl. this invoice
          tierAtSale,                                // { rate, label } at this moment
          resolvedSpareRate,                         // spare rate applied (may differ from global)
          commissionAtSale,                          // commission for THIS invoice at this tier
          spareTotal: thisSpare,                     // spare generated in this invoice
          itemBreakdown,                             // per-item commission breakdown
        }
      } catch {
        return null   // never block a sale due to snapshot failure
      }
    })()

    const invoice = {
      number:        nextInvoiceNumber(),
      timestamp:     new Date(),
      location:      posSession?.location   || DEFAULT_LOCATION,  // name snapshot (display + backward compat)
      locationId:    posSession?.locationId || null,               // stable ID for backend relations
      employee:      saleEmployee.name,                            // name snapshot (display + reports)
      employeeId:    saleEmployee.id ?? null,                      // stable ID for backend relations
      items:         cart,
      subtotal,
      tax,
      total,
      tip,
      status:        'completed',
      paymentMethod: method,
      payments:      payments || [],
      totalSpare:        cartTotalSpare,
      commissionSnapshot,
      notes:             notes || '',
      linkedCustomerId: linkedCustomerId || null,
      receiptAction,
      // Legacy flat fields — only written for single-method sales (backward compat)
      ...(isSingle && method === 'cash'     && { amountReceived, changeDue }),
      ...(isSingle && method === 'card'     && { cardBrand, cardLast4, authorizationNumber }),
      ...(isSingle && method === 'external' && { externalRef }),
      ...(isSingle && method === 'check'    && { checkNumber }),
    }
    finalizingRef.current = false  // reset guard for this new sale
    setShowPayment(false)
    setPendingInvoice(invoice)
  }

  const finalizeSale = async (invoice) => {
    // Guard: if already running (double-click / React deferred commit), do nothing
    if (finalizingRef.current) return
    finalizingRef.current = true

    // Resolve cross-kiosk invoice number from the shared Postgres sequence.
    // Falls back to the locally-generated temp number when offline.
    const realNumber   = await getNextInvoiceNumber(invoice.number)
    const finalInvoice = realNumber !== invoice.number
      ? { ...invoice, number: realNumber }
      : invoice

    // Persist sale to localStorage + Supabase; get saleId for inventory chain (Phase 4)
    const { saleId } = await saveSale(finalInvoice)

    // Decrement stock locally + write inventory_stock/movements to Supabase via saleId
    decrementStock(finalInvoice.items, posSession?.locationId || null, {
      invoiceNumber: finalInvoice.number,
      locationName:  finalInvoice.location,
      employee:      finalInvoice.employee,
    }, saleId)

    // Auto-open cash drawer if enabled for this location (fire-and-forget — never cancels sale)
    const locCfg = posSession?.locationId
      ? loadLocationConfigById(posSession.locationId)
      : loadLocationConfig(posSession?.location)
    if (locCfg?.autoOpenCashDrawerAfterSale) {
      triggerDrawerHardware(finalInvoice.location).then(result => {
        if (result === 'error') console.warn('[AutoDrawer] Failed to open cash drawer after sale', finalInvoice.number)
      }).catch(err => {
        console.warn('[AutoDrawer] Exception opening cash drawer after sale:', err)
      })
    }

    setSaleComplete(finalInvoice)
    clearCart()
    setSaleEmployee(null)   // clear sale-specific seller; session user (currentUser) is preserved
    setPendingInvoice(null)

    // Auto-print based on receiptAction selected in PaymentModal
    if (finalInvoice.receiptAction === 'print' || finalInvoice.receiptAction === 'both') {
      setTimeout(() => printReceipt(finalInvoice), 80)
    }
  }

  const handleCustomerSave = (formData) => {
    const invoice = pendingInvoice
    if (!invoice) return                 // already handled (stale click)
    setPendingInvoice(null)              // close modal immediately — visual feedback
    // Stash phone so the SMS Receipt modal can pre-fill it
    if (formData.phone) setSmsReceipt(prev => prev ? prev : { invoice: null, phone: formData.phone })
    upsertCustomer(formData, invoice)
    finalizeSale(invoice)
  }

  const handleCustomerSkip = () => {
    const invoice = pendingInvoice
    if (!invoice) return                 // already handled (stale click)
    setPendingInvoice(null)              // close modal immediately — visual feedback
    finalizeSale(invoice)
  }

  // Autenticação do captador — independente do currentUser (suporta 2 vendedores simultâneos)
  const handleCaptureAuthSuccess = (employee) => {
    setCaptureEmployee(employee)
    setShowCaptureAuth(false)
    setShowCaptureClient(true)
  }

  // Captura standalone — capturedBy = vendedor selecionado no formulário (pré-preenchido via PIN)
  const handleCaptureClientSave = (formData) => {
    const sellerName = formData.capturedByName || captureEmployee?.name || null
    const sellerId   = formData.capturedById   || captureEmployee?.id   || null
    if (!sellerName) return  // guard: nunca salvar sem vendedor identificado
    upsertCustomer({ ...formData, capturedLocation: posSession?.location || '' }, null, sellerName, sellerId)
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
    appendLockEntry({ id: localId('lock'), ...entry, unlockedAt: null, unlockedBy: null })
  }

  const handleUnlock = ({ employee, unlockedAt }) => {
    resolveLastLockEntry(unlockedAt, employee.name)
    setCurrentUser(employee)  // define sessão com role correto (ex: manager vê CRM)
    setLockState(null)
  }

  const persistFrozen = (updated) => {
    setFrozenSales(updated)
    saveFrozenSales(updated)
  }

  const handleFreezeSale = () => {
    if (cart.length === 0) return
    const entry = {
      id:       localId('frz'),
      user:     currentUser?.name || null,
      items:    cart,
      time:     new Date().toISOString(),
      subtotal: cartSubtotal,
    }
    persistFrozen([...frozenSales, entry])
    clearCart()
  }

  const handleResumeFrozen = (id) => {
    const sale = frozenSales.find(s => s.id === id)
    if (!sale) return
    if (cart.length > 0) {
      // Se já tem itens no carrinho, congela o atual antes de retomar
      const current = {
        id:       localId('frz'),
        user:     currentUser?.name || null,
        items:    cart,
        time:     new Date().toISOString(),
        subtotal: cartSubtotal,
      }
      persistFrozen([...frozenSales.filter(s => s.id !== id), current])
    } else {
      persistFrozen(frozenSales.filter(s => s.id !== id))
    }
    loadCartItems(sale.items)
    setShowFrozen(false)
  }

  const handleDiscardFrozen = (id) => {
    persistFrozen(frozenSales.filter(s => s.id !== id))
  }

  // Filtered products — inactive products are never shown to sellers
  const filtered = (() => {
    const seen = new Set()
    return products.filter(p => {
      if (p.status === 'inactive') return false
      const matchCat = selectedCategory === 'All' || p.category === selectedCategory
      const matchSearch = search === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.barcode.includes(search)
      if (!matchCat || !matchSearch) return false
      // Dedup by barcode — prevents duplicates from showing in POS grid
      const key = p.barcode?.trim()
      if (key && seen.has(key)) return false
      if (key) seen.add(key)
      return true
    })
  })()

  const sorted = sortOrder === 'az' ? [...filtered].sort((a, b) => a.name.localeCompare(b.name))
               : sortOrder === 'za' ? [...filtered].sort((a, b) => b.name.localeCompare(a.name))
               : filtered

  if (!isClientConfigured() || setupMode) {
    return <SetupScreen onClose={setupMode ? () => setSetupMode(false) : null} />
  }

  if (!accountSession) {
    return <AccountLoginScreen
      onLogin={(session) => {
        try { localStorage.setItem(KIOSK_KEY, JSON.stringify(session)) } catch {}
        setAccountSession(session)
      }}
      onSetup={() => setSetupMode(true)}
    />
  }

  if (orgReady === false) {
    return <OrgOnboardingScreen onComplete={() => setOrgReady(true)} />
  }

  if (!posSession) {
    return (
      <LoginScreen
        onLogin={(session, employee) => {
          setPosSession(session)
          if (employee) setCurrentUser(employee)
        }}
        onBack={() => {
          try { localStorage.removeItem(KIOSK_KEY) } catch {}
          setAccountSession(null)
        }}
      />
    )
  }

  // ── Business type routing — retail keeps existing flow, service gets ServiceApp ──
  const activeLocCfg   = LOCATIONS_CFG.find(l => l.id === posSession?.locationId)
  const businessType   = activeLocCfg?.business_type || 'retail'

  if (businessType === 'service') {
    return (
      <ServiceApp
        posSession={posSession}
        currentUser={currentUser}
        onLogout={() => setPosSession(null)}
      />
    )
  }

  return (
    <div style={{ ...tokens, display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--c-bg-grad)' }}>

      {/* TOP BAR */}
      <div style={{
        height: 50,
        background: 'var(--c-bg-panel)',
        borderBottom: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 4, flexShrink: 0,
        boxShadow: 'var(--c-shadow-bar)',
        position: 'relative', zIndex: 10,
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 12 }}>
          <span className="fluxe-logo">
            <span className="fluxe-f">F</span>luxe
          </span>
          <span style={{
            padding: '2px 8px', borderRadius: 6,
            background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.2)',
            color: '#60a5fa', fontSize: 11, fontWeight: 600,
          }}>{posSession?.location || DEFAULT_LOCATION}</span>
        </div>

        {/* Demo mode badge + exit button */}
        {isDemoMode() && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              padding: '2px 10px', borderRadius: 6,
              background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)',
              color: '#fbbf24', fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            }}>DEMO</span>
            <button
              onClick={() => { clearDemoData(); location.reload() }}
              style={{
                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700,
                background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
                color: '#f87171', cursor: 'pointer',
              }}
            >Exit Demo</button>
          </div>
        )}

        {/* Nav icons — main modules */}
        {[
          ...(isAdmin ? [{ icon: '📊', label: 'Dashboard', action: () => setShowDashboard(true) }] : []),
          { icon: '⏰', label: 'Clock',       action: () => setShowClockInOut(true)  },
          { icon: '📦', label: 'Inventory',   action: () => setShowInventory(true)   },
          { icon: '🗓️', label: 'End of Day',  action: () => setShowEndOfDay(true)    },
          { icon: '👤', label: 'My Report',   action: () => setShowUserReport(true)  },
          { icon: '🏆', label: 'Competition', action: () => setShowCompetition(true) },
          { icon: '🧾', label: 'Receipts',    action: () => setShowReceipts(true)    },
          { icon: '👥', label: 'CRM',         action: () => setShowCRMAuth(true)     },
          { icon: '➕', label: 'Capture',     action: () => setShowCaptureAuth(true) },
        ].map(item => (
          <button key={item.label} onClick={item.action} style={{
            background: 'transparent',
            border: '1px solid transparent',
            color: 'var(--c-text-sub)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, fontSize: 11, fontWeight: 600,
            padding: '6px 10px', borderRadius: 8,
            transition: 'all 0.2s ease', cursor: 'pointer',
          }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(37,99,235,0.12)'
              e.currentTarget.style.borderColor = 'rgba(37,99,235,0.28)'
              e.currentTarget.style.color = '#93c5fd'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.color = 'var(--c-text-sub)'
            }}
          >
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            {item.label}
          </button>
        ))}

        {/* Lock Station */}
        <button
          onClick={handleLock}
          title="Lock Station"
          style={{
            background: 'transparent', border: '1px solid transparent', color: 'var(--c-text-sub)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8, transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
        >
          <svg width="20" height="22" viewBox="0 0 18 20" fill="none">
            <path d="M4 9V6a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none"/>
            <rect x="1" y="9" width="16" height="10" rx="3" fill="currentColor" opacity="0.85"/>
            <circle cx="9" cy="14" r="2" fill="#0d1526"/>
            <rect x="8" y="15" width="2" height="2.5" rx="0.5" fill="#0d1526"/>
          </svg>
          Lock
        </button>

        {/* Cash Drawer — SVG icon */}
        <button
          onClick={() => setShowCashDrawer(true)}
          style={{
            background: 'transparent', border: '1px solid transparent', color: 'var(--c-text-sub)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8, transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.12)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.28)'; e.currentTarget.style.color = '#93c5fd' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
        >
          {/* Cash drawer SVG — top body + sliding drawer + handle */}
          <svg width="22" height="20" viewBox="0 0 22 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Shadow/depth */}
            <rect x="1" y="2" width="20" height="15" rx="2" fill="#111d30" />
            {/* Main body — top unit */}
            <rect x="0" y="1" width="20" height="9" rx="2" fill="#415569" />
            {/* Top highlight */}
            <rect x="0" y="1" width="20" height="2.5" rx="2" fill="#94a3b8" />
            {/* Bill slot */}
            <rect x="4" y="4.5" width="9" height="1.2" rx="0.6" fill="#253349" />
            {/* Status LED */}
            <circle cx="17" cy="5" r="1.2" fill="#22c55e" />
            <circle cx="17" cy="5" r="0.6" fill="#86efac" />
            {/* Drawer face */}
            <rect x="0" y="11" width="20" height="6" rx="1.5" fill="#94a3b8" />
            {/* Drawer top edge highlight */}
            <rect x="0" y="11" width="20" height="1.2" rx="1" fill="#94a3b8" />
            {/* Drawer handle */}
            <rect x="5.5" y="13" width="9" height="2" rx="1" fill="#253349" />
            <rect x="6" y="13.3" width="8" height="1" rx="0.5" fill="#415569" />
          </svg>
          Cash Drawer
        </button>

        {/* Fluxe Assist button */}
        <button
          onClick={() => {
            if (showAssist) { setShowAssist(false); setAssistEmployee(null) }
            else setShowAssistAuth(true)
          }}
          title="Fluxe Assist — quick commands"
          style={{
            background: showAssist ? 'rgba(37,99,235,0.15)' : 'transparent',
            border: showAssist ? '1px solid rgba(37,99,235,0.35)' : '1px solid transparent',
            color: showAssist ? '#93c5fd' : 'var(--c-text-sub)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            padding: '6px 10px', borderRadius: 8, transition: 'all 0.2s ease',
            boxShadow: showAssist ? '0 0 12px rgba(37,99,235,0.2)' : 'none',
          }}
          onMouseEnter={e => {
            if (!showAssist) {
              e.currentTarget.style.background = 'rgba(37,99,235,0.10)'
              e.currentTarget.style.borderColor = 'rgba(37,99,235,0.25)'
              e.currentTarget.style.color = '#93c5fd'
            }
          }}
          onMouseLeave={e => {
            if (!showAssist) {
              e.currentTarget.style.background = 'none'
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.color = 'var(--c-text-muted)'
            }
          }}
        >
          <span style={{ fontSize: 20 }}>✨</span>
          Assist
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Theme toggle */}
          <button
            onClick={toggle}
            title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            style={{
              background: 'transparent', border: '1px solid transparent',
              color: 'var(--c-text-muted)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
              padding: '6px 10px', borderRadius: 8, transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.1)'; e.currentTarget.style.borderColor = 'rgba(245,158,11,0.28)'; e.currentTarget.style.color = '#fcd34d' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--c-text-muted)' }}
          >
            <span style={{ fontSize: 20 }}>{mode === 'dark' ? '☀️' : '🌙'}</span>
            {mode === 'dark' ? 'Light' : 'Dark'}
          </button>
          {/* Admin — isolated right side */}
          <button onClick={() => setShowAdminAuth(true)} style={{
            background: 'transparent', border: '1px solid transparent', color: 'var(--c-text-sub)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, fontSize: 11, fontWeight: 600,
            padding: '6px 10px', borderRadius: 8,
            transition: 'all 0.2s ease', cursor: 'pointer',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.3)'; e.currentTarget.style.color = '#c4b5fd' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
          >
            <span style={{ fontSize: 20 }}>⚙️</span>
            Admin
          </button>
          <div style={{ width: 1, height: 28, background: 'var(--c-border)', marginLeft: 2, marginRight: 4, flexShrink: 0 }} />
          {currentUser && (
            <span style={{ color: '#22c55e', fontSize: 13 }}>
              👤 {currentUser.name}
            </span>
          )}
          <span style={{ color: 'var(--c-text-muted)', fontSize: 12 }}>
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => setPosSession(null)}
            title="Switch location / Log out"
            style={{
              background: 'none', border: '1px solid var(--c-border)', borderRadius: 4,
              color: 'var(--c-text-muted)', fontSize: 10, cursor: 'pointer',
              padding: '4px 8px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 2, transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-muted)' }}
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
          width: 110, background: 'var(--c-bg-panel)', borderRight: '1px solid var(--c-border)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto', flexShrink: 0
        }}>
          {['All', ...categoryNames].map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              style={{
                padding: '14px 8px', border: 'none', borderBottom: '1px solid var(--c-border)',
                background: selectedCategory === cat ? 'rgba(37,99,235,0.15)' : 'transparent',
                color: selectedCategory === cat ? '#93c5fd' : 'var(--c-text-muted)',
                fontSize: 13, fontWeight: selectedCategory === cat ? 700 : 400,
                cursor: 'pointer', textAlign: 'center', lineHeight: 1.3,
                transition: 'all 0.2s ease',
                borderLeft: selectedCategory === cat ? '2px solid #3b82f6' : '2px solid transparent',
                boxShadow: selectedCategory === cat ? 'inset 0 0 20px rgba(37,99,235,0.08)' : 'none',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* PRODUCT LIST */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Search + controls bar */}
          <div style={{
            padding: '8px 12px', background: 'var(--c-bg-panel)', borderBottom: '1px solid var(--c-border)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search product or scan barcode..."
              style={{
                flex: 1, padding: '9px 14px', background: 'var(--c-bg-card)',
                border: '1px solid var(--c-border)', borderRadius: 6, color: 'var(--c-text)', fontSize: 14,
                outline: 'none', transition: 'border-color 0.15s',
              }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6' }}
              onBlur={e => { e.target.style.borderColor = 'var(--c-border)' }}
            />
            <BarcodeIconButton active={showBarcodeModal} onClick={() => setShowBarcodeModal(true)} />

            {/* Sort toggle */}
            <div style={{ display: 'flex', gap: 2 }}>
              {[['default', '—'], ['az', 'A→Z'], ['za', 'Z→A']].map(([val, label]) => (
                <button key={val} onClick={() => setSort(val)} style={{
                  padding: '5px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  borderRadius: 5, border: '1px solid',
                  borderColor: sortOrder === val ? '#3b82f6' : 'var(--c-border)',
                  background:  sortOrder === val ? 'rgba(37,99,235,0.15)' : 'transparent',
                  color:       sortOrder === val ? '#93c5fd' : 'var(--c-text-muted)',
                  transition: 'all 0.15s',
                }}>{label}</button>
              ))}
            </div>

            {/* View mode toggle */}
            <div style={{ display: 'flex', gap: 2 }}>
              {[['list', '☰'], ['grid', '⊞']].map(([val, icon]) => (
                <button key={val} onClick={() => setView(val)} style={{
                  padding: '5px 9px', fontSize: 14, cursor: 'pointer',
                  borderRadius: 5, border: '1px solid',
                  borderColor: viewMode === val ? '#3b82f6' : 'var(--c-border)',
                  background:  viewMode === val ? 'rgba(37,99,235,0.15)' : 'transparent',
                  color:       viewMode === val ? '#93c5fd' : 'var(--c-text-muted)',
                  transition: 'all 0.15s',
                }}>{icon}</button>
              ))}
            </div>

            <span style={{ color: 'var(--c-text-dim)', fontSize: 12, whiteSpace: 'nowrap' }}>
              {sorted.length} items
            </span>
          </div>

          {/* ── LIST MODE ── */}
          {viewMode === 'list' && <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '52px 1fr 180px 70px 60px 50px 60px',
              padding: '9px 12px', background: 'var(--c-bg-card)',
              borderBottom: '1px solid var(--c-border)', fontSize: 12, color: 'var(--c-text-muted)',
              fontWeight: 600, letterSpacing: 0.4, flexShrink: 0,
            }}>
              <span>Photo</span><span>Product</span><span>Barcode</span>
              <span>Size</span><span style={{ textAlign: 'right' }}>Qty</span>
              <span /><span style={{ textAlign: 'center' }}>Add</span>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {sorted.map(product => {
                const locQty = product.qtyByLoc?.[posSession?.locationId] ?? product.qty
                const qColor = locQty <= 2 ? '#ef4444' : locQty <= 5 ? '#f59e0b' : 'var(--c-text-sub)'
                const dColor = locQty <= 2 ? '#ef4444' : locQty <= 5 ? '#f59e0b' : '#22c55e'
                return (
                  <div key={product.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '52px 1fr 180px 70px 60px 50px 60px',
                    padding: '11px 12px', borderBottom: '1px solid var(--c-border)',
                    alignItems: 'center', cursor: 'pointer', transition: 'all 0.2s ease',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderBottomColor = 'var(--c-border-md)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderBottomColor = 'var(--c-border)' }}
                  >
                    <div style={{ width: 36, height: 36, background: 'var(--c-bg-hover)', borderRadius: 6, border: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🧴</div>
                    <div>
                      <p style={{ fontSize: 15, color: 'var(--c-text)', fontWeight: 600 }}>{product.name}</p>
                      {product.description && <p style={{ fontSize: 12, color: 'var(--c-text-muted)', marginTop: 2 }}>{product.description}</p>}
                    </div>
                    <span style={{ fontSize: 15, color: 'var(--c-text-muted)', fontFamily: "'Courier New', Courier, monospace", letterSpacing: 0.5 }}>{product.barcode}</span>
                    <span style={{ fontSize: 13, color: 'var(--c-text-muted)' }}>{product.size}</span>
                    <span style={{ textAlign: 'right', fontSize: 15, fontWeight: 700, color: qColor }}>{locQty}</span>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', margin: '0 auto', background: dColor, boxShadow: `0 0 6px ${dColor}` }} />
                    <button onClick={() => openEditModal(product)} style={{
                      padding: '7px 14px', background: '#3b82f6', border: 'none',
                      borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700,
                      cursor: 'pointer', margin: '0 auto', display: 'block', transition: 'background 0.15s',
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
                      onMouseLeave={e => { e.currentTarget.style.background = '#3b82f6' }}
                    >Add</button>
                  </div>
                )
              })}
            </div>
          </>}

          {/* ── GRID MODE ── */}
          {viewMode === 'grid' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {sorted.map(product => {
                  const locQty = product.qtyByLoc?.[posSession?.locationId] ?? product.qty
                  const dColor = locQty <= 2 ? '#ef4444' : locQty <= 5 ? '#f59e0b' : '#22c55e'
                  const qColor = locQty <= 2 ? '#ef4444' : locQty <= 5 ? '#f59e0b' : 'var(--c-text-sub)'
                  return (
                    <button key={product.id} onClick={() => openEditModal(product)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                      padding: '14px 12px', background: 'var(--c-bg-card)',
                      border: '1px solid var(--c-border)', borderRadius: 8,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      gap: 6,
                    }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--c-bg-card)'; e.currentTarget.style.borderColor = 'var(--c-border)' }}
                    >
                      <p style={{ fontSize: 13, color: 'var(--c-text)', fontWeight: 700, lineHeight: 1.3 }}>{product.name}</p>
                      {product.size && <p style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>{product.size}</p>}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: dColor, boxShadow: `0 0 5px ${dColor}`, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: qColor, fontWeight: 700 }}>{locQty} in stock</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
        height: 32, background: 'var(--c-bg-panel)', borderTop: '1px solid var(--c-border)',
        display: 'flex', alignItems: 'center', padding: '0 16px', gap: 20,
        fontSize: 11, color: 'var(--c-text-dim)', flexShrink: 0
      }}>
        <span>{SYSTEM_NAME} v1.0</span>
        <span>•</span>
        <span>{posSession?.location || DEFAULT_LOCATION}</span>
        <span>•</span>
        <span style={{ color: serverOnline ? '#22c55e' : '#94a3b8' }}>
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
          onCancel={() => { setShowLogin(false); closeEditModal() }}
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
          onCancel={closeEditModal}
        />
      )}

      {showPayment && (
        <PaymentModal
          items={cart}
          taxRate={taxRate}
          currentUser={saleEmployee}
          customers={customers}
          locationPrefs={loadLocationConfigById(posSession?.locationId) || loadLocationConfig(posSession?.location) || {}}
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

      {showDashboard   && <Dashboard       onClose={() => setShowDashboard(false)}  sales={sales} />}
      {showEndOfDay    && <EndOfDayReport onClose={() => setShowEndOfDay(false)}   sales={sales} posSession={posSession} />}
      {showUserReport  && <UserReport    onClose={() => setShowUserReport(false)}  sales={sales} updateSale={updateSale} voidSale={voidSale} refundSale={refundSale} />}
      {showCompetition && <Competition   onClose={() => setShowCompetition(false)} sales={sales} posSession={posSession} />}
      {showAssistAuth && (
        <LoginModal
          title="Fluxe Assist"
          subtitle="Enter your PIN to view your stats"
          onLogin={emp => {
            setAssistEmployee(emp)
            setShowAssistAuth(false)
            setShowAssist(true)
          }}
          onCancel={() => setShowAssistAuth(false)}
        />
      )}
      {showAssist && (
        <FluxeAssist
          onClose={() => { setShowAssist(false); setAssistEmployee(null) }}
          sales={sales}
          customers={customers}
          empName={assistEmployee?.name || currentUser?.name || ''}
          location={posSession?.location || ''}
        />
      )}
      {showClockInOut  && <ClockInOut    onClose={() => setShowClockInOut(false)}  posSession={posSession} />}
      {showInventory   && <Inventory     onClose={() => setShowInventory(false)} products={products} />}
      {showAdmin       && <AdminPanel    onClose={() => setShowAdmin(false)}  sales={sales} updateSale={updateSale} voidSale={voidSale} refundSale={refundSale} customers={customers} onAddCustomer={addCustomer} onPatchCustomer={patchCustomer} onArchiveCustomer={archiveCustomer} products={products} setProducts={setProducts} posSession={posSession} />}
      {showReceipts    && <Receipts      onClose={() => setShowReceipts(false)}    posSession={posSession} />}
      {showCashDrawer  && <CashDrawer   onClose={() => setShowCashDrawer(false)} location={posSession?.location} />}
      {showCRM && (
        <CRMPanel
          customers={customers}
          serverOnline={serverOnline}
          onSendSMS={sendManualSMS}
          onGetSMSHistory={getSMSHistory}
          onUpdateSmsConsent={updateSmsConsent}
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

      {showAdminAuth && (
        <LoginModal
          title="Admin Access"
          subtitle="Admin or Manager PIN required"
          requiredRole="manager"
          filterRoles={['admin', 'manager']}
          onLogin={() => {
            setShowAdminAuth(false)
            setShowAdmin(true)
          }}
          onCancel={() => setShowAdminAuth(false)}
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
          capturedByEmployee={captureEmployee}
          sellerOptions={loadActiveEmployees()}
        />
      )}

      {/* OUT-OF-STOCK BLOCK TOAST */}
      {cartError && (
        <div style={{
          position: 'fixed', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          background: '#111d30', border: '1px solid #ef4444', borderRadius: 10,
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
          background: '#111d30', border: '1px solid #22c55e', borderRadius: 10,
          padding: '16px 24px', color: '#f1f5f9', fontSize: 14, fontWeight: 600,
          zIndex: 2000, display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)'
        }}>
          <span style={{ fontSize: 22 }}>✅</span>
          <div style={{ marginRight: 4 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Sale #{saleComplete.number} — ${saleComplete.total.toFixed(2)}
            </div>
            <div style={{ color: '#cbd0e0', fontSize: 12, marginTop: 2 }}>
              {saleComplete.employee} · {saleComplete.paymentMethod}
            </div>
          </div>
          <button
            onClick={() => printReceipt(saleComplete)}
            style={{
              background: '#3b82f6', border: 'none',
              borderRadius: 6, color: '#fff', padding: '8px 14px',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >🖨 Print</button>
          <button
            onClick={() => {
              setSmsReceipt(prev => ({ invoice: saleComplete, phone: prev?.phone || '' }))
              setSaleComplete(null)
            }}
            style={{
              background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)',
              borderRadius: 6, color: '#93c5fd', padding: '8px 14px',
              cursor: 'pointer', fontSize: 13, fontWeight: 700,
            }}
          >📱 SMS</button>
          <button
            onClick={() => { setSaleComplete(null); setSmsReceipt(null) }}
            style={{
              background: 'transparent', border: '1px solid #253349',
              borderRadius: 6, color: '#94a3b8', padding: '8px 12px',
              cursor: 'pointer', fontSize: 13,
            }}
          >Close</button>
        </div>
      )}

      {/* SMS RECEIPT MODAL */}
      {smsReceipt?.invoice && (
        <SmsReceiptModal
          invoice={smsReceipt.invoice}
          defaultPhone={smsReceipt.phone || ''}
          onClose={() => setSmsReceipt(null)}
        />
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
