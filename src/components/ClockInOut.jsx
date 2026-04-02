import { useState, useEffect } from 'react'
import { EMPLOYEES } from '../data/mockData'

const STORAGE_KEY = 'pp_clock_records'

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [] }
  catch { return [] }
}
function saveRecords(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function calcHours(clockIn, clockOut) {
  const ms = new Date(clockOut) - new Date(clockIn)
  const h  = Math.floor(ms / 3600000)
  const m  = Math.floor((ms % 3600000) / 60000)
  return `${h}h ${m}m`
}

export default function ClockInOut({ onClose }) {
  const [records, setRecords]       = useState(loadRecords)
  const [selectedEmp, setSelectedEmp] = useState(EMPLOYEES[0].name)
  const [pin, setPin]               = useState('')
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [now, setNow]               = useState(new Date())

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Who is currently clocked in
  const clockedIn = (empName) => {
    const emp = records.filter(r => r.employee === empName)
    const last = emp[emp.length - 1]
    return last && !last.clockOut ? last : null
  }

  const handleKey = (val) => {
    if (val === 'Clear') { setPin(''); setError(''); return }
    if (pin.length >= 6) return
    setPin(p => p + val)
  }

  const handleAction = () => {
    const emp = EMPLOYEES.find(e => e.name === selectedEmp)
    if (!emp || emp.pin !== pin) {
      setError('Incorrect PIN'); setPin(''); return
    }
    setError('')
    const active = clockedIn(selectedEmp)
    const ts = new Date().toISOString()

    let updated
    if (active) {
      // Clock OUT
      updated = records.map(r =>
        r.id === active.id ? { ...r, clockOut: ts } : r
      )
      setSuccess(`${selectedEmp} clocked out at ${formatTime(ts)}`)
    } else {
      // Clock IN
      const newRecord = { id: Date.now(), employee: selectedEmp, clockIn: ts, clockOut: null }
      updated = [...records, newRecord]
      setSuccess(`${selectedEmp} clocked in at ${formatTime(ts)}`)
    }
    saveRecords(updated)
    setRecords(updated)
    setPin('')
    setTimeout(() => setSuccess(''), 3000)
  }

  // Today's records
  const today = new Date().toDateString()
  const todayRecords = records.filter(r => new Date(r.clockIn).toDateString() === today)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#323232', border: '1px solid #555', borderRadius: 8,
        width: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 24px', background: '#3d3d3d',
          borderBottom: '1px solid #555', display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 22 }}>⏰</span>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>Clock In / Out</h2>
          <span style={{ marginLeft: 'auto', color: '#4caf50', fontSize: 20, fontWeight: 700, fontFamily: 'monospace' }}>
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <button onClick={onClose} style={{
            padding: '6px 14px', background: '#555', border: 'none',
            borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer', marginLeft: 12
          }}>✕ Close</button>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left: action panel */}
          <div style={{ width: 280, padding: 24, borderRight: '1px solid #444', flexShrink: 0 }}>
            {/* Current status badges */}
            <div style={{ marginBottom: 20 }}>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>Current Status</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {EMPLOYEES.map(emp => {
                  const active = clockedIn(emp.name)
                  return (
                    <div key={emp.name} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '6px 10px', background: '#2c2c2c', borderRadius: 6,
                      border: `1px solid ${active ? '#27ae60' : '#3a3a3a'}`
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: active ? '#27ae60' : '#555'
                      }} />
                      <span style={{ color: '#ccc', fontSize: 13, flex: 1 }}>{emp.name}</span>
                      {active && (
                        <span style={{ color: '#4caf50', fontSize: 11 }}>
                          since {formatTime(active.clockIn)}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Employee selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>Employee</label>
              <select
                value={selectedEmp}
                onChange={e => { setSelectedEmp(e.target.value); setPin(''); setError('') }}
                style={{
                  width: '100%', padding: '8px 12px', background: '#2c2c2c',
                  border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 14
                }}
              >
                {EMPLOYEES.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
              </select>
            </div>

            {/* PIN */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ color: '#aaa', fontSize: 12, display: 'block', marginBottom: 6 }}>PIN</label>
              <input
                type="password" value={pin} readOnly
                style={{
                  width: '100%', padding: '8px 12px', background: '#2c2c2c',
                  border: `1px solid ${error ? '#e74c3c' : '#555'}`,
                  borderRadius: 4, color: '#fff', fontSize: 18, letterSpacing: 6
                }}
              />
              {error && <p style={{ color: '#e74c3c', fontSize: 11, marginTop: 4 }}>{error}</p>}
              {success && <p style={{ color: '#4caf50', fontSize: 11, marginTop: 4 }}>{success}</p>}
            </div>

            {/* Numpad */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
              {['7','8','9','4','5','6','1','2','3','0','Clear'].map(k => (
                <button key={k} onClick={() => handleKey(k)} style={{
                  gridColumn: k === 'Clear' ? 'span 2' : 'auto',
                  padding: '12px', background: '#4a4a4a', border: '1px solid #555',
                  borderRadius: 6, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer'
                }}>{k}</button>
              ))}
            </div>

            {/* Action button */}
            <button onClick={handleAction} style={{
              width: '100%', padding: '12px',
              background: clockedIn(selectedEmp) ? '#e74c3c' : '#27ae60',
              border: 'none', borderRadius: 6, color: '#fff',
              fontSize: 15, fontWeight: 700, cursor: 'pointer'
            }}>
              {clockedIn(selectedEmp) ? '🔴 Clock Out' : '🟢 Clock In'}
            </button>
          </div>

          {/* Right: today's log */}
          <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 14 }}>
              Today's Log — {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>

            {todayRecords.length === 0 && (
              <p style={{ color: '#555', fontSize: 13, textAlign: 'center', marginTop: 40 }}>
                No clock-in records today
              </p>
            )}

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              {todayRecords.length > 0 && (
                <thead>
                  <tr style={{ borderBottom: '1px solid #3a3a3a' }}>
                    {['Employee', 'Clock In', 'Clock Out', 'Hours'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: 11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {[...todayRecords].reverse().map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #2a2a2a' }}>
                    <td style={{ padding: '10px', color: '#e0e0e0' }}>{r.employee}</td>
                    <td style={{ padding: '10px', color: '#4caf50' }}>{formatTime(r.clockIn)}</td>
                    <td style={{ padding: '10px', color: r.clockOut ? '#aaa' : '#f39c12' }}>
                      {r.clockOut ? formatTime(r.clockOut) : '—  Active'}
                    </td>
                    <td style={{ padding: '10px', color: '#ccc' }}>
                      {r.clockOut ? calcHours(r.clockIn, r.clockOut) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Summary */}
            {todayRecords.length > 0 && (
              <div style={{ marginTop: 20, padding: 16, background: '#2c2c2c', borderRadius: 8 }}>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>Today's Summary</p>
                {EMPLOYEES.map(emp => {
                  const empRecs = todayRecords.filter(r => r.employee === emp.name && r.clockOut)
                  const totalMs = empRecs.reduce((s, r) => s + (new Date(r.clockOut) - new Date(r.clockIn)), 0)
                  const h = Math.floor(totalMs / 3600000)
                  const m = Math.floor((totalMs % 3600000) / 60000)
                  if (empRecs.length === 0) return null
                  return (
                    <div key={emp.name} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ color: '#ccc', fontSize: 13 }}>{emp.name}</span>
                      <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 600 }}>{h}h {m}m</span>
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
