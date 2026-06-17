/**
 * supabaseWrite.js — Phases 2 & 3: payload builders + INSERT functions.
 *
 * Phase 2: builders that convert the frontend invoice shape to snake_case
 *   Supabase rows (no HTTP calls — used for payload validation).
 *
 * Phase 3: INSERT functions that write a sale atomically across 3 tables.
 *   writeSaleToSupabase(serialized) is the single entry point for saveSale().
 *
 * INSERT order (must be sequential — FK dependency):
 *   1. INSERT sales        → returns { id, number } from sequence
 *   2. INSERT sale_items   → requires sale_id from step 1
 *   3. INSERT payments     → requires sale_id from step 1
 *   Steps 2 & 3 run in parallel once sale_id is known.
 *
 * Atomicity risk (Phase 3):
 *   The 3 INSERTs are NOT wrapped in a transaction. If sale_items or payments
 *   fail after sales succeeds, a partial sale row exists in Supabase.
 *   Mitigation: the local localStorage copy is always the source of truth.
 *   Full atomicity via a Postgres RPC function is planned for a future phase.
 *
 * inventory_movements:
 *   NOT written in this phase. The `delta` column is GENERATED ALWAYS AS
 *   (qty_after - qty_before) STORED — never include it in any INSERT.
 *
 * employee_id:
 *   Stored as UUID only when the login layer provides one (Phase 6+).
 *   Until then: employee_id = null, employee_name snapshot is preserved.
 *   The schema allows null employee_id, so no FK violation occurs.
 */

import { getLocationUUID, getOrgId, isSupabaseConfigured } from './supabaseRead'
import { getAccessToken } from './supabaseSession'
import { awaitOrgSession } from './supabaseAuth'

// ── HTTP layer ────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function authBearer() { return getAccessToken() || SUPABASE_KEY }

/**
 * POST to a Supabase REST table endpoint.
 * prefer='return=representation' → returns the inserted row(s) as JSON.
 * prefer='return=minimal'        → returns nothing (201, empty body).
 */
async function sbPost(path, body, prefer = 'return=minimal') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method:  'POST',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${authBearer()}`,
      'Content-Type':  'application/json',
      Prefer:          prefer,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase POST ${res.status} at ${path}: ${text}`)
  }
  if (prefer === 'return=representation') {
    const data = await res.json()
    // PostgREST returns an array; unwrap single-object inserts
    return Array.isArray(data) ? data[0] : data
  }
  return null
}

// ── Table INSERT functions ────────────────────────────────────────────────────

/**
 * Insert one sale row. Returns the full inserted row including server-assigned
 * { id (UUID), number (from sequence) }.
 */
async function insertSale(saleRow) {
  return sbPost('/sales', saleRow, 'return=representation')
}

/** Insert sale_items rows (batch). Returns null (minimal response). */
async function insertSaleItems(itemRows) {
  if (!itemRows?.length) return null
  return sbPost('/sale_items', itemRows, 'return=minimal')
}

/** Insert payments rows (batch). Returns null (minimal response). */
async function insertPayments(paymentRows) {
  if (!paymentRows?.length) return null
  return sbPost('/payments', paymentRows, 'return=minimal')
}

/**
 * PATCH a Supabase REST table endpoint.
 * Uses `return=minimal` — no body expected on success.
 */
async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${authBearer()}`,
      'Content-Type':  'application/json',
      Prefer:          'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase PATCH ${res.status} at ${path}: ${text}`)
  }
  return null
}

// ── EOD Notes upsert ─────────────────────────────────────────────────────────

/**
 * Upsert EOD notes for a specific location and date.
 * Uses PostgREST upsert (POST + Prefer: resolution=merge-duplicates) against
 * the unique constraint (organization_id, location_name, report_date).
 *
 * @param {{ locationName: string, date: Date, notes: string, updatedBy?: string }}
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function upsertEODNotes({ locationName, date, notes, updatedBy = null }) {
  if (!isSupabaseConfigured()) return false
  try {
    await awaitOrgSession()
    const orgId   = await getOrgId()
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const res = await fetch(`${SUPABASE_URL}/rest/v1/eod_notes?on_conflict=organization_id,location_name,report_date`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${authBearer()}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        organization_id: orgId,
        location_name:   locationName,
        report_date:     dateStr,
        notes,
        updated_by:      updatedBy,
        updated_at:      new Date().toISOString(),
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[Fluxe] upsertEODNotes failed:', res.status, text)
      return false
    }
    return true
  } catch (err) {
    console.warn('[Fluxe] upsertEODNotes error:', err.message)
    return false
  }
}

// ── Category sync ─────────────────────────────────────────────────────────────

/**
 * Upsert all categories to Supabase in a single batch call.
 * Uses on_conflict=organization_id,name so the operation is idempotent.
 * Fire-and-forget safe — failure only means categories stay localStorage-only.
 *
 * @param {object[]} cats  Full category array from categoriesStorage
 * @returns {Promise<{[name:string]: string}|null>} name→supabaseId map, or null on failure
 */
export async function syncAllCategoriesToSupabase(cats) {
  if (!isSupabaseConfigured() || !cats?.length) return null
  try {
    await awaitOrgSession()
    const orgId = await getOrgId()
    const rows = cats.map((cat, i) => ({
      organization_id: orgId,
      name:            cat.name,
      status:          cat.status          || 'active',
      sort_index:      cat.sortIndex       ?? i,
      commission_rate: cat.commissionRate  ?? null,
      commission_type: cat.commissionType  ?? null,
      notes:           cat.notes           || '',
    }))
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/categories?on_conflict=organization_id,name`,
      {
        method: 'POST',
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  `Bearer ${authBearer()}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify(rows),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[Fluxe] syncAllCategoriesToSupabase failed:', res.status, text)
      return null
    }
    const inserted = await res.json()
    if (!Array.isArray(inserted)) return null
    const uuidMap = {}
    for (const r of inserted) if (r.name && r.id) uuidMap[r.name] = r.id
    return uuidMap
  } catch (err) {
    console.warn('[Fluxe] syncAllCategoriesToSupabase error:', err.message)
    return null
  }
}

// ── Location config upsert ───────────────────────────────────────────────────

/**
 * Upsert a location config to Supabase.
 * Stores the full config JSONB so any device can pull it on boot.
 * Fire-and-forget — localStorage is updated first by the caller.
 *
 * @param {object} loc  Full location config object (must have .id and .name)
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function writeLocationConfigToSupabase(loc) {
  if (!isSupabaseConfigured()) return false
  try {
    await awaitOrgSession()
    const orgId = await getOrgId()

    // 1. Upsert into `locations` (required for FK references in inventory_transfers).
    //    Uses on_conflict=organization_id,name so it's safe to call repeatedly.
    await fetch(
      `${SUPABASE_URL}/rest/v1/locations?on_conflict=organization_id,name`,
      {
        method: 'POST',
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  `Bearer ${authBearer()}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          organization_id: orgId,
          name:            loc.name,
          address:         loc.address || '',
          tax_rate:        loc.taxRate  || 8.5,
          status:          loc.active === false ? 'inactive' : 'active',
          updated_at:      loc.updatedAt || new Date().toISOString(),
        }),
      }
    ).catch(() => {})  // non-fatal — location_configs is source of truth

    // 2. Upsert into `location_configs` (full extended config blob)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/location_configs?on_conflict=organization_id,location_id`,
      {
        method: 'POST',
        headers: {
          apikey:         SUPABASE_KEY,
          Authorization:  `Bearer ${authBearer()}`,
          'Content-Type': 'application/json',
          Prefer:         'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          organization_id: orgId,
          location_id:     loc.id,
          location_name:   loc.name,
          location_type:   loc.location_type || 'retail',
          config:          loc,
          updated_at:      loc.updatedAt || new Date().toISOString(),
        }),
      }
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[Fluxe] writeLocationConfigToSupabase failed:', res.status, text)
      return false
    }
    return true
  } catch (err) {
    console.warn('[Fluxe] writeLocationConfigToSupabase error:', err.message)
    return false
  }
}

/**
 * Create a transfer draft in inventory_transfers with status='draft'.
 * Does NOT touch inventory_stock or inventory_movements.
 *
 * @returns {Promise<string|null>} draft UUID or null on failure
 */
export async function createTransferDraft({ productId, productName, barcode, qty, fromLocationUUID, fromLocationName, toLocationUUID, toLocationName, createdBy = 'Dashboard Owner', note = '' }) {
  if (!isSupabaseConfigured()) return null
  if (!fromLocationUUID || !toLocationUUID) return null
  try {
    await awaitOrgSession()
    const orgId = await getOrgId()
    const row   = await sbPost('/inventory_transfers', {
      organization_id:    orgId,
      from_location_id:   fromLocationUUID,
      from_location_name: fromLocationName,
      to_location_id:     toLocationUUID,
      to_location_name:   toLocationName,
      product_id:         productId,
      product_name:       productName,
      barcode:            barcode || '',
      qty,
      note:               note || '',
      sent_by:            createdBy,
      created_by:         createdBy,
      status:             'draft',
    }, 'return=representation')
    return row?.id || null
  } catch (err) {
    console.warn('[Fluxe] createTransferDraft failed:', err.message)
    return null
  }
}

/**
 * Complete a draft transfer: deduct from origin, add to destination, mark received.
 * Reuses the same logic as sendTransfer + receiveTransfer.
 *
 * @param {object} draft  Row from inventory_transfers (must have id, product_id, qty, etc.)
 * @returns {Promise<boolean>}
 */
export async function completeDraftTransfer(draft) {
  if (!isSupabaseConfigured()) return false
  try {
    const { id, product_id, from_location_id, to_location_id, qty } = draft

    // Fetch origin stock
    const fromRows = await sbGet(
      `/inventory_stock?product_id=eq.${product_id}&location_id=eq.${from_location_id}&select=qty&limit=1`
    )
    const fromBefore = fromRows?.[0]?.qty ?? 0
    const fromAfter  = Math.max(0, fromBefore - qty)

    // Fetch destination stock
    const toRows = await sbGet(
      `/inventory_stock?product_id=eq.${product_id}&location_id=eq.${to_location_id}&select=qty&limit=1`
    )
    const toBefore = toRows?.[0]?.qty ?? 0

    const orgId = await getOrgId()

    // Deduct from origin
    await sbPatch(
      `/inventory_stock?product_id=eq.${product_id}&location_id=eq.${from_location_id}`,
      { qty: fromAfter }
    )

    // Add to destination
    await sbPatch(
      `/inventory_stock?product_id=eq.${product_id}&location_id=eq.${to_location_id}`,
      { qty: toBefore + qty }
    )

    // Insert inventory_movements for origin side
    await sbPost('/inventory_movements', [{
      organization_id:    orgId,
      product_id,
      location_id:        from_location_id,
      to_location_id,
      type:               'transfer',
      qty_before:         fromBefore,
      qty_after:          fromAfter,
      note:               `Transfer to ${draft.to_location_name || ''} — from Dashboard draft`,
      product_name_snap:  draft.product_name || '',
      barcode_snap:       draft.barcode      || '',
      location_name_snap: draft.from_location_name || '',
      performed_by_snap:  draft.created_by   || 'Dashboard Owner',
    }], 'return=minimal')

    // Mark as received
    await sbPatch(`/inventory_transfers?id=eq.${id}`, {
      status:      'received',
      received_at: new Date().toISOString(),
    })

    return true
  } catch (err) {
    console.warn('[Fluxe] completeDraftTransfer failed:', err.message)
    return false
  }
}

/**
 * Cancel a draft transfer (marks status='cancelled', no stock changes).
 * @param {string} draftId
 * @returns {Promise<boolean>}
 */
export async function cancelTransferDraft(draftId) {
  if (!isSupabaseConfigured() || !draftId) return false
  try {
    await sbPatch(`/inventory_transfers?id=eq.${draftId}`, { status: 'cancelled' })
    return true
  } catch (err) {
    console.warn('[Fluxe] cancelTransferDraft failed:', err.message)
    return false
  }
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP = {
  normal:    'completed',  // legacy localStorage value
  completed: 'completed',
  deleted:   'voided',     // legacy localStorage value
  voided:    'voided',
}

// ── UUID validation ───────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUUID(v) {
  return typeof v === 'string' && UUID_RE.test(v)
}

// ── Payment method normalization ──────────────────────────────────────────────

function resolveMethod(m) {
  if (!m) return 'cash'
  const lower = m.toLowerCase()
  if (lower === 'cash')           return 'cash'
  if (lower.includes('card'))     return 'card'
  if (lower.includes('external')) return 'external'
  if (lower.includes('check'))    return 'check'
  return lower
}

// ── Legacy payment fallback ───────────────────────────────────────────────────

function buildPaymentsFromLegacy(invoice) {
  const method = invoice.paymentMethod
  if (!method || method === 'split') return []
  const normalized = resolveMethod(method)
  const p = { method: normalized, amount: invoice.total ?? 0 }
  if (normalized === 'cash') {
    p.amountReceived = invoice.amountReceived ?? invoice.total ?? 0
    p.changeDue      = invoice.changeDue      ?? 0
  } else if (normalized === 'card') {
    p.cardBrand           = invoice.cardBrand           ?? ''
    p.cardLast4           = invoice.cardLast4           ?? ''
    p.authorizationNumber = invoice.authorizationNumber ?? ''
  } else if (normalized === 'external') {
    p.externalRef = invoice.externalRef ?? ''
  } else if (normalized === 'check') {
    p.checkNumber = invoice.checkNumber ?? ''
  }
  return [p]
}

// ── Public builders ───────────────────────────────────────────────────────────

/**
 * Build the `sales` row for INSERT.
 *
 * Omits: id (auto), number (auto via sequence), created_at, updated_at.
 * Phase 3: pass orgId from getOrgId(). After INSERT, use the returned
 * { id, number } to fill sale_items and payments rows.
 *
 * @param {object} invoice  Serialized invoice from saveSale
 * @param {string} orgId    Organization UUID from getOrgId()
 * @returns {object}        sales row ready for INSERT
 */
export function toSupabaseSaleRow(invoice, orgId) {
  const soldAt = invoice.timestamp instanceof Date
    ? invoice.timestamp.toISOString()
    : (invoice.sold_at || invoice.timestamp || new Date().toISOString())

  return {
    organization_id:    orgId,
    number:             invoice.number              ?? null,
    status:             STATUS_MAP[invoice.status] ?? 'completed',
    sold_at:            soldAt,
    location_id:        getLocationUUID(invoice.locationId),  // null if cache miss (safe — nullable FK)
    location_name:      invoice.location            || '',
    employee_id:        isUUID(invoice.employeeId) ? invoice.employeeId : null,
    employee_name:      invoice.employee            || '',
    subtotal:           invoice.subtotal            ?? 0,
    tax:                invoice.tax                 ?? 0,
    tip:                invoice.tip                 ?? 0,
    total:              invoice.total               ?? 0,
    total_spare:        invoice.totalSpare          ?? 0,
    notes:              invoice.notes               ?? '',
    linked_customer_id: invoice.linkedCustomerId    ?? null,
    payment_method:      invoice.paymentMethod       || '',
    // Snapshot of per-method amounts — used by EOD when payments(*) join is unavailable
    payments_snapshot:   (invoice.payments || []).map(p => ({ method: p.method, amount: p.amount })),
    // commissionSnapshot stored in a JSONB column — Phase 5 decision
  }
}

/**
 * Build the `sale_items` rows for INSERT.
 * Call AFTER the sale INSERT returns the UUID.
 *
 * @param {object[]} items    invoice.items (serialized in saveSale)
 * @param {string}   saleId   UUID returned from sales INSERT
 * @param {string}   orgId    Organization UUID
 * @returns {object[]}
 */
export function toSupabaseSaleItemRows(items, saleId, orgId) {
  return (items || []).map(item => ({
    sale_id:       saleId,
    product_id:    isUUID(item.productId)  ? item.productId  : null,
    category_id:   isUUID(item.categoryId) ? item.categoryId : null,
    name:          item.name        || item.product?.name        || '',
    barcode:       item.barcode     || item.product?.barcode     || '',
    description:   item.description || item.product?.description || '',
    size:          item.size        || item.product?.size        || '',
    category_name: item.category    || item.product?.category    || '',
    qty:           item.qty         ?? 1,
    sale_price:    item.salePrice   ?? 0,
    system_price:  item.systemPrice ?? item.salePrice            ?? 0,
    min_price:     item.minPrice    ?? item.product?.minPrice    ?? 0,
    cost_price:    item.costPrice   ?? item.product?.costPrice   ?? 0,
    discount:      item.discount    ?? 0,
    subtotal:      item.subtotal    ?? 0,
    spare:         item.spare       ?? 0,
  }))
}

/**
 * Build the `payments` rows for INSERT.
 * Handles both new payments[] array and legacy flat fields.
 * Call AFTER the sale INSERT returns the UUID.
 *
 * @param {object} invoice   Full serialized invoice
 * @param {string} saleId    UUID returned from sales INSERT
 * @param {string} orgId     Organization UUID
 * @returns {object[]}
 */
export function toSupabasePaymentRows(invoice, saleId, orgId) {
  const payments = Array.isArray(invoice.payments) && invoice.payments.length > 0
    ? invoice.payments
    : buildPaymentsFromLegacy(invoice)

  return payments.map(p => {
    const row = {
      sale_id: saleId,
      method:  resolveMethod(p.method),
      amount:  p.amount ?? 0,
    }
    if (p.amountReceived      != null) row.amount_received      = p.amountReceived
    if (p.changeDue           != null) row.change_due           = p.changeDue
    if (p.cardBrand           != null) row.card_brand           = p.cardBrand    || null
    if (p.cardLast4           != null) row.card_last4           = /^[0-9]{4}$/.test(p.cardLast4) ? p.cardLast4 : null
    if (p.authorizationNumber != null) row.authorization_number = p.authorizationNumber || null
    if (p.externalRef         != null) row.external_ref         = p.externalRef  || null
    if (p.checkNumber         != null) row.check_number         = p.checkNumber  || null
    return row
  })
}

/**
 * Convenience: build all three row sets from a single invoice.
 * saleId is not known yet at call time — returns a factory that accepts it.
 *
 * Usage in Phase 3:
 *   const { saleRow, withSaleId } = prepareInvoicePayload(invoice, orgId)
 *   const { id: saleId, number } = await insertSale(saleRow)
 *   const { itemRows, paymentRows } = withSaleId(saleId)
 *   await Promise.all([insertSaleItems(itemRows), insertPayments(paymentRows)])
 */
export function prepareInvoicePayload(invoice, orgId) {
  const saleRow = toSupabaseSaleRow(invoice, orgId)
  const withSaleId = (saleId) => ({
    itemRows:    toSupabaseSaleItemRows(invoice.items, saleId, orgId),
    paymentRows: toSupabasePaymentRows(invoice, saleId, orgId),
  })
  return { saleRow, withSaleId }
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Write a complete sale to Supabase: sales + sale_items + payments.
 *
 * Returns the server-assigned invoice number on success, or null if Supabase
 * is unavailable / not configured. The caller must handle null gracefully
 * (the sale is already persisted locally before this is called).
 *
 * Flow:
 *   1. INSERT sales        → get { id: saleId, number: serverNumber }
 *   2. INSERT sale_items + payments in parallel using saleId
 *
 * employee_id is null when the login layer doesn't provide a UUID yet (Phase 6).
 * inventory_movements are NOT written here (Phase 4).
 *
 * @param {object} serialized  The serialized invoice from saveSale()
 * @returns {Promise<number|null>}  Server-assigned invoice number, or null on failure
 */
export async function writeSaleToSupabase(serialized) {
  if (!isSupabaseConfigured()) return { saleId: null, serverNumber: null }
  let orgId
  try {
    orgId = await getOrgId()
    const { saleRow, withSaleId } = prepareInvoicePayload(serialized, orgId)

    // Step 1: INSERT sale — blocks until we have the UUID and server number
    const inserted = await insertSale(saleRow)
    if (!inserted?.id) throw new Error('INSERT sales returned no id')

    const { id: saleId, number: serverNumber } = inserted

    // Step 2: INSERT items and payments in parallel
    const { itemRows, paymentRows } = withSaleId(saleId)
    await Promise.all([
      insertSaleItems(itemRows),
      insertPayments(paymentRows),
    ])

    return { saleId, serverNumber }
  } catch (err) {
    // FK violation on employee_id: local fallback returned a stale UUID not present in users.
    // Retry with employee_id = null — employee_name snapshot is preserved for all reports.
    if (orgId && err.message.includes('23503') && err.message.includes('employee_id_fkey')) {
      console.warn('[Fluxe] Sale has invalid employee_id UUID — retrying without FK link (name snapshot kept)')
      try {
        const { saleRow, withSaleId } = prepareInvoicePayload(serialized, orgId)
        const inserted = await insertSale({ ...saleRow, employee_id: null })
        if (!inserted?.id) throw new Error('Retry: INSERT sales returned no id')
        const { id: saleId, number: serverNumber } = inserted
        const { itemRows, paymentRows } = withSaleId(saleId)
        await Promise.all([insertSaleItems(itemRows), insertPayments(paymentRows)])
        return { saleId, serverNumber }
      } catch (retryErr) {
        console.warn('[Fluxe] Sale retry without employee_id also failed:', retryErr.message)
      }
    }
    console.warn('[Fluxe] Sale write to Supabase failed — local copy is source of truth:', err.message)
    return { saleId: null, serverNumber: null }
  }
}

/**
 * Write inventory_stock updates and inventory_movements to Supabase.
 * Called after writeSaleToSupabase resolves and returns a saleId.
 *
 * inventory_stock: PATCH qty for each (product_id, location_id) pair.
 * inventory_movements: INSERT one row per item; type='sale' requires sale_id IS NOT NULL.
 * delta must NEVER be in the INSERT — it is GENERATED ALWAYS AS (qty_after - qty_before).
 *
 * Silently skips products/locations that are not yet UUID-hydrated (localStorage-only items).
 *
 * @param {object[]} stockChanges  [{ productId, locationUUID, qtyBefore, qtyAfter }]
 * @param {object}   meta          { saleId, note, performedById }
 * @returns {Promise<void>}
 */
export async function writeInventoryToSupabase(stockChanges, meta) {
  if (!isSupabaseConfigured()) return
  if (!stockChanges?.length) return
  try {
    const orgId = await getOrgId()
    const { saleId, note = '', performedById = null } = meta

    // Only process rows where both IDs are valid Supabase UUIDs
    const valid = stockChanges.filter(sc => isUUID(sc.productId) && isUUID(sc.locationUUID))
    if (!valid.length) return

    // Step 1: PATCH inventory_stock qty (parallel per product-location pair)
    await Promise.all(valid.map(sc =>
      sbPatch(
        `/inventory_stock?product_id=eq.${sc.productId}&location_id=eq.${sc.locationUUID}`,
        { qty: sc.qtyAfter }
      )
    ))

    // Step 2: INSERT inventory_movements — requires sale_id for type='sale'
    if (!saleId) return

    const movementRows = valid.map(sc => ({
      organization_id:    orgId,
      product_id:         sc.productId,
      location_id:        sc.locationUUID,
      type:               'sale',
      qty_before:         sc.qtyBefore,
      qty_after:          sc.qtyAfter,
      // delta MUST NOT be included — GENERATED ALWAYS AS (qty_after - qty_before) STORED
      note,
      sale_id:            saleId,
      performed_by_id:    isUUID(performedById) ? performedById : null,
      product_name_snap:  sc.productName  || '',
      barcode_snap:       sc.barcode      || '',
      location_name_snap: sc.locationName || '',
      performed_by_snap:  '',
    }))

    await sbPost('/inventory_movements', movementRows, 'return=minimal')
  } catch (err) {
    console.warn('[Fluxe] Inventory write to Supabase failed — local copy is source of truth:', err.message)
  }
}

/**
 * Write a manual stock adjustment to Supabase (Update Count, Damage/Loss, Transfer receive).
 * Unlike writeInventoryToSupabase, this does NOT require a saleId.
 *
 * @param {object[]} stockChanges  [{ productId, locationUUID, qtyBefore, qtyAfter }]
 * @param {object}   meta          { type, note, performedById }
 *   type: 'adjustment' | 'removal' | 'transfer' | 'count_set' (inventory_movement_type ENUM)
 */
export async function writeStockAdjustment(stockChanges, { type = 'adjustment', note = '', performedById = null } = {}) {
  if (!isSupabaseConfigured()) return
  if (!stockChanges?.length) return
  try {
    const orgId = await getOrgId()
    const valid = stockChanges.filter(sc => isUUID(sc.productId) && isUUID(sc.locationUUID))
    if (!valid.length) return

    await Promise.all(valid.map(sc =>
      sbPatch(
        `/inventory_stock?product_id=eq.${sc.productId}&location_id=eq.${sc.locationUUID}`,
        { qty: sc.qtyAfter }
      )
    ))

    const movementRows = valid.map(sc => ({
      organization_id:    orgId,
      product_id:         sc.productId,
      location_id:        sc.locationUUID,
      type,
      qty_before:         sc.qtyBefore,
      qty_after:          sc.qtyAfter,
      note,
      performed_by_id:    isUUID(performedById) ? performedById : null,
      product_name_snap:  sc.productName  || '',
      barcode_snap:       sc.barcode      || '',
      location_name_snap: sc.locationName || '',
      performed_by_snap:  '',
    }))
    await sbPost('/inventory_movements', movementRows, 'return=minimal')
  } catch (err) {
    console.warn('[Fluxe] Stock adjustment failed — local copy is source of truth:', err.message)
  }
}

/**
 * Record a stock transfer between two locations.
 * Deducts from origin, creates transfer record, inserts inventory_movement.
 * The destination stock is updated when receiveTransfer() is called.
 */
export async function sendTransfer({ productId, productName, barcode, qty, fromLocationUUID, fromLocationName, toLocationUUID, toLocationName, sentBy, note }) {
  if (!isSupabaseConfigured()) return null
  if (!isUUID(productId) || !isUUID(fromLocationUUID) || !isUUID(toLocationUUID)) return null
  try {
    const orgId = await getOrgId()

    // Fetch current qty at origin
    const stockRows = await sbGet(
      `/inventory_stock?product_id=eq.${productId}&location_id=eq.${fromLocationUUID}&select=qty&limit=1`
    )
    const qtyBefore = stockRows?.[0]?.qty ?? 0
    const qtyAfter  = Math.max(0, qtyBefore - qty)

    // Deduct from origin
    await sbPatch(
      `/inventory_stock?product_id=eq.${productId}&location_id=eq.${fromLocationUUID}`,
      { qty: qtyAfter }
    )

    // Create transfer record
    const rows = await sbPost('/inventory_transfers', [{
      organization_id:    orgId,
      from_location_id:   fromLocationUUID,
      from_location_name: fromLocationName,
      to_location_id:     toLocationUUID,
      to_location_name:   toLocationName,
      product_id:         productId,
      product_name:       productName,
      barcode,
      qty,
      note:    note   || '',
      sent_by: sentBy || '',
      status:  'sent',
    }], 'return=representation')

    // Insert inventory_movement (origin side; type='transfer' requires to_location_id)
    await sbPost('/inventory_movements', [{
      organization_id:    orgId,
      product_id:         productId,
      location_id:        fromLocationUUID,
      to_location_id:     toLocationUUID,
      type:               'transfer',
      qty_before:         qtyBefore,
      qty_after:          qtyAfter,
      note:               `Transfer to ${toLocationName}${note ? ` — ${note}` : ''}`,
      product_name_snap:  productName,
      barcode_snap:       barcode,
      location_name_snap: fromLocationName,
      performed_by_snap:  sentBy || '',
    }], 'return=minimal')

    return Array.isArray(rows) ? rows[0]?.id : null
  } catch (err) {
    console.warn('[Fluxe] sendTransfer failed:', err.message)
    return null
  }
}

/**
 * Receive a pending transfer: add qty to destination inventory_stock
 * and mark the transfer record as received.
 */
export async function receiveTransfer(transfer) {
  if (!isSupabaseConfigured()) return false
  if (!isUUID(transfer?.product_id) || !isUUID(transfer?.to_location_id)) return false
  try {
    const { id, product_id, to_location_id, qty } = transfer

    // Fetch current qty at destination
    const stockRows = await sbGet(
      `/inventory_stock?product_id=eq.${product_id}&location_id=eq.${to_location_id}&select=qty&limit=1`
    )
    const qtyBefore = stockRows?.[0]?.qty ?? 0

    // Add to destination
    await sbPatch(
      `/inventory_stock?product_id=eq.${product_id}&location_id=eq.${to_location_id}`,
      { qty: qtyBefore + qty }
    )

    // Mark as received
    await sbPatch(`/inventory_transfers?id=eq.${id}`, {
      status:      'received',
      received_at: new Date().toISOString(),
    })

    return true
  } catch (err) {
    console.warn('[Fluxe] receiveTransfer failed:', err.message)
    return false
  }
}

// ── Internal GET helper ───────────────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey:        SUPABASE_KEY,
      Authorization: `Bearer ${authBearer()}`,
    },
  })
  if (!res.ok) throw new Error(`Supabase GET ${res.status} at ${path}`)
  return res.json()
}

// ── Void / Refund ─────────────────────────────────────────────────────────────

/**
 * Mark a sale as voided in Supabase, restore inventory_stock, and create
 * inventory_movements rows with type='refund'.
 *
 * Atomicity note:
 *   The three operations (PATCH sale, PATCH stock, INSERT movements) are NOT
 *   wrapped in a database transaction. Failure order and partial-success risks:
 *
 *   • If PATCH sale fails → nothing else runs (safest partial failure).
 *   • If PATCH stock fails after PATCH sale → sale is voided in Supabase but
 *     stock is not restored. Movements are not created. Manual correction needed.
 *   • If INSERT movements fails after PATCH stock → stock is restored but no
 *     audit trail. Sale is voided. No customer-visible harm; audit gap only.
 *
 *   Mitigation: the local copy (localStorage) is always updated first by the
 *   caller. A future phase can wrap this in a Postgres RPC for full atomicity.
 *
 * @param {object} invoice      Local invoice object (must have .items[], .number, .locationId)
 * @param {object} meta         { performedById?: string|null }
 */
export async function voidSaleInSupabase(invoice, meta = {}) {
  if (!isSupabaseConfigured()) return
  try {
    const orgId = await getOrgId()
    const { performedById = null } = meta

    // ── Step 1: Resolve Supabase sale UUID ────────────────────────────────────
    // Use supabaseId stored on the local record (set since Phase 8) first.
    // Fall back to querying by invoice number for older / offline-first sales.
    let saleId = isUUID(invoice.supabaseId) ? invoice.supabaseId : null
    if (!saleId) {
      const rows = await sbGet(`/sales?number=eq.${invoice.number}&select=id&limit=1`)
      saleId = rows[0]?.id || null
    }

    // ── Step 2: PATCH sale status → voided ────────────────────────────────────
    await sbPatch(`/sales?number=eq.${invoice.number}`, { status: 'voided' })

    // ── Steps 3–5: Restore inventory per item ─────────────────────────────────
    const items        = invoice.items || []
    const locationUUID = getLocationUUID(invoice.locationId)

    if (!isUUID(locationUUID)) {
      // Location UUID not in cache (sale was made offline or cache miss).
      // Sale is voided in Supabase; stock restoration skipped — document for ops.
      console.warn(
        `[Fluxe] voidSaleInSupabase: no locationUUID for locationId="${invoice.locationId}" — ` +
        `sale #${invoice.number} voided but inventory NOT restored. Manual correction may be needed.`
      )
      return
    }

    const validItems = items.filter(item => isUUID(item.productId))
    if (!validItems.length) return

    // Step 3: Fetch current qty (qty_before) per product at this location
    const stockData = await Promise.all(
      validItems.map(async item => {
        const rows = await sbGet(
          `/inventory_stock?product_id=eq.${item.productId}&location_id=eq.${locationUUID}&select=qty&limit=1`
        )
        return { item, qtyBefore: rows[0]?.qty ?? 0 }
      })
    )

    // Step 4: PATCH inventory_stock — restore qty (add back returned units)
    await Promise.all(
      stockData.map(({ item, qtyBefore }) =>
        sbPatch(
          `/inventory_stock?product_id=eq.${item.productId}&location_id=eq.${locationUUID}`,
          { qty: qtyBefore + (item.qty ?? 1) }
        )
      )
    )

    // Step 5: INSERT inventory_movements type='refund'
    // The CHECK constraint requires sale_id IS NOT NULL for type='refund'.
    // If we couldn't resolve saleId, skip movement rows (stock was still restored above).
    if (!saleId) {
      console.warn(
        `[Fluxe] voidSaleInSupabase: saleId unknown for invoice #${invoice.number} — ` +
        'stock restored but inventory_movements NOT created (refund requires sale_id).'
      )
      return
    }

    const movementRows = stockData.map(({ item, qtyBefore }) => ({
      organization_id:    orgId,
      product_id:         item.productId,
      location_id:        locationUUID,
      type:               'refund',
      qty_before:         qtyBefore,
      qty_after:          qtyBefore + (item.qty ?? 1),
      // delta is GENERATED ALWAYS AS (qty_after - qty_before) — never include it
      note:               `Void/Refund Invoice #${invoice.number}`,
      sale_id:            saleId,
      performed_by_id:    isUUID(performedById) ? performedById : null,
      product_name_snap:  item.productName || item.name || '',
      barcode_snap:       item.barcode     || '',
      location_name_snap: invoice.location || '',
      performed_by_snap:  meta.employeeName || '',
    }))

    await sbPost('/inventory_movements', movementRows, 'return=minimal')

  } catch (err) {
    console.warn('[Fluxe] voidSaleInSupabase failed — local state preserved:', err.message)
  }
}

/**
 * Re-export getOrgId for Phase 3 callers that need it alongside write functions.
 */
export { getOrgId }

// ── Product CRUD ──────────────────────────────────────────────────────────────

async function sbUpsert(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${authBearer()}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase UPSERT ${res.status} at ${path}: ${text}`)
  }
  return null
}

/**
 * Insert a new product + inventory_stock rows into Supabase.
 * Returns the Supabase UUID on success (use it as the product ID).
 * Returns null on failure — caller already saved to localStorage.
 */
export async function writeProductToSupabase(product) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const row = await sbPost('/products', {
      organization_id:     orgId,
      name:                product.name,
      description:         product.description  || '',
      barcode:             product.barcode,
      size:                product.size         || '',
      system_price:        product.systemPrice,
      min_price:           product.minPrice     ?? 0,
      cost_price:          product.costPrice    ?? 0,
      supplier_name:       product.supplierName || '',
      status:              product.status       || 'active',
      reorder_status:      product.reorderStatus      || 'reorderable',
      core_product:        product.coreProduct        ?? false,
      min_stock_target:    product.minStockTarget      ?? null,
      reorder_point:       product.reorderPoint       ?? null,
      target_days_of_stock: product.targetDaysOfStock ?? 14,
      lead_time_days:      product.leadTimeDays        ?? 7,
    }, 'return=representation')

    if (!row?.id) return null

    const stockRows = Object.entries(product.qtyByLoc || {})
      .map(([legacyLocId, qty]) => ({
        locUUID: getLocationUUID(legacyLocId),
        qty:     parseInt(qty) || 0,
      }))
      .filter(s => s.locUUID && s.qty > 0)
      .map(s => ({
        product_id:      row.id,
        location_id:     s.locUUID,
        organization_id: orgId,
        qty:             s.qty,
      }))

    if (stockRows.length) {
      await sbPost('/inventory_stock', stockRows, 'return=minimal')
    }

    return row.id
  } catch (err) {
    // Barcode already exists in Supabase (23505 unique constraint).
    // Fetch the existing UUID so the local record gets properly hydrated instead of failing.
    if (err.message.includes('23505')) {
      try {
        const orgId2 = await getOrgId()
        const rows = await sbGet(
          `/products?organization_id=eq.${orgId2}&barcode=eq.${encodeURIComponent(product.barcode)}&select=id&limit=1`
        )
        if (rows?.[0]?.id) return rows[0].id
      } catch {}
    }
    console.warn('[Fluxe] writeProductToSupabase failed — saved locally only:', err.message)
    return null
  }
}

/**
 * Update an existing product in Supabase (PATCH fields + upsert stock).
 * Only runs when product.id is a valid Supabase UUID.
 */
export async function updateProductInSupabase(product) {
  if (!isSupabaseConfigured() || !isUUID(product.id)) return
  try {
    const orgId = await getOrgId()

    await sbPatch(`/products?id=eq.${product.id}`, {
      name:                product.name,
      description:         product.description  || '',
      barcode:             product.barcode,
      size:                product.size         || '',
      system_price:        product.systemPrice,
      min_price:           product.minPrice     ?? 0,
      cost_price:          product.costPrice    ?? 0,
      supplier_name:       product.supplierName || '',
      status:              product.status       || 'active',
      reorder_status:      product.reorderStatus      || 'reorderable',
      core_product:        product.coreProduct        ?? false,
      min_stock_target:    product.minStockTarget      ?? null,
      reorder_point:       product.reorderPoint       ?? null,
      target_days_of_stock: product.targetDaysOfStock ?? 14,
      lead_time_days:      product.leadTimeDays        ?? 7,
    })

    const stockRows = Object.entries(product.qtyByLoc || {})
      .map(([legacyLocId, qty]) => ({
        locUUID: getLocationUUID(legacyLocId),
        qty:     parseInt(qty) || 0,
      }))
      .filter(s => s.locUUID)
      .map(s => ({
        product_id:      product.id,
        location_id:     s.locUUID,
        organization_id: orgId,
        qty:             s.qty,
      }))

    if (stockRows.length) {
      await sbUpsert('/inventory_stock', stockRows)
    }
  } catch (err) {
    console.warn('[Fluxe] updateProductInSupabase failed — local copy preserved:', err.message)
  }
}

// ── User CRUD ─────────────────────────────────────────────────────────────────

/**
 * Upload an optimized avatar File to Supabase Storage and update the user record.
 * Path: avatars/{orgId}/{supabaseUserId}.webp  (stable — PUT replaces in-place)
 * Appends ?v=timestamp to bust browser cache after re-upload.
 *
 * @param {string} supabaseUserId  User UUID in Supabase
 * @param {File}   file            Optimized WebP File from optimizeAvatarImage()
 * @returns {Promise<string|null>} Public URL with cache-buster, or null on failure
 */
export async function uploadUserAvatar(supabaseUserId, file) {
  if (!isSupabaseConfigured()) return null
  try {
    await awaitOrgSession().catch(() => null)
    const orgId = await getOrgId()
    const path  = `${orgId}/${supabaseUserId}.webp`
    const res   = await fetch(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      method:  'PUT',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${authBearer()}`,
        'Content-Type': 'image/webp',
        'x-upsert':     'true',
      },
      body: file,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Storage PUT ${res.status}: ${text}`)
    }
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}?v=${Date.now()}`
    await sbPatch(`/users?id=eq.${supabaseUserId}`, { avatar_url: publicUrl })
    return publicUrl
  } catch (err) {
    console.warn('[Fluxe] uploadUserAvatar failed:', err.message)
    return null
  }
}

/**
 * Delete a user's avatar from Supabase Storage and clear avatar_url in the DB.
 * @param {string} supabaseUserId
 */
export async function deleteUserAvatar(supabaseUserId) {
  if (!isSupabaseConfigured()) return
  try {
    await awaitOrgSession().catch(() => null)
    const orgId = await getOrgId()
    const path  = `${orgId}/${supabaseUserId}.webp`
    await fetch(`${SUPABASE_URL}/storage/v1/object/avatars`, {
      method:  'DELETE',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization:  `Bearer ${authBearer()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [path] }),
    })
    await sbPatch(`/users?id=eq.${supabaseUserId}`, { avatar_url: null })
  } catch (err) {
    console.warn('[Fluxe] deleteUserAvatar failed:', err.message)
  }
}

/**
 * Create or update a user in Supabase.
 * - New user (no supabaseId): POST → returns Supabase UUID to store locally
 * - Existing user (has supabaseId): PATCH by UUID → returns existing UUID
 * Silently no-ops when Supabase is not configured.
 * @returns {Promise<string|null>} Supabase UUID, or null on failure
 */
export async function upsertUserToSupabase(user) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const row = {
      organization_id: orgId,
      first_name:      user.firstName  || '',
      last_name:       user.lastName   || '',
      position:        user.position   || 'Sales',
      email:           user.email      || '',
      phone:           user.phone      || '',
      status:          user.status     || 'active',
      hourly_rate:     user.hourlyRate || 0,
    }
    // Sync avatar_url only when it's a real URL or an explicit removal (null).
    // Base64 data URLs from the old localStorage system are never written to the DB.
    const isRealUrl = typeof user.photo === 'string' && user.photo.startsWith('http')
    if (user.photo === null || isRealUrl) {
      row.avatar_url = user.photo || null
    }
    let supabaseId
    if (user.supabaseId) {
      await sbPatch(`/users?id=eq.${user.supabaseId}`, row)
      supabaseId = user.supabaseId
    } else {
      const inserted = await sbPost('/users', row, 'return=representation')
      supabaseId = inserted?.id ?? null
    }
    // Hash and store PIN server-side via RPC — plaintext never written to DB column.
    // Ensure machine account is authenticated first (set_user_pin requires `authenticated` role).
    if (supabaseId && user.pin) {
      await awaitOrgSession().catch(() => null)
      await sbPost('/rpc/set_user_pin', { p_user_id: supabaseId, p_plain_pin: user.pin })
        .catch(e => console.warn('[Fluxe] set_user_pin RPC failed:', e.message))
    }
    return supabaseId
  } catch (err) {
    console.warn('[Fluxe] upsertUserToSupabase failed:', err.message)
    return null
  }
}

/**
 * Update an employee's PIN locally and in Supabase (fire-and-forget on backend).
 * Called from ChangePinModal after identity is verified.
 *
 * @param {string} employeeName  Full name as stored in localStorage
 * @param {string} newPin        Plaintext new PIN
 */
export async function updateEmployeePin(employeeName, newPin) {
  const { loadUsers, saveUsers } = await import('../utils/usersStorage')
  const users = loadUsers()
  const idx   = users.findIndex(u => {
    const full = `${u.firstName} ${u.lastName}`.replace(/\s+/g, ' ').trim()
    return full === employeeName
  })
  if (idx === -1) throw new Error('Employee not found')

  users[idx] = { ...users[idx], pin: newPin }
  saveUsers(users)

  // Sync to Supabase — non-blocking
  const supabaseId = users[idx].supabaseId
  if (isSupabaseConfigured() && supabaseId) {
    awaitOrgSession().catch(() => null).then(() =>
      sbPost('/rpc/set_user_pin', { p_user_id: supabaseId, p_plain_pin: newPin })
        .catch(e => console.warn('[Fluxe] updateEmployeePin RPC failed:', e.message))
    )
  }
}

// ── Clock Records ─────────────────────────────────────────────────────────────

/**
 * Insert a clock-in record.
 * Returns the Supabase UUID to store on the local record (for clock-out PATCH).
 * Returns null on failure — local record is always saved first.
 *
 * @param {{ locationId: string|null, locationName: string, employeeName: string, clockIn: string }} opts
 * @returns {Promise<string|null>}
 */
export async function insertClockRecord({ locationId, locationName, employeeName, clockIn }) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const row = await sbPost('/clock_records', {
      organization_id: orgId,
      location_id:     getLocationUUID(locationId) || null,
      location_name:   locationName || '',
      employee_name:   employeeName,
      clock_in:        clockIn,
    }, 'return=representation')
    return row?.id ?? null
  } catch (err) {
    console.warn('[Fluxe] insertClockRecord failed:', err.message)
    return null
  }
}

/**
 * Set clock_out on an existing clock record.
 * Fire-and-forget — local record is already updated before this is called.
 *
 * @param {string} supabaseId  UUID returned from insertClockRecord
 * @param {string} clockOut    ISO timestamp
 */
export async function patchClockOut(supabaseId, clockOut) {
  if (!isSupabaseConfigured() || !supabaseId) return
  try {
    await sbPatch(`/clock_records?id=eq.${supabaseId}`, { clock_out: clockOut })
  } catch (err) {
    console.warn('[Fluxe] patchClockOut failed:', err.message)
  }
}
