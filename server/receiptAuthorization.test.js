const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createApiGuard } = require('./security')
const { createReceiptAuthorization, normalizePhone } = require('./receiptAuthorization')
const ORG = '11111111-1111-4111-8111-111111111111'
const ID = '22222222-2222-4222-8222-222222222222'
const CUSTOMER = '33333333-3333-4333-8333-333333333333'
const baseSale = { id: ID, number: 100, status: 'completed', location_name: 'Venetian', total: 108, subtotal: 100, tax: 8, tip: 0, sale_items: [{ name: 'Perfume', qty: 1, subtotal: 100 }], payments: [{ amount: 108 }] }

async function verify({ sale = baseSale, customers = [], customer = null, input = {}, dbError = false } = {}) {
  const reads = []
  const client = { from(table) {
    const filters = []
    reads.push({ table, filters })
    const query = {
      select() { return this }, eq(key, value) { filters.push([key, value]); return this },
      async in(key, values) { filters.push([key, values]); return { data: customers, error: dbError } },
      async maybeSingle() { return { data: table === 'sales' ? sale : customer, error: dbError } },
    }
    return query
  } }
  const req = { auth: { orgId: ORG, userId: 'machine' }, body: { saleId: ID, phone: '(702) 555-1234', receiptRequested: true, ...input } }
  const res = { code: 200, headers: {}, set(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(body) { this.body = body; return this } }
  await createReceiptAuthorization({ getClient: () => client })(req, res)
  return { res, reads }
}

test('receipt preview uses persisted sale and never claims it was sent or queued', async () => {
  const { res, reads } = await verify()
  assert.equal(res.code, 200)
  assert.equal(res.body.phone, '+17025551234')
  assert.match(res.body.message, /Venetian - Receipt #100/)
  assert.match(res.body.message, /Total: \$108.00/)
  assert.equal(res.body.sent, false)
  assert.equal(res.body.queued, false)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  for (const read of reads) assert.ok(read.filters.some(([k, v]) => k === 'organization_id' && v === ORG))
  assert.ok(reads[0].filters.some(([k, v]) => k === 'id' && v === ID))
})
test('rejects arbitrary messages, missing consent, unsynced IDs and invalid destinations', async () => {
  for (const input of [{ message: 'spam' }, { dryRun: false }, { receiptRequested: false }, { receiptRequested: 'true' }, { saleId: null }, { phone: '+447025551234' }]) {
    const { res, reads } = await verify({ input })
    assert.equal(res.code, 400)
    assert.equal(reads.length, 0)
  }
})
test('missing/cross-organization sale is not disclosed; void and incomplete sales rejected', async () => {
  assert.equal((await verify({ sale: null })).res.code, 404)
  for (const patch of [{ status: 'voided' }, { status: 'refunded' }, { sale_items: [] }, { payments: [] }, { payments: [{ amount: 10 }] }, { subtotal: 99 }]) {
    assert.equal((await verify({ sale: { ...baseSale, ...patch } })).res.code, 409)
  }
})
test('opt-out and linked recipient restrictions fail closed', async () => {
  assert.equal((await verify({ customers: [{ sms_consent_status: 'opted_out', archived: true }] })).res.code, 403)
  const sale = { ...baseSale, linked_customer_id: CUSTOMER }
  for (const customer of [null, { phone: '2125551234' }, { phone: '7025551234', archived: true }, { phone: '7025551234', sms_consent_status: 'opted_out' }]) {
    assert.equal((await verify({ sale, customer })).res.code, 403)
  }
  assert.equal((await verify({ sale, customer: { phone: '7025551234', sms_consent_status: 'unknown', archived: false } })).res.code, 200)
  assert.equal((await verify({ dbError: true })).res.code, 503)
})
test('normalization never silently truncates foreign numbers or extensions', () => {
  assert.equal(normalizePhone('+1 (702) 555-1234'), '+17025551234')
  for (const value of ['+447025551234', '7025551234 ext 5', '', null, 7025551234]) assert.equal(normalizePhone(value), null)
})
test('machine session may authorize receipts only; admin routes stay closed', async () => {
  const client = { auth: { getUser: async token => ({ data: { user: { id: 'machine', app_metadata: { org_id: token === 'other-org' ? CUSTOMER : ORG } } } }) } }
  const app = express()
  app.use(express.json())
  app.use('/api', createApiGuard({ getClient: () => client, getOrgId: () => ORG }))
  app.post('/api/receipts/authorize', (_req, res) => res.json({ authorizedHandlerReached: true }))
  app.all('/api/*', (_req, res) => res.json({ adminHandlerReached: true }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    for (const [path, method, token, expected] of [
      ['/receipts/authorize', 'POST', null, 401],
      ['/receipts/authorize', 'POST', 'other-org', 403],
      ['/receipts/authorize', 'POST', 'machine', 200],
      ['/receipts/requests', 'POST', null, 401],
      ['/receipts/requests', 'POST', 'other-org', 403],
      ['/receipts/requests', 'POST', 'machine', 200],
      ['/receipts/requests', 'GET', 'machine', 403],
      ['/receipts/authorize', 'GET', 'machine', 403],
      ['/sms/send', 'POST', 'machine', 403],
      ['/email/send', 'POST', 'machine', 403],
      ['/scheduler/run', 'POST', 'machine', 403],
    ]) {
      const r = await fetch(`${base}/api${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })
      assert.equal(r.status, expected, `${method} ${path} ${token}`)
    }
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
