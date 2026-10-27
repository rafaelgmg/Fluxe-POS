const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readWorkerConfig, createReceiptWorker, createReceiptWorkerStore } = require('./receiptWorker')
const config = { orgId: '11111111-1111-4111-8111-111111111111', requestId: '22222222-2222-4222-8222-222222222222', recipient: '+17025551234', from: '+17025555678' }
const sid = `SM${'a'.repeat(32)}`
function fixture(options = {}) {
  const row = { id: config.requestId, organization_id: config.orgId, recipient: config.recipient,
    status: 'pending', attempts: 0, channel: 'sms', purpose: 'receipt', message_body: 'Receipt fixture', ...options.row }
  const sends = []
  const store = {
    async expire() {},
    async claim() {
      if (row.status !== 'pending' || row.attempts !== 0) return null
      row.status = 'processing'; row.attempts = 1
      return { ...row }
    },
    async revalidate() { if (options.validationError) throw new Error('Unavailable'); return options.valid !== false },
    async finish(_config, patch) { if (options.persistError) throw new Error('Unavailable'); Object.assign(row, patch); return row },
  }
  const make = (enabled = true) => createReceiptWorker({ config: enabled ? options.config || config : null, store,
    send: async payload => { sends.push(payload); if (options.sendError) throw options.sendError; return options.reply || { sid } },
    log: { info() {}, warn() {} },
  })
  return { row, sends, make }
}
test('worker disabled by default; incomplete live configuration cannot enable sending', () => {
  assert.equal(readWorkerConfig({}), null)
  assert.throws(() => readWorkerConfig({ RECEIPT_WORKER_ENABLED: 'true', RECEIPT_WORKER_MODE: 'live' }))
  const env = { RECEIPT_WORKER_ENABLED: 'true', RECEIPT_WORKER_MODE: 'test', ORG_ID: config.orgId,
    RECEIPT_TEST_REQUEST_ID: config.requestId, RECEIPT_TEST_NUMBER: config.recipient,
    TWILIO_PHONE_NUMBER: config.from, TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'fixture' }
  assert.deepEqual(readWorkerConfig(env), config)
  assert.throws(() => readWorkerConfig({ ...env, RECEIPT_TEST_NUMBER: '7025551234' }))
})

test('live config requires independent send and queue gates, supports a restricted pilot', () => {
  const { getDeliveryConfig } = require('./receiptDelivery')
  const env = { RECEIPT_WORKER_ENABLED: 'true', RECEIPT_WORKER_MODE: 'live', ORG_ID: config.orgId,
    RECEIPT_SEND_ENABLED: 'true', RECEIPT_QUEUE_ENABLED: 'true',
    TWILIO_PHONE_NUMBER: config.from, TWILIO_ACCOUNT_SID: `AC${'a'.repeat(32)}`, TWILIO_AUTH_TOKEN: 'fixture' }
  assert.equal(readWorkerConfig(env).mode, 'live')
  for (const key of ['RECEIPT_WORKER_ENABLED', 'RECEIPT_SEND_ENABLED', 'RECEIPT_QUEUE_ENABLED']) {
    assert.equal(getDeliveryConfig({ ...env, [key]: 'false' }, config.orgId), null)
  }
  assert.equal(getDeliveryConfig(env, 'foreign'), null)
  assert.equal(getDeliveryConfig({ ...env, RECEIPT_LIVE_TEST_NUMBER: 'invalid' }, config.orgId), null)
  assert.equal(getDeliveryConfig({ ...env, RECEIPT_LIVE_TEST_NUMBER: config.recipient }, config.orgId).recipient, config.recipient)
})

test('live worker sends different explicitly released requests; held or test rows do not send', async () => {
  const live = { mode: 'live', orgId: config.orgId, from: config.from, recipient: null }
  for (const recipient of [config.recipient, '+12125551234']) {
    const f = fixture({ config: live, row: { recipient, delivery_mode: 'live' } })
    await f.make().tick(); await f.make().tick()
    assert.equal(f.sends.length, 1)
    assert.equal(f.sends[0].to, recipient)
  }
  for (const row of [{ status: 'held', delivery_mode: 'live' }, { delivery_mode: 'test' },
    { delivery_mode: 'live', organization_id: 'foreign' }]) {
    const f = fixture({ config: live, row }); await f.make().tick()
    assert.equal(f.sends.length, 0)
  }
})

test('live store uses atomic claim RPC and refuses unscoped outcome updates', async () => {
  const live = { mode: 'live', orgId: config.orgId, recipient: null }
  const store = createReceiptWorkerStore(() => ({ rpc(name, args) {
    assert.equal(name, 'claim_receipt_send')
    assert.deepEqual(args, { p_org_id: config.orgId, p_recipient: null })
    return { async abortSignal() { return { data: [] } } }
  } }))
  assert.equal(await store.claim(live), null)
  assert.throws(() => store.finish(live, { status: 'sent' }))
  assert.throws(() => store.release(live))
})
test('disabled worker and held requests never send', async () => {
  const disabled = fixture(); await disabled.make(false).tick(); assert.equal(disabled.row.attempts, 0)
  const held = fixture({ row: { status: 'held' } }); await held.make().tick(); assert.equal(held.sends.length, 0)
})
test('two workers racing use a single claim; subsequent ticks do not resend', async () => {
  const f = fixture()
  const first = f.make(), second = f.make()
  await Promise.all([first.tick(), second.tick()]); await second.tick()
  assert.equal(f.sends.length, 1)
  assert.deepEqual(f.sends[0], { to: config.recipient, from: config.from, body: 'Receipt fixture' })
  assert.equal(f.row.status, 'sent'); assert.equal(f.row.provider_message_id, sid)
})
test('foreign organization, request or destination never sends', async () => {
  for (const row of [{ organization_id: 'foreign' }, { id: 'foreign' }, { recipient: '+17025559999' }]) {
    const f = fixture({ row }); await f.make().tick(); assert.equal(f.sends.length, 0)
  }
})
test('changed consent/invalid sale and unavailable validation block provider call', async () => {
  for (const opts of [{ valid: false }, { validationError: true }]) {
    const f = fixture(opts); await f.make().tick(); assert.equal(f.sends.length, 0)
    assert.ok(['failed', 'cancelled'].includes(f.row.status))
  }
})
test('timeouts, 5xx and missing confirmation are uncertain and never retried', async () => {
  for (const opts of [{ sendError: new Error('timeout') }, { sendError: { status: 503 } }, { reply: {} }]) {
    const f = fixture(opts); const worker = f.make(); await worker.tick(); await worker.tick()
    assert.equal(f.row.status, 'uncertain'); assert.equal(f.sends.length, 1)
  }
})
test('provider rejection fails without retry', async () => {
  const f = fixture({ sendError: { status: 400 } }); await f.make().tick()
  assert.equal(f.row.status, 'failed')
})
test('provider failure with a SID is recorded as failed, not sent', async () => {
  const f = fixture({ reply: { sid, status: 'failed' } }); await f.make().tick()
  assert.equal(f.row.status, 'failed'); assert.equal(f.row.provider_message_id, sid)
})
test('database failure after sending leaves processing and prevents a second send', async () => {
  const f = fixture({ persistError: true }); await f.make().tick(); await f.make().tick()
  assert.equal(f.row.status, 'processing'); assert.equal(f.sends.length, 1)
})
test('Supabase claim query includes organization, exact recipient, status and attempts guards', async () => {
  const calls = []
  const query = new Proxy({}, { get(_target, method) { return (...args) => {
    calls.push([method, ...args])
    return method === 'abortSignal' ? Promise.resolve({ data: null, error: null }) : query
  } } })
  const store = createReceiptWorkerStore(() => ({ from: () => query }))
  await store.claim(config)
  for (const filter of [['eq', 'organization_id', config.orgId], ['eq', 'id', config.requestId],
    ['eq', 'recipient', config.recipient], ['eq', 'status', 'pending'], ['eq', 'attempts', 0], ['is', 'provider_message_id', null]]) {
    assert.ok(calls.some(call => JSON.stringify(call) === JSON.stringify(filter)))
  }
})
