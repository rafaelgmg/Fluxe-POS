/**
 * supabaseRead.js — Phase 1: read-only Supabase integration.
 *
 * Each exported function returns normalized frontend objects or null on failure.
 * null = caller must fall back to localStorage. No exceptions bubble up.
 *
 * Required env vars (.env or .env.local):
 *   VITE__url()       e.g. https://abcdef.supabase.co
 *   VITE_SUPABASE_ANON_KEY  anon/public key from Supabase Dashboard → Settings → API
 *
 * Optional:
 *   VITE_SUPABASE_ORG_ID    organization UUID (auto-detected from DB if blank)
 */

import { normalizeProduct }    from '../domain/adapters/legacyProduct'
import { normalizeSale }       from '../domain/adapters/legacySale'
import { normalizeUser }       from '../domain/adapters/legacyUser'
import { LOCATIONS_CFG }      from '../config/branding'
import { getAccessToken }     from './supabaseSession'
import { KEY_INVOICE_COUNTER } from '../utils/storageKeys'

import { getClientConfig } from './clientConfig'

function _url() { return getClientConfig().supabaseUrl }
function _key() { return getClientConfig().supabaseAnonKey }

export function isSupabaseConfigured() {
  return Boolean(_url() && _key())
}

// ── Auth header helper ────────────────────────────────────────────────────────
// With RLS active (Phase 9), all requests must carry the machine account JWT.
// Falls back to the anon key when initOrgSession() hasn't run yet (offline/dev).

function authBearer() {
  return getAccessToken() || _key()
}

// ── Base fetch + RPC ─────────────────────────────────────────────────────────

async function sbRpc(fnName, params = {}) {
  const res = await fetch(`${_url()}/rest/v1/rpc/${fnName}`, {
    method:  'POST',
    headers: {
      apikey:         _key(),
      Authorization:  `Bearer ${authBearer()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`RPC ${fnName} ${res.status}: ${text}`)
  }
  return res.json()
}

async function sbFetch(path) {
  const res = await fetch(`${_url()}/rest/v1${path}`, {
    headers: {
      apikey:          _key(),
      Authorization:   `Bearer ${authBearer()}`,
      'Content-Type':  'application/json',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Supabase ${res.status} at ${path}: ${body}`)
  }
  return res.json()
}

// ── Org ID resolution ─────────────────────────────────────────────────────────

let _orgId = ''

async function getOrgId() {
  if (!_orgId) _orgId = getClientConfig().orgId || ''
  if (_orgId) return _orgId
  // Fallback: auto-detect from DB (requires anon key access to organizations table).
  const rows = await sbFetch('/organizations?select=id&limit=1')
  if (!rows.length) throw new Error('No organization found in Supabase')
  _orgId = rows[0].id
  return _orgId
}

/**
 * Set the org ID cache from outside (e.g., from the JWT claim in initOrgSession).
 * Prevents a DB round-trip for getOrgId() when RLS is active.
 * Phase 9: initOrgSession() calls this after extracting org_id from the JWT.
 */
export function setOrgIdCache(id) { if (id) _orgId = id }

/**
 * Get the next invoice number from the shared Postgres sequence (cross-kiosk safe).
 *
 * - Online:  calls next_invoice_number() RPC → atomic, collision-free between kiosks.
 *            Also updates the local counter so offline sales continue from the right range.
 * - Offline: returns localFallback (the locally-generated temp number).
 *
 * @param {number|null} localFallback  — locally-generated number to use if RPC fails
 * @returns {Promise<number>}
 */
export async function getNextInvoiceNumber(localFallback = null) {
  if (!isSupabaseConfigured()) return localFallback
  try {
    const result = await sbRpc('next_invoice_number')
    if (typeof result === 'number' && result > 0) {
      // Keep local counter in sync — if we go offline, the next local number
      // continues from where the shared sequence left off.
      const stored = parseInt(localStorage.getItem(KEY_INVOICE_COUNTER) || '0', 10)
      if (result >= stored) localStorage.setItem(KEY_INVOICE_COUNTER, String(result))
      return result
    }
  } catch (err) {
    console.warn('[Fluxe] getNextInvoiceNumber RPC failed — using local fallback:', err.message)
  }
  return localFallback
}

// Exported so Phase 3 write functions can get the org ID without fetching again.
export { getOrgId }

// ── Location UUID cache (write path) ──────────────────────────────────────────
// Maps legacy static ID ('loc_01', 'loc_02') → Supabase UUID.
// Populated as a side effect of fetchProducts() on every app boot.
// Used by supabaseWrite.js to resolve locationId before INSERT.

let _legacyToUUID = {}  // { 'loc_01': 'uuid-...', 'loc_02': 'uuid-...' }
let _nameToUUID   = {}  // { 'Warehouse': 'uuid-...' } — covers dynamically-created locations

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a legacy static location ID ('loc_01') to a Supabase UUID.
 * Returns the input unchanged if it already looks like a UUID.
 * Returns null if unknown.
 */
export function getLocationUUID(legacyId) {
  if (!legacyId) return null
  if (_legacyToUUID[legacyId]) return _legacyToUUID[legacyId]
  if (UUID_RE.test(legacyId)) return legacyId
  return null
}

/**
 * Resolve a location display name to its Supabase UUID.
 * Covers dynamically-created warehouse locations not present in LOCATIONS_CFG.
 * Returns null if unknown (fetchLocationMap must have run first).
 */
export function getLocationUUIDByName(name) {
  if (!name) return null
  if (_nameToUUID[name]) return _nameToUUID[name]
  // Fallback: check via LOCATIONS_CFG → _legacyToUUID path
  const cfg = LOCATIONS_CFG.find(l => l.name === name)
  if (cfg && _legacyToUUID[cfg.id]) return _legacyToUUID[cfg.id]
  return null
}

// ── fromSupabase mappers ──────────────────────────────────────────────────────
// Convert PostgREST snake_case rows to the camelCase shape the adapters expect.

function fromSupabasePayment(row) {
  if (!row) return row
  return {
    ...row,
    amountReceived:      row.amount_received      ?? undefined,
    changeDue:           row.change_due           ?? undefined,
    cardBrand:           row.card_brand           ?? undefined,
    cardLast4:           row.card_last4           ?? undefined,
    authorizationNumber: row.authorization_number ?? undefined,
    externalRef:         row.external_ref         ?? undefined,
    checkNumber:         row.check_number         ?? undefined,
  }
}

function fromSupabaseSaleItem(row) {
  if (!row) return row
  return {
    ...row,
    productId:    row.product_id    ?? null,
    categoryId:   row.category_id   ?? null,
    // resolveItem() in Receipts uses item.name or item.product.name
    name:         row.name || row.product_name || '',
    salePrice:    row.sale_price    ?? 0,
    unitPrice:    row.unit_price    ?? 0,
    systemPrice:  row.system_price  ?? row.sale_price ?? 0,
    minPrice:     row.min_price     ?? 0,
    discount:     row.discount      ?? 0,
    spare:        row.spare         ?? 0,
    costPrice:    row.cost_price    ?? 0,
    category:     row.category_name || '',
    description:  row.description   || '',
    size:         row.size          || '',
  }
}

function fromSupabaseSale(row) {
  if (!row) return row
  // Prefer the live join; fall back to the JSONB snapshot when RLS blocks the join
  const joinedPayments   = (row.payments          || []).map(fromSupabasePayment)
  const snapshotPayments = Array.isArray(row.payments_snapshot) ? row.payments_snapshot : []
  return {
    ...row,
    // Preserve the Supabase UUID so voidSaleInSupabase skips the extra lookup query
    supabaseId:    row.id,
    // Field renames: Supabase → frontend canonical shape
    timestamp:     row.sold_at,
    location:      row.location_name   || '',
    employee:      row.employee_name   || '',
    totalSpare:    row.total_spare     ?? 0,
    paymentMethod: row.payment_method  || '',
    // Flatten nested relations for normalizeSale
    items:    (row.sale_items || []).map(fromSupabaseSaleItem),
    payments: joinedPayments.length > 0 ? joinedPayments : snapshotPayments,
  }
}

function fromSupabaseProduct(row, locationMap) {
  if (!row) return row
  const stock     = row.inventory_stock || []
  const qtyByLoc  = {}
  let   totalQty  = 0
  for (const s of stock) {
    // Map Supabase UUID → static 'loc_01'/'loc_02' so decrementStock still works
    const key = locationMap[s.location_id] || s.location_id
    qtyByLoc[key] = (qtyByLoc[key] || 0) + s.qty
    totalQty += s.qty
  }
  return normalizeProduct({
    ...row,
    systemPrice:       row.system_price        ?? 0,
    minPrice:          row.min_price           ?? 0,
    costPrice:         row.cost_price          ?? 0,
    supplierName:      row.supplier_name       || '',
    categoryId:        row.category_id         ?? null,
    updatedAt:         row.updated_at,
    createdAt:         row.created_at,
    qty:               totalQty,
    qtyByLoc,
    reorderStatus:     row.reorder_status      ?? 'reorderable',
    coreProduct:       row.core_product        ?? false,
    minStockTarget:    row.min_stock_target     ?? null,
    reorderPoint:      row.reorder_point       ?? null,
    targetDaysOfStock: row.target_days_of_stock ?? 14,
    leadTimeDays:      row.lead_time_days       ?? 7,
  })
}

function fromSupabaseUser(row) {
  if (!row) return row
  // Strip secret fields — pin and pin_hash must never reach the client.
  // PIN verification goes through the verify_employee_pin RPC (Phase 6).
  // eslint-disable-next-line no-unused-vars
  const { pin, pin_hash, ...safe } = row
  return {
    ...safe,
    firstName:  row.first_name  || '',
    lastName:   row.last_name   || '',
    hourlyRate: row.hourly_rate ?? 0,
    photo:      row.avatar_url  || null,
    createdAt:  row.created_at,
  }
}

function fromSupabaseCategory(row) {
  if (!row) return row
  return {
    ...row,
    sortIndex:      row.sort_index      ?? 0,
    commissionRate: row.commission_rate ?? null,
    commissionType: row.commission_type ?? null,
    notes:          row.notes           ?? '',
    createdAt:      row.created_at,
  }
}

// ── Location map helper ───────────────────────────────────────────────────────

async function fetchLocationMap(orgId) {
  const rows = await sbFetch(`/locations?select=id,name&organization_id=eq.${orgId}`)

  // Load user-created locations from localStorage (e.g. warehouse added via LocationSettings)
  let dynLocs = []
  try {
    const raw = localStorage.getItem('fluxe-locations-v1')
    if (raw) dynLocs = JSON.parse(raw)
  } catch {}

  const reverseMap = {}  // UUID → 'loc_01' / 'loc_03' …  (read path: qtyByLoc keys)
  for (const row of rows) {
    // 1. Static branding locations (loc_01, loc_02)
    const cfg = LOCATIONS_CFG.find(l => l.name === row.name)
    if (cfg) {
      reverseMap[row.id] = cfg.id
      _legacyToUUID[cfg.id] = row.id
    } else {
      // 2. Dynamically-created locations (warehouse / extra retail added via LocationSettings)
      const dyn = dynLocs.find(l => l.name === row.name)
      if (dyn) {
        reverseMap[row.id] = dyn.id
        _legacyToUUID[dyn.id] = row.id
      }
      // If neither matched: fromSupabaseProduct falls back to raw UUID as key (still visible)
    }
    // Cache ALL locations by name for getLocationUUIDByName()
    _nameToUUID[row.name] = row.id
  }
  return reverseMap
}

// ── Public fetch functions ────────────────────────────────────────────────────

/**
 * Fetch all products with per-location inventory.
 * @returns {Promise<import('../domain/models/product').Product[] | null>}
 */
export async function fetchProducts() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const [rows, locationMap] = await Promise.all([
      sbFetch(
        `/products?select=*,inventory_stock(location_id,qty)` +
        `&organization_id=eq.${orgId}&order=name.asc`
      ),
      fetchLocationMap(orgId),
    ])
    return rows.map(r => fromSupabaseProduct(r, locationMap))
  } catch (err) {
    console.warn('[Fluxe] fetchProducts failed — using local fallback:', err.message)
    return null
  }
}

/**
 * Fetch sales with items in a date range (for forecast / velocity calculations).
 * @param {Date} from
 * @param {Date} to
 * @returns {Promise<import('../domain/models/sale').Sale[] | null>}
 */
export async function fetchSalesInRange(from, to) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId  = await getOrgId()
    const fromTs = from.toISOString()
    const toTs   = to.toISOString()
    const rows   = await sbFetch(
      `/sales?select=*,sale_items(*)` +
      `&organization_id=eq.${orgId}` +
      `&sold_at=gte.${fromTs}&sold_at=lte.${toTs}` +
      `&status=neq.voided` +
      `&order=sold_at.desc&limit=5000`
    )
    return rows.map(r => normalizeSale(fromSupabaseSale(r)))
  } catch (err) {
    console.warn('[Fluxe] fetchSalesInRange failed:', err.message)
    return null
  }
}

/**
 * Fetch all sales with items and payments (latest 2000, sorted desc).
 * @returns {Promise<import('../domain/models/sale').Sale[] | null>}
 */
export async function fetchSales() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/sales?select=*,sale_items(*),payments(*)` +
      `&organization_id=eq.${orgId}&order=number.desc&limit=2000`
    )
    return rows.map(r => normalizeSale(fromSupabaseSale(r)))
  } catch (err) {
    console.warn('[Fluxe] fetchSales failed — using local fallback:', err.message)
    return null
  }
}

/**
 * Fetch all users.
 * @returns {Promise<import('../domain/models/user').User[] | null>}
 */
export async function fetchUsers() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/v_users?select=*&organization_id=eq.${orgId}&order=first_name.asc`
    )
    return rows.map(r => normalizeUser(fromSupabaseUser(r)))
  } catch (err) {
    console.warn('[Fluxe] fetchUsers failed — using local fallback:', err.message)
    return null
  }
}

/**
 * Fetch inventory movements (latest 1000, sorted desc by created_at).
 * Normalizes snake_case → camelCase to match the local inventoryHistoryStorage shape.
 * @returns {Promise<object[] | null>}
 */
export async function fetchInventoryMovements() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/inventory_movements?select=*` +
      `&organization_id=eq.${orgId}&order=created_at.desc&limit=1000`
    )
    return rows.map(r => ({
      ...r,
      // Normalize to camelCase shape used by InventoryAdmin history list
      timestamp:    r.created_at,
      productId:    r.product_id    ?? null,
      locationId:   r.location_id   ?? null,
      locationName: r.location_name ?? '',
      productName:  r.product_name  ?? '',
      before:       r.qty_before    ?? 0,
      after:        r.qty_after     ?? 0,
      delta:        r.delta         ?? 0,   // GENERATED column — safe to read, never write
      invoiceNumber: r.sale_id      ?? null, // sale_id FK — not the invoice number, close enough for display
      performedBy:  r.performed_by_id ?? '',
    }))
  } catch (err) {
    console.warn('[Fluxe] fetchInventoryMovements failed — using local fallback:', err.message)
    return null
  }
}

/**
 * Fetch all categories.
 * @returns {Promise<object[] | null>}
 */
export async function fetchCategories() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/categories?select=*&organization_id=eq.${orgId}&order=sort_index.asc`
    )
    return rows.map(fromSupabaseCategory)
  } catch (err) {
    console.warn('[Fluxe] fetchCategories failed — using local fallback:', err.message)
    return null
  }
}

/**
 * Fetch clock records for a specific employee within a date range.
 * Used by UserReport to calculate worked hours across periods.
 *
 * @param {{ employeeName: string, from: Date, to: Date }}
 * @returns {Promise<Array<{ id, employee, location, clockIn, clockOut }> | null>}
 */
export async function fetchClockRecordsByEmployee({ employeeName, from, to }) {
  if (!isSupabaseConfigured() || !employeeName) return null
  try {
    const orgId   = await getOrgId()
    const fromISO = from instanceof Date ? from.toISOString() : new Date(from).toISOString()
    const toISO   = to   instanceof Date ? to.toISOString()   : new Date(to).toISOString()

    const rows = await sbFetch(
      `/clock_records?organization_id=eq.${orgId}` +
      `&employee_name=eq.${encodeURIComponent(employeeName)}` +
      `&clock_in=gte.${encodeURIComponent(fromISO)}` +
      `&clock_in=lte.${encodeURIComponent(toISO)}` +
      `&order=clock_in.asc`
    )
    return rows.map(r => ({
      id:       r.id,
      employee: r.employee_name || '',
      location: r.location_name || '',
      clockIn:  r.clock_in      || '',
      clockOut: r.clock_out     || null,
    }))
  } catch (err) {
    console.warn('[Fluxe] fetchClockRecordsByEmployee failed:', err.message)
    return null
  }
}

/**
 * Fetch today's clock records for the org (all locations).
 * Returns normalized frontend objects or null on failure.
 * Filtered server-side to clock_in >= start of today (UTC midnight).
 *
 * @returns {Promise<Array<{ id, employee, location, clockIn, clockOut }> | null>}
 */
export async function fetchTodayClockRecords() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId    = await getOrgId()
    const today    = new Date()
    today.setHours(0, 0, 0, 0)
    const todayISO = today.toISOString()

    const rows = await sbFetch(
      `/clock_records?organization_id=eq.${orgId}` +
      `&clock_in=gte.${encodeURIComponent(todayISO)}` +
      `&order=clock_in.asc`
    )
    return rows.map(r => ({
      id:       r.id,
      employee: r.employee_name || '',
      location: r.location_name || '',
      clockIn:  r.clock_in      || '',
      clockOut: r.clock_out     || null,
    }))
  } catch (err) {
    console.warn('[Fluxe] fetchTodayClockRecords failed:', err.message)
    return null
  }
}

/**
 * Fetch pending (status='sent') transfers destined for a given location.
 * Returns [] when none found, null on error.
 */
/**
 * Fetch the most recent transfers for the org (all statuses, all locations).
 * Used by InventoryAdmin to show a unified transfer history.
 */
export async function fetchRecentTransfers(limit = 20) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/inventory_transfers?organization_id=eq.${orgId}&order=sent_at.desc&limit=${limit}`
    )
    return rows || []
  } catch (err) {
    console.warn('[Fluxe] fetchRecentTransfers failed:', err.message)
    return null
  }
}

/**
 * Fetch pending transfer drafts (status='draft') for the org.
 * Returns normalized camelCase objects or null on failure.
 */
export async function fetchTransferDrafts() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/inventory_transfers?select=*` +
      `&organization_id=eq.${orgId}&status=eq.draft&order=created_at.desc&limit=100`
    )
    return rows.map(r => ({
      id:               r.id,
      productId:        r.product_id          || '',
      productName:      r.product_name        || '',
      barcode:          r.barcode             || '',
      qty:              r.qty                ?? 0,
      fromLocationId:   r.from_location_id   || '',
      fromLocationName: r.from_location_name || '',
      toLocationId:     r.to_location_id     || '',
      toLocationName:   r.to_location_name   || '',
      status:           r.status             || 'draft',
      createdBy:        r.created_by         || '',
      note:             r.note               || '',
      createdAt:        r.created_at         || '',
    }))
  } catch (err) {
    console.warn('[Fluxe] fetchTransferDrafts failed:', err.message)
    return null
  }
}

export async function fetchPendingTransfers(toLocationUUID) {
  if (!isSupabaseConfigured() || !toLocationUUID) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/inventory_transfers?organization_id=eq.${orgId}` +
      `&to_location_id=eq.${toLocationUUID}&status=eq.sent&order=sent_at.desc`
    )
    return rows || []
  } catch (err) {
    console.warn('[Fluxe] fetchPendingTransfers failed:', err.message)
    return null
  }
}

/**
 * Fetch all sales (including voided) for a specific location and calendar date.
 * Used by EndOfDayReport for accurate daily totals filtered by location.
 * Passing no locationName returns all sales for the org on that date.
 *
 * @param {{ locationName?: string, date?: Date }}
 * @returns {Promise<import('../domain/models/sale').Sale[] | null>}
 */
export async function fetchSalesByLocationAndDate({ locationName, date = new Date() } = {}) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId     = await getOrgId()
    const start     = new Date(date); start.setHours(0, 0, 0, 0)
    const end       = new Date(date); end.setHours(23, 59, 59, 999)
    const locFilter = locationName
      ? `&location_name=eq.${encodeURIComponent(locationName)}`
      : ''
    const rows = await sbFetch(
      `/sales?select=*,sale_items(*),payments(*)` +
      `&organization_id=eq.${orgId}` +
      locFilter +
      `&sold_at=gte.${encodeURIComponent(start.toISOString())}` +
      `&sold_at=lte.${encodeURIComponent(end.toISOString())}` +
      `&order=number.desc`
    )
    return rows.map(r => normalizeSale(fromSupabaseSale(r)))
  } catch (err) {
    console.warn('[Fluxe] fetchSalesByLocationAndDate failed:', err.message)
    return null
  }
}

/**
 * Fetch clock records for a specific location and calendar date.
 * Used by EndOfDayReport to calculate employee hours worked on a given day.
 *
 * @param {{ locationName?: string, date?: Date }}
 * @returns {Promise<Array<{ id, employee, location, clockIn, clockOut }> | null>}
 */
export async function fetchClockRecordsByDate({ locationName, date = new Date() } = {}) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId     = await getOrgId()
    const start     = new Date(date); start.setHours(0, 0, 0, 0)
    const end       = new Date(date); end.setHours(23, 59, 59, 999)
    const locFilter = locationName
      ? `&location_name=eq.${encodeURIComponent(locationName)}`
      : ''
    const rows = await sbFetch(
      `/clock_records?organization_id=eq.${orgId}` +
      locFilter +
      `&clock_in=gte.${encodeURIComponent(start.toISOString())}` +
      `&clock_in=lte.${encodeURIComponent(end.toISOString())}` +
      `&order=clock_in.asc`
    )
    return rows.map(r => ({
      id:       r.id,
      employee: r.employee_name || '',
      location: r.location_name || '',
      clockIn:  r.clock_in      || '',
      clockOut: r.clock_out     || null,
    }))
  } catch (err) {
    console.warn('[Fluxe] fetchClockRecordsByDate failed:', err.message)
    return null
  }
}

/**
 * Fetch all clock records that are still open (clock_out IS NULL) for a location.
 * Used by EOD auto clock-out to catch stale shifts from previous days.
 *
 * @param {{ locationName?: string }}
 * @returns {Promise<Array<{ id, employee, location, clockIn, clockOut }> | null>}
 */
export async function fetchOpenClockRecords({ locationName } = {}) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId     = await getOrgId()
    const locFilter = locationName
      ? `&location_name=eq.${encodeURIComponent(locationName)}`
      : ''
    const rows = await sbFetch(
      `/clock_records?organization_id=eq.${orgId}` +
      locFilter +
      `&clock_out=is.null` +
      `&order=clock_in.asc`
    )
    return rows.map(r => ({
      id:       r.id,
      employee: r.employee_name || '',
      location: r.location_name || '',
      clockIn:  r.clock_in      || '',
      clockOut: null,
    }))
  } catch (err) {
    console.warn('[Fluxe] fetchOpenClockRecords failed:', err.message)
    return null
  }
}

/**
 * Fetch all location configs for the org.
 * Returns an array of rows { location_id, location_name, config, updated_at }
 * or null on failure.
 *
 * @returns {Promise<object[] | null>}
 */
export async function fetchLocationConfigs() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows  = await sbFetch(
      `/location_configs?organization_id=eq.${orgId}&order=location_id.asc`
    )
    return rows || []
  } catch (err) {
    console.warn('[Fluxe] fetchLocationConfigs failed:', err.message)
    return null
  }
}

/**
 * Fetch EOD notes for a specific location and date.
 * Returns the notes string, or null if none saved yet.
 *
 * @param {{ locationName: string, date: Date }}
 * @returns {Promise<string | null>}
 */
export async function fetchEODNotes({ locationName, date }) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId     = await getOrgId()
    const dateStr   = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const rows = await sbFetch(
      `/eod_notes?organization_id=eq.${orgId}` +
      `&location_name=eq.${encodeURIComponent(locationName)}` +
      `&report_date=eq.${dateStr}` +
      `&select=notes&limit=1`
    )
    return rows?.[0]?.notes ?? null
  } catch (err) {
    console.warn('[Fluxe] fetchEODNotes failed:', err.message)
    return null
  }
}
