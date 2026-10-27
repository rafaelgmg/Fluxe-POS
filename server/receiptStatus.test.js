const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { createReceiptStatus } = require('./receiptQueue')
const { createApiGuard } = require('./security')
const ORG = '11111111-1111-4111-8111-111111111111'
const SALE = '22222222-2222-4222-8222-222222222222'

function fixture({ exists = true, row = null, error = null } = {}) {
  const reads = []
  const client = {
    auth: { async getUser(token) { return token === 'invalid' ? { error: true } : { data: { user: { id: 'machine', app_metadata: { org_id: token === 'foreign' ? SALE : ORG } } } } } },
    from(table) {
      const filters = []
      reads.push({ table, filters })
      return { select() { return this }, eq(k, v) { filters.push([k, v]); return this },
        async maybeSingle() { return table === 'sales' ? { data: exists ? { id: SALE } : null } : { data: row, error } },
      }
    },
  }
  return { client, reads }
}

test('status endpoint masks phone, excludes message body, and scopes every read to organization', async () => {
  const f = fixture({ row: { id: 'request-id', status: 'held', recipient: '+17025551234', message_body: 'private', requested_at: 'date' } })
  const res = { code: 200, set() {}, status(c) { this.code = c; return this }, json(data) { this.body = data } }
  await createReceiptStatus({ getClient: () => f.client })({ auth: { orgId: ORG }, params: { saleId: SALE } }, res)
  assert.equal(res.body.request.recipientLast4, '1234')
  assert.equal(res.body.request.requestId, 'request-id')
  assert.equal(res.body.request.recipient, undefined)
  assert.equal(res.body.request.message_body, undefined)
  assert.equal(res.body.sendingEnabled, false)
  for (const read of f.reads) assert.ok(read.filters.some(([k, v]) => k === 'organization_id' && v === ORG))
})

test('status exposes only delivery availability and pilot flag, never the allowed number', async () => {
  const f = fixture()
  const res = { set() {}, json(body) { this.body = body } }
  await createReceiptStatus({ getClient: () => f.client, getDeliveryConfig: org => {
    assert.equal(org, ORG); return { recipient: '+17025551234' }
  } })({ auth: { orgId: ORG }, params: { saleId: SALE } }, res)
  assert.equal(res.body.sendingEnabled, true)
  assert.equal(res.body.testOnly, true)
  assert.equal(JSON.stringify(res.body).includes('7025551234'), false)
})

test('missing record differs from unavailable queue; missing sale is not disclosed', async () => {
  for (const [options, code, expected] of [
    [{}, 200, null], [{ exists: false }, 404, undefined], [{ error: { code: '42P01' } }, 503, undefined],
  ]) {
    const f = fixture(options)
    const res = { code: 200, set() {}, status(c) { this.code = c; return this }, json(data) { this.body = data } }
    await createReceiptStatus({ getClient: () => f.client })({ auth: { orgId: ORG }, params: { saleId: SALE } }, res)
    assert.equal(res.code, code)
    assert.equal(res.body.request, expected)
    if (!options.exists && options.exists !== undefined) assert.equal(f.reads.length, 1)
  }
})

test('authenticated kiosk can recover status, but foreign/missing sessions and mutation attempts fail', async () => {
  const f = fixture({ row: { id: 'existing', status: 'held', recipient: '+17025551234' } })
  const app = express()
  app.use('/api', createApiGuard({ getClient: () => f.client, getOrgId: () => ORG }))
  app.get('/api/receipts/requests/:saleId', createReceiptStatus({ getClient: () => f.client }))
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/receipts/requests/${SALE}`
    for (const [token, code] of [[null, 401], ['invalid', 401], ['foreign', 403], ['machine', 200]]) {
      const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      assert.equal(response.status, code)
      if (code === 200) assert.equal((await response.json()).request.requestId, 'existing')
    }
    assert.equal((await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer machine' } })).status, 403)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
