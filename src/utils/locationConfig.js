/**
 * locationConfig.js
 * Shared helper to read a location's config from localStorage.
 * Used by printReceipt, PaymentModal, Cart, EndOfDayReport, etc.
 * Single source of truth — no more duplicate inline readers.
 *
 * Storage key: fluxe-locations-v1  (same as LocationSettings.jsx)
 */

const LOC_KEY = 'fluxe-locations-v1'

/**
 * Load the full config object for a location by name.
 * Returns null if not found.
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
