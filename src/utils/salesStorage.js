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
 *
 * Per-kiosk isolation: set VITE_INVOICE_SEED in .env to a unique starting
 * point for each physical device so invoice numbers never collide:
 *   Kiosk A  →  VITE_INVOICE_SEED=60000  (invoices 60001, 60002 …)
 *   Kiosk B  →  VITE_INVOICE_SEED=70000  (invoices 70001, 70002 …)
 *
 * The counter is always the maximum of (stored value, seed), so:
 *   - A fresh device starts exactly at seed + 1.
 *   - An existing device that already has a counter above seed continues
 *     from where it left off (no backwards jump, no gaps).
 *   - If a device's counter is ever below seed (e.g. wrong config applied),
 *     the seed acts as a floor and corrects it forward on the next sale.
 *
 * @returns {number}
 */
export function nextInvoiceNumber() {
  const seed    = parseInt(import.meta.env.VITE_INVOICE_SEED || '60000', 10)
  const stored  = parseInt(localStorage.getItem(KEY_INVOICE_COUNTER) || '0',  10)
  const current = Math.max(stored, seed)
  const next    = current + 1
  localStorage.setItem(KEY_INVOICE_COUNTER, String(next))
  return next
}
