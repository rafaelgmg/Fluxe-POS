import React from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import SmsReceiptModal from '../src/components/SmsReceiptModal'

export async function run() {
  const results = []
  const settle = () => new Promise(resolve => setTimeout(resolve, 25))
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  async function scenario({ enabled = true, initial = null, failure = false }) {
    const host = document.body.appendChild(document.createElement('div'))
    const root = createRoot(host)
    const writes = []
    let status = initial
    window.receiptBackend = async (path, options = {}) => {
      if (options.method !== 'POST') return { ok: true, json: async () => ({ sendingEnabled: enabled, request: status ? { status, requestId: 'fixture' } : null }) }
      writes.push({ path, body: JSON.parse(options.body) })
      if (path.endsWith('/authorize')) return { ok: true, json: async () => ({ status: 'authorized', sent: false, queued: false, phone: '+17025551234', message: 'Fixture receipt' }) }
      if (failure) { status = 'pending'; throw new Error('Connection lost') }
      status = enabled ? 'pending' : 'held'
      return { ok: true, json: async () => ({ requestId: 'fixture', queued: true, status }) }
    }
    const button = text => [...host.querySelectorAll('button')].find(b => b.textContent === text)
    const click = async text => { assert(button(text), `Missing ${text}`); flushSync(() => button(text).click()); await settle() }
    try {
      flushSync(() => root.render(<SmsReceiptModal invoice={{ number: 1, supabaseId: 'fixture-sale' }} defaultPhone="7025551234" onClose={() => {}} />))
      await settle()
      if (initial && initial !== 'held') {
        assert(!button('Verify receipt') && !button('Send receipt by SMS'), 'Terminal/processing request can be resent')
        assert(!writes.length, 'Opening modal sent a request')
        return
      }
      assert(button('Verify receipt').disabled, 'Consent required')
      flushSync(() => host.querySelector('[type=checkbox]').click())
      await click('Verify receipt')
      const label = enabled ? 'Send receipt by SMS' : 'Save request on hold'
      assert(button(label), 'Wrong confirmation action')
      assert(writes.length === 1 && writes[0].path.endsWith('/authorize'), 'Verification released receipt')
      await click(label)
      assert(writes[1].path === (enabled ? '/api/receipts/send' : '/api/receipts/requests'), 'Wrong release endpoint')
      assert(writes[1].body.receiptRequested === true, 'Missing explicit consent')
      if (failure) {
        assert(button(label).disabled, 'Ambiguous response permits blind retry')
        await click('Refresh status')
      }
      assert(!button('Send receipt by SMS'), 'Duplicate send remains available')
      assert(host.textContent.includes(enabled ? 'Waiting to send' : 'On hold'), 'Wrong resulting status')
    } finally { root.unmount(); host.remove() }
  }
  await scenario({}); results.push('new request requires consent, verification and explicit Send confirmation')
  await scenario({ initial: 'held' }); results.push('existing held request can be explicitly released')
  await scenario({ enabled: false }); results.push('disabled delivery preserves save-on-hold behavior')
  await scenario({ failure: true }); results.push('lost response requires status recovery and does not resend')
  for (const initial of ['pending', 'processing', 'sent', 'failed', 'uncertain', 'cancelled']) await scenario({ initial })
  results.push('pending and all terminal states have no resend action')
  return results
}
