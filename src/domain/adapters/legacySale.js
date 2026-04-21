import { SALE_DEFAULTS, SALE_ITEM_DEFAULTS } from '../models/sale'

/**
 * Normalizes a raw sale (from localStorage or future backend response) to the
 * canonical Sale shape. Safe to call on already-normalized objects.
 *
 * Handles:
 *  - missing payments[] → built from legacy flat fields (paymentMethod, cardBrand, etc.)
 *  - missing status / tip / totalSpare / locationId / employeeId
 *
 * @param {object} raw
 * @returns {import('../models/sale').Sale}
 */
// Maps legacy localStorage status values to the canonical Supabase enum values.
// 'refunded' is not in the Supabase schema yet — preserved as-is for local use.
const STATUS_CANONICAL = { normal: 'completed', deleted: 'voided' }

export function normalizeSale(raw) {
  if (!raw) return raw

  let payments = raw.payments
  if (!Array.isArray(payments) || payments.length === 0) {
    payments = buildPaymentsFromLegacy(raw)
  }

  // Canonical status: maps legacy 'normal'/'deleted' → 'completed'/'voided'
  const status = STATUS_CANONICAL[raw.status] ?? raw.status ?? 'completed'

  // Derive paymentMethod from payments[] when the flat field is absent.
  // Supabase-sourced sales have payments[] but no paymentMethod column.
  const paymentMethod = raw.paymentMethod
    || (payments.length === 1 ? payments[0].method : payments.length > 1 ? 'split' : '')

  return {
    ...SALE_DEFAULTS,
    ...raw,
    payments,
    paymentMethod,
    status,
    tip:              raw.tip              ?? 0,
    totalSpare:       raw.totalSpare       ?? 0,
    locationId:       raw.locationId       ?? null,
    employeeId:       raw.employeeId       ?? null,
    linkedCustomerId: raw.linkedCustomerId ?? null,
    notes:            raw.notes            ?? '',
    items:            (raw.items || []).map(normalizeSaleItem),
  }
}

/**
 * Normalizes a raw SaleItem. Safe to call on already-normalized items.
 * lineId is preserved if present; legacy items (without lineId) get null —
 * the caller can reconstruct a fallback lineId from invoiceNumber + index when needed.
 *
 * @param {object} raw
 * @returns {import('../models/sale').SaleItem}
 */
export function normalizeSaleItem(raw) {
  if (!raw) return raw
  return {
    ...SALE_ITEM_DEFAULTS,
    ...raw,
    lineId:      raw.lineId      ?? null,
    productId:   raw.productId   ?? null,
    categoryId:  raw.categoryId  ?? null,
    minPrice:    raw.minPrice    ?? 0,
    discount:    raw.discount    ?? 0,
    spare:       raw.spare       ?? 0,
    systemPrice: raw.systemPrice ?? raw.salePrice ?? 0,
    description: raw.description ?? '',
    size:        raw.size        ?? '',
  }
}

// ── Internal ────────────────────────────────────────────────────────────────

function buildPaymentsFromLegacy(raw) {
  const method = raw.paymentMethod
  if (!method || method === 'split') return []

  const normalized = resolveMethod(method)
  const payment    = { method: normalized, amount: raw.total ?? 0 }

  if (normalized === 'cash') {
    payment.amountReceived = raw.amountReceived ?? raw.total ?? 0
    payment.changeDue      = raw.changeDue ?? 0
  } else if (normalized === 'card') {
    payment.cardBrand           = raw.cardBrand           ?? ''
    payment.cardLast4           = raw.cardLast4           ?? ''
    payment.authorizationNumber = raw.authorizationNumber ?? ''
  } else if (normalized === 'external') {
    payment.externalRef = raw.externalRef ?? ''
  } else if (normalized === 'check') {
    payment.checkNumber = raw.checkNumber ?? ''
  }

  return [payment]
}

function resolveMethod(m) {
  if (!m) return 'cash'
  const lower = m.toLowerCase()
  if (lower === 'cash')              return 'cash'
  if (lower.includes('card'))        return 'card'
  if (lower.includes('external'))    return 'external'
  if (lower.includes('check'))       return 'check'
  return lower
}
