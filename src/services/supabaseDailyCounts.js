/**
 * supabaseDailyCounts.js
 * CRUD for daily_counts + daily_count_items tables.
 * All functions return null/void on failure — callers fall back to localStorage.
 */

import { getOrgId, isSupabaseConfigured } from './supabaseRead'
import { getAccessToken }                 from './supabaseSession'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL      || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

function authBearer() { return getAccessToken() || SUPABASE_KEY }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function sbPost(path, body, prefer = 'return=minimal') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${authBearer()}`,
      'Content-Type': 'application/json', Prefer: prefer,
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`POST ${path} ${res.status}: ${text}`)
  }
  if (prefer.includes('representation')) {
    const data = await res.json()
    return Array.isArray(data) ? data : [data]
  }
  return null
}

async function sbPatch(path, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${authBearer()}`,
      'Content-Type': 'application/json', Prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`PATCH ${path} ${res.status}: ${text}`)
  }
}

async function sbFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY, Authorization: `Bearer ${authBearer()}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GET ${path} ${res.status}: ${text}`)
  }
  return res.json()
}

// ── Shape converters ──────────────────────────────────────────────────────────

function fromCountRow(row) {
  return {
    id:            row.id,
    _sbId:         row.id,
    seq:           row.seq,
    countNumber:   row.count_number,
    locationId:    row.location_id,
    locationName:  row.location_name,
    submittedBy:   row.submitted_by,
    submittedById: row.submitted_by_id || null,
    submittedAt:   row.submitted_at,
    status:        row.status,
    reviewedBy:    row.reviewed_by  || null,
    reviewedAt:    row.reviewed_at  || null,
    appliedBy:     row.applied_by   || null,
    appliedAt:     row.applied_at   || null,
    notes:         row.notes        || '',
    items: (row.daily_count_items || []).map(item => ({
      _sbItemId:   item.id,
      productId:   item.product_id || item.barcode || item.product_name,
      barcode:     item.barcode     || '',
      productName: item.product_name,
      category:    item.category    || '',
      description: item.description || '',
      size:        item.size        || '',
      systemQty:   item.system_qty,
      countedQty:  item.counted_qty,
      difference:  item.difference,
      itemStatus:  item.item_status,
      appliedAt:   item.applied_at  || null,
      appliedBy:   item.applied_by  || null,
    })),
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * POST a new daily count + its items.
 * Returns the Supabase count UUID on success, null on failure.
 */
export async function pushDailyCount(count) {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()

    const [countRow] = await sbPost('/daily_counts', [{
      organization_id: orgId,
      seq:             count.seq,
      count_number:    count.countNumber,
      location_id:     count.locationId,
      location_name:   count.locationName,
      submitted_by:    count.submittedBy,
      submitted_by_id: count.submittedById || null,
      submitted_at:    count.submittedAt,
      status:          count.status,
      notes:           count.notes || null,
    }], 'return=representation')

    if (!countRow?.id) return null

    if (count.items?.length) {
      const itemRows = count.items.map(item => ({
        count_id:        countRow.id,
        organization_id: orgId,
        product_id:      UUID_RE.test(item.productId || '') ? item.productId : null,
        barcode:         item.barcode     || null,
        product_name:    item.productName,
        category:        item.category    || null,
        description:     item.description || null,
        size:            item.size        || null,
        system_qty:      item.systemQty,
        counted_qty:     item.countedQty,
        difference:      item.difference,
        item_status:     item.itemStatus  || 'pending',
      }))
      await sbPost('/daily_count_items', itemRows, 'return=minimal')
    }

    return countRow.id
  } catch (err) {
    console.warn('[DailyCounts] pushDailyCount failed:', err.message)
    return null
  }
}

/**
 * Fetch all daily counts for the org with their items.
 * Returns normalized array or null on failure.
 */
export async function fetchDailyCounts() {
  if (!isSupabaseConfigured()) return null
  try {
    const orgId = await getOrgId()
    const rows = await sbFetch(
      `/daily_counts?select=*,daily_count_items(*)` +
      `&organization_id=eq.${orgId}` +
      `&order=submitted_at.desc&limit=500`
    )
    return rows.map(fromCountRow)
  } catch (err) {
    console.warn('[DailyCounts] fetchDailyCounts failed:', err.message)
    return null
  }
}

/**
 * Patch top-level fields on a daily count (status, reviewedBy, appliedBy, notes…).
 * @param {string} sbId  Supabase UUID of the count (_sbId field)
 */
export async function patchDailyCountStatus(sbId, patch) {
  if (!isSupabaseConfigured() || !sbId) return
  const row = {}
  if (patch.status     !== undefined) row.status      = patch.status
  if (patch.reviewedBy !== undefined) row.reviewed_by = patch.reviewedBy
  if (patch.reviewedAt !== undefined) row.reviewed_at = patch.reviewedAt
  if (patch.appliedBy  !== undefined) row.applied_by  = patch.appliedBy
  if (patch.appliedAt  !== undefined) row.applied_at  = patch.appliedAt
  if (patch.notes      !== undefined) row.notes       = patch.notes
  if (!Object.keys(row).length) return
  try {
    await sbPatch(`/daily_counts?id=eq.${sbId}`, row)
  } catch (err) {
    console.warn('[DailyCounts] patchDailyCountStatus failed:', err.message)
  }
}

/**
 * Patch a single item row (itemStatus, appliedAt, appliedBy).
 * Identifies the row by _sbItemId when available, then barcode, then product_name.
 * @param {string} countSbId  _sbId of the parent count
 * @param {object} item       Item object (must have _sbItemId OR barcode OR productName)
 */
export async function patchDailyCountItemStatus(countSbId, item, patch) {
  if (!isSupabaseConfigured() || !countSbId) return
  const row = {}
  if (patch.itemStatus !== undefined) row.item_status = patch.itemStatus
  if (patch.appliedAt  !== undefined) row.applied_at  = patch.appliedAt
  if (patch.appliedBy  !== undefined) row.applied_by  = patch.appliedBy
  if (!Object.keys(row).length) return
  try {
    let path
    if (item._sbItemId) {
      path = `/daily_count_items?id=eq.${item._sbItemId}`
    } else if (item.barcode) {
      path = `/daily_count_items?count_id=eq.${countSbId}&barcode=eq.${encodeURIComponent(item.barcode)}`
    } else {
      path = `/daily_count_items?count_id=eq.${countSbId}&product_name=eq.${encodeURIComponent(item.productName)}`
    }
    await sbPatch(path, row)
  } catch (err) {
    console.warn('[DailyCounts] patchDailyCountItemStatus failed:', err.message)
  }
}
