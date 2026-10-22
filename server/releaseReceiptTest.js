// Explicit operator action only; never runs at server startup.
require('dotenv').config()
const { readWorkerConfig, createReceiptWorkerStore } = require('./receiptWorker')
const { getClient } = require('./supabaseClient')

async function main() {
  const config = readWorkerConfig(process.env)
  if (!config || process.argv[2] !== config.requestId) throw new Error('Pass the configured test request ID explicitly')
  const released = await createReceiptWorkerStore(getClient).release(config)
  if (!released) throw new Error('No matching held, unattempted test receipt was released')
  console.log('Test request released as pending:', released.id)
}
main().catch(() => { console.error('Test release failed. Check configuration and request status.'); process.exitCode = 1 })
