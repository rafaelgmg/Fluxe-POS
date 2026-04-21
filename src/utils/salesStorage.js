/**
 * salesStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure storage functions for sales/invoices and the invoice counter.
 * Used by: useSales hook, Receipts, InventoryAdmin.
 *
 * Supabase migration point: replace loadAllSales / persistAllSales /
 * nextInvoiceNumber with Supabase client calls — all callers stay the same.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_SALES, KEY_INVOICE_COUNTER } from './storageKeys'
import { normalizeSale } from '../domain/adapters/legacySale'

// ── Sales array ───────────────────────────────────────────────────────────────

/**
 * Load all serialized invoices from storage.
 * Each invoice is normalized to the canonical Sale shape
 * (guarantees payments[], status, tip, locationId, employeeId, etc.).
 *
 * @returns {import('../domain/models/sale').Sale[]}
 */
export function loadAllSales() {
  try {
    const raw = localStorage.getItem(KEY_SALES)
    const list = raw ? JSON.parse(raw) : []
    return list.map(normalizeSale)
  } catch {
    return []
  }
}

/**
 * Overwrite the full sales array in storage.
 *
 * @param {object[]} sales
 */
export function persistAllSales(sales) {
  localStorage.setItem(KEY_SALES, JSON.stringify(sales))
}

// ── Invoice sequence ──────────────────────────────────────────────────────────

/**
 * Return the next sequential invoice number and advance the counter.
 * Reads and writes synchronously — safe for single-tab use.
 *
 * Supabase migration: replace with a server-side sequence call (e.g.
 * a Postgres sequence or a row-level counter in a dedicated table) so
 * numbers remain gap-free and collision-free across devices.
 *
 * @returns {number}
 */
export function nextInvoiceNumber() {
  const current = parseInt(localStorage.getItem(KEY_INVOICE_COUNTER) || '60000', 10)
  const next = current + 1
  localStorage.setItem(KEY_INVOICE_COUNTER, String(next))
  return next
}
