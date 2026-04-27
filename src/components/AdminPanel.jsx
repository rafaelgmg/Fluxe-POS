import { useState, useMemo, useEffect } from 'react'
import { buildBarcode } from '../utils/parseBarcode'
import { BUSINESS_SHORT, COLORS, SYSTEM_NAME, LOCATIONS_CFG } from '../config/branding'
import { loadActiveCategoryNames } from '../utils/categoriesStorage'
import { loadAllProducts, saveAllProducts } from '../utils/productsStorage'
import { writeProductToSupabase, updateProductInSupabase } from '../services/supabaseWrite'
import UsersScreen        from './UsersScreen'
import UserReport         from './UserReport'
import InventoryAdmin     from './InventoryAdmin'
import LocationReport     from './LocationReport'
import LocationSettings   from './LocationSettings'
import CategoriesScreen      from './CategoriesScreen'
import CommissionSettings   from './CommissionSettings'
import BonusRulesScreen     from './BonusRulesScreen'
import BarcodeModal, { BarcodeIconButton } from './BarcodeModal'
import CustomersAdmin from './CustomersAdmin'
import CRMSettings    from './CRMSettings'
import AdminEODReport from './AdminEODReport'

const PURPLE       = COLORS.admin
const GOLD         = COLORS.accent

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcMargin(systemPrice, costPrice) {
  if (!systemPrice || !costPrice) return null
  return ((systemPrice - costPrice) / systemPrice) * 100
}

function marginColor(pct) {
  if (pct >= 40) return '#22c55e'
  if (pct >= 20) return '#f39c12'
  return '#ef4444'
}

function timeAgo(date) {
  if (!date) return null
  const diff = Math.floor((Date.now() - new Date(date)) / 1000)
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

// ─── Module definitions ───────────────────────────────────────────────────────

const MODULES = [
  {
    id: 'locations', icon: '📍', label: 'Locations', color: '#e74c3c',
    submenu: [
      { id: 'loc-settings',   label: 'Settings', screen: 'loc-settings' },
      { id: 'loc-reports',    label: 'Reports',  screen: 'loc-reports' },
      { id: 'loc-cashlog',    label: 'Cash Register Activity'  },
      { id: 'loc-eod',        label: 'End-Of-Day Reports', screen: 'loc-eod' },
      { id: 'loc-regions',    label: 'Regions'                 },
    ],
  },
  {
    id: 'products', icon: '🧴', label: 'Products', color: '#3498db',
    submenu: [
      { id: 'products-settings',  label: 'Settings',              screen: 'product-table' },
      { id: 'products-pricelists',label: 'Price Lists'            },
      { id: 'products-categories',label: 'Categories', screen: 'categories' },
      { id: 'products-wholesale', label: 'Wholesalers'            },
      { id: 'products-coupons',   label: 'Coupons'                },
      { id: 'products-couponrpt', label: 'Coupons Reports'        },
      { id: 'products-reports',   label: 'Reports'                },
      { id: 'products-compare',   label: 'Compare Products'       },
      { id: 'products-labels',    label: 'Labels and Price Tags'  },
      { id: 'products-kits',      label: 'Kits and Bundles'       },
    ],
  },
  {
    id: 'inventory', icon: '📦', label: 'Inventory', color: '#27ae60',
    submenu: [
      { id: 'inv-mgmt',     label: 'Management',                screen: 'inv-management' },
      { id: 'inv-changes',  label: 'View Changes'                },
      { id: 'inv-testers',  label: 'View Testers and Losses'     },
      { id: 'inv-orders',   label: 'Automatic Purchase Orders'   },
      { id: 'inv-report',   label: 'Inventory Report'            },
      { id: 'inv-transfer', label: 'Transfers',                  screen: 'inv-transfers'  },
      { id: 'inv-counts',   label: 'Daily Counts'                },
      { id: 'inv-history',  label: 'History',                    screen: 'inv-history'    },
    ],
  },
  {
    id: 'users', icon: '👥', label: 'Users', color: '#9b59b6',
    submenu: [
      { id: 'usr-settings',    label: 'Settings',            screen: 'user-table'         },
      { id: 'usr-reports',     label: 'Reports',             screen: 'user-report'         },
      { id: 'usr-commission',  label: 'Commission Settings', screen: 'commission-settings' },
      { id: 'usr-bonus',       label: 'Daily Bonus Rules',   screen: 'bonus-rules'         },
      { id: 'usr-salary',      label: 'Salary Report'   },
      { id: 'usr-compare',     label: 'Compare Users'   },
      { id: 'usr-changelog',   label: 'Change Log'      },
      { id: 'usr-payroll',     label: 'Payroll Changes' },
    ],
  },
  {
    id: 'customers', icon: '🙋', label: 'Customers', color: '#f39c12',
    submenu: [
      { id: 'cust-mgmt',      label: 'Management',   screen: 'customers-mgmt' },
      { id: 'cust-settings',  label: 'CRM Settings', screen: 'crm-settings'   },
      { id: 'cust-email',     label: 'Email Campaign'  },
      { id: 'cust-layaway',  label: 'Layaways'        },
      { id: 'cust-quotes',   label: 'Quotes'          },
    ],
  },
  {
    id: 'accounting', icon: '💰', label: 'Accounting', color: '#1abc9c',
    submenu: [
      { id: 'acc-invoices',  label: 'Invoices'           },
      { id: 'acc-payments',  label: 'Payments'           },
      { id: 'acc-credit',    label: 'Store Credit'       },
      { id: 'acc-refunds',   label: 'Refunds'            },
      { id: 'acc-expenses',  label: 'Expenses'           },
      { id: 'acc-pl',        label: 'Profit/Loss Report' },
      { id: 'acc-reset',     label: 'Reset Account'      },
    ],
  },
]

// ─── Product Editor (Slide Panel) ────────────────────────────────────────────

function ProductEditor({ product, onSave, onClose, isNew, onDeactivate, onReactivate }) {
  const liveCategories = loadActiveCategoryNames()
  const defaultCategory = liveCategories[0] || ''
  const emptyQtyByLoc = () => LOCATIONS_CFG.reduce((acc, l) => ({ ...acc, [l.id]: 0 }), {})

  const empty = {
    name: '', description: '', cleanBarcode: '', size: '',
    category: defaultCategory, systemPrice: '', minPrice: '',
    costPrice: '', supplierName: '', qtyByLoc: emptyQtyByLoc(),
  }

  const [form, setForm] = useState(() => product ? {
    name:          product.name        || '',
    description:   product.description || '',
    cleanBarcode:  product.barcode     || '',
    size:          product.size        || '',
    category:      product.category    || defaultCategory,
    systemPrice:   product.systemPrice != null ? product.systemPrice : '',
    minPrice:      product.minPrice    != null ? product.minPrice    : '',
    costPrice:     product.costPrice   != null ? product.costPrice   : '',
    supplierName:  product.supplierName|| '',
    qtyByLoc:      product.qtyByLoc   || emptyQtyByLoc(),
  } : empty)

  const [errors, setErrors] = useState({})

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const validate = () => {
    const e = {}
    if (!form.name.trim())                                        e.name         = 'Required'
    if (!form.cleanBarcode.trim())                                e.cleanBarcode = 'Required'
    if (form.systemPrice === '' || isNaN(parseFloat(form.systemPrice))) e.systemPrice  = 'Required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSave = () => {
    if (!validate()) return
    const minP = form.minPrice !== '' ? parseFloat(form.minPrice) : null
    onSave({
      name:         form.name.trim(),
      description:  form.description.trim(),
      barcode:      form.cleanBarcode.trim(),
      rawBarcode:   buildBarcode(form.cleanBarcode.trim(), minP),
      size:         form.size.trim(),
      category:     form.category,
      systemPrice:  parseFloat(form.systemPrice),
      minPrice:     minP ?? 0,
      costPrice:    form.costPrice !== '' ? parseFloat(form.costPrice) : 0,
      supplierName: form.supplierName.trim(),
      qtyByLoc:     form.qtyByLoc,
      qty:          Object.values(form.qtyByLoc).reduce((s, v) => s + (parseInt(v) || 0), 0),
      updatedAt:    new Date(),
    })
  }

  const margin    = calcMargin(parseFloat(form.systemPrice), parseFloat(form.costPrice))
  const minMargin = calcMargin(parseFloat(form.minPrice),    parseFloat(form.costPrice))

  const inp = (key, extra = {}) => ({
    value: form[key],
    onChange: e => set(key, e.target.value),
    style: {
      width: '100%', padding: '7px 10px', background: '#111d30',
      border: `1px solid ${errors[key] ? '#ef4444' : '#253349'}`,
      borderRadius: 4, color: '#f1f5f9', fontSize: 13,
      boxSizing: 'border-box', ...extra.style
    },
    ...extra
  })

  const lbl = (text) => (
    <label style={{ color: '#94a3b8', fontSize: 11, marginBottom: 3, display: 'block' }}>{text}</label>
  )
  const err = (key) => errors[key] && (
    <p style={{ color: '#ef4444', fontSize: 10, marginTop: 2 }}>{errors[key]}</p>
  )
  const row = (children, mb = 12) => (
    <div style={{ marginBottom: mb }}>{children}</div>
  )

  return (
    <div style={{
      width: 340, background: '#0d1526', borderLeft: `2px solid ${PURPLE}`,
      display: 'flex', flexDirection: 'column', flexShrink: 0
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: '#111d30',
        borderBottom: `1px solid ${PURPLE}`,
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0
      }}>
        <span style={{ color: PURPLE, fontWeight: 700, fontSize: 13 }}>
          {isNew ? '＋ New Product' : '✏ Edit Product'}
        </span>
        {margin !== null && (
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: marginColor(margin) }}>
            {margin.toFixed(0)}% margin
          </span>
        )}
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#94a3b8',
          fontSize: 20, cursor: 'pointer', lineHeight: 1,
          marginLeft: margin === null ? 'auto' : 8
        }}>×</button>
      </div>

      {/* Form body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>

        {row(<>
          {lbl('Product Name *')}
          <input {...inp('name')} />
          {err('name')}
        </>)}

        {row(<>
          {lbl('Description')}
          <textarea {...inp('description', {
            style: { resize: 'vertical', fontFamily: 'inherit', minHeight: 52 }
          })} rows={2} />
        </>)}

        {row(<>
          {lbl('Barcode *')}
          <input {...inp('cleanBarcode', { style: { fontFamily: 'monospace' } })} />
          {err('cleanBarcode')}
          {form.minPrice && form.cleanBarcode && (
            <p style={{ color: '#94a3b8', fontSize: 10, marginTop: 3, fontFamily: 'monospace' }}>
              Stored as: {buildBarcode(form.cleanBarcode, form.minPrice)}
            </p>
          )}
        </>)}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
          <div>
            {lbl('Size')}
            <input {...inp('size')} />
          </div>
          <div>
            {lbl('Category')}
            <select value={form.category} onChange={e => set('category', e.target.value)}
              style={{ width: '100%', padding: '7px 10px', background: '#111d30', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 13, cursor: 'pointer' }}>
              {/* Show all active categories + keep current value even if now inactive */}
              {[...new Set([...(product?.category ? [product.category] : []), ...liveCategories])]
                .map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Pricing block */}
        <div style={{
          background: '#111d30', border: '1px solid #253349', borderRadius: 6,
          padding: '12px 12px 8px', marginBottom: 12
        }}>
          <p style={{ color: GOLD, fontSize: 10, fontWeight: 800, letterSpacing: 1, marginBottom: 10 }}>
            💰 PRICING — CONFIDENTIAL
          </p>

          {row(<>
            {lbl('System Price * (visible to customers)')}
            <input {...inp('systemPrice', { type: 'number', style: { color: '#22c55e' } })} />
            {err('systemPrice')}
          </>, 10)}

          {row(<>
            {lbl('Min Price (floor — hidden from sellers)')}
            <input {...inp('minPrice', { type: 'number', style: { color: '#ef4444' } })} />
          </>, 10)}

          {row(<>
            {lbl('Cost Price (supplier cost — hidden)')}
            <input {...inp('costPrice', { type: 'number', style: { color: '#f39c12' } })} />
          </>, 8)}

          {/* Live margin pills */}
          {(margin !== null || minMargin !== null) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {margin !== null && (
                <div style={{
                  flex: 1, background: '#030e1e', border: '1px solid #253349', borderRadius: 4, padding: '6px 10px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ color: '#94a3b8', fontSize: 10 }}>Gross Margin</span>
                  <span style={{ color: marginColor(margin), fontWeight: 700, fontSize: 13 }}>
                    {margin.toFixed(1)}%
                  </span>
                </div>
              )}
              {minMargin !== null && (
                <div style={{
                  flex: 1, background: '#030e1e', border: '1px solid #253349', borderRadius: 4, padding: '6px 10px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <span style={{ color: '#94a3b8', fontSize: 10 }}>Min Margin</span>
                  <span style={{ color: marginColor(minMargin), fontWeight: 700, fontSize: 13 }}>
                    {minMargin.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {row(<>
          {lbl('Supplier Name')}
          <input {...inp('supplierName')} />
        </>)}

        <div style={{ marginBottom: 0 }}>
          {lbl('Stock by Location')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {LOCATIONS_CFG.map(loc => {
              const val = parseInt(form.qtyByLoc[loc.id] || 0)
              const setLoc = (v) => set('qtyByLoc', { ...form.qtyByLoc, [loc.id]: Math.max(0, v) })
              return (
                <div key={loc.id} style={{
                  background: '#111d30', border: '1px solid #253349', borderRadius: 6,
                  padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: '#cbd0e0', fontSize: 12, fontWeight: 600 }}>{loc.name}</p>
                    <p style={{ color: '#415569', fontSize: 10, marginTop: 1 }}>{loc.region}</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button onClick={() => setLoc(val - 1)}
                      style={{ width: 26, height: 26, background: '#030e1e', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>−</button>
                    <input
                      type="number"
                      value={val}
                      onChange={e => setLoc(parseInt(e.target.value) || 0)}
                      style={{ width: 48, textAlign: 'center', padding: '4px 6px', background: '#030e1e', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 13, outline: 'none' }}
                    />
                    <button onClick={() => setLoc(val + 1)}
                      style={{ width: 26, height: 26, background: '#030e1e', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>＋</button>
                  </div>
                </div>
              )
            })}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingRight: 2 }}>
              <span style={{ color: '#94a3b8', fontSize: 11 }}>
                Total: <span style={{ color: '#f1f5f9', fontWeight: 700 }}>
                  {Object.values(form.qtyByLoc).reduce((s, v) => s + (parseInt(v) || 0), 0)}
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Save footer */}
      <div style={{ padding: 14, borderTop: '1px solid #253349', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {product?.updatedAt && (
          <p style={{ color: '#94a3b8', fontSize: 10, textAlign: 'center' }}>
            Last updated: {timeAgo(product.updatedAt)} · {new Date(product.updatedAt).toLocaleString()}
          </p>
        )}
        <button onClick={handleSave} style={{
          width: '100%', padding: '11px', background: PURPLE,
          border: 'none', borderRadius: 6, color: '#fff',
          fontSize: 14, fontWeight: 700, cursor: 'pointer'
        }}>💾 Save Product</button>

        {!isNew && (
          product?.status === 'inactive' ? (
            <button onClick={onReactivate} style={{
              width: '100%', padding: '9px', background: 'rgba(34,197,94,0.08)',
              border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6,
              color: '#86efac', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.18)'; e.currentTarget.style.borderColor = '#22c55e' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(34,197,94,0.08)'; e.currentTarget.style.borderColor = 'rgba(34,197,94,0.3)' }}
              title="Re-enable this product for sales"
            >✅ Reactivate Product</button>
          ) : (
            <button onClick={onDeactivate} style={{
              width: '100%', padding: '9px', background: 'transparent',
              border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6,
              color: '#f87171', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.5)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)' }}
            >⛔ Deactivate Product</button>
          )
        )}
      </div>
    </div>
  )
}

// ─── Products Management Screen ───────────────────────────────────────────────

function ProductsScreen({ products, setProducts, onBack }) {
  const [search,          setSearch]          = useState('')
  const [filterCategory,  setFilterCategory]  = useState('All')
  const [filterSupplier,  setFilterSupplier]  = useState('')
  const [filterLowMargin, setFilterLowMargin] = useState(false)
  const [sortKey,         setSortKey]         = useState('name')
  const [sortDir,         setSortDir]         = useState('asc')
  const [selected,        setSelected]        = useState(new Set())
  const [showBarcode,     setShowBarcode]     = useState(false)
  const [editingProduct,    setEditingProduct]    = useState(null)
  const [isNewProduct,      setIsNewProduct]      = useState(false)
  const [bulkCategory,      setBulkCategory]      = useState('')
  const [bulkSupplier,      setBulkSupplier]      = useState('')
  const [showBulkMenu,      setShowBulkMenu]      = useState(false)
  const [statusFilter,      setStatusFilter]      = useState('active')      // 'active' | 'inactive' | 'all'
  const [deactivatingProduct, setDeactivatingProduct] = useState(null)

  const suppliers = useMemo(() =>
    [...new Set(products.map(p => p.supplierName).filter(Boolean))],
    [products]
  )

  const statusCounts = useMemo(() => ({
    active:   products.filter(p => p.status !== 'inactive').length,
    inactive: products.filter(p => p.status === 'inactive').length,
    all:      products.length,
  }), [products])

  const filtered = useMemo(() => {
    let list = products.map(p => ({ ...p, margin: calcMargin(p.systemPrice, p.costPrice) }))
    // status filter
    if (statusFilter === 'active')   list = list.filter(p => p.status !== 'inactive')
    if (statusFilter === 'inactive') list = list.filter(p => p.status === 'inactive')
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.barcode.includes(q) ||
        (p.supplierName || '').toLowerCase().includes(q)
      )
    }
    if (filterCategory !== 'All') list = list.filter(p => p.category === filterCategory)
    if (filterSupplier)           list = list.filter(p => p.supplierName === filterSupplier)
    if (filterLowMargin)          list = list.filter(p => p.margin !== null && p.margin < 20)
    list.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      if (av == null) return 1
      if (bv == null) return -1
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
    return list
  }, [products, search, filterCategory, filterSupplier, filterLowMargin, sortKey, sortDir, statusFilter])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const toggleSelect    = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleSelectAll = () => setSelected(
    selected.size === filtered.length && filtered.length > 0
      ? new Set()
      : new Set(filtered.map(p => p.id))
  )
  const openEditor      = (p) => { setIsNewProduct(false); setEditingProduct(p) }
  const openNewProduct  = () => { setEditingProduct(null); setIsNewProduct(true) }

  const handleSaveProduct = (data) => {
    if (isNewProduct) {
      const tempId = Math.max(...products.map(p => typeof p.id === 'number' ? p.id : 0), 0) + 1
      const newProduct = { ...data, id: tempId }
      setProducts(prev => { const u = [...prev, newProduct]; saveAllProducts(u); return u })
      // Write to Supabase and swap temp ID for UUID
      writeProductToSupabase(newProduct).then(uuid => {
        if (!uuid) return
        setProducts(prev => {
          const u = prev.map(p => p.id === tempId ? { ...p, id: uuid } : p)
          saveAllProducts(u)
          return u
        })
      })
    } else {
      const updated = { ...editingProduct, ...data }
      setProducts(prev => { const u = prev.map(p => p.id === editingProduct.id ? updated : p); saveAllProducts(u); return u })
      updateProductInSupabase(updated)
    }
    setEditingProduct(null); setIsNewProduct(false)
  }

  const handleDeactivateProduct = (p) => {
    setProducts(prev => { const u = prev.map(x => x.id === p.id ? { ...x, status: 'inactive', updatedAt: new Date().toISOString() } : x); saveAllProducts(u); return u })
    setEditingProduct(null)
  }

  const handleReactivateProduct = (p) => {
    setProducts(prev => { const u = prev.map(x => x.id === p.id ? { ...x, status: 'active', updatedAt: new Date().toISOString() } : x); saveAllProducts(u); return u })
    setEditingProduct(null)
  }

  const handleBulkCategory = () => {
    if (!bulkCategory) return
    setProducts(prev => prev.map(p => selected.has(p.id) ? { ...p, category: bulkCategory } : p))
    setSelected(new Set()); setBulkCategory(''); setShowBulkMenu(false)
  }
  const handleBulkSupplier = () => {
    if (!bulkSupplier) return
    setProducts(prev => prev.map(p => selected.has(p.id) ? { ...p, supplierName: bulkSupplier } : p))
    setSelected(new Set()); setBulkSupplier(''); setShowBulkMenu(false)
  }

  const exportCSV = (rows) => {
    const data = rows || products
    const headers = ['ID','Name','Description','Barcode','Raw Barcode','Size','Category',
                     'System Price','Min Price','Cost Price','Margin%','Qty','Supplier','Updated At']
    const lines = [
      headers.join(','),
      ...data.map(p => {
        const m = calcMargin(p.systemPrice, p.costPrice)
        return [
          p.id, `"${(p.name||'').replace(/"/g,'""')}"`,
          `"${(p.description||'').replace(/"/g,'""')}"`,
          p.barcode, p.rawBarcode,
          `"${p.size||''}"`, `"${p.category||''}"`,
          p.systemPrice, p.minPrice, p.costPrice,
          m != null ? m.toFixed(1) : '',
          p.qty, `"${p.supplierName||''}"`,
          p.updatedAt ? new Date(p.updatedAt).toISOString() : ''
        ].join(',')
      })
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: `fluxe-products-${new Date().toISOString().slice(0,10)}.csv`
    })
    a.click(); URL.revokeObjectURL(url)
  }

  const SortIcon = ({ col }) => (
    <span style={{ marginLeft: 3, opacity: sortKey === col ? 1 : 0.18 }}>
      {sortKey === col ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
    </span>
  )
  const th = (col, label) => (
    <th onClick={() => toggleSort(col)} style={{
      padding: '8px 10px', textAlign: 'left', color: '#94a3b8', fontWeight: 600, fontSize: 11,
      cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', background: '#111d30'
    }}>{label}<SortIcon col={col} /></th>
  )

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Sub-header */}
      <div style={{
        padding: '10px 16px', background: '#111d30', borderBottom: '1px solid #253349',
        display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: '#94a3b8', fontSize: 18,
          cursor: 'pointer', paddingRight: 4, lineHeight: 1
        }}>←</button>
        <span style={{ color: '#3498db', fontWeight: 700, fontSize: 13 }}>🧴 Products</span>
        <span style={{ color: '#94a3b8', fontSize: 11 }}>Settings</span>
        <div style={{ width: 1, height: 16, background: '#253349', margin: '0 4px' }} />

        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search product, barcode, supplier..."
          style={{
            padding: '6px 12px', background: '#030e1e', border: '1px solid #253349',
            borderRadius: 4, color: '#f1f5f9', fontSize: 13, width: 230, outline: 'none'
          }}
          onFocus={e => { e.target.style.borderColor = '#3b82f6' }}
          onBlur={e =>  { e.target.style.borderColor = '#253349' }}
        />
        <BarcodeIconButton active={showBarcode} onClick={() => setShowBarcode(true)} />
        {showBarcode && (
          <BarcodeModal
            onConfirm={(code) => { setSearch(code); setShowBarcode(false) }}
            onClose={() => setShowBarcode(false)}
          />
        )}

        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
          style={{ padding: '6px 10px', background: '#030e1e', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
          <option value="All">All Categories</option>
          {loadActiveCategoryNames().map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {suppliers.length > 0 && (
          <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
            style={{ padding: '6px 10px', background: '#030e1e', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 12, cursor: 'pointer', outline: 'none' }}>
            <option value="">All Suppliers</option>
            {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {/* Status filter tabs */}
        <div style={{ display: 'flex', gap: 2, background: '#030e1e', border: '1px solid #253349', borderRadius: 6, padding: 2 }}>
          {[
            { id: 'active',   label: 'Active',   color: '#22c55e' },
            { id: 'inactive', label: 'Inactive', color: '#ef4444' },
            { id: 'all',      label: 'All',      color: '#94a3b8' },
          ].map(({ id, label, color }) => (
            <button key={id} onClick={() => { setStatusFilter(id); setEditingProduct(null) }} style={{
              padding: '4px 11px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              background: statusFilter === id ? `${color}18` : 'transparent',
              color: statusFilter === id ? color : '#94a3b8',
              outline: statusFilter === id ? `1px solid ${color}40` : 'none',
            }}>
              {label} <span style={{ opacity: 0.7 }}>{statusCounts[id]}</span>
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontSize: 12, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={filterLowMargin} onChange={e => setFilterLowMargin(e.target.checked)} style={{ cursor: 'pointer' }} />
          Low Margin (&lt;20%)
        </label>

        <span style={{ color: '#94a3b8', fontSize: 12 }}>{filtered.length} products</span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          {selected.size > 0 && (
            <>
              <span style={{ color: PURPLE, fontSize: 12, fontWeight: 600 }}>{selected.size} selected</span>
              <button onClick={() => setShowBulkMenu(v => !v)} style={{
                padding: '6px 12px', background: PURPLE + '18', border: `1px solid ${PURPLE}`,
                borderRadius: 4, color: PURPLE, fontSize: 12, cursor: 'pointer', fontWeight: 600
              }}>Bulk Actions ▾</button>

              {showBulkMenu && (
                <div style={{
                  position: 'absolute', top: '110%', right: 0, background: '#0d1526',
                  border: `1px solid ${PURPLE}`, borderRadius: 8, padding: 14, zIndex: 20,
                  minWidth: 230, boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
                }}>
                  <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 600 }}>Update Category</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    <select value={bulkCategory} onChange={e => setBulkCategory(e.target.value)}
                      style={{ flex: 1, padding: '5px 8px', background: '#111d30', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 12, outline: 'none' }}>
                      <option value="">Select category...</option>
                      {loadActiveCategoryNames().map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button onClick={handleBulkCategory}
                      style={{ padding: '5px 10px', background: PURPLE, border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>Apply</button>
                  </div>

                  <p style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8, fontWeight: 600 }}>Update Supplier</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                    <input value={bulkSupplier} onChange={e => setBulkSupplier(e.target.value)}
                      placeholder="Supplier name..."
                      style={{ flex: 1, padding: '5px 8px', background: '#111d30', border: '1px solid #253349', borderRadius: 4, color: '#f1f5f9', fontSize: 12, outline: 'none' }} />
                    <button onClick={handleBulkSupplier}
                      style={{ padding: '5px 10px', background: PURPLE, border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>Apply</button>
                  </div>

                  <button onClick={() => { exportCSV(products.filter(p => selected.has(p.id))); setShowBulkMenu(false) }}
                    style={{ width: '100%', padding: '8px', background: '#22c55e', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>
                    📥 Export Selected CSV
                  </button>
                </div>
              )}
            </>
          )}

          <button onClick={() => exportCSV()} style={{
            padding: '6px 14px', background: 'transparent', border: `1px solid ${PURPLE}`,
            borderRadius: 4, color: PURPLE, fontSize: 12, cursor: 'pointer', fontWeight: 600
          }}>📥 Export CSV</button>

          <button onClick={openNewProduct} style={{
            padding: '6px 14px', background: PURPLE, border: 'none',
            borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>＋ Add Product</button>
        </div>
      </div>

      {/* Table + Editor */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ padding: '8px 12px', background: '#111d30', width: 36 }}>
                  <input type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
                {th('name',        'Product'  )}
                {th('description', 'Desc'     )}
                {th('barcode',     'Barcode'  )}
                {th('size',        'Size'     )}
                {th('category',    'Category' )}
                {th('systemPrice', 'System $' )}
                {th('minPrice',    'Min $'    )}
                {th('costPrice',   'Cost $'   )}
                {th('margin',      'Margin%'  )}
                {th('qty',         'Stock'    )}
                {th('supplierName','Supplier' )}
                <th style={{ padding: '8px 10px', background: '#111d30', width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const isActive = editingProduct?.id === p.id
                const isSel    = selected.has(p.id)
                return (
                  <tr key={p.id} onClick={() => openEditor(p)} style={{
                    borderBottom: '1px solid #253349', cursor: 'pointer',
                    background: isActive ? PURPLE + '18' : isSel ? PURPLE + '10' : 'transparent'
                  }}
                    onMouseEnter={e => { if (!isActive && !isSel) { e.currentTarget.style.background = 'rgba(37,99,235,0.05)'; e.currentTarget.style.borderBottomColor = 'rgba(37,99,235,0.15)' } }}
                    onMouseLeave={e => { if (!isActive && !isSel) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderBottomColor = '#253349' } }}
                  >
                    <td style={{ padding: '7px 12px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={isSel} onChange={() => toggleSelect(p.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{
                          width: 26, height: 26, background: '#111d30', border: '1px solid #253349', borderRadius: 4,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
                          opacity: p.status === 'inactive' ? 0.5 : 1,
                        }}>🧴</div>
                        <span style={{ color: p.status === 'inactive' ? '#94a3b8' : '#f1f5f9', fontWeight: 500, whiteSpace: 'nowrap' }}>{p.name}</span>
                        {p.status === 'inactive' && (
                          <span style={{ padding: '1px 6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 4, color: '#f87171', fontSize: 9, fontWeight: 700, letterSpacing: 0.3, flexShrink: 0 }}>INACTIVE</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', maxWidth: 120 }}>
                      <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.description || '—'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap' }}>{p.barcode}</td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8' }}>{p.size || '—'}</td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ background: '#111d30', border: '1px solid #253349', borderRadius: 3, padding: '2px 6px', color: '#94a3b8', fontSize: 10, whiteSpace: 'nowrap' }}>
                        {p.category}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', color: '#22c55e', fontWeight: 700 }}>${p.systemPrice}</td>
                    <td style={{ padding: '7px 10px', color: '#ef4444', fontWeight: 600 }}>${p.minPrice}</td>
                    <td style={{ padding: '7px 10px', color: '#f39c12' }}>
                      {p.costPrice ? `$${p.costPrice}` : <span style={{ color: '#415569' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      {p.margin != null
                        ? <span style={{ color: marginColor(p.margin), fontWeight: 700 }}>{p.margin.toFixed(0)}%</span>
                        : <span style={{ color: '#415569' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '7px 10px' }}>
                      <span style={{ color: p.qty <= 2 ? '#ef4444' : p.qty <= 5 ? '#f39c12' : '#94a3b8', fontWeight: p.qty <= 2 ? 700 : 400 }}>{p.qty}</span>
                    </td>
                    <td style={{ padding: '7px 10px', color: '#94a3b8' }}>
                      {p.supplierName || <span style={{ color: '#415569' }}>—</span>}
                    </td>
                    <td style={{ padding: '7px 10px' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => openEditor(p)} style={{
                        padding: '4px 10px', background: 'transparent', border: `1px solid ${PURPLE}`,
                        borderRadius: 4, color: PURPLE, fontSize: 11, cursor: 'pointer', fontWeight: 600
                      }}>✏ Edit</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {(editingProduct || isNewProduct) && (
          <ProductEditor
            product={editingProduct}
            onSave={handleSaveProduct}
            onClose={() => { setEditingProduct(null); setIsNewProduct(false) }}
            isNew={isNewProduct}
            onDeactivate={() => setDeactivatingProduct(editingProduct)}
            onReactivate={() => handleReactivateProduct(editingProduct)}
          />
        )}

        {/* Deactivate confirmation modal */}
        {deactivatingProduct && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1400, backdropFilter: 'blur(4px)' }}>
            <div style={{ background: 'linear-gradient(160deg,#0d1829 0%,#0d1526 100%)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, width: 420, padding: 28, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>⛔</div>
                <div>
                  <p style={{ color: '#f1f5f9', fontWeight: 800, fontSize: 16, marginBottom: 3 }}>Deactivate Product?</p>
                  <p style={{ color: '#fca5a5', fontSize: 12 }}>{deactivatingProduct.name}</p>
                </div>
              </div>
              <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>
                This product will be <strong style={{ color: '#ef4444' }}>removed from active sales</strong> and hidden from sellers.
                All past sales, reports, and inventory history will be preserved.
              </p>
              {(deactivatingProduct.qty || 0) > 0 && (
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 14 }}>⚠️</span>
                  <p style={{ color: '#f59e0b', fontSize: 12, lineHeight: 1.5 }}>
                    This product still has <strong>{deactivatingProduct.qty} unit{deactivatingProduct.qty !== 1 ? 's' : ''} in stock</strong>. Are you sure you want to deactivate it?
                  </p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeactivatingProduct(null)} style={{ flex: 1, padding: '11px', background: 'transparent', border: '1px solid #253349', borderRadius: 6, color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={() => { handleDeactivateProduct(deactivatingProduct); setDeactivatingProduct(null) }} style={{ flex: 2, padding: '11px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: 6, color: '#fca5a5', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#ef4444'; e.currentTarget.style.color = '#fff' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#fca5a5' }}
                >Confirm Deactivation</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Coming Soon placeholder ──────────────────────────────────────────────────

function ComingSoon({ label, moduleColor, onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, color: '#253349' }}>
      <button onClick={onBack} style={{
        position: 'absolute', top: 16, left: 16,
        background: 'none', border: 'none', color: '#94a3b8', fontSize: 18, cursor: 'pointer'
      }}>←</button>
      <div style={{ fontSize: 48, opacity: 0.3 }}>🚧</div>
      <p style={{ fontSize: 18, fontWeight: 700, color: moduleColor || '#94a3b8', opacity: 0.7 }}>{label}</p>
      <p style={{ fontSize: 13, color: '#415569' }}>This module is coming soon</p>
    </div>
  )
}

// ─── Shared header button helper ─────────────────────────────────────────────

function HeaderBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '6px 16px', background: 'transparent', border: '1px solid #253349',
      borderRadius: 4, color: '#94a3b8', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#94a3b8' }}
    >{children}</button>
  )
}

// ─── Shared admin header ──────────────────────────────────────────────────────

function AdminHeader({ goBack, onClose, backLabel = '← Back' }) {
  return (
    <div style={{
      height: 50, background: '#0d1526', borderBottom: `2px solid ${PURPLE}`,
      display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0
    }}>
      <span style={{ fontWeight: 800, fontSize: 15, color: '#93c5fd', letterSpacing: 2 }}>{SYSTEM_NAME}</span>
      <div style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#c4b5fd', letterSpacing: 1.5 }}>
        ADMIN
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        {goBack && <HeaderBtn onClick={goBack}>{backLabel}</HeaderBtn>}
        <HeaderBtn onClick={onClose}>✕ Exit Admin</HeaderBtn>
      </div>
    </div>
  )
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────

export default function AdminPanel({ onClose, sales = [], updateSale, customers = [], onAddCustomer, onPatchCustomer, onArchiveCustomer, products: liveProducts = null, setProducts: setAppProducts = null, posSession = null }) {
  const [localProducts, setLocalProducts] = useState(loadAllProducts)

  useEffect(() => {
    if (liveProducts && liveProducts.length > 0) setLocalProducts(liveProducts)
  }, [liveProducts])

  // Use shared App state if available, so edits (category etc.) are reflected in POS immediately
  const products    = liveProducts && liveProducts.length > 0 ? liveProducts : localProducts
  const setProducts = setAppProducts
    ? (updater) => {
        const next = typeof updater === 'function' ? updater(products) : updater
        setLocalProducts(next)
        setAppProducts(next)
      }
    : setLocalProducts

  const [activeModule, setActiveModule] = useState(null)   // id of selected module tile
  const [activeScreen, setActiveScreen] = useState(null)   // id of selected submenu item + optional screen key


  const currentModule = MODULES.find(m => m.id === activeModule)
  const currentItem   = currentModule?.submenu.find(s => s.id === activeScreen?.id)

  const goBack = () => {
    if (activeScreen) { setActiveScreen(null) }
    else              { setActiveModule(null) }
  }

  // ── Render full-screen content (product table etc.) ──────────────────────
  if (activeScreen?.screen === 'user-report') {
    return (
      <UserReport
        onClose={goBack}
        sales={sales}
        updateSale={updateSale}
        mode="admin"
      />
    )
  }

  if (activeScreen?.screen === 'user-table') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Management" />
        <UsersScreen onBack={goBack} />
      </div>
    )
  }

  if (activeScreen?.screen === 'loc-settings') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Locations" />
        <LocationSettings onBack={goBack} />
      </div>
    )
  }

  if (activeScreen?.screen === 'loc-reports') {
    return <LocationReport onClose={goBack} sales={sales} />
  }

  if (activeScreen?.screen === 'loc-eod') {
    return <AdminEODReport onClose={goBack} />
  }

  if (activeScreen?.screen === 'inv-management') {
    return <InventoryAdmin onClose={goBack} defaultView="management" />
  }

  if (activeScreen?.screen === 'inv-transfers') {
    return <InventoryAdmin onClose={goBack} defaultView="transfers" />
  }

  if (activeScreen?.screen === 'inv-history') {
    return <InventoryAdmin onClose={goBack} defaultView="history" />
  }

  if (activeScreen?.screen === 'product-table') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Management" />
        <ProductsScreen products={products} setProducts={setProducts} onBack={goBack} />
      </div>
    )
  }

  if (activeScreen?.screen === 'categories') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Products" />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <CategoriesScreen onBack={goBack} />
        </div>
      </div>
    )
  }

  if (activeScreen?.screen === 'commission-settings') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Users" />
        <CommissionSettings onBack={goBack} />
      </div>
    )
  }

  if (activeScreen?.screen === 'bonus-rules') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Users" />
        <BonusRulesScreen onBack={goBack} />
      </div>
    )
  }

  if (activeScreen?.screen === 'customers-mgmt') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Customers" />
        <CustomersAdmin
          customers={customers}
          onAddCustomer={onAddCustomer}
          onPatchCustomer={onPatchCustomer}
          onArchiveCustomer={onArchiveCustomer}
          posSession={posSession}
        />
      </div>
    )
  }

  if (activeScreen?.screen === 'crm-settings') {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Customers" />
        <CRMSettings />
      </div>
    )
  }

  // Coming soon overlay for non-implemented screens
  if (activeScreen && !activeScreen.screen) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
        <AdminHeader goBack={goBack} onClose={onClose} backLabel="← Back" />
        <div style={{ flex: 1, position: 'relative', display: 'flex' }}>
          <ComingSoon label={currentItem?.label} moduleColor={currentModule?.color} onBack={goBack} />
        </div>
      </div>
    )
  }

  // ── Main dashboard ────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#030e1e', zIndex: 1000, display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        height: 50, background: '#0d1526', borderBottom: `2px solid ${PURPLE}`,
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 14, flexShrink: 0
      }}>
        <span style={{ fontWeight: 800, fontSize: 15, color: '#93c5fd', letterSpacing: 2 }}>{SYSTEM_NAME}</span>
        <div style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.35)', borderRadius: 6, padding: '3px 10px', fontSize: 10, fontWeight: 700, color: '#c4b5fd', letterSpacing: 1.5 }}>
          ADMIN
        </div>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>Management</span>
        {activeModule && (
          <>
            <span style={{ color: '#94a3b8' }}>›</span>
            <span style={{ color: currentModule?.color, fontSize: 12, fontWeight: 600 }}>
              {currentModule?.icon} {currentModule?.label}
            </span>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <HeaderBtn onClick={onClose}>← Exit Admin</HeaderBtn>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT — module tiles */}
        <div style={{
          width: 260, background: '#0d1526', borderRight: '1px solid #253349',
          display: 'flex', flexDirection: 'column', padding: 20, gap: 12, flexShrink: 0,
          overflowY: 'auto'
        }}>
          <p style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
            MODULES
          </p>
          {MODULES.map(mod => {
            const isActive = activeModule === mod.id
            return (
              <button
                key={mod.id}
                onClick={() => { setActiveModule(mod.id); setActiveScreen(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px 16px',
                  background: isActive ? mod.color + '12' : '#111d30',
                  border: `1px solid ${isActive ? mod.color : '#253349'}`,
                  borderLeft: `4px solid ${isActive ? mod.color : '#253349'}`,
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.borderColor = mod.color; e.currentTarget.style.borderLeftColor = mod.color; e.currentTarget.style.boxShadow = `0 0 16px ${mod.color}18` } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.borderLeftColor = '#253349'; e.currentTarget.style.boxShadow = 'none' } }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: isActive ? mod.color + '22' : '#111d30',
                  border: `1px solid ${isActive ? mod.color + '44' : '#253349'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0
                }}>
                  {mod.icon}
                </div>
                <div>
                  <p style={{ color: isActive ? '#f1f5f9' : '#cbd0e0', fontWeight: isActive ? 700 : 500, fontSize: 14 }}>
                    {mod.label}
                  </p>
                  <p style={{ color: '#94a3b8', fontSize: 10, marginTop: 2 }}>
                    {mod.submenu.length} options
                  </p>
                </div>
                {isActive && (
                  <span style={{ marginLeft: 'auto', color: mod.color, fontSize: 16 }}>›</span>
                )}
              </button>
            )
          })}
        </div>

        {/* RIGHT — submenu or welcome */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {!activeModule && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
              background: 'radial-gradient(ellipse at center, rgba(139,92,246,0.04) 0%, transparent 70%)',
            }}>
              <div style={{ fontSize: 56, opacity: 0.2 }}>⚙️</div>
              <p style={{ fontSize: 20, fontWeight: 800, color: '#253349', letterSpacing: 2 }}>MANAGEMENT</p>
              <p style={{ fontSize: 13, color: '#415569' }}>Select a module on the left to get started</p>
            </div>
          )}

          {activeModule && currentModule && (
            <>
              {/* Module header bar */}
              <div style={{
                padding: '20px 28px 16px', borderBottom: '1px solid rgba(30,41,59,0.6)', flexShrink: 0,
                background: `linear-gradient(135deg, ${currentModule.color}08 0%, #0d1526 60%)`,
                borderLeft: `4px solid ${currentModule.color}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 28 }}>{currentModule.icon}</span>
                  <div>
                    <h2 style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 800, letterSpacing: 0.5 }}>
                      {currentModule.label}
                    </h2>
                    <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 2 }}>
                      {currentModule.submenu.length} available options
                    </p>
                  </div>
                </div>
              </div>

              {/* Submenu list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {currentModule.submenu.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveScreen(item)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14,
                        padding: '16px 18px',
                        background: '#111d30', border: '1px solid #253349',
                        borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = '#0d1526'
                        e.currentTarget.style.borderColor = currentModule.color + '66'
                        e.currentTarget.style.boxShadow = `0 0 16px ${currentModule.color}10`
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = '#111d30'
                        e.currentTarget.style.borderColor = '#253349'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: currentModule.color,
                        boxShadow: `0 0 6px ${currentModule.color}88`
                      }} />
                      <span style={{ color: '#cbd0e0', fontSize: 14, fontWeight: 500 }}>{item.label}</span>
                      <span style={{ marginLeft: 'auto', color: '#94a3b8', fontSize: 16 }}>›</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
