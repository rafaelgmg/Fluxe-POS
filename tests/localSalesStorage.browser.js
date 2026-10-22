import { openLocalSalesDb, readLocalSales, writeLocalSales, migrateLegacySales, mergeSalesForDisplay } from '/src/utils/localSalesDb.js'

export async function run() {
  const results = []
  const check = (value, label) => { if (!value) throw new Error(label); results.push(label) }
  const name = `test-sales-${crypto.randomUUID()}`
  let db = await openLocalSalesDb(indexedDB, name)
  const key = 'test-legacy-sales'
  const sales = Array.from({ length: 2807 }, (_, number) => ({ number, notes: 'x'.repeat(1000) }))
  localStorage.setItem(key, JSON.stringify(sales))
  let quotaError
  try { localStorage.setItem(key, JSON.stringify(sales.map(s => ({ ...s, notes: 'x'.repeat(4000) })))) }
  catch (error) { quotaError = error.name }
  check(quotaError === 'QuotaExceededError', 'reproduced actual localStorage quota with 2807 records')
  await migrateLegacySales(db, localStorage, key)
  check((await readLocalSales(db)).length === 2807, 'migrated every legacy sale')
  check(localStorage.getItem(key) === null, 'released legacy space only after commit')
  await writeLocalSales(db, [{ number: 3000, _localPending: true, notes: 'offline sale' }])
  db.close()
  db = await openLocalSalesDb(indexedDB, name)
  let records = await readLocalSales(db)
  check(records.find(s => s.number === 3000)?.notes === 'offline sale', 'pending sale survives database reopen without network')
  const merged = mergeSalesForDisplay([{ number: 3000, notes: 'stale cloud' }, { number: 4000 }], records)
  check(merged.find(s => s.number === 3000)._localPending && merged.some(s => s.number === 4000), 'refresh keeps pending sale and complete remote history')
  check(mergeSalesForDisplay([{ number: 42, status: 'completed' }], [{ number: 42, status: 'refunded', refunds: [{}] }])[0].status === 'refunded', 'legacy refund survives refresh before pending markers existed')
  const count = records.length
  try { await writeLocalSales(db, [{ number: 9999 }, { number: 9998, invalid: () => {} }]) } catch {}
  records = await readLocalSales(db)
  check(records.length === count && !records.some(s => s.number === 9999), 'aborted transaction leaves previous records intact')
  localStorage.setItem(key, '[{"number":5000},null]')
  try { await migrateLegacySales(db, localStorage, key) } catch {}
  check(localStorage.getItem(key) !== null && !(await readLocalSales(db)).some(s => s.number === 5000), 'failed migration preserves original and rolls back partial import')
  localStorage.setItem(key, '[{"number":5000}]')
  const deniedDatabase = { transaction() { throw new DOMException('Full', 'QuotaExceededError') } }
  try { await migrateLegacySales(deniedDatabase, localStorage, key) } catch {}
  check(localStorage.getItem(key) === '[{"number":5000}]', 'IndexedDB quota failure keeps legacy source untouched')
  localStorage.setItem(key, JSON.stringify([{ number: 3000, notes: 'old legacy' }]))
  await migrateLegacySales(db, localStorage, key)
  check((await readLocalSales(db)).find(s => s.number === 3000).notes === 'offline sale', 'repeated migration does not overwrite newer local data')
  await writeLocalSales(db, [{ number: 3001, supabaseId: 'confirmed', _localPending: false }], { removeNumbers: [3000] })
  records = await readLocalSales(db)
  check(!records.some(s => s.number === 3000) && records.some(s => s.number === 3001), 'server number reconciliation is atomic')
  const before = records.length
  await Promise.all([
    writeLocalSales(db, [{ number: 6000 }]),
    writeLocalSales(db, [{ number: 6001 }]),
  ])
  check((await readLocalSales(db)).length === before + 2, 'concurrent record writes do not replace the full history')
  db.close()
  return results
}
