/**
 * locationConfig.js
 * Shared helper to read a location's config from localStorage.
 * Used by printReceipt, PaymentModal, Cart, EndOfDayReport, etc.
 * Single source of truth — no more duplicate inline readers.
 *
 * Storage key: fluxe-locations-v1  (same as LocationSettings.jsx)
 */

import { loadSpareRate } from './commissionTiersStorage'

const LOC_KEY = 'fluxe-locations-v1'

/**
 * Load the full config object for a location by name.
 * Returns null if not found.
 *
 * Prefer loadLocationConfigById() for new code — name-based lookup is legacy.
 * Kept as primary for backward compatibility until all callers migrate to ID.
 *
 * @param {string} locationName
 * @returns {object|null}
 */
export function loadLocationConfig(locationName) {
  if (!locationName) return null
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      return list.find(l => l.name === locationName) || null
    }
  } catch {}
  return null
}

/**
 * Load the full config object for a location by stable ID.
 * Preferred over loadLocationConfig() for new code — ID is immutable,
 * name can change. Falls back to name lookup if id is absent on the record.
 *
 * @param {string|null} locationId
 * @returns {object|null}
 */
export function loadLocationConfigById(locationId) {
  if (!locationId) return null
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) {
      const list = JSON.parse(raw)
      return list.find(l => l.id === locationId) || null
    }
  } catch {}
  return null
}

/**
 * Get the effective tax rate (as a decimal) for a location.
 * Falls back to 0.085 (Nevada 8.5%) if not configured.
 *
 * @param {string|null} locationName
 * @returns {number}  e.g. 0.085
 */
export function getTaxRate(locationName) {
  const cfg = loadLocationConfig(locationName)
  const rate = cfg?.taxRate ?? 8.5
  return rate / 100
}

/**
 * Get the tax display label for a location (e.g. "TAX", "GST", "VAT").
 * Falls back to "TAX".
 *
 * @param {string|null} locationName
 * @returns {string}
 */
export function getTaxLabel(locationName) {
  const cfg = loadLocationConfig(locationName)
  return cfg?.taxDisplayAs || 'TAX'
}

/**
 * Get a single preference value for a location.
 * Falls back to defaultValue if the location or field is not found.
 *
 * @param {string|null} locationName
 * @param {string} key        — e.g. 'blockSaleOutOfStock'
 * @param {*} defaultValue    — returned when config or field is missing
 * @returns {*}
 */
export function getLocationPref(locationName, key, defaultValue = undefined) {
  const cfg = loadLocationConfig(locationName)
  if (!cfg) return defaultValue
  return key in cfg ? cfg[key] : defaultValue
}

/**
 * Get the spare commission rate (as %) for a location.
 * Uses the location's spareCommissionRate if configured,
 * falls back to the global spare rate (default 30%).
 *
 * @param {string|null} locationName
 * @returns {number}  e.g. 30
 */
export function loadSpareRateForLocation(locationName) {
  if (locationName) {
    const cfg = loadLocationConfig(locationName)
    if (cfg?.spareCommissionRate != null) {
      const val = parseFloat(cfg.spareCommissionRate)
      if (!isNaN(val) && val >= 0 && val <= 100) return val
    }
  }
  return loadSpareRate()
}

/**
 * Resolve the effective spare commission rate (as %) for a given day.
 *
 * - mode = 'fixed'  → returns spareCommissionRate from location (or global default 30%)
 * - mode = 'tiered' → looks up location's spareTiers table using daySpareTotal
 *                     (retroactive: highest threshold reached wins)
 *                     Falls back to fixed rate if no tiers are defined.
 *
 * @param {string|null} locationName
 * @param {number}      daySpareTotal  - total spare earned by the employee on that day ($)
 * @returns {number} rate as % (e.g. 30)
 */
export function resolveSpareRateForDay(locationName, daySpareTotal = 0) {
  const cfg  = locationName ? loadLocationConfig(locationName) : null
  const mode = cfg?.spareCommissionMode || 'fixed'

  if (mode === 'tiered') {
    const tiers = cfg?.spareTiers
    if (Array.isArray(tiers) && tiers.length > 0) {
      // Sort highest threshold first — pick the first tier the daily spare meets
      const sorted = [...tiers].sort((a, b) => b.threshold - a.threshold)
      const match  = sorted.find(t => daySpareTotal >= t.threshold)
      if (match) return match.rate
      // Below the lowest threshold — use lowest-threshold tier's rate as floor
      return sorted[sorted.length - 1].rate
    }
    // Tiered selected but no tiers defined → fall through to fixed
  }

  // Fixed mode (or tiered with no tiers configured)
  return loadSpareRateForLocation(locationName)
}

/**
 * Merge location configs fetched from Supabase into localStorage.
 * Called on app boot after fetchLocationConfigs() resolves.
 * Cloud wins when its updated_at >= local updatedAt (ensures PC saves propagate to kiosks).
 *
 * @param {object[]} rows  Array of { location_id, config, updated_at } from Supabase
 */
export function mergeLocationConfigsFromCloud(rows) {
  if (!Array.isArray(rows) || !rows.length) return
  try {
    const raw   = localStorage.getItem(LOC_KEY)
    const local = raw ? JSON.parse(raw) : []
    let changed = false
    for (const row of rows) {
      const cloudCfg = row.config
      if (!cloudCfg?.id) continue
      const idx         = local.findIndex(l => l.id === cloudCfg.id)
      const localUpdated = idx >= 0 ? (local[idx].updatedAt || '') : ''
      const cloudUpdated = row.updated_at || cloudCfg.updatedAt || ''
      if (cloudUpdated >= localUpdated) {
        if (idx >= 0) {
          local[idx] = cloudCfg
        } else {
          local.push(cloudCfg)
        }
        changed = true
      }
    }
    if (changed) localStorage.setItem(LOC_KEY, JSON.stringify(local))
  } catch {}
}

// ── ID-first variants (preferred for new code with access to locationId) ──────

/**
 * getTaxRateById — like getTaxRate() but looks up by stable ID.
 * Falls back to 0.085 if location not found.
 *
 * @param {string|null} locationId
 * @returns {number}  e.g. 0.085
 */
export function getTaxRateById(locationId) {
  const cfg = loadLocationConfigById(locationId)
  const rate = cfg?.taxRate ?? 8.5
  return rate / 100
}

/**
 * resolveSpareRateForDayById — like resolveSpareRateForDay() but looks up by ID.
 * Delegates to the name-based variant after resolving config by ID.
 *
 * @param {string|null} locationId
 * @param {number}      daySpareTotal
 * @returns {number} rate as %
 */
export function resolveSpareRateForDayById(locationId, daySpareTotal = 0) {
  if (!locationId) return loadSpareRate()
  const cfg = loadLocationConfigById(locationId)
  if (!cfg) return loadSpareRate()
  // Reuse name-based logic — cfg.name is authoritative (came from same store)
  return resolveSpareRateForDay(cfg.name, daySpareTotal)
}
