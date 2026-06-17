/**
 * locationHelpers.js — Runtime location helpers (read from localStorage).
 *
 * Unlike branding.js (which is static config), these helpers read the live
 * location list from localStorage so they reflect user-added warehouse locations.
 *
 * Key: fluxe-locations-v1  (managed by LocationSettings.jsx)
 * Fallback: LOCATIONS_CFG from branding.js when localStorage is empty.
 */

import { LOCATIONS_CFG } from '../config/branding'

const LOC_KEY   = 'fluxe-locations-v1'
const SALES_KEY = 'fluxe-sales-v1'

function readLocations() {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return LOCATIONS_CFG
}

/** All active locations (retail + warehouse). Used by Inventory, Transfers, Admin. */
export function getInventoryLocations() {
  return readLocations().filter(l => l.active !== false)
}

/** Active retail-only locations. Used by POS, EOD, Sales, Competition, Dashboard sales. */
export function getRetailLocations() {
  return readLocations().filter(l => l.active !== false && l.location_type !== 'warehouse')
}

/** Active warehouse-only locations. Used by Inventory transfers destination picker. */
export function getWarehouseLocations() {
  return readLocations().filter(l => l.active !== false && l.location_type === 'warehouse')
}

/**
 * Returns true if any completed sale in localStorage belongs to this location.
 * Used to warn before converting a retail location to warehouse.
 */
export function locationHasSales(locationName) {
  try {
    const raw = localStorage.getItem(SALES_KEY)
    if (!raw) return false
    const sales = JSON.parse(raw)
    return sales.some(s => s.location === locationName && s.status !== 'voided')
  } catch {
    return false
  }
}
