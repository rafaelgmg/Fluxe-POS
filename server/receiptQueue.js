const { createReceiptAuthorization } = require('./receiptAuthorization')

const ERRORS = {
  invalid_request: [400, 'Invalid receipt request'],
  organization_denied: [403, 'Organization access denied'],
  sale_not_found: [404, 'Sale not found'],
  sale_not_completed: [409, 'Only completed sales can have receipts queued'],
  sale_incomplete: [409, 'Sale synchronization is incomplete'],
  opted_out: [403, 'This number has opted out of SMS messages'],
  recipient_denied: [403, 'Recipient does not match the customer linked to this sale'],
  recipient_conflict: [409, 'A receipt was already requested for a different number. Contact a manager.'],
  rate_limit: [429, 'Receipt request limit reached for this number. Try again later.'],
  queue_busy: [503, 'Receipt queue is busy. Check the request status, then retry if needed.'],
}

function createReceiptQueue({ getClient, isEnabled = () => false, send = false, getDeliveryConfig = () => null }) {
  const authorize = createReceiptAuthorization({
    getClient,
    async onAuthorized({ req, res, saleId, phone }) {
      if (send) {
        const delivery = getDeliveryConfig(req.auth.orgId)
        if (!delivery) return res.status(503).json({ error: 'Receipt sending is not enabled. No request was released.' })
        if (delivery.recipient && delivery.recipient !== phone) {
          return res.status(403).json({ error: 'Receipt sending is currently limited to the configured test number.' })
        }
      }
      const { data, error } = await getClient().rpc(send ? 'request_receipt_send' : 'enqueue_receipt', {
        p_org_id: req.auth.orgId, p_sale_id: saleId,
        p_requested_by: req.auth.userId, p_recipient: phone,
      }).abortSignal(AbortSignal.timeout(10_000))
      if (error || !data) return res.status(503).json({ error: 'Receipt queue unavailable. Retry the same request later.' })
      if (data.error) {
        const [code, message] = ERRORS[data.error] || [503, 'Receipt queue unavailable']
        return res.status(code).json({ error: message })
      }
      if (!data.id || !['held', 'pending', 'processing', 'sent', 'failed', 'uncertain', 'cancelled'].includes(data.status)) {
        return res.status(503).json({ error: 'Unable to confirm receipt request' })
      }
      return res.status(data.duplicate ? 200 : 202).json({
        requestId: data.id, status: data.status, duplicate: data.duplicate === true,
        queued: true, sent: data.status === 'sent',
      })
    },
  })
  return (req, res) => {
    res.set('Cache-Control', 'no-store')
    if (!isEnabled()) return res.status(503).json({ error: 'Receipt queue is not enabled yet. No request was saved.' })
    return authorize(req, res)
  }
}
function createReceiptStatus({ getClient, getDeliveryConfig = () => null }) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store')
    if (!req.auth?.orgId) return res.status(401).json({ error: 'Authentication required' })
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.saleId || '')) {
      return res.status(400).json({ error: 'Invalid sale ID' })
    }
    try {
      const sb = getClient()
      const { data: sale, error: saleError } = await sb.from('sales').select('id')
        .eq('organization_id', req.auth.orgId).eq('id', req.params.saleId).maybeSingle()
      if (saleError) throw saleError
      if (!sale) return res.status(404).json({ error: 'Sale not found' })
      const { data, error } = await sb.from('receipt_queue').select('id,status,recipient,requested_at,updated_at')
        .eq('organization_id', req.auth.orgId).eq('sale_id', req.params.saleId)
        .eq('channel', 'sms').eq('purpose', 'receipt').maybeSingle()
      if (error) throw error
      const delivery = getDeliveryConfig(req.auth.orgId)
      return res.json({ sendingEnabled: !!delivery, testOnly: !!delivery?.recipient, request: data ? {
        requestId: data.id, status: data.status, recipientLast4: data.recipient.slice(-4),
        requestedAt: data.requested_at, updatedAt: data.updated_at,
      } : null })
    } catch {
      return res.status(503).json({ error: 'Unable to check receipt status. No new request was created.' })
    }
  }
}
module.exports = { createReceiptQueue, createReceiptStatus }
