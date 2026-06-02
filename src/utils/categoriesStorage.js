/**
 * categoriesStorage.js
 * Single source of truth for product categories.
 * Reads/writes to localStorage: 'fluxe-categories-v1'
 * Seeds from CATEGORIES in mockData on first run.
 *
 * ── Commission architecture ──────────────────────────────────────────────────
 *
 * Each category carries an optional commission rule:
 *
 *   commissionType:
 *     null            — not configured (inherits system default, if any)
 *     'none'          — explicitly no commission for this category
 *     'pct_spare'     — % of the "spare" on each item  ← recommended for this business
 *                       spare = salePrice - minPrice (already tracked per invoice)
 *     'pct_subtotal'  — % of item subtotal (total revenue from that item)
 *     'fixed_per_unit'— fixed $ amount per unit sold, regardless of price
 *
 *   commissionRate:
 *     number | null   — the rate value (% or $). null = not configured.
 *                       e.g. 10 with 'pct_spare'    → 10% of spare
 *                       e.g. 5  with 'pct_subtotal' → 5% of subtotal
 *                       e.g. 3  with 'fixed_per_unit' → $3 per unit
 *
 * Commission is calculated at REPORT TIME (not stored in the sale).
 * This means changing a rate affects all historical calculations.
 * If point-in-time accuracy is needed later, add commissionSnapshot to the
 * invoice at sale time — commissionEngine.js is already designed for that.
 * ────────────────────────────────────────────────────────────────────────────
 */

const KEY = 'fluxe-categories-v1'

/**
 * All valid commissionType values.
 * Exported so UI and engine use the same list — no magic strings.
 */
export const COMMISSION_TYPES = [
  { value: null,             label: 'Not configured'                 },
  { value: 'none',           label: 'No commission'                  },
  { value: 'tier_nc',        label: 'New Collection (day tier %)'    },
  { value: 'pct_subtotal',   label: 'Brands — fixed % of subtotal'  },
  { value: 'pct_spare',      label: 'Spare — fixed % of spare'      },
  { value: 'fixed_per_unit', label: 'Fixed $ per unit'              },
]

// Seed names matching the existing mock categories
const SEED_NAMES = [
  "Armaf Oil",
  "Kids",
  "Men's Brands",
  "Men's NC",
  "Niche",
  "SMART SHOP",
  "Unisex",
  "Unisex NC",
  "Women's Brands",
  "Women's NC",
]

function buildSeed() {
  return SEED_NAMES.map((name, i) => ({
    id:             i + 1,
    name,
    status:         'active',
    sortIndex:      i,
    commissionRate: null,
    commissionType: null,
    notes:          '',
    createdAt:      new Date().toISOString(),
  }))
}

/** Load all categories. Returns seed if storage is empty or corrupt. */
export function loadCategories() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Migrate older records that may lack new fields
        return parsed.map(c => ({
          commissionRate: null,
          commissionType: null,
          notes: '',
          ...c,
        }))
      }
    }
  } catch {}
  return buildSeed()
}

/** Persist categories array. */
export function saveCategories(cats) {
  try {
    localStorage.setItem(KEY, JSON.stringify(cats))
  } catch {}
}

/** Active categories sorted by sortIndex. */
export function loadActiveCategories() {
  return loadCategories()
    .filter(c => c.status !== 'inactive')
    .sort((a, b) => a.sortIndex - b.sortIndex)
}

/**
 * Just the names — drop-in replacement for the old static CATEGORIES array.
 * Used by ProductEditor, ProductsScreen filter, POS sidebar.
 */
export function loadActiveCategoryNames() {
  return loadActiveCategories().map(c => c.name)
}

/** Safe next id. Handles both integer IDs (local) and UUID IDs (post-Supabase-sync). */
export function nextCategoryId(cats) {
  const nums = cats.map(c => c.id).filter(id => typeof id === 'number' && Number.isFinite(id))
  return nums.length > 0 ? Math.max(...nums) + 1 : 1
}

/**
 * Initialize storage if not yet seeded.
 * Call once on app boot so POS reads real data from the start.
 */
export function ensureCategoriesSeeded() {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) saveCategories(buildSeed())
  } catch {}
}

/**
 * Build a lookup map  { categoryName → category }  for O(1) access.
 * Used by commissionEngine to avoid repeated array searches per item.
 *
 * @param {boolean} activeOnly  - if true, exclude inactive categories
 * @returns {{ [name: string]: object }}
 */
export function buildCategoryMap(activeOnly = false) {
  const cats = activeOnly ? loadActiveCategories() : loadCategories()
  // Lowercase keys so lookups are case-insensitive — category names on sale items
  // may differ in case from the stored config (e.g. "men's brands" vs "Men's Brands").
  return Object.fromEntries(cats.map(c => [c.name.toLowerCase(), c]))
}

/**
 * Merge remote (Supabase) categories into local ones:
 *  - Existing local category: hydrate supabaseId if not yet set
 *  - New in Supabase but not local: add with UUID as id
 * Does not remove local-only categories (could be offline-created and not yet synced).
 */
function mergeRemoteCategories(local, remote) {
  const byName = {}
  for (const c of local) byName[c.name.toLowerCase()] = c

  const result = local.map(c => ({ ...c }))

  for (const r of remote) {
    const key = r.name.toLowerCase()
    if (byName[key]) {
      // Hydrate supabaseId onto the existing local record
      const idx = result.findIndex(c => c.name.toLowerCase() === key)
      if (idx !== -1 && !result[idx].supabaseId) {
        result[idx] = { ...result[idx], supabaseId: r.id }
      }
    } else {
      // Category exists in Supabase but not locally — add it
      result.push({
        id:             r.id,
        supabaseId:     r.id,
        name:           r.name,
        status:         r.status          || 'active',
        sortIndex:      r.sortIndex       ?? result.length,
        commissionRate: r.commissionRate  ?? null,
        commissionType: r.commissionType  ?? null,
        notes:          r.notes           ?? '',
        createdAt:      r.createdAt       || new Date().toISOString(),
      })
    }
  }

  return result
}

/**
 * Async variant: tries Supabase first and merges into local, then falls back.
 * Saves the merged result to localStorage so future sync-free boots stay fast.
 */
export async function loadCategoriesAsync() {
  try {
    const { fetchCategories } = await import('../services/supabaseRead')
    const remote = await fetchCategories()
    if (remote && remote.length > 0) {
      const local  = loadCategories()
      const merged = mergeRemoteCategories(local, remote)
      saveCategories(merged)
      return merged
    }
  } catch {}
  return loadCategories()
}
