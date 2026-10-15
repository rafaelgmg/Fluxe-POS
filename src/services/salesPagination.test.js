import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchSalesPages } from './salesPagination.js'

test('loads more than 1000 sales despite a server cap below requested page size', async () => {
  const source = Array.from({ length: 2706 }, (_, i) => ({ number: 62742 - i }))
  const calls = []
  const result = await fetchSalesPages(async path => {
    calls.push(path)
    const cursor = new URL('https://test.invalid' + path).searchParams.get('number')
    return source.filter(r => !cursor || r.number < Number(cursor.slice(3))).slice(0, 200)
  }, '/sales?organization_id=eq.test&sold_at=gte.start&sold_at=lte.end')
  assert.deepEqual(result, source)
  assert.ok(result.some(r => r.number === 60986))
  assert.ok(calls.every(p => p.includes('organization_id=eq.test') && p.includes('sold_at=gte.start')))
})

test('newer insert between pages does not skip or duplicate historical invoices', async () => {
  let source = [5, 4, 3, 2, 1].map(number => ({ number }))
  const result = await fetchSalesPages(async path => {
    const cursor = new URL('https://test.invalid' + path).searchParams.get('number')
    const rows = source.filter(r => !cursor || r.number < Number(cursor.slice(3))).slice(0, 2)
    source = [{ number: 6 }, ...source.filter(r => r.number !== 6)]
    return rows
  }, '/sales?organization_id=eq.test')
  assert.deepEqual(result.map(r => r.number), [5, 4, 3, 2, 1])
})

test('a later failed page rejects instead of returning partial totals', async () => {
  let calls = 0
  await assert.rejects(fetchSalesPages(async () => {
    if (calls++) throw new Error('offline')
    return [{ number: 2 }]
  }, '/sales?organization_id=eq.test'), /offline/)
})

test('repeated pages fail instead of looping forever', async () => {
  await assert.rejects(fetchSalesPages(async () => [{ number: 2 }], '/sales?x=1'), /did not advance/)
})

test('empty result is valid, malformed response is not', async () => {
  assert.deepEqual(await fetchSalesPages(async () => [], '/sales?x=1'), [])
  await assert.rejects(fetchSalesPages(async () => ({}), '/sales?x=1'), /Invalid sales response/)
})

test('unsafe numeric identifiers cannot silently corrupt page cursors', async () => {
  await assert.rejects(fetchSalesPages(async () => [{ number: Number.MAX_SAFE_INTEGER + 1 }], '/sales?x=1'), /Invalid invoice number/)
})
