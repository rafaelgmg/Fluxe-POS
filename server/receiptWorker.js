// Controlled pilot: one explicitly selected request, one allowlisted destination.
// No automatic retries: a timeout can mean the provider accepted the message.
const { normalizePhone } = require('./receiptAuthorization')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function readWorkerConfig(env) {
  if (env.RECEIPT_WORKER_ENABLED !== 'true') return null
  if (env.RECEIPT_WORKER_MODE !== 'test' || !UUID.test(env.ORG_ID || '') ||
      !UUID.test(env.RECEIPT_TEST_REQUEST_ID || '') ||
      normalizePhone(env.RECEIPT_TEST_NUMBER) !== env.RECEIPT_TEST_NUMBER || !env.RECEIPT_TEST_NUMBER ||
      !/^\+[1-9]\d{7,14}$/.test(env.TWILIO_PHONE_NUMBER || '') ||
      !/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID || '') || !env.TWILIO_AUTH_TOKEN) {
    throw new Error('Receipt worker test configuration is incomplete or invalid')
  }
  return { orgId: env.ORG_ID, requestId: env.RECEIPT_TEST_REQUEST_ID,
    recipient: env.RECEIPT_TEST_NUMBER, from: env.TWILIO_PHONE_NUMBER }
}

function createReceiptWorkerStore(getClient) {
  const scope = (query, config) => query.eq('organization_id', config.orgId)
    .eq('id', config.requestId).eq('recipient', config.recipient)
    .eq('channel', 'sms').eq('purpose', 'receipt')
  async function one(query) {
    const { data, error } = await query.select('*').maybeSingle().abortSignal(AbortSignal.timeout(10_000))
    if (error) throw new Error('Receipt database operation failed')
    return data
  }
  return {
    release: config => one(scope(getClient().from('receipt_queue').update({ status: 'pending', last_error_code: null }), config)
      .eq('status', 'held').eq('attempts', 0).is('provider_message_id', null)),
    claim: config => one(scope(getClient().from('receipt_queue').update({ status: 'processing', attempts: 1, last_error_code: null }), config)
      .eq('status', 'pending').eq('attempts', 0).is('provider_message_id', null)),
    async revalidate(row) {
      const { data, error } = await getClient().rpc('enqueue_receipt', {
        p_org_id: row.organization_id, p_sale_id: row.sale_id,
        p_requested_by: row.requested_by_auth_user_id, p_recipient: row.recipient,
      }).abortSignal(AbortSignal.timeout(10_000))
      if (error || !data) throw new Error('Receipt validation unavailable')
      return data.id === row.id && data.duplicate === true && data.status === 'processing' && !data.error
    },
    finish: (config, patch) => one(scope(getClient().from('receipt_queue').update(patch), config)
      .eq('status', 'processing').eq('attempts', 1)),
    expire: config => one(scope(getClient().from('receipt_queue').update({
      status: 'uncertain', last_error_code: 'worker_interrupted',
    }), config).eq('status', 'processing').eq('attempts', 1)
      .lt('updated_at', new Date(Date.now() - 15 * 60_000).toISOString())),
  }
}

function createReceiptWorker({ config, store, send, log = console }) {
  let running = false
  async function tick() {
    if (!config || running) return
    running = true
    try {
      await store.expire(config)
      const row = await store.claim(config)
      if (!row) return
      // Defense in depth: never redirect a customer's receipt to a test number.
      if (row.id !== config.requestId || row.organization_id !== config.orgId ||
          row.recipient !== config.recipient || row.status !== 'processing' || row.attempts !== 1 ||
          row.channel !== 'sms' || row.purpose !== 'receipt' ||
          typeof row.message_body !== 'string' || !row.message_body.length || row.message_body.length > 2000) {
        await store.finish(config, { status: 'cancelled', last_error_code: 'worker_scope_denied' })
        return
      }
      let valid
      try { valid = await store.revalidate(row) } catch {
        await store.finish(config, { status: 'failed', last_error_code: 'revalidation_unavailable' })
        return
      }
      if (!valid) {
        await store.finish(config, { status: 'cancelled', last_error_code: 'receipt_no_longer_eligible' })
        return
      }
      let patch
      try {
        const message = await send({ to: row.recipient, from: config.from, body: row.message_body })
        if (!/^SM[0-9a-f]{32}$/i.test(message?.sid || '')) throw new Error('Missing provider confirmation')
        const failed = ['failed', 'undelivered', 'canceled'].includes(message.status)
        patch = { status: failed ? 'failed' : 'sent', provider_message_id: message.sid,
          last_error_code: failed ? 'provider_rejected' : null }
      } catch (error) {
        // Only an explicit HTTP 4xx rejection is a definite failure. All other
        // outcomes are unknown and must never trigger a second automatic send.
        const rejected = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 && error.status !== 408
        patch = { status: rejected ? 'failed' : 'uncertain',
          last_error_code: rejected ? 'provider_rejected' : 'provider_outcome_unknown' }
      }
      const saved = await store.finish(config, patch)
      if (!saved) throw new Error('Receipt outcome could not be persisted')
      log.info('[ReceiptWorker]', { requestId: row.id, status: patch.status })
    } catch {
      // Do not log provider errors, credentials, bodies or customer numbers.
      log.warn('[ReceiptWorker] Processing interrupted; no automatic resend. Inspect request status.')
    } finally { running = false }
  }
  return { tick, start() {
    if (!config) return () => {}
    const timer = setInterval(tick, 10_000)
    timer.unref?.()
    void tick()
    return () => clearInterval(timer)
  } }
}

function startReceiptWorker(env, getClient) {
  let config
  try { config = readWorkerConfig(env) } catch {
    console.warn('[ReceiptWorker] Disabled: invalid test configuration')
    return () => {}
  }
  if (!config) { console.info('[ReceiptWorker] Disabled'); return () => {} }
  const client = require('twilio')(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN, { autoRetry: false, timeout: 30_000 })
  return createReceiptWorker({ config, store: createReceiptWorkerStore(getClient),
    send: payload => client.messages.create(payload) }).start()
}

module.exports = { readWorkerConfig, createReceiptWorkerStore, createReceiptWorker, startReceiptWorker }
