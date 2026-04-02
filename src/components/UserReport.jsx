import { useState } from 'react'
import { EMPLOYEES } from '../data/mockData'

const MOCK_USER_DATA = {
  Rafael: {
    totalSalary: 918.53, salesComm: 918.53, productComm: 0, hourly: 0,
    reimbursements: 0, tips: 0, refundsComm: 0, deductions: 0,
    dailySales: [
      { date: '3/1',  salary: 82.91,  sales: 829.09,  spare: 279.10 },
      { date: '3/2',  salary: 37.97,  sales: 379.73,  spare: 14.74  },
      { date: '3/4',  salary: 9.22,   sales: 92.17,   spare: 22.17  },
      { date: '3/5',  salary: 28.02,  sales: 280.15,  spare: 30.16  },
      { date: '3/6',  salary: 60.00,  sales: 600.00,  spare: 170.00 },
      { date: '3/10', salary: 34.31,  sales: 343.09,  spare: 38.11  },
      { date: '3/11', salary: 65.51,  sales: 655.13,  spare: 100.13 },
      { date: '3/12', salary: 27.74,  sales: 277.40,  spare: 55.20  },
      { date: '3/13', salary: 20.28,  sales: 202.80,  spare: 40.10  },
      { date: '3/14', salary: 100.98, sales: 1009.80, spare: 300.20 },
      { date: '3/16', salary: 47.47,  sales: 474.70,  spare: 90.30  },
      { date: '3/17', salary: 32.68,  sales: 326.80,  spare: 60.10  },
      { date: '3/18', salary: 39.40,  sales: 394.00,  spare: 75.00  },
      { date: '3/19', salary: 15.67,  sales: 156.70,  spare: 28.50  },
      { date: '3/24', salary: 60.92,  sales: 609.20,  spare: 115.00 },
      { date: '3/25', salary: 128.99, sales: 1289.90, spare: 380.40 },
      { date: '3/27', salary: 29.28,  sales: 292.80,  spare: 55.00  },
      { date: '3/28', salary: 85.93,  sales: 859.30,  spare: 198.20 },
    ],
    invoices: [
      { id: 67613, time: '3/28 8:44 PM',  location: 'Miracle Mall 01', sub: 73.73,  tax: 6.27,  total: 80.00  },
      { id: 67614, time: '3/28 8:35 PM',  location: 'Miracle Mall 01', sub: 130.00, tax: 11.05, total: 141.05 },
      { id: 67615, time: '3/27 5:06 PM',  location: 'Miracle Mall 01', sub: 70.00,  tax: 5.95,  total: 75.95  },
      { id: 67616, time: '3/27 5:23 PM',  location: 'Miracle Mall 01', sub: 97.50,  tax: 8.29,  total: 105.79 },
      { id: 67617, time: '3/25 3:18 PM',  location: 'Miracle Mall 01', sub: 140.00, tax: 11.90, total: 151.90 },
      { id: 67618, time: '3/24 4:03 PM',  location: 'Miracle Mall 01', sub: 79.99,  tax: 6.80,  total: 86.79  },
    ]
  }
}

const TABS = ['Summary', 'Invoices', 'Product Commission', 'Products Sold', 'Hours', 'Spare', 'Deductions', 'Reimbursements']

export default function UserReport({ onClose }) {
  const [selectedUser, setSelectedUser] = useState('Rafael')
  const [activeTab, setActiveTab] = useState('Summary')
  const [fromDate, setFromDate] = useState('2026-03-01')
  const [toDate, setToDate]     = useState('2026-03-31')

  const data = MOCK_USER_DATA[selectedUser] || MOCK_USER_DATA.Rafael
  const maxSale = Math.max(...data.dailySales.map(d => d.salary))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20
    }}>
      <div style={{
        background: '#323232', border: '1px solid #555', borderRadius: 8,
        width: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 24px', background: '#3d3d3d',
          borderBottom: '1px solid #555', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0
        }}>
          <span style={{ fontSize: 22 }}>👤</span>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#fff' }}>User Report</h2>

          {/* User selector */}
          <select
            value={selectedUser}
            onChange={e => setSelectedUser(e.target.value)}
            style={{
              padding: '6px 12px', background: '#2c2c2c', border: '1px solid #555',
              borderRadius: 4, color: '#fff', fontSize: 13
            }}
          >
            {EMPLOYEES.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>

          {/* Date range */}
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            style={{ padding: '6px 10px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 12 }} />
          <span style={{ color: '#666' }}>to</span>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            style={{ padding: '6px 10px', background: '#2c2c2c', border: '1px solid #555', borderRadius: 4, color: '#fff', fontSize: 12 }} />

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button style={{ padding: '6px 14px', background: '#c0392b', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>📧 Email</button>
            <button style={{ padding: '6px 14px', background: '#555', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>🖨️ Print</button>
            <button onClick={onClose} style={{ padding: '6px 14px', background: '#444', border: 'none', borderRadius: 4, color: '#fff', fontSize: 12, cursor: 'pointer' }}>✕ Close</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
          {/* Salary summary */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: '#4caf50', fontSize: 13, marginBottom: 4 }}>Total Salary</p>
            <p style={{ color: '#4caf50', fontSize: 32, fontWeight: 800, marginBottom: 16 }}>
              ${data.totalSalary.toFixed(2)}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {[
                { label: 'Sales Commission',   value: data.salesComm    },
                { label: 'Product Commission', value: data.productComm  },
                { label: 'Hourly Salary',      value: data.hourly       },
                { label: 'Reimbursements',     value: data.reimbursements },
                { label: 'Refunds Comm.',      value: data.refundsComm  },
                { label: 'Deductions',         value: data.deductions, red: true },
                { label: 'Tips',               value: data.tips         },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: item.red ? '#e74c3c' : '#888', fontSize: 12 }}>{item.label}:</span>
                  <span style={{ color: item.red ? '#e74c3c' : '#ccc', fontSize: 12, fontWeight: 600 }}>
                    ${item.value.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Bar chart */}
          <div style={{
            background: '#2c2c2c', borderRadius: 8, padding: '16px 20px', marginBottom: 20
          }}>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>Daily Commission</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120 }}>
              {data.dailySales.map(d => (
                <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <span style={{ color: '#4caf50', fontSize: 9, fontWeight: 600 }}>${d.salary.toFixed(0)}</span>
                  <div style={{
                    width: '100%', background: '#4caf50', borderRadius: '3px 3px 0 0',
                    height: `${(d.salary / maxSale) * 90}px`, minHeight: 4
                  }} />
                  <span style={{ color: '#666', fontSize: 8, whiteSpace: 'nowrap' }}>{d.date}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 16, flexWrap: 'wrap' }}>
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '7px 14px', border: 'none', borderRadius: '4px 4px 0 0',
                  background: activeTab === tab ? '#2980b9' : '#3a3a3a',
                  color: activeTab === tab ? '#fff' : '#888', fontSize: 12, cursor: 'pointer',
                  fontWeight: activeTab === tab ? 600 : 400
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ background: '#2c2c2c', borderRadius: '0 8px 8px 8px', overflow: 'hidden' }}>
            {activeTab === 'Summary' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#3a3a3a' }}>
                    {['Date', 'Salary', 'Sales Total', 'Sales Comm.', 'Spare', 'Profit'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.dailySales.map((d, i) => (
                    <tr key={d.date} style={{ borderBottom: '1px solid #3a3a3a', background: i % 2 === 0 ? 'transparent' : '#2a2a2a' }}>
                      <td style={{ padding: '7px 12px', color: '#ccc' }}>{d.date}/2026</td>
                      <td style={{ padding: '7px 12px', color: '#4caf50' }}>${d.salary.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', color: '#ccc' }}>${d.sales.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', color: '#ccc' }}>${d.salary.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', color: '#f39c12' }}>${d.spare.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', color: '#4caf50' }}>${(d.sales * 0.9).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {activeTab === 'Invoices' && (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#3a3a3a' }}>
                    {['Invoice #', 'Date/Time', 'Location', 'Subtotal', 'Tax', 'Total'].map(h => (
                      <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#888', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.map((inv, i) => (
                    <tr key={inv.id} style={{ borderBottom: '1px solid #3a3a3a', background: i % 2 === 0 ? 'transparent' : '#2a2a2a' }}>
                      <td style={{ padding: '7px 12px', color: '#2980b9' }}>{inv.id}</td>
                      <td style={{ padding: '7px 12px', color: '#ccc' }}>{inv.time}</td>
                      <td style={{ padding: '7px 12px', color: '#ccc' }}>{inv.location}</td>
                      <td style={{ padding: '7px 12px', color: '#ccc' }}>${inv.sub.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', color: '#888' }}>${inv.tax.toFixed(2)}</td>
                      <td style={{ padding: '7px 12px', color: '#4caf50', fontWeight: 700 }}>${inv.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!['Summary', 'Invoices'].includes(activeTab) && (
              <div style={{ padding: 40, textAlign: 'center', color: '#555', fontSize: 13 }}>
                {activeTab} — coming in the next phase
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
