/**
 * branding.js — Single source of truth for all business & visual configuration.
 *
 * To white-label Fluxe for another business:
 *   1. Edit ONLY this file.
 *   2. The entire system adapts automatically.
 */

const branding = {
  // ── System (never changes per client) ──────────────────────────────────────
  system: {
    name:    'Fluxe',
    tagline: 'Retail Simplified',
    version: '1.0.0',
    creator: 'Fluxion Technologies',
  },

  // ── Business (changes per client) ──────────────────────────────────────────
  business: {
    name:       'Perfume Passage',       // Full business name
    nameShort:  'PERFUME PASSAGE',       // Uppercase/display version
    account:    'Delmondes_Retailing_NV_Inc',
    industry:   'Perfume & Fragrance',
    logo:       null,                    // No emoji — uses text logo
  },

  // ── Locations ───────────────────────────────────────────────────────────────
  locations: [
    {
      id:            'loc_01',
      name:          'Miracle Mall 01',
      address:       '3663 Las Vegas Blvd, Las Vegas, Nevada',
      region:        'Las Vegas',
      phone:         '',
      business_type:  'retail',     // 'retail' | 'service' — routes to POS vs ServiceApp
      location_type:  'retail',     // 'retail' | 'warehouse' — retail=POS/sales, warehouse=storage only
    },
    {
      id:            'loc_02',
      name:          'Perfume Passage',
      address:       'Las Vegas, Nevada',
      region:        'Las Vegas',
      phone:         '',
      business_type:  'retail',     // 'retail' | 'service'
      location_type:  'retail',     // 'retail' | 'warehouse'
    },
  ],

  // ── Finance ─────────────────────────────────────────────────────────────────
  finance: {
    taxRate:       0.085,   // 8.5% Nevada
    currency:      'USD',
    currencySymbol: '$',
  },

  // ── Colors ──────────────────────────────────────────────────────────────────
  // Change these to rebrand the entire UI instantly.
  colors: {
    primary:   '#3b82f6',   // Blue — buttons, tabs, highlights
    primaryHv: '#1d4ed8',   // Hover state of primary
    accent:    '#f59e0b',   // Gold — header logo, admin highlights
    admin:     '#8b5cf6',   // Purple — admin panel
    crm:       '#06b6d4',   // Teal — CRM panel
    success:   '#22c55e',   // Green — confirmed, saved
    danger:    '#ef4444',   // Red — error, damage, low stock
    warning:   '#f59e0b',   // Amber — discount, warning
    bg:        '#030e1e',   // Main background (deep navy)
    bgDark:    '#0d1526',   // Darker panels
    bgCard:    '#111d30',   // Cards / modals / inputs
    border:    '#253349',   // Borders
    textPrimary:   '#f1f5f9',
    textSecondary: '#cbd0e0',
    textMuted:     '#94a3b8',
  },

  // ── Login screen ────────────────────────────────────────────────────────────
  login: {
    password:       import.meta.env.VITE_ADMIN_PASSWORD || '',
    checkboxLabel:  'Use only with Perfume Passage',
  },

  // ── Receipt ─────────────────────────────────────────────────────────────────
  receipt: {
    footer: 'No Refunds. Exchanges within 14 days.',
    legal:  'Thank you for your purchase!',
  },

  // ── CRM / SMS ───────────────────────────────────────────────────────────────
  crm: {
    smsSignature: '— Perfume Passage',
  },
}

export default branding

// ── Convenience exports ──────────────────────────────────────────────────────
// Import these directly in components for cleaner code.
// Static — never change per tenant:
export const SYSTEM_NAME    = branding.system.name
export const SYSTEM_TAG     = branding.system.tagline
export const CREATOR        = branding.system.creator
export const LOGO           = branding.business.logo
export const COLORS         = branding.colors
export const ACCOUNTS       = [branding.business.account]
export const LOGIN_PASSWORD = branding.login.password
export const LOGIN_CHECKBOX = branding.login.checkboxLabel

// ── Live bindings (mutable per-tenant) ──────────────────────────────────────
// These are `let` so applyOrgSettings() can reassign them after Supabase loads.
// Importers always see the current value — ES module live bindings guarantee this.

function _buildDerived(locs) {
  const retail   = locs.filter(l => l.location_type !== 'warehouse')
  const regions  = [...new Set(locs.map(l => l.region))]
  const locMap   = regions.reduce((acc, r) => {
    acc[r] = locs.filter(l => l.region === r).map(l => l.name)
    return acc
  }, {})
  const retailMap = regions.reduce((acc, r) => {
    acc[r] = retail.filter(l => l.region === r).map(l => l.name)
    return acc
  }, {})
  return { retail, regions, locMap, retailMap }
}

const _init = _buildDerived(branding.locations)

export let BUSINESS           = branding.business.name
export let BUSINESS_SHORT     = branding.business.nameShort
export let TAX_RATE           = branding.finance.taxRate
export let CURRENCY           = branding.finance.currencySymbol
export let RECEIPT_FOOTER     = branding.receipt.footer
export let RECEIPT_LEGAL      = branding.receipt.legal
export let SMS_SIGNATURE      = branding.crm.smsSignature
export let LOCATIONS_CFG      = branding.locations
export let RETAIL_LOCATIONS   = _init.retail
export let DEFAULT_LOCATION   = _init.retail[0]?.name || branding.locations[0].name
export let REGIONS            = _init.regions
export let LOCATION_MAP       = _init.locMap
export let RETAIL_LOCATION_MAP = _init.retailMap

/**
 * Apply org settings fetched from Supabase, updating all live bindings.
 * Called once on boot (after awaitOrgSession) and when an admin saves settings.
 */
export function applyOrgSettings(settings) {
  if (!settings) return
  if (settings.business_name)    BUSINESS       = settings.business_name
  if (settings.business_short)   BUSINESS_SHORT = settings.business_short
  if (settings.tax_rate != null) TAX_RATE       = settings.tax_rate
  if (settings.currency_symbol)  CURRENCY       = settings.currency_symbol
  if (settings.receipt_footer)   RECEIPT_FOOTER = settings.receipt_footer
  if (settings.receipt_legal)    RECEIPT_LEGAL  = settings.receipt_legal
  if (settings.crm_sms_signature) SMS_SIGNATURE = settings.crm_sms_signature
  if (Array.isArray(settings.locations) && settings.locations.length) {
    LOCATIONS_CFG  = settings.locations
    const d        = _buildDerived(settings.locations)
    RETAIL_LOCATIONS    = d.retail
    REGIONS             = d.regions
    LOCATION_MAP        = d.locMap
    RETAIL_LOCATION_MAP = d.retailMap
    DEFAULT_LOCATION    = d.retail[0]?.name || settings.locations[0]?.name || DEFAULT_LOCATION
  }
}
