import { useState } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { loadClockRecords }    from '../utils/clockStorage'

// Returns a Set of employee names that are clocked in right now (today, no clockOut)
function getClockedInNames() {
  const today   = new Date().toDateString()
  const records = loadClockRecords()
  const names   = new Set()
  records.forEach(r => {
    if (new Date(r.clockIn).toDateString() === today && !r.clockOut) {
      names.add(r.employee)
    }
  })
  return names
}

function EmployeeButton({ emp, isActive, onClick }) {
  return (
    <button
      onClick={() => onClick(emp)}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '13px 16px',
        background: isActive ? 'rgba(37,99,235,0.15)' : '#111d30',
        border: `1px solid ${isActive ? '#3b82f6' : '#253349'}`,
        borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.2s ease',
        boxShadow: isActive ? '0 0 16px rgba(37,99,235,0.15)' : 'none',
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(37,99,235,0.06)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.3)' } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = '#111d30'; e.currentTarget.style.borderColor = '#253349' } }}
    >
      {emp.photo
        ? <img src={emp.photo} alt={emp.name[0]} style={{
            width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
            border: `2px solid ${isActive ? '#3b82f6' : '#415569'}`,
          }} />
        : <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: isActive ? 'rgba(37,99,235,0.25)' : '#253349',
            border: `2px solid ${isActive ? '#3b82f6' : '#415569'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800,
            color: isActive ? '#93c5fd' : '#64748b',
            flexShrink: 0,
          }}>
            {emp.name[0]}
          </div>
      }
      <div style={{ flex: 1 }}>
        <p style={{ color: isActive ? '#f1f5f9' : '#a8b8cc', fontWeight: isActive ? 700 : 500, fontSize: 14 }}>
          {emp.name}
        </p>
        <p style={{ color: '#415569', fontSize: 11, marginTop: 2 }}>{emp.role}</p>
      </div>
      {isActive && (
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: '#3b82f6', display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 12, color: '#fff',
        }}>✓</div>
      )}
    </button>
  )
}

export default function SellerSelectModal({ total, onConfirm, onCancel }) {
  const employees      = loadActiveEmployees()
  const clockedInNames = getClockedInNames()

  const clocked = employees.filter(e => clockedInNames.has(e.name))
  const others  = employees.filter(e => !clockedInNames.has(e.name))

  const [selected,     setSelected]     = useState(null)
  const [showAll,      setShowAll]      = useState(clocked.length === 0)

  // Which list to render in the main body
  const listToShow = showAll ? employees : clocked

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0d1526 100%)',
        border: '1px solid #253349', borderRadius: 10,
        width: 380, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', background: '#111d30',
          borderBottom: '1px solid #253349', borderRadius: '10px 10px 0 0',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, background: 'rgba(37,99,235,0.15)',
            border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>👤</div>
          <div>
            <p style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Select Seller</p>
            <p style={{ color: '#64748b', fontSize: 11, marginTop: 1 }}>
              {showAll ? 'All active sellers' : 'Clocked in today'}
            </p>
          </div>
          <div style={{
            marginLeft: 'auto', background: '#111d30',
            border: '1px solid #253349', borderRadius: 6,
            padding: '5px 12px', textAlign: 'right',
          }}>
            <p style={{ color: '#64748b', fontSize: 10 }}>Total</p>
            <p style={{ color: '#22c55e', fontWeight: 800, fontSize: 16 }}>${total.toFixed(2)}</p>
          </div>
        </div>

        {/* Clocked-in badge — only shown when in clock-in view */}
        {!showAll && clocked.length > 0 && (
          <div style={{
            padding: '8px 16px 4px',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ color: '#64748b', fontSize: 11 }}>
              {clocked.length} seller{clocked.length > 1 ? 's' : ''} clocked in
            </span>
          </div>
        )}

        {/* Employee list */}
        <div style={{ padding: '8px 16px', display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
          {listToShow.map(emp => (
            <EmployeeButton
              key={emp.id}
              emp={emp}
              isActive={selected?.id === emp.id}
              onClick={setSelected}
            />
          ))}
        </div>

        {/* "Not on that list?" — only when showing clocked-in and there are others */}
        {!showAll && others.length > 0 && (
          <div style={{ padding: '4px 16px 8px', flexShrink: 0 }}>
            <button
              onClick={() => setShowAll(true)}
              style={{
                width: '100%', padding: '10px',
                background: 'transparent',
                border: '1px dashed #253349',
                borderRadius: 6, cursor: 'pointer',
                color: '#64748b', fontSize: 12,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#415569'; e.currentTarget.style.color = '#a8b8cc' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#64748b' }}
            >
              Not on that list? → Select another seller
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #253349',
          display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={() => { if (selected) onConfirm(selected) }}
            disabled={!selected}
            style={{
              flex: 2, padding: '13px',
              background: selected ? '#3b82f6' : '#111d30',
              border: selected ? 'none' : '1px solid #253349',
              borderRadius: 6, color: selected ? '#fff' : '#415569',
              fontSize: 14, fontWeight: 700,
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              boxShadow: selected ? '0 0 20px rgba(37,99,235,0.25)' : 'none',
            }}
            onMouseEnter={e => { if (selected) { e.currentTarget.style.background = '#1d4ed8'; e.currentTarget.style.boxShadow = '0 0 30px rgba(37,99,235,0.4)' } }}
            onMouseLeave={e => { if (selected) { e.currentTarget.style.background = '#3b82f6'; e.currentTarget.style.boxShadow = '0 0 20px rgba(37,99,235,0.25)' } }}
          >
            Confirm →
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '13px',
              background: 'transparent', border: '1px solid #253349',
              borderRadius: 6, color: '#64748b', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#253349'; e.currentTarget.style.color = '#64748b' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
