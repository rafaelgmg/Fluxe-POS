/**
 * useCart.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Manages all cart state and item-level interactions for the POS.
 *
 * Responsibilities:
 *  - Cart items array (add / edit / remove / clear / load)
 *  - EditItemModal open/close state and pending product
 *  - Out-of-stock check before opening the edit modal
 *  - Barcode → product lookup → open edit modal
 *  - Derived totals: cartSubtotal, cartTotalSpare
 *
 * NOT responsible for:
 *  - Frozen sales (they also touch localStorage + App state)
 *  - Payment processing
 *  - Inventory decrement (happens after sale confirmation)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react'
import { PRODUCT_BY_BARCODE } from '../data/mockData'
import { loadLocationConfig } from '../utils/locationConfig'
import { parseBarcode } from '../utils/parseBarcode'
import { sumItemSpare } from '../utils/spareUtils'

/**
 * @param {object}   params
 * @param {object[]} params.products  - live product list (from App state, reflects current stock)
 * @param {string}   params.location  - active POS location name (for blockSaleOutOfStock check)
 */
export function useCart({ products, location }) {

  // ── Core state ─────────────────────────────────────────────────────────────
  const [cart,           setCart]           = useState([])
  const [cartError,      setCartError]      = useState(null)  // out-of-stock block message

  // ── EditItemModal state ────────────────────────────────────────────────────
  const [showEdit,       setShowEdit]       = useState(false)
  const [pendingProduct, setPendingProduct] = useState(null)
  const [editingCartIdx, setEditingCartIdx] = useState(null)  // null = new item | N = editing index

  // ── Derived totals (recomputed on every cart change) ──────────────────────
  const cartSubtotal   = cart.reduce((s, i) => s + (i.subtotal || 0), 0)
  const cartTotalSpare = sumItemSpare(cart)

  // ── Open EditItemModal for a product ──────────────────────────────────────
  const openEditModal = useCallback((product) => {
    const locCfg = loadLocationConfig(location)
    if (locCfg?.blockSaleOutOfStock && (product.qty ?? 1) <= 0) {
      setCartError(`"${product.name}" is out of stock and cannot be added to this sale.`)
      setTimeout(() => setCartError(null), 4000)
      return
    }
    setEditingCartIdx(null)
    setPendingProduct(product)
    setShowEdit(true)
  }, [location])

  // ── Close EditItemModal without saving ────────────────────────────────────
  const closeEditModal = useCallback(() => {
    setShowEdit(false)
    setPendingProduct(null)
    setEditingCartIdx(null)
  }, [])

  // ── Open EditItemModal for an existing cart item ──────────────────────────
  const handleEditCartItem = useCallback((idx) => {
    const item = cart[idx]
    if (!item || item.exchangeType) return  // exchange lines are not editable
    setEditingCartIdx(idx)
    setPendingProduct({ ...item.product, _cartPrice: item.salePrice })
    setShowEdit(true)
  }, [cart])

  // ── Barcode scan → product lookup → open edit modal ───────────────────────
  const handleBarcodeScanned = useCallback((rawCode) => {
    const { cleanBarcode, minPrice } = parseBarcode(rawCode)
    const base = PRODUCT_BY_BARCODE[cleanBarcode]
    if (!base) return
    // Use live product from state so qty reflects recent sales
    const live = products.find(p => p.barcode === cleanBarcode) || base
    const productWithPrice = minPrice !== null ? { ...live, minPrice } : live
    openEditModal(productWithPrice)
  }, [products, openEditModal])

  // ── Add / update item from EditItemModal ──────────────────────────────────
  const handleAddToCart = useCallback((item) => {
    if (editingCartIdx !== null) {
      setCart(prev => prev.map((c, i) => i === editingCartIdx ? item : c))
      setEditingCartIdx(null)
    } else {
      setCart(prev => [...prev, item])
    }
    setShowEdit(false)
    setPendingProduct(null)
  }, [editingCartIdx])

  // ── Add exchange / return line ─────────────────────────────────────────────
  const handleExchange = useCallback(({ type, product }) => {
    setCart(prev => [...prev, {
      product,
      qty:         -1,
      salePrice:   0,
      systemPrice: product.systemPrice,
      discount:    product.systemPrice,
      subtotal:    0,
      spare:       type === 'return' ? product.minPrice : 0,
      exchangeType: type,
    }])
    setShowEdit(false)
    setPendingProduct(null)
  }, [])

  // ── Remove item by index ───────────────────────────────────────────────────
  const handleRemoveFromCart = useCallback((idx) => {
    setCart(prev => prev.filter((_, i) => i !== idx))
  }, [])

  // ── Clear cart (used by finalizeSale after sale is saved) ─────────────────
  const clearCart = useCallback(() => setCart([]), [])

  // ── Load a full cart (used by handleResumeFrozen) ─────────────────────────
  const loadCartItems = useCallback((items) => setCart(items), [])

  return {
    // State
    cart,
    cartError,
    cartSubtotal,
    cartTotalSpare,
    // EditItemModal state
    showEdit,
    pendingProduct,
    editingCartIdx,
    // Handlers
    openEditModal,
    closeEditModal,
    handleEditCartItem,
    handleBarcodeScanned,
    handleAddToCart,
    handleExchange,
    handleRemoveFromCart,
    clearCart,
    loadCartItems,
  }
}
