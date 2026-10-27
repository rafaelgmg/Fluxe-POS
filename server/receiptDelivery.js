const { readWorkerConfig } = require('./receiptWorker')

// A separate opt-in prevents an existing test deployment from sending customer SMS.
function getDeliveryConfig(env, orgId) {
  try {
    const config = readWorkerConfig(env)
    return config?.mode === 'live' && config.orgId === orgId ? config : null
  } catch { return null }
}
module.exports = { getDeliveryConfig }
