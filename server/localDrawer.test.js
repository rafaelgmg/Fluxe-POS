const { test } = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const { registerLocalDrawer, allowLocalDrawer } = require('./localDrawer')

test('rejects network peers and forwarded requests without invoking hardware', () => {
  for (const req of [
    { socket: { remoteAddress: '192.168.0.20' }, headers: {} },
    { socket: { remoteAddress: '127.0.0.1' }, headers: { 'x-forwarded-for': '192.168.0.20' } },
    { socket: { remoteAddress: '127.0.0.1' }, headers: { forwarded: 'for=attacker' } },
  ]) {
    let code
    allowLocalDrawer(req, { status(c) { code = c; return this }, json() {} }, () => assert.fail('must reject'))
    assert.equal(code, 403)
  }
})

test('legacy kiosk route works locally; cloud bind and other APIs remain protected', async () => {
  for (const host of ['127.0.0.1', '0.0.0.0', '::']) {
    const app = express()
    let kicks = 0
    // Fake hardware handler: no printing, PowerShell, files or real drawer action.
    registerLocalDrawer(app, host, (_req, res) => { kicks++; res.json({ ok: true }) })
    app.use('/api', (_req, res) => res.status(401).json({ error: 'Authentication required' }))
    const server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    try {
      const base = `http://127.0.0.1:${server.address().port}`
      const result = await fetch(`${base}/api/drawer/kick`, { method: 'POST' })
      assert.equal(result.status, host === '127.0.0.1' ? 200 : 401)
      assert.equal(kicks, host === '127.0.0.1' ? 1 : 0)
      assert.equal((await fetch(`${base}/api/sms/send`, { method: 'POST' })).status, 401)
    } finally {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
  }
})
