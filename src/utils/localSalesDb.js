// Transaction completion, not an individual request's success, confirms durability.
export function openLocalSalesDb(factory, name = 'fluxe-local-sales-v1') {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('sales')
      request.result.createObjectStore('legacyArchive', { autoIncrement: true })
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('Local sales database is blocked by another tab'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => db.close()
      resolve(db)
    }
  })
}

export function readLocalSales(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sales', 'readonly')
    const request = tx.objectStore('sales').getAll()
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error || new Error('Local read aborted'))
    tx.onerror = () => {} // onabort handles the final outcome
  })
}

export function writeLocalSales(db, sales, { importOnly = false, removeNumbers = [], legacyRaw } = {}) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['sales', 'legacyArchive'], 'readwrite')
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('Local write aborted'))
    tx.onerror = () => {}
    const store = tx.objectStore('sales')
    try {
      if (legacyRaw !== undefined) tx.objectStore('legacyArchive').add(legacyRaw)
      for (const number of removeNumbers) store.delete(String(number))
      for (const sale of sales) {
        if (!sale || sale.number == null) throw new Error('Invalid local sale')
        const key = String(sale.number)
        if (importOnly) {
          const existing = store.get(key)
          existing.onsuccess = () => {
            if (existing.result === undefined) store.put(sale, key)
          }
        } else store.put(sale, key)
      }
    } catch (error) {
      tx.abort()
      reject(error)
    }
  })
}

export async function migrateLegacySales(db, storage, key) {
  const raw = storage.getItem(key)
  if (raw === null) return
  const sales = JSON.parse(raw)
  if (!Array.isArray(sales)) throw new Error('Invalid legacy sales array')
  await writeLocalSales(db, sales, { importOnly: true, legacyRaw: raw })
  // A second tab may have changed the legacy copy during the transaction.
  // Remove only the exact copy whose import has committed successfully.
  if (storage.getItem(key) === raw) storage.removeItem(key)
}

export function mergeSalesForDisplay(remote, local) {
  const merged = new Map(remote.map(sale => [String(sale.number), sale]))
  for (const sale of local) {
    const legacyAdjustment = ['voided', 'deleted', 'refunded'].includes(sale.status) || sale.refunds?.length
    if (sale._localPending || legacyAdjustment || !merged.has(String(sale.number))) merged.set(String(sale.number), sale)
  }
  return [...merged.values()]
}
