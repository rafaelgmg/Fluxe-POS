import { sumItemSpare } from '../utils/spareUtils'

export default function Cart({ items, taxRate = 0.085, onRemove, onCompleteSale, currentUser, onFreezeSale, onEditItem }) {
  const subtotal      = items.reduce((sum, i) => sum + i.subtotal, 0)
  const totalDiscount = items.reduce((sum, i) => sum + (i.discount * i.qty), 0)
  const totalSpare    = sumItemSpare(items)
  const tax   = subtotal * taxRate
  const total = subtotal + tax
  const empty = items.length === 0

  return (
    <div style={{
      width: 320, background: '#0d1526', borderLeft: '1px solid #253349',
      display: 'flex', flexDirection: 'column', height: '100%'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: '#111d30',
        borderBottom: '1px solid #253349', display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{ fontSize: 16 }}>🛒</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9' }}>Cart</span>
        {items.length > 0 && (
          <span style={{
            fontSize: 11, marginLeft: 4,
            color: totalSpare < 0 ? '#ef4444' : '#94a3b8'
          }}>
            {totalSpare < 0 ? '-' : '+'}{Math.floor(Math.abs(totalSpare))}
          </span>
        )}
        {currentUser && (
          <span style={{
            marginLeft: 'auto', background: 'rgba(37,99,235,0.2)',
            border: '1px solid rgba(37,99,235,0.3)',
            borderRadius: 12, padding: '2px 10px',
            fontSize: 11, color: '#93c5fd', fontWeight: 600,
          }}>{currentUser.name}</span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 48px 68px 68px 28px',
        padding: '8px 12px', background: '#111d30',
        borderBottom: '1px solid #253349',
        fontSize: 11, color: '#b8c8da', fontWeight: 700, letterSpacing: 0.4,
      }}>
        <span>PRODUCT</span>
        <span style={{ textAlign: 'center' }}>QTY</span>
        <span style={{ textAlign: 'right' }}>PRICE</span>
        <span style={{ textAlign: 'right' }}>SUB</span>
        <span></span>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {empty && (
          <div style={{
            padding: 32, textAlign: 'center', color: '#415569', fontSize: 13,
            background: 'radial-gradient(ellipse at center, rgba(37,99,235,0.03) 0%, transparent 70%)',
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            Scan or select a product
          </div>
        )}
        {items.map((item, idx) => {
          const isExchange = !!item.exchangeType
          const isReturn   = item.exchangeType === 'return'
          return (
            <div key={idx}
              onClick={() => !isExchange && onEditItem && onEditItem(idx)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 48px 68px 68px 28px',
                padding: '11px 12px', borderBottom: '1px solid rgba(30,41,59,0.5)',
                alignItems: 'start', transition: 'background 0.2s ease',
                cursor: isExchange ? 'default' : 'pointer',
                background: isReturn
                  ? 'rgba(34,197,94,0.06)'
                  : isExchange
                  ? 'rgba(239,68,68,0.06)'
                  : 'transparent'
              }}
              onMouseEnter={e => { if (!isExchange) e.currentTarget.style.background = 'rgba(37,99,235,0.07)' }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isReturn
                  ? 'rgba(34,197,94,0.06)'
                  : isExchange ? 'rgba(239,68,68,0.06)' : 'transparent'
              }}
            >
              <div>
                <p style={{ fontSize: 14, color: isExchange ? '#94a3b8' : '#f1f5f9', lineHeight: 1.3, fontWeight: 600 }}>
                  {item.product.name}
                </p>
                {isReturn && (
                  <p style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>↩ Return</p>
                )}
                {isExchange && !isReturn && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>⚠ Damaged</p>
                )}
                {!isExchange && item.discount > 0 && (
                  <p style={{ fontSize: 11, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>
                    −${item.discount.toFixed(2)} disc
                  </p>
                )}
              </div>
              <span style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: '#cbd0e0' }}>
                {item.qty}
              </span>
              <span style={{ textAlign: 'right', fontSize: 14, color: '#cbd0e0' }}>
                ${item.systemPrice.toFixed(2)}
              </span>
              <span style={{
                textAlign: 'right', fontSize: 15, fontWeight: 700,
                color: isExchange ? '#94a3b8' : '#22c55e'
              }}>
                ${item.subtotal.toFixed(2)}
              </span>
              <button onClick={e => { e.stopPropagation(); onRemove(idx) }} style={{
                background: 'none', border: 'none', color: '#94a3b8',
                fontSize: 17, cursor: 'pointer', textAlign: 'center',
                transition: 'color 0.1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
              >×</button>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid #253349', background: '#111d30' }}>
        {[
          { label: 'Subtotal', value: `$${subtotal.toFixed(2)}`, color: '#e2e8f0' },
          ...(totalDiscount > 0 ? [{ label: 'Discount', value: `-$${totalDiscount.toFixed(2)}`, color: '#f59e0b' }] : []),
        ].map(row => (
          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ color: '#94a3b8', fontSize: 13 }}>{row.label}</span>
            <span style={{ color: row.color, fontSize: 13 }}>{row.value}</span>
          </div>
        ))}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          borderTop: '1px solid #253349', paddingTop: 10, marginTop: 6
        }}>
          <span style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 800 }}>Total</span>
          <span style={{ color: '#f1f5f9', fontSize: 20, fontWeight: 800 }}>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '12px 16px', background: '#0d1526', borderTop: '1px solid #253349' }}>
        <button
          onClick={onCompleteSale}
          disabled={empty}
          style={{
            width: '100%', padding: '14px', marginBottom: 8,
            background: empty
              ? '#111d30'
              : 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
            border: empty ? '1px solid #253349' : 'none',
            borderRadius: 10,
            color: empty ? '#415569' : '#fff',
            fontSize: 15, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: empty ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
            boxShadow: empty ? 'none' : '0 0 24px rgba(37,99,235,0.35)',
            letterSpacing: 0.3,
          }}
          onMouseEnter={e => { if (!empty) { e.currentTarget.style.boxShadow = '0 0 36px rgba(37,99,235,0.5)'; e.currentTarget.style.transform = 'scale(1.01)' } }}
          onMouseLeave={e => { if (!empty) { e.currentTarget.style.boxShadow = '0 0 24px rgba(37,99,235,0.35)'; e.currentTarget.style.transform = 'scale(1)' } }}
        >
          🛒 Complete Sale
        </button>
        <button
          onClick={onFreezeSale}
          disabled={empty}
          style={{
            width: '100%', padding: '9px',
            background: 'rgba(255,255,255,0.03)',
            border: `1px solid ${empty ? '#253349' : '#263354'}`,
            borderRadius: 10,
            color: empty ? '#415569' : '#cbd0e0',
            fontSize: 12, fontWeight: 500,
            cursor: empty ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { if (!empty) { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#93c5fd'; e.currentTarget.style.background = 'rgba(37,99,235,0.06)' } }}
          onMouseLeave={e => { if (!empty) { e.currentTarget.style.borderColor = '#263354'; e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)' } }}
        >
          ❄️ Freeze Sale
        </button>
      </div>
    </div>
  )
}
