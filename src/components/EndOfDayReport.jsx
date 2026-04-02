import { useState } from 'react'
import { TAX_RATE } from '../data/mockData'

// Mock sales data for demonstration
const MOCK_SALES = [
  { id: 67613, time: '09:15', employee: 'Rafael', product: 'New Collection Ocean Noir',    subtotal: 120.00, method: 'cash'     },
  { id: 67614, time: '10:32', employee: 'Natalia', product: 'YSL Black Opium Extreme',      subtotal: 140.00, method: 'external' },
  { id: 67615, time: '11:05', employee: 'Rafael',  product: 'Jean Paul Gaultier',           subtotal: 95.00,  method: 'cash'     },
  { id: 67616, time: '12:20', employee: 'Nate',    product: 'Prada Paradoxe SET',           subtotal: 45.00,  method: 'external' },
  { id: 67617, time: '13:44', employee: 'Natalia', product: 'Tom Ford Metallique',          subtotal: 180.00, method: 'cash'     },
  { id: 67618, time: '15:10', employee: 'Rafael',  product: 'Burberry Hero Parfum',         subtotal: 110.00, method: 'card'     },
  { id: 67619, time: '16:55', employee: 'Rafael',  product: 'Ralph Lauren Polo Red',        subtotal: 80.00,  method: 'cash'     },
]

export default function EndOfDayReport({ onClose }) {
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  const netRevenue  = MOCK_SALES.reduce((s, x) => s + x.subtotal, 0)
  const taxRevenue  = netRevenue * TAX_RATE
  const grossRevenue = netRevenue + taxRevenue

  const cashTotal     = MOCK_SALES.filter(s => s.method === 'cash').reduce((s, x) => s + x.subtotal + x.subtotal * TAX_RATE, 0)
  const externalTotal = MOCK_SALES.filter(s => s.method === 'external').reduce((s, x) => s + x.subtotal + x.subtotal * TAX_RATE, 0)
  const cardTotal     = MOCK_SALES.filter(s => s.method === 'card').reduce((s, x) => s + x.subtotal + x.subtotal * TAX_RATE, 0)

  // Sales by employee
  const byEmployee = MOCK_SALES.reduce((acc, s) => {
    acc[s.employee] = (acc[s.employee] || 0) + s.subtotal
    return acc
  }, {})

  // Products sold
  const byProduct = MOCK_SALES.reduce((acc, s) => {
    acc[s.product] = (acc[s.product] || 0) + 1
    return acc
  }, {})
  const topProducts = Object.entries(byProduct).sort((a, b) => b[1] - a[1])

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  // Bar chart: max bar = 100% width
  const maxEmpSales = Math.max(...Object.values(byEmployee))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      padding: 20
    }}>
      <div style={{
        background: '#323232', border: '1px solid #555', borderRadius: 8,
        width: 760, maxHeight: '90vh', overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 24px', background: '#3d3d3d',
          borderBottom: '1px solid #555', display: 'flex', alignItems: 'center', gap: 12
        }}>
          <span style={{ fontSize: 22 }}>📊</span>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>End of Day Report</h2>
            <p style={{ color: '#888', fontSize: 12 }}>{today} — Miracle Mall 01</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
            <button style={{
              padding: '8px 16px', background: '#2980b9', border: 'none',
              borderRadius: 6, color: '#fff', fontSize: 13, cursor: 'pointer'
            }}>🖨️ Print</button>
            <button onClick={onClose} style={{
              padding: '8px 16px', background: '#555', border: 'none',
              borderRadius: 6, color: '#fff', fontSize: 13, cursor: 'pointer'
            }}>Close</button>
          </div>
        </div>

        <div style={{ padding: 24 }}>
          {/* Revenue summary */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
            {[
              { label: 'Total Net Revenue',   value: netRevenue,   color: '#4caf50' },
              { label: 'Total Tax Revenue',   value: taxRevenue,   color: '#f39c12' },
              { label: 'Total Gross Revenue', value: grossRevenue, color: '#2980b9' },
            ].map(item => (
              <div key={item.label} style={{
                background: '#2c2c2c', borderRadius: 8, padding: '16px 20px',
                borderLeft: `4px solid ${item.color}`
              }}>
                <p style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>{item.label}</p>
                <p style={{ color: item.color, fontSize: 26, fontWeight: 800 }}>
                  ${item.value.toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          {/* Transactions count */}
          <p style={{ color: '#888', fontSize: 13, marginBottom: 20 }}>
            Number of Transactions: <strong style={{ color: '#fff' }}>{MOCK_SALES.length}</strong>
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
            {/* Payment methods */}
            <div style={{ background: '#2c2c2c', borderRadius: 8, padding: 20 }}>
              <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                Payment Methods
              </h3>
              {[
                { label: 'Cash',            value: cashTotal,     color: '#27ae60' },
                { label: 'External Credit', value: externalTotal, color: '#8e44ad' },
                { label: 'Credit Cards',    value: cardTotal,     color: '#2980b9' },
              ].map(m => (
                <div key={m.label} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#ccc', fontSize: 13 }}>{m.label}</span>
                    <span style={{ color: m.color, fontSize: 13, fontWeight: 700 }}>
                      ${m.value.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#3a3a3a', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: m.color,
                      width: `${(m.value / grossRevenue) * 100}%`
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Sales by employee */}
            <div style={{ background: '#2c2c2c', borderRadius: 8, padding: 20 }}>
              <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                Sales by Employee
              </h3>
              {Object.entries(byEmployee).sort((a, b) => b[1] - a[1]).map(([name, total]) => (
                <div key={name} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#ccc', fontSize: 13 }}>{name}</span>
                    <span style={{ color: '#4caf50', fontSize: 13, fontWeight: 700 }}>
                      ${total.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ height: 6, background: '#3a3a3a', borderRadius: 3 }}>
                    <div style={{
                      height: '100%', borderRadius: 3, background: '#4caf50',
                      width: `${(total / maxEmpSales) * 100}%`
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Products sold */}
          <div style={{ background: '#2c2c2c', borderRadius: 8, padding: 20, marginBottom: 20 }}>
            <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
              Products Sold Today
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
              {topProducts.map(([name, qty]) => (
                <div key={name} style={{
                  background: '#3a3a3a', borderRadius: 6, padding: '12px 14px',
                  borderBottom: '3px solid #4caf50'
                }}>
                  <p style={{ color: '#aaa', fontSize: 11, marginBottom: 4, lineHeight: 1.3 }}>{name}</p>
                  <p style={{ color: '#4caf50', fontSize: 22, fontWeight: 800 }}>{qty}×</p>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={{ background: '#2c2c2c', borderRadius: 8, padding: 20 }}>
            <h3 style={{ color: '#fff', fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              📝 Additional Notes
            </h3>
            <textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setSaved(false) }}
              placeholder="Enter end of day notes here..."
              style={{
                width: '100%', height: 80, background: '#3a3a3a', border: '1px solid #555',
                borderRadius: 6, color: '#fff', fontSize: 13, padding: 12, resize: 'vertical',
                fontFamily: 'inherit'
              }}
            />
            <button
              onClick={() => setSaved(true)}
              style={{
                marginTop: 8, padding: '8px 20px', background: saved ? '#27ae60' : '#2980b9',
                border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, cursor: 'pointer'
              }}
            >
              {saved ? '✓ Saved' : 'Save Notes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
