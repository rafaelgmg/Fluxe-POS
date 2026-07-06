/**
 * CashDrawer.jsx
 * Cash Drawer Options module — PIN gate + 4 operations.
 * Open Register | Add Money | Take Money Out | Cash Count
 *
 * Hardware: sends ESC/POS drawer-kick command via print job to Star Micronics TSP143IIIU.
 * The printer driver processes the raw bytes and pulses the drawer via RJ11.
 */

import { useState, useMemo } from 'react'
import { localId } from '../domain/utils/ids'
import { loadActiveEmployees } from '../utils/usersStorage'
import { verifyEmployeePin } from '../services/supabaseAuth'

// ── Design tokens — resolved at runtime via CSS custom properties ──────────────
const BG     = 'var(--c-bg)'
const PANEL  = 'var(--c-bg-panel)'
const CARD   = 'var(--c-bg-card)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const MUTED  = 'var(--c-text-muted)'
const DIM    = 'var(--c-text-sub)'
const TEXT   = 'var(--c-text)'

// ── Storage ────────────────────────────────────────────────────────────────────
const DRAWER_KEY = 'fluxe-cash-drawer-v1'

function loadLog() {
  try { return JSON.parse(localStorage.getItem(DRAWER_KEY)) || [] }
  catch { return [] }
}

function appendLog(entry) {
  const log = loadLog()
  log.push({ ...entry, id: localId('csh'), timestamp: new Date().toISOString() })
  localStorage.setItem(DRAWER_KEY, JSON.stringify(log))
}

// ── Hardware trigger ───────────────────────────────────────────────────────────
// Priority:
//   1. Local server  POST /api/drawer/kick → Win32 Spooler raw ESC/POS (no paper)
//   2. Web Serial    → raw bytes via virtual COM port (no paper)
//   3. Drawer slip   → hidden iframe print (requires driver "Open before printing")
//
// Returns: 'ok-server' | 'ok' | 'ok-slip' | 'error'

const KICK_BYTES = new Uint8Array([0x1B, 0x70, 0x00, 0x19, 0xFA])
const SERVER_URL = `${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/drawer/kick`

async function kickViaServer(location) {
  const res  = await fetch(SERVER_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ location: location || 'unknown' }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error || 'server kick failed')
  return data
}

function kickViaDrawerSlip() {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<style>@page{margin:0;size:80mm 1px;}body{margin:0;padding:0;height:0;overflow:hidden;}</style>
</head><body></body></html>`

  return new Promise((resolve) => {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:302px;height:1px;border:0;overflow:hidden;'
    document.body.appendChild(iframe)

    let done = false
    const finish = () => {
      if (done) return; done = true
      try { document.body.removeChild(iframe) } catch {}
      resolve()
    }

    try {
      iframe.contentDocument.open()
      iframe.contentDocument.write(html)
      iframe.contentDocument.close()
    } catch { finish(); return }

    iframe.contentWindow.addEventListener('afterprint', finish)
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch { finish() }
    }, 200)
    setTimeout(finish, 30_000)
  })
}

export async function triggerDrawerHardware(location) {
  const tag = `[CashDrawer] Location: ${location || 'unknown'}`

  // 1. Local server (Win32 Spooler RAW — most reliable, no paper)
  try {
    const data = await kickViaServer(location)
    console.log(`${tag} → ESC/POS raw via server → printer: "${data.printer}" → bytes: ${data.bytes}`)
    return 'ok-server'
  } catch (e) {
    console.warn(`${tag} → server kick failed (${e.message}) → trying Web Serial`)
  }

  // 2. Web Serial (virtual COM port — no paper)
  if (navigator?.serial) {
    try {
      const ports = await navigator.serial.getPorts()
      if (ports.length > 0) {
        const port = ports[0]
        if (!port.readable) await port.open({ baudRate: 9600 })
        const writer = port.writable.getWriter()
        await writer.write(KICK_BYTES)
        await writer.close()
        await port.close()
        console.log(`${tag} → ESC/POS via Web Serial`)
        return 'ok'
      }
    } catch (e) {
      console.warn(`${tag} → Web Serial failed (${e.message}) → fallback slip`)
    }
  }

  // 3. Drawer slip (requires driver "Open before printing" — may print paper)
  try {
    await kickViaDrawerSlip()
    console.log(`${tag} → fallback drawer slip sent`)
    return 'ok-slip'
  } catch {
    console.error(`${tag} → all methods failed`)
    return 'error'
  }
}

// ── Denomination list for Cash Count ──────────────────────────────────────────
const DENOMS = [
  { label: '$100', value: 100 },
  { label: '$50',  value: 50  },
  { label: '$20',  value: 20  },
  { label: '$10',  value: 10  },
  { label: '$5',   value: 5   },
  { label: '$1',   value: 1   },
  { label: '25¢',  value: 0.25 },
  { label: '10¢',  value: 0.10 },
  { label: '5¢',   value: 0.05 },
  { label: '1¢',   value: 0.01 },
]

const ADD_REASONS    = ['Change fund', 'Opening float', 'Cash transfer', 'Other']
const REMOVE_REASONS = ['Bank deposit', 'Safe drop', 'Cash payout', 'Expense', 'Other']

const fmt$ = (n) => `$${(n || 0).toFixed(2)}`

// ── PIN Gate ───────────────────────────────────────────────────────────────────
function PinGate({ onUnlock, onClose }) {
  const employees = loadActiveEmployees()
  const [selectedId, setSelectedId] = useState(employees[0]?.id ?? null)
  const [pin,   setPin]   = useState('')
  const [shake, setShake] = useState(false)

  const press = async (digit) => {
    if (pin.length >= 4) return
    const next = pin + digit
    setPin(next)
    if (next.length === 4) {
      const emp = employees.find(e => e.id === selectedId)
      const result = emp ? await verifyEmployeePin(emp.name, next) : null
      if (result) {
        onUnlock(result)
      } else {
        setShake(true)
        setTimeout(() => { setPin(''); setShake(false) }, 700)
      }
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 10,
        width: 360, padding: 28,
        boxShadow: 'var(--c-shadow-card)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, fontSize: 18,
            background: 'rgba(37,99,235,0.12)', border: `1px solid rgba(37,99,235,0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>🗄️</div>
          <div>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Cash Drawer</p>
            <p style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>Enter your PIN to continue</p>
          </div>
        </div>

        {/* Employee selector */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.6 }}>EMPLOYEE</label>
          <select
            value={selectedId ?? ''}
            onChange={e => { const v = e.target.value; const n = Number(v); setSelectedId(Number.isNaN(n) ? v : n); setPin('') }}
            style={{
              width: '100%', padding: '9px 12px', background: CARD,
              border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
              fontSize: 13, outline: 'none', cursor: 'pointer',
            }}
          >
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        {/* PIN dots */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 10, letterSpacing: 0.6 }}>PIN</label>
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 6,
            transform: shake ? 'translateX(5px)' : 'none',
            transition: shake ? 'transform 0.07s' : 'none',
          }}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{
                width: 14, height: 14, borderRadius: '50%',
                background: i < pin.length ? (shake ? RED : BLUE) : CARD,
                border: `2px solid ${i < pin.length ? (shake ? RED : BLUE) : BORDER}`,
                transition: 'background 0.12s',
              }} />
            ))}
          </div>
          {shake && <p style={{ color: RED, fontSize: 11, textAlign: 'center', marginBottom: 4 }}>Incorrect PIN</p>}
          <div style={{ height: shake ? 0 : 14 }} />
        </div>

        {/* Numpad */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 7, marginBottom: 16 }}>
          {['7','8','9','4','5','6','1','2','3','','0','⌫'].map((k, i) => (
            <button key={i}
              onClick={() => {
                if (!k) return
                if (k === '⌫') setPin(p => p.slice(0,-1))
                else press(k)
              }}
              disabled={!k}
              style={{
                padding: '13px 0', background: !k ? 'transparent' : CARD,
                border: !k ? 'none' : `1px solid ${BORDER}`, borderRadius: 7,
                color: TEXT, fontSize: k === '⌫' ? 16 : 18,
                fontWeight: 600, cursor: !k ? 'default' : 'pointer', opacity: !k ? 0 : 1,
                transition: 'all 0.1s',
              }}
              onMouseEnter={e => { if (k) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
              onMouseLeave={e => { if (k) { e.currentTarget.style.background = CARD; e.currentTarget.style.borderColor = BORDER } }}
            >{k}</button>
          ))}
        </div>

        <button onClick={onClose} style={{
          width: '100%', padding: '11px', background: 'transparent',
          border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED,
          fontSize: 14, cursor: 'pointer', transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
        >Cancel</button>
      </div>
    </div>
  )
}

// ── Add / Take Money modal ─────────────────────────────────────────────────────
function MoneyModal({ type, employee, onDone, onClose }) {
  const isAdd = type === 'add'
  const reasons = isAdd ? ADD_REASONS : REMOVE_REASONS
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState(reasons[0])
  const [notes,  setNotes]  = useState('')
  const [done,   setDone]   = useState(false)

  const color = isAdd ? GREEN : AMBER

  const handleConfirm = () => {
    const n = parseFloat(amount)
    if (!n || n <= 0) return
    appendLog({
      type:     isAdd ? 'add' : 'remove',
      employee: employee.name,
      amount:   n,
      reason,
      notes,
    })
    setDone(true)
    setTimeout(onDone, 1200)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${color}40`, borderRadius: 10, width: 400, padding: 28,
        boxShadow: 'var(--c-shadow-card)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <span style={{ fontSize: 24 }}>{isAdd ? '➕' : '➖'}</span>
          <div>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>{isAdd ? 'Add Money' : 'Take Money Out'}</p>
            <p style={{ color: MUTED, fontSize: 11 }}>{employee.name}</p>
          </div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <p style={{ color: color, fontWeight: 700, fontSize: 15 }}>
              {isAdd ? 'Money added' : 'Money removed'} — {fmt$(parseFloat(amount))}
            </p>
          </div>
        ) : (
          <>
            {/* Amount */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.6 }}>AMOUNT</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED, fontSize: 16, fontWeight: 700 }}>$</span>
                <input
                  type="number" min="0.01" step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                  style={{
                    width: '100%', padding: '10px 12px 10px 28px', background: CARD,
                    border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
                    fontSize: 20, fontWeight: 700, outline: 'none', boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = color }}
                  onBlur={e => { e.target.style.borderColor = BORDER }}
                />
              </div>
            </div>

            {/* Reason */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.6 }}>REASON</label>
              <select
                value={reason}
                onChange={e => setReason(e.target.value)}
                style={{
                  width: '100%', padding: '9px 12px', background: CARD,
                  border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
                  fontSize: 13, outline: 'none', cursor: 'pointer',
                }}
              >
                {reasons.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ color: MUTED, fontSize: 10, fontWeight: 700, display: 'block', marginBottom: 6, letterSpacing: 0.6 }}>NOTES (optional)</label>
              <input
                type="text" value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional details..."
                style={{
                  width: '100%', padding: '9px 12px', background: CARD,
                  border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
                  fontSize: 13, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleConfirm}
                disabled={!parseFloat(amount) || parseFloat(amount) <= 0}
                style={{
                  flex: 1, padding: '11px', background: color,
                  border: 'none', borderRadius: 6, color: isAdd ? '#fff' : '#000',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                  opacity: !parseFloat(amount) || parseFloat(amount) <= 0 ? 0.4 : 1,
                  transition: 'opacity 0.15s',
                }}
              >Confirm</button>
              <button onClick={onClose} style={{
                flex: 1, padding: '11px', background: 'transparent',
                border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED,
                fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Cash Count modal ───────────────────────────────────────────────────────────
function CashCountModal({ employee, onDone, onClose }) {
  const [counts, setCounts] = useState(() => Object.fromEntries(DENOMS.map(d => [d.label, ''])))
  const [saved, setSaved]   = useState(false)

  const total = useMemo(() =>
    DENOMS.reduce((s, d) => s + (parseFloat(counts[d.label]) || 0) * d.value, 0),
    [counts]
  )

  const handleSave = () => {
    appendLog({
      type:     'count',
      employee: employee.name,
      amount:   total,
      counts:   Object.fromEntries(DENOMS.map(d => [d.label, parseFloat(counts[d.label]) || 0])),
      notes:    '',
    })
    setSaved(true)
    setTimeout(onDone, 1400)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, backdropFilter: 'blur(2px)', padding: 20,
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 10, width: 480,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--c-shadow-card)',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔢</span>
            <div>
              <p style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Cash Count</p>
              <p style={{ color: MUTED, fontSize: 11 }}>{employee.name}</p>
            </div>
          </div>
        </div>

        {saved ? (
          <div style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <p style={{ color: GREEN, fontWeight: 700, fontSize: 18 }}>Count saved — {fmt$(total)}</p>
          </div>
        ) : (
          <>
            {/* Denominations */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '18px 24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {DENOMS.map(d => {
                  const qty = parseFloat(counts[d.label]) || 0
                  const sub = qty * d.value
                  return (
                    <div key={d.label} style={{
                      background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                      padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <div style={{ width: 42 }}>
                        <p style={{ color: TEXT, fontSize: 14, fontWeight: 700 }}>{d.label}</p>
                        <p style={{ color: sub > 0 ? GREEN : MUTED, fontSize: 11, marginTop: 2 }}>
                          {sub > 0 ? fmt$(sub) : '—'}
                        </p>
                      </div>
                      <input
                        type="number" min="0" step="1"
                        value={counts[d.label]}
                        onChange={e => setCounts(prev => ({ ...prev, [d.label]: e.target.value }))}
                        placeholder="0"
                        style={{
                          flex: 1, padding: '7px 10px', background: PANEL,
                          border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT,
                          fontSize: 15, fontWeight: 700, outline: 'none', textAlign: 'center',
                        }}
                        onFocus={e => { e.target.style.borderColor = BLUE }}
                        onBlur={e => { e.target.style.borderColor = BORDER }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Total + actions */}
            <div style={{
              padding: '16px 24px', borderTop: `1px solid ${BORDER}`,
              display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
            }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: MUTED, fontSize: 11 }}>TOTAL COUNT</p>
                <p style={{ color: GREEN, fontSize: 26, fontWeight: 800 }}>{fmt$(total)}</p>
              </div>
              <button onClick={handleSave} style={{
                padding: '11px 28px', background: BLUE, border: 'none',
                borderRadius: 6, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>Save Count</button>
              <button onClick={onClose} style={{
                padding: '11px 18px', background: 'transparent',
                border: `1px solid ${BORDER}`, borderRadius: 6, color: MUTED,
                fontSize: 14, cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CashDrawer({ onClose, location }) {
  const [employee,     setEmployee]     = useState(null)
  const [mode,         setMode]         = useState(null)  // 'add' | 'remove' | 'count'
  // null | 'sending' | 'ok' | 'no-port' | 'unsupported' | 'error'
  const [drawerStatus, setDrawerStatus] = useState(null)

  // ── Sub-modals ───────────────────────────────────────────────────────────────
  if (!employee) {
    return <PinGate onUnlock={setEmployee} onClose={onClose} />
  }

  if (mode === 'add') {
    return <MoneyModal type="add" employee={employee}
      onDone={() => setMode(null)} onClose={() => setMode(null)} />
  }

  if (mode === 'remove') {
    return <MoneyModal type="remove" employee={employee}
      onDone={() => setMode(null)} onClose={() => setMode(null)} />
  }

  if (mode === 'count') {
    return <CashCountModal employee={employee}
      onDone={() => setMode(null)} onClose={() => setMode(null)} />
  }

  // ── Main options screen ──────────────────────────────────────────────────────
  const handleOpenRegister = async () => {
    appendLog({ type: 'open', employee: employee.name, amount: 0, notes: '' })
    setDrawerStatus('sending')
    const result = await triggerDrawerHardware(location)
    setDrawerStatus(result)
    if (result === 'ok' || result === 'ok-slip') setTimeout(() => setDrawerStatus(null), 4000)
    if (result === 'error')                      setTimeout(() => setDrawerStatus(null), 6000)
  }

  const actions = [
    {
      key:     'open',
      label:   'Open Register',
      icon:    '🗄️',
      color:   GREEN,
      desc:    'Open cash drawer',
      onClick: handleOpenRegister,
    },
    {
      key:     'add',
      label:   'Add Money',
      icon:    '➕',
      color:   BLUE,
      desc:    'Record cash added',
      onClick: () => setMode('add'),
    },
    {
      key:     'remove',
      label:   'Take Money Out',
      icon:    '➖',
      color:   AMBER,
      desc:    'Record cash removed',
      onClick: () => setMode('remove'),
    },
    {
      key:     'count',
      label:   'Cash Count',
      icon:    '🔢',
      color:   '#8b5cf6',
      desc:    'Count drawer contents',
      onClick: () => setMode('count'),
    },
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: PANEL,
        border: `1px solid ${BORDER}`, borderRadius: 10, width: 420,
        boxShadow: 'var(--c-shadow-card)', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 22px', background: CARD, borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: 8, fontSize: 17,
            background: 'rgba(37,99,235,0.12)', border: `1px solid rgba(37,99,235,0.25)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>🗄️</div>
          <div>
            <p style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Cash Drawer Options</p>
            <p style={{ color: GREEN, fontSize: 12, marginTop: 1 }}>Signed in as: {employee.name}</p>
          </div>
          <button onClick={onClose} style={{
            marginLeft: 'auto', background: 'none', border: `1px solid ${BORDER}`,
            borderRadius: 6, color: MUTED, fontSize: 20, cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
          >×</button>
        </div>

        {/* Open Register feedback */}
        {drawerStatus && (() => {
          const isOk  = ['ok-server','ok','ok-slip'].includes(drawerStatus)
          const isBad = drawerStatus === 'error'
          const bgColor  = isOk ? 'rgba(34,197,94,0.08)' : isBad ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)'
          const bdColor  = isOk ? 'rgba(34,197,94,0.25)' : isBad ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'
          const txtColor = isOk ? GREEN                  : isBad ? RED                     : AMBER
          return (
            <div style={{
              margin: '12px 22px 0', padding: '10px 14px', borderRadius: 8,
              background: bgColor, border: `1px solid ${bdColor}`,
              color: txtColor, fontSize: 12, fontWeight: 600,
            }}>
              {drawerStatus === 'sending'   && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>⏳</span><span>Sending drawer command…</span></div>}
              {drawerStatus === 'ok-server' && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>✅</span><span>Drawer opened (ESC/POS direct)</span></div>}
              {drawerStatus === 'ok'        && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>✅</span><span>Drawer opened (Web Serial)</span></div>}
              {drawerStatus === 'ok-slip'   && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span>🖨</span><span>Fallback: slip sent — local server may be offline</span>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 400, color: MUTED, lineHeight: 1.5 }}>
                    If the drawer didn't open: make sure the CRM server is running on this machine.
                  </div>
                </div>
              )}
              {drawerStatus === 'error'     && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>⚠️</span><span>All methods failed — check printer connection.</span></div>}
            </div>
          )
        })()}

        {/* Action grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, padding: 22 }}>
          {actions.map(a => (
            <button key={a.key} onClick={a.onClick} style={{
              padding: '22px 16px',
              background: CARD, border: `1px solid ${BORDER}`,
              borderRadius: 10, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              transition: 'all 0.2s',
            }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = a.color
                e.currentTarget.style.background  = a.color + '12'
                e.currentTarget.style.boxShadow   = `0 0 16px ${a.color}22`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = BORDER
                e.currentTarget.style.background  = CARD
                e.currentTarget.style.boxShadow   = 'none'
              }}
            >
              <span style={{ fontSize: 30 }}>{a.icon}</span>
              <p style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>{a.label}</p>
              <p style={{ color: MUTED, fontSize: 11 }}>{a.desc}</p>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
