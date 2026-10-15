const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createReceiptQueue } = require('./receiptQueue')
const ORG = '11111111-1111-4111-8111-111111111111'
const SALE = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
function fixture({ enabled = true, rpcError = null, rpcData, saleStatus = 'completed', rpcThrows = false } = {}) {
  const calls = []
  let persisted
  const client = {
    from(table) {
      return {
        select() { return this }, eq() { return this },
        async in() { return { data: [] } },
        async maybeSingle() { return { data: table === 'sales' ? {
          id: SALE, number: 1, status: saleStatus, total: 108, subtotal: 100, tax: 8, tip: 0,
          sale_items: [{ name: 'Perfume', qty: 1, subtotal: 100 }], payments: [{ amount: 108 }],
        } : null } },
      }
    },
    rpc(name, params) {
      return { abortSignal(signal) {
        assert.ok(signal instanceof AbortSignal)
        if (rpcThrows) throw new Error('request aborted')
      calls.push({ name, params })
      if (rpcError) return { error: rpcError }
      if (rpcData) return { data: rpcData }
      // Simulates database RPC contract only; does not prove PostgreSQL locking.
      if (persisted && persisted.p_recipient !== params.p_recipient) return { data: { error: 'recipient_conflict' } }
      const duplicate = Boolean(persisted)
      persisted ||= params
      return { data: { id: 'queue-id', status: 'held', duplicate } }
      } }
    },
  }
  const handler = createReceiptQueue({ getClient: () => client, isEnabled: () => enabled })
  async function request(body = {}) {
    const req = { auth: { orgId: ORG, userId: USER }, body: { saleId: SALE, phone: '7025551234', receiptRequested: true, ...body } }
    const res = { code: 200, set() {}, status(code) { this.code = code; return this }, json(body) { this.body = body; return this } }
    await handler(req, res)
    return res
  }
  return { request, calls }
}
test('queue remains disabled by default with no database writes', async () => {
  const f = fixture({ enabled: false })
  assert.equal((await f.request()).code, 503)
  assert.equal(f.calls.length, 0)
})
test('passes verified identity only; database builds receipt and keeps it held', async () => {
  const f = fixture()
  const r = await f.request()
  assert.equal(r.code, 202)
  assert.equal(r.body.status, 'held')
  assert.equal(r.body.sent, false)
  assert.equal(f.calls[0].name, 'enqueue_receipt')
  assert.deepEqual(f.calls[0].params, {
    p_org_id: ORG, p_sale_id: SALE, p_requested_by: USER, p_recipient: '+17025551234',
  })
  assert.equal(Object.hasOwn(f.calls[0].params, 'p_message'), false)
})
test('retries reuse RPC record; destination changes do not overwrite original', async () => {
  const f = fixture()
  const [a, b] = await Promise.all([f.request(), f.request()])
  assert.deepEqual([a.code, b.code].sort(), [200, 202])
  assert.equal(a.body.requestId, b.body.requestId)
  assert.equal((await f.request({ phone: '2125551234' })).code, 409)
})
test('database failure and missing migration never report a saved request', async () => {
  const f = fixture({ rpcError: { code: 'PGRST202' } })
  const r = await f.request()
  assert.equal(r.code, 503)
  assert.equal(r.body.queued, undefined)
})

test('aborted RPC has an unknown outcome and never reports success', async () => {
  const r = await fixture({ rpcThrows: true }).request()
  assert.equal(r.code, 503)
  assert.equal(r.body.queued, undefined)
})
test('revalidates consent, status and payload before persisting', async () => {
  for (const body of [{ receiptRequested: false }, { message: 'arbitrary' }]) {
    const f = fixture()
    assert.equal((await f.request(body)).code, 400)
    assert.equal(f.calls.length, 0)
  }
  const f = fixture({ saleStatus: 'voided' })
  assert.equal((await f.request()).code, 409)
  assert.equal(f.calls.length, 0)
})
test('maps transaction rejections without exposing database errors', async () => {
  for (const [error, code] of [['queue_busy', 503], ['rate_limit', 429], ['opted_out', 403], ['sale_incomplete', 409], ['sale_not_found', 404], ['organization_denied', 403]]) {
    assert.equal((await fixture({ rpcData: { error } }).request()).code, code)
  }
})
