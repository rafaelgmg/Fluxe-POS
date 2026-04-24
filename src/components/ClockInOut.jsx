import { useState, useEffect } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { loadClockRecords, saveClockRecords } from '../utils/clockStorage'
import { localId } from '../domain/utils/ids'
import { insertClockRecord, patchClockOut } from '../services/supabaseWrite'
import { verifyEmployeePin } from '../services/supabaseAuth'
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function calcHours(clockIn, clockOut) {
  const ms = new Date(clockOut) - new Date(clockIn)
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

export default function ClockInOut({ onClose, posSession }) {
  const [employees,   setEmployees]   = useState(() => loadActiveEmployees())
  const [records,     setRecords]     = useState(loadClockRecords)
  const [selectedEmp, setSelectedEmp] = useState(() => loadActiveEmployees()[0]?.name ?? '')
  const [pin,         setPin]         = useState('')
  const [error,       setError]       = useState('')
  const [success,     setSuccess]     = useState('')
  const [now,         setNow]         = useState(new Date())

  // Re-read employees every time the modal opens so it stays in sync with Admin
  useEffect(() => {
    const fresh = loadActiveEmployees()
    setEmployees(fresh)
    setSelectedEmp(prev => fresh.find(e => e.name === prev) ? prev : (fresh[0]?.name ?? ''))
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const clockedIn = (empName) => {
    const emp  = records.filter(r => r.employee === empName)
    const last = emp[emp.length - 1]
    return last && !last.clockOut ? last : null
  }

  const handleKey = (val) => {
    if (val === 'Clear') { setPin(''); setError(''); return }
    if (pin.length >= 6) return
    setPin(p => p + val)
  }

  const handleAction = async () => {
    const verified = await verifyEmployeePin(selectedEmp, pin)
    if (!verified) {
      setError('Incorrect PIN'); setPin(''); return
    }
    setError('')
    const active = clockedIn(selectedEmp)
    const ts = new Date().toISOString()
    let updated

    if (active) {
      // ── Clock Out ────────────────────────────────────────────────────────────
      updated = records.map(r => r.id === active.id ? { ...r, clockOut: ts } : r)
      saveClockRecords(updated)
      setRecords(updated)
      setSuccess(`${selectedEmp} clocked out at ${formatTime(ts)}`)

      // Fire-and-forget: PATCH clock_out in Supabase
      if (active.supabaseId) patchClockOut(active.supabaseId, ts)

    } else {
      // ── Clock In ─────────────────────────────────────────────────────────────
      const localRec = { id: localId('clk'), employee: selectedEmp, clockIn: ts, clockOut: null }
      updated = [...records, localRec]
      saveClockRecords(updated)
      setRecords(updated)
      setSuccess(`${selectedEmp} clocked in at ${formatTime(ts)}`)

      // Fire-and-forget: INSERT in Supabase, then store supabaseId on local record
      insertClockRecord({
        locationId:   posSession?.locationId   || null,
        locationName: posSession?.location     || '',
        employeeName: selectedEmp,
        clockIn:      ts,
      }).then(supabaseId => {
        if (!supabaseId) return
        const current = loadClockRecords()
        const patched = current.map(r => r.id === localRec.id ? { ...r, supabaseId } : r)
        saveClockRecords(patched)
        setRecords(patched)
      })
    }

    setPin('')
    setTimeout(() => setSuccess(''), 3000)
  }

  const today = new Date().toDateString()
  const todayRecords = records.filter(r => new Date(r.clockIn).toDateString() === today)
  const isClockedIn  = !!clockedIn(selectedEmp)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1e 100%)', border: '1px solid #1e293b', borderRadius: 10,
        width: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 22px', background: '#0f172a',
          borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 20 }}>⏰</span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>Clock In / Out</h2>
          <span style={{
            marginLeft: 'auto', color: '#22c55e',
            fontSize: 18, fontWeight: 700, fontFamily: 'monospace',
          }}>
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button onClick={onClose} style={{
            padding: '6px 14px', background: 'transparent',
            border: '1px solid #1e293b', borderRadius: 5,
            color: '#64748b', fontSize: 12, cursor: 'pointer', marginLeft: 8,
            transition: 'all 0.15s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
          >✕ Close</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: action panel */}
          <div style={{ width: 280, padding: 20, borderRight: '1px solid #1e293b', flexShrink: 0 }}>

            {/* Current status */}
            <div style={{ marginBottom: 18 }}>
              <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 10 }}>
                CURRENT STATUS
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {employees.map(emp => {
                  const active = clockedIn(emp.name)
                  return (
                    <div key={emp.name} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', background: '#0f172a', borderRadius: 6,
                      border: `1px solid ${active ? 'rgba(34,197,94,0.3)' : '#1e293b'}`,
                      transition: 'all 0.2s ease',
                    }}>
                      <div style={{
                        width: 7, height: 7, borderRadius: '50%',
                        background: active ? '#22c55e' : '#334155',
                        boxShadow: active ? '0 0 6px #22c55e' : 'none',
                      }} />
                      <span style={{ color: '#94a3b8', fontSize: 13, flex: 1 }}>{emp.name}</span>
                      {active && (
                        <span style={{ color: '#22c55e', fontSize: 10 }}>
                          {formatTime(active.clockIn)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Employee selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: '#475569', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
                EMPLOYEE
              </label>
              <select
                value={selectedEmp}
                onChange={e => { setSelectedEmp(e.target.value); setPin(''); setError('') }}
                style={{
                  width: '100%', padding: '8px 12px', background: '#0f172a',
                  border: '1px solid #1e293b', borderRadius: 6,
                  color: '#f1f5f9', fontSize: 13, outline: 'none', cursor: 'pointer',
                }}
              >
                {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </div>

            {/* PIN */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: '#475569', fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6, letterSpacing: 0.5 }}>
                PIN
              </label>
              <input
                type="password" value={pin} readOnly
                style={{
                  width: '100%', padding: '8px 12px', background: '#0f172a',
                  border: `1px solid ${error ? '#ef4444' : '#1e293b'}`,
                  borderRadius: 6, color: '#f1f5f9', fontSize: 20, letterSpacing: 6,
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {error   && <p style={{ color: '#ef4444', fontSize: 11, marginTop: 5 }}>{error}</p>}
              {success && <p style={{ color: '#22c55e', fontSize: 11, marginTop: 5 }}>{success}</p>}
            </div>

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {['7','8','9','4','5','6','1','2','3','0','Clear'].map(k => (
                <button key={k} onClick={() => handleKey(k)} style={{
                  gridColumn: k === 'Clear' ? 'span 2' : 'auto',
                  padding: '11px', background: '#0f172a',
                  border: '1px solid #1e293b', borderRadius: 6,
                  color: '#f1f5f9', fontSize: k === 'Clear' ? 11 : 16,
                  fontWeight: 600, cursor: 'pointer', transition: 'background 0.1s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#131d35' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#0f172a' }}
                >{k}</button>
              ))}
            </div>

            {/* Action button */}
            <button onClick={handleAction} style={{
              width: '100%', padding: '12px',
              background: isClockedIn ? '#ef4444' : '#22c55e',
              border: 'none', borderRadius: 6, color: '#fff',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.15s',
              boxShadow: isClockedIn ? '0 0 16px rgba(239,68,68,0.3)' : '0 0 16px rgba(34,197,94,0.3)',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
            >
              {isClockedIn ? '🔴 Clock Out' : '🟢 Clock In'}
            </button>
          </div>

          {/* Right: today's log */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 14 }}>
              TODAY'S LOG — {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {todayRecords.length === 0 && (
              <p style={{ color: '#334155', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                No clock-in records today
              </p>
            )}

            {todayRecords.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                    {['Employee', 'Clock In', 'Clock Out', 'Hours'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...todayRecords].reverse().map(r => (
                    <tr key={r.id} style={{ borderBottom: '1px solid rgba(30,41,59,0.5)' }}>
                      <td style={{ padding: '10px', color: '#f1f5f9' }}>{r.employee}</td>
                      <td style={{ padding: '10px', color: '#22c55e' }}>{formatTime(r.clockIn)}</td>
                      <td style={{ padding: '10px', color: r.clockOut ? '#94a3b8' : '#f59e0b' }}>
                        {r.clockOut ? formatTime(r.clockOut) : '— Active'}
                      </td>
                      <td style={{ padding: '10px', color: '#64748b' }}>
                        {r.clockOut ? calcHours(r.clockIn, r.clockOut) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {todayRecords.length > 0 && (
              <div style={{ marginTop: 20, padding: 16, background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}>
                <p style={{ color: '#475569', fontSize: 11, fontWeight: 600, letterSpacing: 0.5, marginBottom: 10 }}>
                  TODAY'S SUMMARY
                </p>
                {employees.map(emp => {
                  const empRecs = todayRecords.filter(r => r.employee === emp.name && r.clockOut)
                  const totalMs = empRecs.reduce((s, r) => s + (new Date(r.clockOut) - new Date(r.clockIn)), 0)
                  const h = Math.floor(totalMs / 3600000)
                  const m = Math.floor((totalMs % 3600000) / 60000)
                  if (empRecs.length === 0) return null
                  return (
                    <div key={emp.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>{emp.name}</span>
                      <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>{h}h {m}m</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
