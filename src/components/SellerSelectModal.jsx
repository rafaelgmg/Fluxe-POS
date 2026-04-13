import { useState } from 'react'
import { loadActiveEmployees } from '../utils/usersStorage'

export default function SellerSelectModal({ total, onConfirm, onCancel }) {
  const employees = loadActiveEmployees()
  const [selected, setSelected] = useState(null)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0a0f1e 100%)',
        border: '1px solid #1e293b', borderRadius: 10,
        width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header */}
        <div style={{
          padding: '16px 20px', background: '#0f172a',
          borderBottom: '1px solid #1e293b', borderRadius: '10px 10px 0 0',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, background: 'rgba(37,99,235,0.15)',
            border: '1px solid rgba(37,99,235,0.3)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
          }}>👤</div>
          <div>
            <p style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 15 }}>Select Seller</p>
            <p style={{ color: '#475569', fontSize: 11, marginTop: 1 }}>Who is making this sale?</p>
          </div>
          <div style={{
            marginLeft: 'auto', background: '#0f172a',
            border: '1px solid #1e293b', borderRadius: 6,
            padding: '5px 12px', textAlign: 'right',
          }}>
            <p style={{ color: '#475569', fontSize: 10 }}>Total</p>
            <p style={{ color: '#22c55e', fontWeight: 800, fontSize: 16 }}>${total.toFixed(2)}</p>
          </div>
        </div>

        {/* Employee list */}
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {employees.map(emp => {
            const isActive = selected?.id === emp.id
            return (
              <button
                key={emp.id}
                onClick={() => setSelected(emp)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '13px 16px',
                  background: isActive ? 'rgba(37,99,235,0.15)' : '#0f172a',
                  border: `1px solid ${isActive ? '#2563eb' : '#1e293b'}`,
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                  transition: 'all 0.2s ease',
                  boxShadow: isActive ? '0 0 16px rgba(37,99,235,0.15)' : 'none',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(37,99,235,0.06)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.3)' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = '#0f172a'; e.currentTarget.style.borderColor = '#1e293b' } }}
              >
                {/* Avatar */}
                {emp.photo
                  ? <img src={emp.photo} alt={emp.name[0]} style={{
                      width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0,
                      border: `2px solid ${isActive ? '#2563eb' : '#334155'}`,
                      transition: 'border-color 0.2s ease',
                    }} />
                  : <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: isActive ? 'rgba(37,99,235,0.25)' : '#1e293b',
                      border: `2px solid ${isActive ? '#2563eb' : '#334155'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 16, fontWeight: 800, color: isActive ? '#93c5fd' : '#64748b',
                      flexShrink: 0, transition: 'all 0.2s ease',
                    }}>
                      {emp.name[0]}
                    </div>
                }

                <div style={{ flex: 1 }}>
                  <p style={{ color: isActive ? '#f1f5f9' : '#94a3b8', fontWeight: isActive ? 700 : 500, fontSize: 14 }}>
                    {emp.name}
                  </p>
                  <p style={{ color: '#334155', fontSize: 11, marginTop: 2 }}>{emp.role}</p>
                </div>

                {isActive && (
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: '#2563eb', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 12, color: '#fff',
                  }}>✓</div>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid #1e293b',
          display: 'flex', gap: 10,
        }}>
          <button
            onClick={() => { if (selected) onConfirm(selected) }}
            disabled={!selected}
            style={{
              flex: 2, padding: '13px',
              background: selected ? '#2563eb' : '#0f172a',
              border: selected ? 'none' : '1px solid #1e293b',
              borderRadius: 6, color: selected ? '#fff' : '#334155',
              fontSize: 14, fontWeight: 700,
              cursor: selected ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease',
              boxShadow: selected ? '0 0 20px rgba(37,99,235,0.25)' : 'none',
            }}
            onMouseEnter={e => { if (selected) { e.currentTarget.style.background = '#1d4ed8'; e.currentTarget.style.boxShadow = '0 0 30px rgba(37,99,235,0.4)' } }}
            onMouseLeave={e => { if (selected) { e.currentTarget.style.background = '#2563eb'; e.currentTarget.style.boxShadow = '0 0 20px rgba(37,99,235,0.25)' } }}
          >
            Confirm →
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '13px',
              background: 'transparent', border: '1px solid #1e293b',
              borderRadius: 6, color: '#64748b', fontSize: 13, cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#ef4444'; e.currentTarget.style.color = '#ef4444' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#1e293b'; e.currentTarget.style.color = '#64748b' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
