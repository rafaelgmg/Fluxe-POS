import { useState, useEffect, useCallback } from 'react'
import { backendFetch } from '../services/backendApi'

export default function SmsReceiptModal({ invoice, defaultPhone = '', onClose }) {
  const [phone, setPhone] = useState(defaultPhone)
  const [requested, setRequested] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [queueResult, setQueueResult] = useState(null)
  const [statusChecked, setStatusChecked] = useState(false)
  const [checking, setChecking] = useState(false)
  const synced = Boolean(invoice.supabaseId)

  const refreshStatus = useCallback(async (signal) => {
    if (!invoice.supabaseId) return
    setChecking(true)
    setError('')
    try {
      const res = await backendFetch(`/api/receipts/requests/${invoice.supabaseId}`, { signal })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to check receipt status')
      if (!Object.hasOwn(data, 'request')) throw new Error('Unexpected receipt status response')
      if (signal?.aborted) return
      setQueueResult(data.request)
      setStatusChecked(true)
    } catch (err) {
      if (signal?.aborted) return
      setStatusChecked(false)
      setError(err.message || 'Unable to check status. Try again before creating a request.')
    } finally { if (!signal?.aborted) setChecking(false) }
  }, [invoice.supabaseId])

  useEffect(() => {
    const controller = new AbortController()
    refreshStatus(controller.signal)
    return () => controller.abort()
  }, [refreshStatus])

  const statusLabels = {
    held: 'On hold — not sent', pending: 'Waiting to send', processing: 'Processing — delivery not confirmed',
    sent: 'Sent to the messaging provider — delivery not confirmed', failed: 'Sending failed',
    uncertain: 'Send outcome unknown — do not create another request', cancelled: 'Cancelled',
  }

  async function queueReceipt() {
    if (busy || checking || !statusChecked || !preview || !requested || queueResult) return
    setBusy(true)
    setError('')
    try {
      const res = await backendFetch('/api/receipts/requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: invoice.supabaseId, phone, receiptRequested: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to save receipt request')
      if (!data.requestId || data.queued !== true) throw new Error('Unable to confirm receipt request')
      setQueueResult(data)
    } catch (err) {
      setStatusChecked(false)
      setError(err.message || 'Unable to confirm. Retry the same request; it will not create another receipt.')
    } finally { setBusy(false) }
  }

  async function verifyReceipt() {
    if (busy || checking || !statusChecked || queueResult || !synced || !requested) return
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      const res = await backendFetch('/api/receipts/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleId: invoice.supabaseId, phone, receiptRequested: requested }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to verify receipt')
      if (data.status !== 'authorized' || data.sent !== false || data.queued !== false) {
        throw new Error('Unexpected receipt verification response')
      }
      setPreview(data)
    } catch (err) {
      setError(err.message || 'Server unavailable')
    } finally {
      setBusy(false)
    }
  }

  const inputStyle = { width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 7, background: '#111d30', border: '1px solid #253349', color: '#f1f5f9' }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(0,0,0,.75)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: '#0d1526', border: '1px solid #253349', borderRadius: 12, padding: 20, color: '#f1f5f9' }}>
        <h3 id="receipt-title">SMS Receipt</h3>
        <p style={{ color: '#94a3b8', margin: '8px 0 16px' }}>Invoice #{invoice.number}</p>
        <p style={{ color: '#fbbf24', marginBottom: 16 }}>Verified requests are saved on hold. Saving a request does not send an SMS; it must be explicitly released for sending.</p>
        {!synced && <p role="status" style={{ marginBottom: 12 }}>This sale has no confirmed server ID. Its SMS receipt cannot be verified yet.</p>}
        <label htmlFor="receipt-phone">Customer phone (US/Canada)</label>
        <input id="receipt-phone" type="tel" value={phone} disabled={busy || !!queueResult} placeholder="702-555-1234" style={{ ...inputStyle, margin: '6px 0 12px' }} onChange={e => { setPhone(e.target.value); setPreview(null); setRequested(false); setError('') }} />
        <label style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input type="checkbox" checked={requested} disabled={busy || !!queueResult} onChange={e => { setRequested(e.target.checked); setPreview(null) }} />
          The customer requested this receipt by SMS at this number.
        </label>
        {error && <p role="alert" style={{ color: '#f87171', marginBottom: 12 }}>{error}</p>}
        {preview && <div role="status">
          <p style={{ color: '#34d399' }}>Receipt verified for {preview.phone}.</p>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#030e1e', padding: 12, margin: '12px 0' }}>{preview.message}</pre>
        </div>}
        {checking && <p role="status">Checking saved receipt request...</p>}
        {queueResult && <p role="status">{statusLabels[queueResult.status] || 'Unknown status'}.{queueResult.recipientLast4 && ` Phone ending in ${queueResult.recipientLast4}.`} Reference: {queueResult.requestId}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...inputStyle, width: 'auto' }}>Close</button>
          {synced && <button onClick={() => refreshStatus()} disabled={busy || checking} style={{ ...inputStyle, width: 'auto' }}>Refresh status</button>}
          {!queueResult && <button onClick={preview ? queueReceipt : verifyReceipt} disabled={busy || checking || !statusChecked || !synced || !requested || !phone.trim()} style={{ ...inputStyle, width: 'auto' }}>{busy ? 'Please wait...' : preview ? 'Save request on hold' : 'Verify receipt'}</button>}
        </div>
      </div>
    </div>
  )
}
