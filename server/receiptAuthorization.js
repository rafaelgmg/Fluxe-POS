const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Current messaging transport supports North American numbers only. Never truncate.
function normalizePhone(value) {
  if (typeof value !== 'string' || !/^[+\d\s().-]{10,30}$/.test(value)) return null
  const digits = value.replace(/\D/g, '')
  if (/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+1${digits}`
  if (/^1[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return `+${digits}`
  return null
}

function createReceiptAuthorization({ getClient, onAuthorized }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store')
    if (!req.auth?.orgId) return res.status(401).json({ error: 'Authentication required' })
    const input = req.body || {}
    const allowed = new Set(['saleId', 'phone', 'receiptRequested', 'orgId'])
    if (Object.keys(input).some(k => !allowed.has(k))) return res.status(400).json({ error: 'Only saleId, phone and receiptRequested are accepted' })
    const phone = normalizePhone(input.phone)
    if (!UUID.test(input.saleId || '') || !phone || input.receiptRequested !== true) {
      return res.status(400).json({ error: 'A synced sale, valid US/Canada phone and customer receipt request are required' })
    }
    try {
      const sb = getClient()
      if (!sb) throw Error('unavailable')
      const { data: sale, error } = await sb.from('sales')
        .select('id,number,status,total,subtotal,tax,tip,location_name,linked_customer_id,sale_items(name,qty,subtotal),payments(amount)')
        .eq('organization_id', req.auth.orgId).eq('id', input.saleId).maybeSingle()
      if (error) throw error
      if (!sale) return res.status(404).json({ error: 'Sale not found' })
      if (sale.status !== 'completed') return res.status(409).json({ error: 'Only completed sales can have a receipt authorized' })
      const cents = n => Math.round(Number(n) * 100)
      const total = cents(sale.total)
      const items = sale.sale_items || []
      const payments = sale.payments || []
      if (!Number.isSafeInteger(total) || total <= 0 || !items.length || !payments.length ||
          items.some(i => !Number.isInteger(i.qty) || i.qty <= 0 || !Number.isFinite(Number(i.subtotal))) ||
          payments.some(p => !Number.isFinite(Number(p.amount)) || Number(p.amount) <= 0) ||
          items.reduce((sum, i) => sum + cents(i.subtotal), 0) !== cents(sale.subtotal) ||
          cents(sale.subtotal) + cents(sale.tax) + cents(sale.tip) !== total ||
          payments.reduce((sum, p) => sum + cents(p.amount), 0) !== total) {
        return res.status(409).json({ error: 'Sale synchronization is incomplete or totals do not match' })
      }
      // Check every matching record, including archived opt-outs and legacy +1 formats.
      const candidates = [phone, phone.slice(1), phone.slice(2)]
      const { data: customers, error: customerError } = await sb.from('customers')
        .select('id,phone,sms_consent_status,archived').eq('organization_id', req.auth.orgId)
        .in('phone_normalized', candidates)
      if (customerError) throw customerError
      if ((customers || []).some(c => c.sms_consent_status === 'opted_out')) {
        return res.status(403).json({ error: 'This number has opted out of SMS messages' })
      }
      if (sale.linked_customer_id) {
        const { data: customer, error: linkedError } = await sb.from('customers')
          .select('id,phone,sms_consent_status,archived').eq('organization_id', req.auth.orgId)
          .eq('id', sale.linked_customer_id).maybeSingle()
        if (linkedError) throw linkedError
        if (!customer || customer.archived || normalizePhone(customer.phone) !== phone || customer.sms_consent_status === 'opted_out') {
          return res.status(403).json({ error: 'Recipient does not match an eligible customer linked to this sale' })
        }
      }
      const clean = value => String(value || '').replace(/[\r\n\t]/g, ' ').slice(0, 80)
      const lines = items.slice(0, 4).map(i => `${clean(i.name)} x${i.qty} - $${Number(i.subtotal).toFixed(2)}`)
      if (items.length > 4) lines.push(`+${items.length - 4} more items`)
      const message = [
        `${clean(sale.location_name) || 'Fluxe'} - Receipt #${sale.number}`,
        ...lines, `Total: $${Number(sale.total).toFixed(2)}`, 'Thank you for shopping with us!',
      ].join('\n')
      if (onAuthorized) return await onAuthorized({ req, res, saleId: sale.id, phone, message })
      // This is a read-only eligibility check, NOT a send token or a queued request.
      // The future queue must revalidate and atomically enforce idempotency.
      return res.json({ status: 'authorized', queued: false, sent: false, saleId: sale.id, phone, message })
    } catch {
      return res.status(503).json({ error: 'Unable to verify receipt details. Try again later.' })
    }
  }
}

module.exports = { createReceiptAuthorization, normalizePhone }
