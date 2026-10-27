const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createApiGuard, createTwilioGuard } = require('./security')

const ORG = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
function response() {
  return { code: 200, status(code) { this.code = code; return this }, json(body) { this.body = body; return this }, send(body) { this.body = body; return this } }
}
async function run({ token = 'valid', org = ORG, role = 'admin', path = '/sms/send', body = {}, error = null, row = { id: OTHER }, configured = ORG, throws = false } = {}) {
  let called = false
  let checkedToken
  const filters = []
  const query = { select() { return this }, eq(k, v) { filters.push([k, v]); return this }, async maybeSingle() { return { data: row } } }
  const client = { auth: { async getUser(jwt) { checkedToken = jwt; if (throws) throw Error('offline'); return { data: { user: { id: 'auth-user', app_metadata: { org_id: org, backend_role: role }, user_metadata: { backend_role: 'admin' } } }, error } } }, from() { return query } }
  const req = { method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, path, body }
  const res = response()
  await createApiGuard({ getClient: () => client, getOrgId: () => configured })(req, res, () => { called = true })
  return { req, res, called, checkedToken, filters }
}
test('missing credentials are rejected before Auth is called', async () => {
  const r = await run({ token: null }); assert.equal(r.res.code, 401); assert.equal(r.checkedToken, undefined); assert.equal(r.called, false)
})
test('invalid session and unavailable Auth fail closed', async () => {
  assert.equal((await run({ error: Error('expired') })).res.code, 401)
  assert.equal((await run({ throws: true })).res.code, 503)
  assert.equal((await run({ configured: '' })).res.code, 503)
})
test('other organizations and forged body organization are denied', async () => {
  assert.equal((await run({ org: OTHER })).res.code, 403)
  assert.equal((await run({ body: { orgId: OTHER } })).res.code, 403)
})
test('machine account cannot send or administer using user-editable metadata', async () => {
  assert.equal((await run({ role: 'machine' })).res.code, 403)
  assert.equal((await run({ role: 'machine', path: '/sms/templates' })).res.code, 403)
  assert.equal((await run({ role: 'machine', path: '/status' })).called, true)
})
test('authorized request derives org from verified identity', async () => {
  const r = await run(); assert.equal(r.called, true); assert.equal(r.checkedToken, 'valid'); assert.equal(r.req.body.orgId, ORG)
})

test('kiosk may request receipt delivery only with verified same-organization identity', async () => {
  const valid = await run({ role: 'machine', path: '/receipts/send' })
  assert.equal(valid.called, true)
  assert.equal(valid.req.auth.orgId, ORG)
  assert.equal((await run({ role: 'machine', path: '/receipts/send', token: null })).res.code, 401)
  assert.equal((await run({ role: 'machine', path: '/receipts/send', org: OTHER })).res.code, 403)
  assert.equal((await run({ role: 'machine', path: '/receipts/send', body: { orgId: OTHER } })).res.code, 403)
})
test('customer and location lookups enforce organization ownership', async () => {
  const r = await run({ body: { supabaseId: OTHER, locationId: OTHER } })
  assert.equal(r.called, true)
  assert.equal(r.filters.filter(([k, v]) => k === 'organization_id' && v === ORG).length, 2)
  assert.equal((await run({ body: { supabaseId: OTHER }, row: null })).res.code, 403)
  assert.equal((await run({ body: { locationId: 'invalid' } })).res.code, 400)
})
test('webhook checks signature against configured URL, not request host', () => {
  const guard = createTwilioGuard({ getConfig: () => ({ token: 'test-secret', url: 'https://configured.example/webhook' }), validateRequest: (token, sig, url) => token === 'test-secret' && sig === 'valid' && url === 'https://configured.example/webhook' })
  for (const signature of [undefined, 'invalid', 'valid']) {
    const res = response(); let called = false
    guard({ headers: { 'x-twilio-signature': signature, host: 'attacker.example' }, body: {} }, res, () => { called = true })
    assert.equal(called, signature === 'valid')
    if (!called) assert.equal(res.code, 403)
  }
})

test('real Twilio signatures reject tampered message bodies', () => {
  const twilio = require('twilio')
  const token = 'isolated-test-secret'
  const url = 'https://example.invalid/api/webhooks/twilio/sms'
  const body = { From: '+15555550100', Body: 'STOP' }
  const signature = twilio.getExpectedTwilioSignature(token, url, body)
  const guard = createTwilioGuard({ getConfig: () => ({ token, url }), validateRequest: twilio.validateRequest })
  for (const tampered of [false, true]) {
    let called = false
    const res = response()
    guard({ headers: { 'x-twilio-signature': signature }, body: tampered ? { ...body, Body: 'START' } : body }, res, () => { called = true })
    assert.equal(called, !tampered)
  }
})

test('Express mount authenticates protected routes before handlers', async () => {
  const express = require('express')
  const app = express()
  let hits = 0
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))
  app.use('/api', createApiGuard({ getOrgId: () => ORG, getClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'machine', app_metadata: { org_id: ORG } } } }) } }) }))
  app.get('/api/status', (_req, res) => res.json({ status: 'ok' }))
  app.post('/api/sms/send', (_req, res) => { hits++; res.json({ ok: true }) })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    assert.equal((await fetch(`${base}/api/health`)).status, 200)
    assert.equal((await fetch(`${base}/api/status`)).status, 401)
    const headers = { Authorization: 'Bearer test-token' }
    assert.equal((await fetch(`${base}/api/status`, { headers })).status, 200)
    assert.equal((await fetch(`${base}/api/sms/send`, { method: 'POST', headers })).status, 403)
    assert.equal(hits, 0)
  } finally {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
})
