/**
 * salesStorage.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Local sales persistence and the small localStorage invoice counter.
 * Used by: useSales hook, Receipts, InventoryAdmin.
 *
 * Production uses IndexedDB; demo mode continues to use localStorage.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { KEY_SALES, KEY_INVOICE_COUNTER } from './storageKeys'
import { normalizeSale } from '../domain/adapters/legacySale'
import { writeCheckoutCache, CHECKOUT_CACHE_ERROR } from './checkoutCache'
import { openLocalSalesDb, readLocalSales, writeLocalSales, migrateLegacySales } from './localSalesDb'
import { isDemoMode } from '../demo/demoSeed'
import { getClientConfig } from '../services/clientConfig'

let database
let localSales = null
let storageError = false
let writes = Promise.resolve()
export const hasSalesStorageError = () => storageError
function reportStorageError(error) {
  storageError = true
  console.warn('[Fluxe] Local sales write failed.', { errorType: error?.name || 'UnknownError' })
  window.dispatchEvent(new Event(CHECKOUT_CACHE_ERROR))
}

export async function initializeSalesStorage() {
  if (isDemoMode()) return
  try {
    const config = getClientConfig()
    if (!config.supabaseUrl || !config.machineEmail) return
    const scope = encodeURIComponent(`${config.supabaseUrl}|${config.orgId || config.machineEmail}`)
    database = await openLocalSalesDb(indexedDB, `fluxe-local-sales-v1:${scope}`)
    await migrateLegacySales(database, localStorage, KEY_SALES)
    localSales = await readLocalSales(database)
  } catch (error) { reportStorageError(error) }
}


// ── Sales array ───────────────────────────────────────────────────────────────

/**
 * Read the local records loaded during startup (not the entire cloud history).
 * Each invoice is normalized to the canonical Sale shape
 * (guarantees payments[], status, tip, locationId, employeeId, etc.).
 *
 * @returns {import('../domain/models/sale').Sale[]}
 */
export function loadAllSales() {
  try {
    if (!isDemoMode() && localSales !== null) return localSales.map(normalizeSale)
    const raw = localStorage.getItem(KEY_SALES)
    const list = raw ? JSON.parse(raw) : []
    return list.map(normalizeSale)
  } catch {
    return []
  }
}

/**
 * Persist only changed local records, retaining every other stored record.
 *
 * @param {object[]} sales
 */
// Only changed kiosk records are written; remote report history stays in memory.
export function persistSaleChanges(sales, removeNumbers = []) {
  const snapshot = JSON.parse(JSON.stringify(sales))
  if (isDemoMode()) {
    const retained = loadAllSales().filter(s => !removeNumbers.map(String).includes(String(s.number)))
    const merged = new Map(retained.map(s => [String(s.number), s]))
    snapshot.forEach(s => merged.set(String(s.number), s))
    return Promise.resolve(writeCheckoutCache(localStorage, KEY_SALES, [...merged.values()], reportStorageError))
  }
  const retained = (localSales || loadAllSales()).filter(s => !removeNumbers.map(String).includes(String(s.number)))
  const merged = new Map(retained.map(s => [String(s.number), s]))
  snapshot.forEach(s => merged.set(String(s.number), s))
  localSales = [...merged.values()]
  const task = writes.then(async () => {
    if (!database) throw new Error('Local sales database unavailable')
    await writeLocalSales(database, snapshot, { removeNumbers })
    return true
  })
  writes = task.catch(error => { reportStorageError(error); return false })
  return writes
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
