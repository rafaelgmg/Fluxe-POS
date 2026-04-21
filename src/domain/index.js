// ── Models (typedefs + defaults) ─────────────────────────────────────────────
export * from './models/sale'
export * from './models/product'
export * from './models/user'
export * from './models/location'
export * from './models/customer'
export * from './models/inventory'
export * from './models/commission'
export * from './models/clock'
export * from './models/transient'

// ── Adapters (normalize legacy/raw data → canonical shape) ───────────────────
export * from './adapters/legacySale'
export * from './adapters/legacyProduct'
export * from './adapters/legacyUser'

// ── Utils ─────────────────────────────────────────────────────────────────────
export * from './utils/ids'
