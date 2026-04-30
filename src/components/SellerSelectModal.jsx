import { useState } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'
import { loadClockRecords }    from '../utils/clockStorage'

const BLUE  = '#3b82f6'
const GREEN = '#22c55e'
const RED   = '#ef4444'

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
        background: isActive ? 'rgba(37,99,235,0.15)' : 'var(--c-bg-card)',
        border: `1px solid ${isActive ? BLUE : 'var(--c-border)'}`,
        borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%',
        transition: 'all 0.2s ease',
        boxShadow: isActive ? '0 0 16px rgba(37,99,235,0.15)' : 'none',
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--c-bg-hover)'; e.currentTarget.style.borderColor = 'var(--c-border-md)' } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'var(--c-bg-card)'; e.currentTarget.style.borderColor = 'var(--c-border)' } }}
    >
      {emp.photo
        ? <img src={emp.photo} alt={emp.name[0]} style={{
            width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
            border: `2px solid ${isActive ? BLUE : 'var(--c-border-md)'}`,
          }} />
        : <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: isActive ? 'rgba(37,99,235,0.25)' : 'var(--c-bg-hover)',
            border: `2px solid ${isActive ? BLUE : 'var(--c-border-md)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800,
            color: isActive ? BLUE : 'var(--c-text-muted)',
            flexShrink: 0,
          }}>
            {emp.name[0]}
          </div>
      }
      <div style={{ flex: 1 }}>
        <p style={{ color: isActive ? 'var(--c-text)' : 'var(--c-text-sub)', fontWeight: isActive ? 700 : 500, fontSize: 14 }}>
          {emp.name}
        </p>
        <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 2 }}>{emp.role}</p>
      </div>
      {isActive && (
        <div style={{
          width: 20, height: 20, borderRadius: '50%',
          background: BLUE, display: 'flex', alignItems: 'center',
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

  const [selected,  setSelected]  = useState(null)
  const [showAll,   setShowAll]   = useState(clocked.length === 0)

  const listToShow = showAll ? employees : clocked

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'var(--c-overlay)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'var(--c-bg-panel)',
        border: '1px solid var(--c-border)', borderRadius: 10,
        width: 380, maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--c-shadow-card)',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', background: 'var(--c-bg-card)',
          borderBottom: '1px solid var(--c-border)', borderRadius: '10px 10px 0 0',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32, background: 'rgba(37,99,235,0.15)',
            border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>👤</div>
          <div>
            <p style={{ color: 'var(--c-text)', fontWeight: 700, fontSize: 15 }}>Select Seller</p>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 11, marginTop: 1 }}>
              {showAll ? 'All active sellers' : 'Clocked in today'}
            </p>
          </div>
          <div style={{
            marginLeft: 'auto', background: 'var(--c-bg)',
            border: '1px solid var(--c-border)', borderRadius: 6,
            padding: '5px 12px', textAlign: 'right',
          }}>
            <p style={{ color: 'var(--c-text-muted)', fontSize: 10 }}>Total</p>
            <p style={{ color: GREEN, fontWeight: 800, fontSize: 16 }}>${total.toFixed(2)}</p>
          </div>
        </div>

        {/* Clocked-in badge */}
        {!showAll && clocked.length > 0 && (
          <div style={{
            padding: '8px 16px 4px',
            display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: GREEN }} />
            <span style={{ color: 'var(--c-text-muted)', fontSize: 11 }}>
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

        {/* "Not on that list?" */}
        {!showAll && others.length > 0 && (
          <div style={{ padding: '4px 16px 8px', flexShrink: 0 }}>
            <button
              onClick={() => setShowAll(true)}
              style={{
                width: '100%', padding: '10px',
                background: 'transparent',
                border: '1px dashed var(--c-border)',
                borderRadius: 6, cursor: 'pointer',
                color: 'var(--c-text-muted)', fontSize: 12,
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.color = 'var(--c-text-sub)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-muted)' }}
            >
              Not on that list? → Select another seller
            </button>
          </div>
        )}

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--c-border)',
          display: 'flex', gap: 10, flexShrink: 0,
        }}>
          <button
            onClick={() => { if (selected) onConfirm(selected) }}
            disabled={!selected}
            style={{
              flex: 2, padding: '13px',
              background: selected ? BLUE : 'var(--c-bg-card)',
              border: selected ? 'none' : '1px solid var(--c-border)',
              borderRadius: 6, color: selected ? '#fff' : 'var(--c-text-muted)',
              fontSize: 14, fontWeight: 700,
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              boxShadow: selected ? '0 0 20px rgba(37,99,235,0.25)' : 'none',
            }}
            onMouseEnter={e => { if (selected) { e.currentTarget.style.background = '#1d4ed8'; e.currentTarget.style.boxShadow = '0 0 30px rgba(37,99,235,0.4)' } }}
            onMouseLeave={e => { if (selected) { e.currentTarget.style.background = BLUE; e.currentTarget.style.boxShadow = '0 0 20px rgba(37,99,235,0.25)' } }}
          >
            Confirm →
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '13px',
              background: 'transparent', border: '1px solid var(--c-border)',
              borderRadius: 6, color: 'var(--c-text-muted)', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--c-border)'; e.currentTarget.style.color = 'var(--c-text-muted)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
