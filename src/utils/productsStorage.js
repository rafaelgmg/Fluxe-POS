/**
 * productsStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure storage functions for the product catalogue.
 * Used by: useProducts hook, AdminPanel, InventoryAdmin, LocationReport.
 *
 * Supabase migration point: replace the body of loadAllProducts /
 * saveAllProducts with Supabase client calls — all callers stay the same.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_PRODUCTS } from './storageKeys'
import { normalizeProduct } from '../domain/adapters/legacyProduct'

/**
 * Load all products from storage.
 * Returns [] when nothing is saved — Supabase hydrates the list on boot.
 * Each product is normalized to the canonical shape (guarantees qtyByLoc, status, etc.).
 *
 * @returns {import('../domain/models/product').Product[]}
 */
export function loadAllProducts() {
  try {
    const raw = localStorage.getItem(KEY_PRODUCTS)
    if (!raw) return []
    return JSON.parse(raw).map(normalizeProduct)
  } catch {
    return []
  }
}

/**
 * Persist the full products array.
 *
 * @param {object[]} products
 */
export function saveAllProducts(products) {
  try {
    localStorage.setItem(KEY_PRODUCTS, JSON.stringify(products))
  } catch {}
}
