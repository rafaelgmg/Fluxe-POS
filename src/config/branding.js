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
      business_type: 'retail',   // 'retail' | 'service'
    },
    {
      id:            'loc_02',
      name:          'Perfume Passage',
      address:       'Las Vegas, Nevada',
      region:        'Las Vegas',
      phone:         '',
      business_type: 'retail',   // 'retail' | 'service'
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

export const BUSINESS      = branding.business.name
export const BUSINESS_SHORT = branding.business.nameShort
export const SYSTEM_NAME   = branding.system.name
export const SYSTEM_TAG    = branding.system.tagline
export const CREATOR       = branding.system.creator
export const LOGO          = branding.business.logo
export const TAX_RATE      = branding.finance.taxRate
export const CURRENCY      = branding.finance.currencySymbol
export const COLORS        = branding.colors
export const LOCATIONS_CFG = branding.locations
export const DEFAULT_LOCATION = branding.locations[0].name
export const REGIONS       = [...new Set(branding.locations.map(l => l.region))]
export const LOCATION_MAP  = REGIONS.reduce((acc, r) => {
  acc[r] = branding.locations.filter(l => l.region === r).map(l => l.name)
  return acc
}, {})
export const ACCOUNTS      = [branding.business.account]
export const LOGIN_PASSWORD = branding.login.password
export const LOGIN_CHECKBOX = branding.login.checkboxLabel
