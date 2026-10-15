// No environment loading or provider calls at import time: safe to test in isolation.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function createApiGuard({ getClient, getOrgId }) {
  return async (req, res, next) => {
    const match = /^Bearer ([^\s]+)$/i.exec(req.headers.authorization || '')
    if (!match) return res.status(401).json({ error: 'Authentication required' })
    try {
      const client = getClient()
      const configuredOrg = getOrgId()
      if (!client || !UUID.test(configuredOrg || '')) {
        return res.status(503).json({ error: 'Backend authentication is not configured' })
      }
      // getUser validates with Supabase Auth; never trust a decoded JWT alone.
      const { data, error } = await client.auth.getUser(match[1])
      if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired session' })
      const metadata = data.user.app_metadata || {}
      if (metadata.org_id !== configuredOrg) return res.status(403).json({ error: 'Organization access denied' })
      req.auth = { userId: data.user.id, orgId: configuredOrg, role: metadata.backend_role }
      const body = req.body || {}
      if (body.orgId && body.orgId !== configuredOrg) return res.status(403).json({ error: 'Organization mismatch' })
      // Legacy JSON storage and templates are not tenant-aware. Keep this deployment
      // pinned to ONE organization until the persistent queue migration is complete.
      const receiptCheck = req.method === 'POST' && ['/receipts/authorize', '/receipts/requests'].includes(req.path)
      const receiptStatus = req.method === 'GET' && /^\/receipts\/requests\/[0-9a-f-]{36}$/i.test(req.path)
      if (req.path !== '/status' && !receiptCheck && !receiptStatus && req.auth.role !== 'admin') {
        return res.status(403).json({ error: 'Backend administrator permission required' })
      }
      for (const [field, table] of [['supabaseId', 'customers'], ['locationId', 'locations']]) {
        if (body[field] == null) continue
        if (!UUID.test(body[field])) return res.status(400).json({ error: `Invalid ${field}` })
        const { data: row, error: lookupError } = await client.from(table)
          .select('id').eq('id', body[field]).eq('organization_id', configuredOrg).maybeSingle()
        if (lookupError) return res.status(503).json({ error: 'Unable to validate resource access' })
        if (!row) return res.status(403).json({ error: 'Resource access denied' })
      }
      if (req.body && typeof req.body === 'object') req.body.orgId = configuredOrg
      next()
    } catch {
      return res.status(503).json({ error: 'Authentication service unavailable' })
    }
  }
}

function createTwilioGuard({ getConfig, validateRequest }) {
  return (req, res, next) => {
    const { token, url } = getConfig()
    if (!token || !url) return res.status(503).send('Webhook not configured')
    const signature = req.headers['x-twilio-signature']
    try {
      if (!signature || !validateRequest(token, signature, url, req.body || {})) {
        return res.status(403).send('Invalid webhook signature')
      }
      next()
    } catch {
      return res.status(403).send('Invalid webhook signature')
    }
  }
}

module.exports = { createApiGuard, createTwilioGuard }
