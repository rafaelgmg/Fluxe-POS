import { useState } from 'react'
import { TAX_RATE } from '../data/mockData'

const METHODS = [
  { id: 'cash',     label: 'Cash',            icon: '💵', color: '#27ae60' },
  { id: 'card',     label: 'Credit Card',     icon: '💳', color: '#2980b9' },
  { id: 'external', label: 'External Credit', icon: '📱', color: '#8e44ad' },
]

export default function PaymentModal({ items, currentUser, onConfirm, onCancel }) {
  const [method, setMethod] = useState('cash')

  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div style={{
        background: '#3d3d3d', border: '1px solid #555', borderRadius: 8,
        width: 420, padding: 28
      }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 20 }}>
          Complete Sale
        </h2>

        {/* Total */}
        <div style={{
          background: '#2c2c2c', borderRadius: 8, padding: '16px 20px',
          marginBottom: 24, textAlign: 'center'
        }}>
          <p style={{ color: '#888', fontSize: 13, marginBottom: 4 }}>Total to charge</p>
          <p style={{ color: '#4caf50', fontSize: 36, fontWeight: 800 }}>${total.toFixed(2)}</p>
          <p style={{ color: '#666', fontSize: 12 }}>
            Subtotal ${subtotal.toFixed(2)} + Tax ${tax.toFixed(2)}
          </p>
        </div>

        {/* Payment method */}
        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 12 }}>Select payment method</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          {METHODS.map(m => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              style={{
                padding: '14px 18px', borderRadius: 8, border: `2px solid ${method === m.id ? m.color : '#444'}`,
                background: method === m.id ? `${m.color}22` : '#2c2c2c',
                color: method === m.id ? '#fff' : '#888',
                display: 'flex', alignItems: 'center', gap: 12,
                fontSize: 15, fontWeight: method === m.id ? 700 : 400, cursor: 'pointer'
              }}
            >
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              {m.label}
              {method === m.id && <span style={{ marginLeft: 'auto', color: m.color }}>✓</span>}
            </button>
          ))}
        </div>

        {/* Confirm / Cancel */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => onConfirm({ method, total, subtotal, tax })}
            style={{
              flex: 2, padding: '14px', background: '#27ae60',
              border: 'none', borderRadius: 6, color: '#fff', fontSize: 16, fontWeight: 700
            }}
          >
            ✓ Confirm Sale
          </button>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: '14px', background: '#555',
              border: 'none', borderRadius: 6, color: '#fff', fontSize: 15
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
