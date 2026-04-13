import { useState, useCallback, useEffect } from 'react'
import { loadCRM, saveCRM } from '../utils/crmStorage'

const SERVER_URL = 'http://localhost:3001'

// keep local aliases so the rest of the file is unchanged
const load    = loadCRM
const persist = saveCRM

// ─── Try to ping the backend ──────────────────────────────────────────────────

async function isServerOnline() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

// ─── Sync from server INTO localStorage (only if server has more recent data) ──
// NOTE: does NOT overwrite localStorage — merges server records that are missing locally

async function syncFromServer(localCustomers) {
  try {
    const res  = await fetch(`${SERVER_URL}/api/customers`)
    if (!res.ok) return null
    const serverList = await res.json()
    if (!Array.isArray(serverList)) return null
    // Merge: add server records that don't exist locally (by id)
    const localIds = new Set(localCustomers.map(c => c.id))
    const toAdd    = serverList.filter(c => !localIds.has(c.id))
    if (toAdd.length === 0) return null
    const merged = [...localCustomers, ...toAdd]
    persist(merged)
    return merged
  } catch {
    return null
  }
}

export function useCRM() {
  const [customers,    setCustomers]  = useState(load)
  const [serverOnline, setServerOnline] = useState(false)
  const [syncStatus,   setSyncStatus] = useState('idle') // 'idle'|'syncing'|'ok'|'offline'

  // Check server on mount (non-blocking) — fixed: useEffect instead of useState
  useEffect(() => {
    isServerOnline().then(online => {
      setServerOnline(online)
      if (online) {
        setCustomers(current => {
          syncFromServer(current).then(merged => {
            if (merged) setCustomers(merged)
          })
          return current // no change synchronously
        })
      }
    })
  }, [])

  // capturedByOverride — usado em capturas standalone (sem venda) para gravar o vendedor
  const upsertCustomer = useCallback(async (formData, invoice, capturedByOverride = null) => {
    // ── Always update localStorage immediately (offline-first) ──────────────
    const digits    = formData.phone?.replace(/\D/g, '')
    const emailNorm = formData.email?.trim().toLowerCase()

    setCustomers(prev => {
      // ── Deduplication: phone first, then email ──────────────────────────
      let idx = -1
      if (digits) {
        idx = prev.findIndex(c => c.phone?.replace(/\D/g, '') === digits)
      }
      if (idx === -1 && emailNorm) {
        idx = prev.findIndex(c => c.email?.trim().toLowerCase() === emailNorm)
      }

      // Só monta o objeto de purchase se há invoice real
      const purchase = invoice ? {
        invoiceNumber: invoice.number,
        date:          invoice.timestamp,
        location:      invoice.location,
        seller:        invoice.employee,
        total:         invoice.total,
        paymentMethod: invoice.paymentMethod,
        items: (invoice.items || []).map(i => ({
          name:     i.product?.name    || '',
          barcode:  i.product?.barcode || '',
          size:     i.product?.size    || '',
          qty:      i.qty,
          subtotal: i.subtotal,
        })),
      } : null

      const resolvedCapturedBy = capturedByOverride || invoice?.employee || null

      // Merge fragrance preferences (array) — deduplica e preserva existentes
      function mergePrefs(existing, incoming) {
        const existArr = Array.isArray(existing) ? existing
          : (existing ? [existing] : [])
        const inArr    = Array.isArray(incoming) ? incoming
          : (incoming ? [incoming] : [])
        return [...new Set([...existArr, ...inArr])]
      }

      let updated
      if (idx >= 0) {
        updated = prev.map((c, i) => i !== idx ? c : {
          ...c,
          firstName:            formData.firstName            || c.firstName,
          lastName:             formData.lastName             || c.lastName,
          // update phone/email only if new value is provided
          phone:                formData.phone                || c.phone,
          email:                formData.email                || c.email,
          birthday:             formData.birthday             || c.birthday,
          fragrancePreferences: mergePrefs(
            c.fragrancePreferences ?? c.fragrancePreference,
            formData.fragrancePreferences,
          ),
          notes: formData.notes
            ? (c.notes ? c.notes + '\n---\n' + formData.notes : formData.notes)
            : c.notes,
          marketingConsent: formData.marketingConsent ?? c.marketingConsent,
          // Preserva capturedBy original; só sobrescreve se ainda não tiver
          capturedBy: c.capturedBy || resolvedCapturedBy,
          updatedAt: new Date().toISOString(),
          purchases: purchase ? [...(c.purchases || []), purchase] : (c.purchases || []),
        })
      } else {
        updated = [...prev, {
          id:                   'cust_' + Date.now(),
          firstName:            formData.firstName,
          lastName:             formData.lastName             || '',
          phone:                formData.phone                || '',
          email:                formData.email                || '',
          birthday:             formData.birthday             || '',
          fragrancePreferences: Array.isArray(formData.fragrancePreferences)
            ? formData.fragrancePreferences
            : (formData.fragrancePreferences ? [formData.fragrancePreferences] : []),
          notes:                formData.notes                || '',
          marketingConsent:     formData.marketingConsent     || false,
          capturedBy:           resolvedCapturedBy,
          capturedLocation:     formData.capturedLocation || invoice?.location || '',
          capturedAt:           new Date().toISOString(),
          createdAt:            new Date().toISOString(),
          updatedAt:            new Date().toISOString(),
          purchases:            purchase ? [purchase] : [],
          tags:                 [],
          crmScore:             0,
          lastInteraction:      null,
          preferredChannel:     '',
        }]
      }

      persist(updated)
      return updated
    })

    // ── Also send to backend (Twilio scheduling) if server is online ─────────
    setSyncStatus('syncing')
    try {
      const online = await isServerOnline()
      setServerOnline(online)

      if (online) {
        const res = await fetch(`${SERVER_URL}/api/customers/upsert`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ formData, invoice, capturedBy: capturedByOverride }),
        })
        if (res.ok) {
          const { customer, scheduledMessages } = await res.json()
          // Update local store with server's canonical version
          setCustomers(prev => {
            const idx = prev.findIndex(c => c.id === customer.id ||
              c.phone?.replace(/\D/g, '') === customer.phone?.replace(/\D/g, ''))
            const updated = idx >= 0
              ? prev.map((c, i) => i === idx ? customer : c)
              : [...prev, customer]
            persist(updated)
            return updated
          })
          setSyncStatus('ok')
          if (scheduledMessages > 0) {
            console.log(`[CRM] ${scheduledMessages} SMS message(s) scheduled via Twilio`)
          }
        } else {
          setSyncStatus('offline')
        }
      } else {
        setSyncStatus('offline')
        console.warn('[CRM] Server offline — customer saved locally only. SMS not scheduled.')
      }
    } catch (err) {
      setSyncStatus('offline')
      console.warn('[CRM] Backend sync failed:', err.message)
    }
  }, [])

  const sendManualSMS = useCallback(async (customerId, message, channel = 'sms') => {
    const res = await fetch(`${SERVER_URL}/api/sms/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ customerId, message, channel }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || 'Failed to send SMS')
    }
    return res.json()
  }, [])

  const getSMSLog = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/sms/log`)
    if (!res.ok) throw new Error('Failed to fetch SMS log')
    return res.json()
  }, [])

  const getScheduled = useCallback(async () => {
    const res = await fetch(`${SERVER_URL}/api/sms/scheduled`)
    if (!res.ok) throw new Error('Failed to fetch scheduled messages')
    return res.json()
  }, [])

  // Update profile fields only — never touches purchases
  const updateCustomer = useCallback((id, fields) => {
    setCustomers(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c
        // Merge fragrance preferences (deduplicate)
        const existArr = Array.isArray(c.fragrancePreferences)
          ? c.fragrancePreferences
          : (c.fragrancePreference ? [c.fragrancePreference] : [])
        const inArr = Array.isArray(fields.fragrancePreferences)
          ? fields.fragrancePreferences
          : []
        return {
          ...c,
          firstName:            fields.firstName            || c.firstName,
          lastName:             fields.lastName             ?? c.lastName,
          phone:                fields.phone                ?? c.phone,
          email:                fields.email                ?? c.email,
          birthday:             fields.birthday             ?? c.birthday,
          fragrancePreferences: inArr.length > 0 ? inArr : existArr,
          notes:                fields.notes                ?? c.notes,
          marketingConsent:     fields.marketingConsent     ?? c.marketingConsent,
          updatedAt:            new Date().toISOString(),
        }
      })
      persist(updated)
      return updated
    })
  }, [])

  // Soft delete — sets archived flag, hidden from normal view
  const archiveCustomer = useCallback((id) => {
    setCustomers(prev => {
      const updated = prev.map(c =>
        c.id === id ? { ...c, archived: true, archivedAt: new Date().toISOString() } : c
      )
      persist(updated)
      return updated
    })
  }, [])

  // Restore archived customer back to active
  const restoreCustomer = useCallback((id) => {
    setCustomers(prev => {
      const updated = prev.map(c =>
        c.id === id ? { ...c, archived: false, archivedAt: null } : c
      )
      persist(updated)
      return updated
    })
  }, [])

  // Hard delete — permanent, cannot be undone
  const deleteCustomer = useCallback((id) => {
    setCustomers(prev => {
      const updated = prev.filter(c => c.id !== id)
      persist(updated)
      return updated
    })
  }, [])

  // ─── Admin-specific helpers ────────────────────────────────────────────────

  /**
   * Add a completely new customer directly (Admin manual add).
   * Returns { error } if duplicate detected, or { success, id } on success.
   */
  const addCustomer = useCallback((formData) => {
    const digits    = formData.phone?.replace(/\D/g, '')
    const emailNorm = formData.email?.trim().toLowerCase()

    // Deduplication check
    const current = load()
    const dupe = current.find(c =>
      (digits    && (c.phone  || '').replace(/\D/g, '') === digits)    ||
      (emailNorm && (c.email  || '').trim().toLowerCase() === emailNorm)
    )
    if (dupe) return { error: 'A customer with this phone or email already exists.' }

    const newId  = 'cust_' + Date.now()
    const newCust = {
      id:                   newId,
      firstName:            formData.firstName?.trim()  || '',
      lastName:             formData.lastName?.trim()   || '',
      phone:                formData.phone              || '',
      email:                formData.email              || '',
      birthday:             formData.birthday           || '',
      fragrancePreferences: Array.isArray(formData.fragrancePreferences) ? formData.fragrancePreferences : [],
      notes:                formData.notes              || '',
      marketingConsent:     formData.marketingConsent   || false,
      capturedBy:           formData.capturedBy         || '',
      capturedLocation:     formData.capturedLocation   || '',
      capturedAt:           new Date().toISOString(),
      createdAt:            new Date().toISOString(),
      updatedAt:            new Date().toISOString(),
      purchases:            [],
      tags:                 [],
      crmScore:             0,
      lastInteraction:      null,
      preferredChannel:     '',
    }

    setCustomers(prev => {
      const updated = [...prev, newCust]
      persist(updated)
      return updated
    })
    return { success: true, id: newId }
  }, [])

  /**
   * Patch any fields of an existing customer (Admin edit / transfer / AI fields).
   * A simple shallow merge — suitable for Admin where all fields are edited explicitly.
   */
  const patchCustomer = useCallback((id, fields) => {
    setCustomers(prev => {
      const updated = prev.map(c =>
        c.id !== id ? c : { ...c, ...fields, updatedAt: new Date().toISOString() }
      )
      persist(updated)
      return updated
    })
  }, [])

  return {
    customers,
    serverOnline,
    syncStatus,
    upsertCustomer,
    updateCustomer,
    archiveCustomer,
    restoreCustomer,
    deleteCustomer,
    addCustomer,
    patchCustomer,
    sendManualSMS,
    getSMSLog,
    getScheduled,
  }
}
