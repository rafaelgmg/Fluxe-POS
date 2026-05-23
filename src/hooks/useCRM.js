import { useState, useCallback, useEffect, useRef } from 'react'
import { loadCRM, saveCRM } from '../utils/crmStorage'
import { localId } from '../domain/utils/ids'
import { isSupabaseConfigured } from '../services/supabaseRead'
import {
  fetchCustomers,
  writeCustomerToSupabase,
  patchCustomerInSupabase,
  archiveCustomerInSupabase,
  restoreCustomerInSupabase,
  fetchMessageHistory,
  updateSmsConsentInSupabase,
} from '../services/supabaseCRM'

const SERVER_URL = 'http://localhost:3001'

const load    = loadCRM
const persist = saveCRM

// ── SMS helpers (Twilio — unchanged) ─────────────────────────────────────────

async function isServerOnline() {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(1500) })
    return res.ok
  } catch {
    return false
  }
}

// ── Merge helpers ─────────────────────────────────────────────────────────────

function mergePrefs(existing, incoming) {
  const existArr = Array.isArray(existing) ? existing : (existing ? [existing] : [])
  const inArr    = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : [])
  return [...new Set([...existArr, ...inArr])]
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

// ── Supabase hydration: merge server records into localStorage ────────────────
// Adds supabaseId to existing local records when phone or id matches.
// Never overwrites local fields that are newer (updatedAt comparison).

function mergeSupabaseIntoLocal(localList, serverList) {
  const byPhone = new Map()
  const byId    = new Map()

  for (const s of serverList) {
    if (s.phoneNormalized) byPhone.set(s.phoneNormalized, s)
    if (s.supabaseId)      byId.set(s.supabaseId, s)
    if (s.legacyLocalId)   byId.set(s.legacyLocalId, s)
  }

  const merged = localList.map(local => {
    const phoneNorm = normalizePhone(local.phone)
    const server    = byPhone.get(phoneNorm) || byId.get(local.supabaseId) || byId.get(local.id)
    if (!server) return local

    // Only adopt supabaseId — don't overwrite local data with server data here.
    // Full sync (server → local) happens on first load, not on every upsert.
    return local.supabaseId ? local : { ...local, supabaseId: server.supabaseId, pendingSync: false }
  })

  // Add server-only records (captured on another device / kiosk)
  const localIds  = new Set(localList.map(c => c.supabaseId).filter(Boolean))
  const toAdd = serverList
    .filter(s => !localIds.has(s.supabaseId))
    .map(s => ({
      // Map from Supabase camelCase → local shape
      id:                   s.legacyLocalId || localId('cust'),
      supabaseId:           s.supabaseId,
      firstName:            s.firstName,
      lastName:             s.lastName,
      phone:                s.phone,
      email:                s.email,
      birthday:             s.birthday,
      fragrancePreferences: s.fragrancePreferences,
      marketingConsent:     s.marketingConsent,
      preferredChannel:     s.preferredChannel,
      notes:                s.notes,
      tags:                 s.tags,
      crmScore:             s.crmScore,
      capturedBy:           null,
      capturedLocation:     null,
      capturedAt:           s.capturedAt,
      createdAt:            s.createdAt,
      updatedAt:            s.updatedAt,
      purchases:            s.purchases,
      lastInteraction:      s.lastInteraction,
      archived:             s.archived,
      archivedAt:           s.archivedAt,
      smsConsentStatus:     s.smsConsentStatus || 'unknown',
      smsConsentSource:     s.smsConsentSource || null,
      smsOptedOutAt:        s.smsOptedOutAt    || null,
    }))

  return [...merged, ...toAdd]
}

// ─────────────────────────────────────────────────────────────────────────────

export function useCRM(posSession = null, currentUser = null) {
  const [customers,    setCustomers]    = useState(load)
  const [serverOnline, setServerOnline] = useState(false)
  const [syncStatus,   setSyncStatus]   = useState('idle')

  // Keep a ref to posSession so async callbacks always read the latest value
  const sessionRef = useRef(posSession)
  useEffect(() => { sessionRef.current = posSession }, [posSession])
  const userRef = useRef(currentUser)
  useEffect(() => { userRef.current = currentUser }, [currentUser])

  // ── Supabase hydration — runs when orgId becomes available after login ────────
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    const orgId = posSession?.orgId
    if (!orgId) return

    fetchCustomers(orgId)
      .then(serverList => {
        if (serverList && serverList.length > 0) {
          setCustomers(local => {
            const merged = mergeSupabaseIntoLocal(local, serverList)
            persist(merged)
            return merged
          })
        }
        // Auto-sync customers that failed to reach Supabase previously
        const locationId = sessionRef.current?.locationUUID
        const pending    = load().filter(c => c.pendingSync && !c.supabaseId && !c.archived)
        pending.forEach(c => {
          // Use the UUID stored at capture time; fall back to current user only if missing
          const syncUserId = c.capturedByUserId || userRef.current?.supabaseId || null
          writeCustomerToSupabase(c, orgId, syncUserId, locationId)
            .then(result => {
              if (!result) return
              setCustomers(prev => {
                const u = prev.map(x =>
                  x.id === c.id ? { ...x, supabaseId: result.supabaseId, pendingSync: false } : x
                )
                persist(u)
                return u
              })
            })
            .catch(() => {})
        })
      })
      .catch(err => console.warn('[CRM] Supabase hydration failed:', err.message))
  }, [posSession?.orgId]) // re-runs when session (orgId) changes from null → UUID after login

  // capturedByOverride — usado em capturas standalone (sem venda)
  // capturedByUserId  — UUID do vendedor que fez o capture (pode ser diferente do currentUser)
  const upsertCustomer = useCallback(async (formData, invoice, capturedByOverride = null, capturedByUserId = null) => {
    const digits    = normalizePhone(formData.phone)
    const emailNorm = (formData.email || '').trim().toLowerCase()
    const resolvedCapturedBy = capturedByOverride || invoice?.employee || null

    // Build purchase record (só se há invoice real)
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

    // ── localStorage write (sync, immediate) ────────────────────────────────
    let upsertedLocal = null

    setCustomers(prev => {
      let idx = -1
      if (digits)    idx = prev.findIndex(c => normalizePhone(c.phone) === digits)
      if (idx === -1 && emailNorm)
                     idx = prev.findIndex(c => (c.email || '').trim().toLowerCase() === emailNorm)

      let updated
      if (idx >= 0) {
        updated = prev.map((c, i) => i !== idx ? c : {
          ...c,
          archived:             false,
          archivedAt:           null,
          firstName:            formData.firstName            || c.firstName,
          lastName:             formData.lastName             || c.lastName,
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
          capturedBy:       c.capturedBy || resolvedCapturedBy,
          updatedAt:        new Date().toISOString(),
          purchases:        purchase ? [...(c.purchases || []), purchase] : (c.purchases || []),
        })
        upsertedLocal = updated[idx]
      } else {
        const newCust = {
          id:                   localId('cust'),
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
          capturedByUserId:     capturedByUserId || null,
          capturedLocation:     formData.capturedLocation || invoice?.location || '',
          capturedAt:           new Date().toISOString(),
          createdAt:            new Date().toISOString(),
          updatedAt:            new Date().toISOString(),
          purchases:            purchase ? [purchase] : [],
          tags:                 [],
          crmScore:             0,
          archived:             false,
          archivedAt:           null,
          lastInteraction:      null,
          preferredChannel:     '',
        }
        updated = [...prev, newCust]
        upsertedLocal = newCust
      }

      persist(updated)
      return updated
    })

    // ── Supabase write (fire-and-forget) ─────────────────────────────────────
    setSyncStatus('syncing')
    if (isSupabaseConfigured()) {
      const orgId      = sessionRef.current?.orgId
      const locationId = sessionRef.current?.locationUUID
      // capturedByUserId is the Capture employee's UUID (may differ from currentUser in 2-employee flow)
      const userId     = capturedByUserId || userRef.current?.supabaseId || null

      if (!orgId) {
        // Session not ready — mark pending so auto-sync picks it up on next login
        if (upsertedLocal) {
          setCustomers(prev => {
            const updated = prev.map(c =>
              c.id === upsertedLocal.id ? { ...c, pendingSync: true } : c
            )
            persist(updated)
            return updated
          })
        }
        setSyncStatus('offline')
        return
      }

      if (upsertedLocal) {
        writeCustomerToSupabase(upsertedLocal, orgId, userId, locationId)
          .then(result => {
            if (!result) return
            setCustomers(prev => {
              const updated = prev.map(c =>
                c.id === upsertedLocal.id ? { ...c, supabaseId: result.supabaseId, pendingSync: false } : c
              )
              persist(updated)
              return updated
            })
            setSyncStatus('ok')
          })
          .catch(err => {
            console.warn('[CRM] Supabase write failed (local preserved):', err.message)
            setCustomers(prev => {
              const updated = prev.map(c =>
                c.id === upsertedLocal.id ? { ...c, pendingSync: true } : c
              )
              persist(updated)
              return updated
            })
            setSyncStatus('offline')
          })
        return // don't fall through to Twilio SMS path
      }
    }

    // ── Twilio SMS scheduling (localhost:3001 — unchanged path) ──────────────
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
          setCustomers(prev => {
            const i = prev.findIndex(c =>
              c.id === customer.id ||
              normalizePhone(c.phone) === normalizePhone(customer.phone)
            )
            const updated = i >= 0
              ? prev.map((c, j) => j === i ? customer : c)
              : [...prev, customer]
            persist(updated)
            return updated
          })
          setSyncStatus('ok')
          if (scheduledMessages > 0)
            console.log(`[CRM] ${scheduledMessages} SMS message(s) scheduled via Twilio`)
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

  // Update profile fields (never touches purchases)
  const updateCustomer = useCallback((id, fields) => {
    setCustomers(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c
        const existArr = Array.isArray(c.fragrancePreferences)
          ? c.fragrancePreferences
          : (c.fragrancePreference ? [c.fragrancePreference] : [])
        const inArr = Array.isArray(fields.fragrancePreferences) ? fields.fragrancePreferences : []
        const merged = {
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
        // Fire-and-forget Supabase patch
        if (isSupabaseConfigured() && c.supabaseId) {
          patchCustomerInSupabase(c.supabaseId, merged, sessionRef.current?.orgId)
            .catch(err => console.warn('[CRM] patchCustomer failed:', err.message))
        }
        return merged
      })
      persist(updated)
      return updated
    })
  }, [])

  const archiveCustomer = useCallback((id) => {
    setCustomers(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c
        const merged = { ...c, archived: true, archivedAt: new Date().toISOString() }
        if (isSupabaseConfigured() && c.supabaseId)
          archiveCustomerInSupabase(c.supabaseId)
            .catch(err => console.warn('[CRM] archiveCustomer failed:', err.message))
        return merged
      })
      persist(updated)
      return updated
    })
  }, [])

  const restoreCustomer = useCallback((id) => {
    setCustomers(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c
        const merged = { ...c, archived: false, archivedAt: null }
        if (isSupabaseConfigured() && c.supabaseId)
          restoreCustomerInSupabase(c.supabaseId)
            .catch(err => console.warn('[CRM] restoreCustomer failed:', err.message))
        return merged
      })
      persist(updated)
      return updated
    })
  }, [])

  const deleteCustomer = useCallback((id) => {
    setCustomers(prev => {
      const updated = prev.filter(c => c.id !== id)
      persist(updated)
      return updated
    })
  }, [])

  const addCustomer = useCallback((formData) => {
    const digits    = normalizePhone(formData.phone)
    const emailNorm = (formData.email || '').trim().toLowerCase()

    const current = load()
    const dupe = current.find(c =>
      (digits    && normalizePhone(c.phone) === digits) ||
      (emailNorm && (c.email || '').trim().toLowerCase() === emailNorm)
    )
    if (dupe) return { error: 'A customer with this phone or email already exists.' }

    const newId   = localId('cust')
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

    // Fire-and-forget Supabase write for manual admin adds
    if (isSupabaseConfigured()) {
      const orgId      = sessionRef.current?.orgId
      const locationId = sessionRef.current?.locationUUID
      const userId     = userRef.current?.supabaseId || null
      if (orgId) {
        writeCustomerToSupabase(newCust, orgId, userId, locationId)
          .then(result => {
            if (!result) return
            setCustomers(prev => {
              const updated = prev.map(c =>
                c.id === newId ? { ...c, supabaseId: result.supabaseId, pendingSync: false } : c
              )
              persist(updated)
              return updated
            })
          })
          .catch(err => {
            console.warn('[CRM] addCustomer Supabase write failed:', err.message)
            setCustomers(prev => {
              const updated = prev.map(c =>
                c.id === newId ? { ...c, pendingSync: true } : c
              )
              persist(updated)
              return updated
            })
          })
      } else {
        // No session yet — mark pending for auto-sync on next login
        setCustomers(prev => {
          const updated = prev.map(c =>
            c.id === newId ? { ...c, pendingSync: true } : c
          )
          persist(updated)
          return updated
        })
      }
    }

    return { success: true, id: newId }
  }, [])

  const patchCustomer = useCallback((id, fields) => {
    setCustomers(prev => {
      const updated = prev.map(c => {
        if (c.id !== id) return c
        const merged = { ...c, ...fields, updatedAt: new Date().toISOString() }
        if (isSupabaseConfigured() && c.supabaseId) {
          patchCustomerInSupabase(c.supabaseId, merged, sessionRef.current?.orgId)
            .catch(err => console.warn('[CRM] patchCustomer failed:', err.message))
        }
        return merged
      })
      persist(updated)
      return updated
    })
  }, [])

  // ── SMS / Messaging ───────────────────────────────────────────────────────

  // customer — full customer object (needs .phone, .firstName, .supabaseId)
  const sendManualSMS = useCallback(async (customer, message, channel = 'sms') => {
    const res = await fetch(`${SERVER_URL}/api/sms/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        // Direct params so server doesn't need to look up from JSON db
        phone:      customer.phone,
        firstName:  customer.firstName,
        supabaseId: customer.supabaseId || null,
        orgId:      posSession?.orgId   || null,
        locationId: posSession?.locationUUID || null,
        // Legacy fallback — keep customerId for backward compat with JSON db
        customerId: customer.id,
        message,
        channel,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      const msg = err.message || err.error || 'Failed to send SMS'
      // Surface consent error distinctly
      if (err.error === 'opted_out') {
        const e = new Error(msg)
        e.consentBlocked = true
        throw e
      }
      throw new Error(msg)
    }
    return res.json()
  }, [posSession])

  // Fetch message history from Supabase (read-only, frontend direct)
  const getSMSHistory = useCallback(async (customer) => {
    if (!customer?.supabaseId) return []
    return fetchMessageHistory(customer.supabaseId)
  }, [])

  // Manually update SMS consent from CRM UI
  const updateSmsConsent = useCallback(async (customer, status) => {
    if (!customer?.supabaseId) return
    await updateSmsConsentInSupabase(customer.supabaseId, status, 'manual')
    // Update local state
    setCustomers(prev => {
      const updated = prev.map(c =>
        c.id === customer.id
          ? { ...c, smsConsentStatus: status, smsConsentSource: 'manual',
              smsOptedOutAt: status === 'opted_out' ? new Date().toISOString() : null }
          : c
      )
      persist(updated)
      return updated
    })
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
    getSMSHistory,
    updateSmsConsent,
    getSMSLog,
    getScheduled,
  }
}
