import test from 'node:test'
import assert from 'node:assert/strict'
import { writeCheckoutCache } from './checkoutCache.js'

test('stores the full history, including an unsynced sale, without changing it', () => {
  const sales = [{ number: 1, supabaseId: 'saved' }, { number: 2 }]
  let stored
  assert.equal(writeCheckoutCache({ setItem: (_, value) => { stored = value } }, 'sales', sales), true)
  assert.deepEqual(JSON.parse(stored), sales)
  assert.equal(sales.length, 2)
})

test('full storage cannot throw into the React updater or prevent subsequent work', async () => {
  const previous = '[{"number":1}]'
  let stored = previous
  let notified = false
  const storage = { setItem: () => { throw new DOMException('Full', 'QuotaExceededError') } }
  const result = writeCheckoutCache(storage, 'sales', [{ number: 2 }], error => {
    assert.equal(error.name, 'QuotaExceededError')
    notified = true
  })
  assert.equal(result, false)
  assert.equal(notified, false, 'notification must not update React while rendering')
  assert.equal(stored, previous, 'previous local records must not be deleted')
  await Promise.resolve()
  assert.equal(notified, true)
})

test('blocked storage is also reported without crashing checkout', async () => {
  let reported
  assert.equal(writeCheckoutCache({ setItem() { throw new Error('Access denied') } }, 'sales', [],
    error => { reported = error.message }), false)
  await Promise.resolve()
  assert.equal(reported, 'Access denied')
})
