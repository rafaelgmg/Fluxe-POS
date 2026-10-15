// Invoice numbers are unique within an organization. Keyset pagination avoids
// offsets shifting when a new sale is inserted during a multi-page read.
export async function fetchSalesPages(fetchPage, basePath) {
  const result = []
  let cursor = null
  for (;;) {
    const rows = await fetchPage(`${basePath}&order=number.desc&limit=500${cursor === null ? '' : `&number=lt.${encodeURIComponent(cursor)}`}`)
    if (!Array.isArray(rows)) throw new Error('Invalid sales response')
    if (!rows.length) return result
    let previous = cursor === null ? null : BigInt(cursor)
    for (const row of rows) {
      const number = String(row.number)
      if (!/^\d+$/.test(number) || (typeof row.number === 'number' && !Number.isSafeInteger(row.number))) throw new Error('Invalid invoice number')
      const current = BigInt(number)
      if (previous !== null && current >= previous) throw new Error('Sales pagination did not advance')
      previous = current
    }
    result.push(...rows)
    cursor = String(rows.at(-1).number)
    // A server-side cap may be smaller than our page size. Only an empty page
    // proves completion; never return a partial result if a later page fails.
  }
}
