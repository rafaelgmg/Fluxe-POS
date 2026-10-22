import React, { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useSales } from '../src/hooks/useSales'
import { initializeSalesStorage, loadAllSales } from '../src/utils/salesStorage'

export async function run() {
  const results = []
  const check = (value, label) => { if (!value) throw new Error(label); results.push(label) }
  await initializeSalesStorage()
  let hook
  let mounted
  const ready = new Promise(resolve => { mounted = resolve })
  function Harness() {
    hook = useSales()
    useEffect(() => { mounted() }, [])
    return null
  }
  const root = createRoot(document.body.appendChild(document.createElement('div')))
  root.render(<Harness />)
  await ready
  try {
    window.testCloudOffline = true
    await hook.saveSale({ number: 8000, items: [], total: 10 })
    check(loadAllSales().find(s => s.number === 8000)?._localPending, 'actual saveSale retains pending record when cloud returns failure')
    window.testCloudOffline = false
    await hook.saveSale({ number: 8001, items: [], total: 20 })
    const confirmed = loadAllSales().find(s => s.number === 9001)
    check(confirmed?.supabaseId === 'cloud-id' && !confirmed._localPending, 'actual saveSale commits confirmed number and id')
    check(!loadAllSales().some(s => s.number === 8001), 'actual saveSale replaces temporary number')
    check(!loadAllSales().some(s => s.number === 123), 'downloaded report history is not copied into local persistence')
    await initializeSalesStorage()
    check(loadAllSales().some(s => s.number === 8000 && s._localPending), 'pending sale survives reinitialization after a successful second sale')
  } finally { root.unmount() }
  return results
}
