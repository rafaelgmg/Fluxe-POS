/**
 * storageKeys.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for every localStorage key in Fluxe POS.
 *
 * When migrating to Supabase: scan this file to know which keys to replace.
 * New storage utils should import their key from here.
 * Existing *Storage.js files still define their own key constants — they should
 * be migrated here incrementally to avoid broad file-level churn.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Transactional data ────────────────────────────────────────────────────────
export const KEY_SALES            = 'fluxe-sales-v1'
export const KEY_INVOICE_COUNTER  = 'fluxe-invoice-counter-v1'
export const KEY_PRODUCTS         = 'fluxe-products-v1'
export const KEY_CATEGORIES       = 'fluxe-categories-v1'
export const KEY_CUSTOMERS        = 'fluxe-crm-v1'
export const KEY_CUSTOMERS_LEGACY = 'perfume-passage-crm-v1'  // migration only

// ── Users & session ───────────────────────────────────────────────────────────
export const KEY_USERS            = 'fluxe-users-v1'
export const KEY_USERS_BACKUP     = 'fluxe-users-v1-corrupted-backup'
export const KEY_CLOCK_RECORDS    = 'pp_clock_records'

// ── Configuration ─────────────────────────────────────────────────────────────
export const KEY_LOCATIONS        = 'fluxe-locations-v1'
export const KEY_CRM_SETTINGS     = 'fluxe-crm-settings-v1'
export const KEY_COMMISSION_TIERS = 'fluxe-commission-tiers-v1'
export const KEY_SPARE_RATE       = 'fluxe-commission-spare-rate'
export const KEY_BONUS_RULES      = 'fluxe-bonus-rules-v1'
export const KEY_BONUS_MANUAL     = 'fluxe-bonus-manual-v1'

// ── Inventory ─────────────────────────────────────────────────────────────────
export const KEY_INV_HISTORY      = 'fluxe-inv-history-v1'
export const KEY_DAILY_COUNTS     = 'fluxe-daily-counts-v1'

// ── Operational state (frontend-only, no backend needed) ──────────────────────
export const KEY_FROZEN_SALES     = 'fluxe-frozen-sales-v1'
export const KEY_LOCK_LOG         = 'fluxe-lock-log-v1'
export const KEY_CASH_DRAWER      = 'fluxe-cash-drawer-v1'

// ── Service module (separate business type) ───────────────────────────────────
export const KEY_SERVICES         = 'fluxe-services-v1'
export const KEY_SERVICE_STAFF    = 'fluxe-service-staff-v1'
export const KEY_SERVICE_CLIENTS  = 'fluxe-service-clients-v1'
export const KEY_APPOINTMENTS     = 'fluxe-appointments-v1'
export const KEY_FOLLOWUP         = 'fluxe-followup-contacts-v1'
