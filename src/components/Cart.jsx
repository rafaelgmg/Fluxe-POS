import { TAX_RATE } from '../data/mockData'

export default function Cart({ items, onRemove, onCompleteSale, currentUser, onFreezeSale }) {
  const subtotal = items.reduce((sum, i) => sum + i.subtotal, 0)
  const totalDiscount = items.reduce((sum, i) => sum + (i.discount * i.qty), 0)
  const totalSpare = items.reduce((sum, i) => sum + i.spare, 0)
  const tax = subtotal * TAX_RATE
  const total = subtotal + tax

  return (
    <div style={{
      width: 320, background: '#323232', borderLeft: '1px solid #333',
      display: 'flex', flexDirection: 'column', height: '100%'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: '#3d3d3d',
        borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{ fontSize: 16 }}>🛒</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Shopping Cart</span>
        {items.length > 0 && (
          <span style={{
            fontSize: 11, marginLeft: 4,
            color: totalSpare < 0 ? '#e74c3c' : '#666'
          }}>
            {totalSpare < 0 ? '-' : ''}{Math.abs(totalSpare).toFixed(2)}
          </span>
        )}
        {currentUser && (
          <span style={{
            marginLeft: 'auto', background: '#2980b9', borderRadius: 12,
            padding: '2px 10px', fontSize: 12, color: '#fff'
          }}>{currentUser.name}</span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 48px 68px 68px 28px',
        padding: '6px 12px', background: '#3d3d3d',
        borderBottom: '1px solid #333', fontSize: 11, color: '#888'
      }}>
        <span>Product</span>
        <span style={{ textAlign: 'center' }}>Qty</span>
        <span style={{ textAlign: 'right' }}>Price</span>
        <span style={{ textAlign: 'right' }}>Sub</span>
        <span></span>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#555', fontSize: 13 }}>
            Scan a product to add
          </div>
        )}
        {items.map((item, idx) => (
          <div key={idx} style={{
            display: 'grid', gridTemplateColumns: '1fr 48px 68px 68px 28px',
            padding: '8px 12px', borderBottom: '1px solid #3a3a3a',
            alignItems: 'start'
          }}>
            <div>
              <p style={{ fontSize: 12, color: '#e0e0e0', lineHeight: 1.3 }}>{item.product.name}</p>
              {item.discount > 0 && (
                <p style={{ fontSize: 11, color: '#f39c12', marginTop: 2 }}>
                  *Disc: -${(item.discount).toFixed(2)}
                </p>
              )}
            </div>
            <span style={{ textAlign: 'center', fontSize: 13, color: '#ccc' }}>{item.qty}</span>
            <span style={{ textAlign: 'right', fontSize: 13, color: '#ccc' }}>
              ${item.systemPrice.toFixed(2)}
            </span>
            <span style={{ textAlign: 'right', fontSize: 13, color: '#4caf50', fontWeight: 600 }}>
              ${item.subtotal.toFixed(2)}
            </span>
            <button
              onClick={() => onRemove(idx)}
              style={{
                background: 'none', border: 'none', color: '#e74c3c',
                fontSize: 16, cursor: 'pointer', textAlign: 'center'
              }}
            >×</button>
          </div>
        ))}
      </div>

      {/* Totals */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #333', background: '#3d3d3d' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#aaa', fontSize: 13 }}>Subtotal</span>
          <span style={{ color: '#4caf50', fontSize: 13 }}>${subtotal.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: '#aaa', fontSize: 13 }}>Tax (8.5%)</span>
          <span style={{ color: '#aaa', fontSize: 13 }}>${tax.toFixed(2)}</span>
        </div>
        {totalDiscount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#f39c12', fontSize: 13 }}>Discount</span>
            <span style={{ color: '#f39c12', fontSize: 13 }}>-${totalDiscount.toFixed(2)}</span>
          </div>
        )}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          borderTop: '1px solid #444', paddingTop: 10, marginTop: 4
        }}>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>Total</span>
          <span style={{ color: '#fff', fontSize: 20, fontWeight: 700 }}>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '12px 16px', background: '#323232', borderTop: '1px solid #333' }}>
        <button
          onClick={onCompleteSale}
          disabled={items.length === 0}
          style={{
            width: '100%', padding: '14px', marginBottom: 8,
            background: items.length === 0 ? '#333' : '#27ae60',
            border: 'none', borderRadius: 6, color: items.length === 0 ? '#666' : '#fff',
            fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8, cursor: items.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          🛒 Complete Sale
        </button>
        <button
          onClick={onFreezeSale}
          disabled={items.length === 0}
          style={{
            width: '100%', padding: '10px',
            background: items.length === 0 ? '#3d3d3d' : '#333348',
            border: '1px solid #555', borderRadius: 6,
            color: items.length === 0 ? '#555' : '#aaa', fontSize: 13,
            cursor: items.length === 0 ? 'not-allowed' : 'pointer'
          }}
        >
          ❄️ Freeze Sale
        </button>
      </div>
    </div>
  )
}
