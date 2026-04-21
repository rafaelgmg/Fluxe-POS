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

import { PRODUCTS as INITIAL_PRODUCTS } from '../data/mockData'
import { KEY_PRODUCTS } from './storageKeys'
import { normalizeProduct } from '../domain/adapters/legacyProduct'

/**
 * Load all products from storage.
 * Falls back to INITIAL_PRODUCTS (mockData) on first run or parse error.
 * Each product is normalized to the canonical shape (guarantees qtyByLoc, status, etc.).
 *
 * @returns {import('../domain/models/product').Product[]}
 */
export function loadAllProducts() {
  try {
    const raw = localStorage.getItem(KEY_PRODUCTS)
    const list = raw ? JSON.parse(raw) : INITIAL_PRODUCTS
    return list.map(normalizeProduct)
  } catch {
    return INITIAL_PRODUCTS.map(normalizeProduct)
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
