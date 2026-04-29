import { useState, useEffect, useRef } from 'react'
import { sumItemSpare } from '../utils/spareUtils'

export default function Cart({ items, taxRate = 0.085, onRemove, onCompleteSale, currentUser, onFreezeSale, onEditItem }) {
  const subtotal      = items.reduce((sum, i) => sum + i.subtotal, 0)
  const totalDiscount = items.reduce((sum, i) => sum + (i.discount * i.qty), 0)
  const totalSpare    = sumItemSpare(items)
  const tax   = subtotal * taxRate
  const total = subtotal + tax
  const empty = items.length === 0

  // Flash animation when total changes — DO NOT MODIFY
  const [flash, setFlash] = useState(false)
  const prevTotalRef = useRef(total)
  useEffect(() => {
    if (prevTotalRef.current !== total) {
      prevTotalRef.current = total
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 400)
      return () => clearTimeout(t)
    }
  }, [total])

  return (
    <div style={{
      width: 320, background: 'var(--c-bg-panel)',
      borderLeft: '1px solid var(--c-border)',
      boxShadow: 'var(--c-shadow-card)',
      display: 'flex', flexDirection: 'column', height: '100%'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', background: 'var(--c-bg-card)',
        borderBottom: '1px solid var(--c-border)', display: 'flex', alignItems: 'center', gap: 8
      }}>
        <span style={{ fontSize: 16 }}>🛒</span>
        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--c-text)' }}>Cart</span>
        {items.length > 0 && (
          <span style={{
            fontSize: 11, marginLeft: 4,
            color: totalSpare < 0 ? '#ef4444' : 'var(--c-text-dim)'
          }}>
            {totalSpare < 0 ? '-' : '+'}{Math.floor(Math.abs(totalSpare))}
          </span>
        )}
        {currentUser && (
          <span style={{
            marginLeft: 'auto', background: 'rgba(37,99,235,0.10)',
            border: '1px solid rgba(37,99,235,0.25)',
            borderRadius: 12, padding: '2px 10px',
            fontSize: 11, color: '#3b82f6', fontWeight: 600,
          }}>{currentUser.name}</span>
        )}
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 48px 68px 68px 28px',
        padding: '8px 12px', background: 'var(--c-bg-card)',
        borderBottom: '1px solid var(--c-border)',
        fontSize: 11, color: 'var(--c-text-muted)', fontWeight: 700, letterSpacing: 0.4,
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
            padding: 32, textAlign: 'center', color: 'var(--c-text-dim)', fontSize: 13,
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
                padding: '11px 12px', borderBottom: '1px solid var(--c-border)',
                alignItems: 'start', transition: 'background 0.2s ease',
                cursor: isExchange ? 'default' : 'pointer',
                background: isReturn
                  ? 'rgba(34,197,94,0.06)'
                  : isExchange
                  ? 'rgba(239,68,68,0.06)'
                  : 'transparent'
              }}
              onMouseEnter={e => { if (!isExchange) e.currentTarget.style.background = 'rgba(37,99,235,0.05)' }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isReturn
                  ? 'rgba(34,197,94,0.06)'
                  : isExchange ? 'rgba(239,68,68,0.06)' : 'transparent'
              }}
            >
              <div>
                <p style={{ fontSize: 14, color: isExchange ? 'var(--c-text-muted)' : 'var(--c-text)', lineHeight: 1.3, fontWeight: 600 }}>
                  {item.product.name}
                </p>
                {isReturn && (
                  <p style={{ fontSize: 11, color: '#22c55e', marginTop: 2 }}>↩ Return</p>
                )}
                {isExchange && !isReturn && (
                  <p style={{ fontSize: 11, color: '#ef4444', marginTop: 2 }}>⚠ Damaged</p>
                )}
                {!isExchange && item.discount > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--c-text-muted)', fontWeight: 500, marginTop: 2, opacity: 0.75 }}>
                    −${item.discount.toFixed(2)} disc
                  </p>
                )}
              </div>
              <span style={{ textAlign: 'center', fontSize: 15, fontWeight: 600, color: 'var(--c-text-sub)' }}>
                {item.qty}
              </span>
              <span style={{ textAlign: 'right', fontSize: 14, color: 'var(--c-text-sub)' }}>
                ${item.systemPrice.toFixed(2)}
              </span>
              <span style={{
                textAlign: 'right', fontSize: 15, fontWeight: 700,
                color: isExchange ? 'var(--c-text-muted)' : '#16a34a'
              }}>
                ${item.subtotal.toFixed(2)}
              </span>
              <button onClick={e => { e.stopPropagation(); onRemove(idx) }} style={{
                background: 'none', border: 'none', color: 'var(--c-text-muted)',
                fontSize: 17, cursor: 'pointer', textAlign: 'center',
                transition: 'color 0.1s',
              }}
                onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--c-text-muted)' }}
              >×</button>
            </div>
          )
        })}
      </div>

      {/* Totals */}
      <div style={{ padding: '14px 16px', borderTop: '1px solid var(--c-border)', background: 'var(--c-bg-card)' }}>
        {/* Subtotal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: 'var(--c-text-muted)', fontSize: 23, fontWeight: 500 }}>Subtotal</span>
          <span style={{ color: 'var(--c-text-sub)', fontSize: 23, fontWeight: 600 }}>${subtotal.toFixed(2)}</span>
        </div>
        {/* Tax */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 0 }}>
          <span style={{ color: 'var(--c-text-muted)', fontSize: 16, fontWeight: 500 }}>Tax</span>
          <span style={{ color: 'var(--c-text-muted)', fontSize: 16, fontWeight: 600 }}>${tax.toFixed(2)}</span>
        </div>
        {/* Total — flash animation preserved */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderTop: '1px solid var(--c-border)', paddingTop: 14, marginTop: 12,
        }}>
          <span style={{ color: 'var(--c-text)', fontSize: 26, fontWeight: 800, letterSpacing: -0.5 }}>Total</span>
          <span style={{
            color: flash ? '#3b82f6' : 'var(--c-text)',
            fontSize: 38, fontWeight: 900, letterSpacing: -1.5,
            transform: flash ? 'scale(1.06)' : 'scale(1)',
            transformOrigin: 'right center',
            display: 'inline-block',
            transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), color 0.25s ease',
            textShadow: flash ? '0 0 18px rgba(59,130,246,0.4)' : 'none',
            lineHeight: 1,
          }}>${total.toFixed(2)}</span>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ padding: '12px 16px', background: 'var(--c-bg-panel)', borderTop: '1px solid var(--c-border)' }}>
        <button
          onClick={onCompleteSale}
          disabled={empty}
          style={{
            width: '100%', padding: '14px', marginBottom: 8,
            background: empty
              ? 'var(--c-bg-card)'
              : 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
            border: empty ? '1px solid var(--c-border)' : 'none',
            borderRadius: 10,
            color: empty ? 'var(--c-text-dim)' : '#fff',
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
            background: 'var(--c-bg-glass)',
            border: `1px solid ${empty ? 'var(--c-border)' : 'var(--c-border-md)'}`,
            borderRadius: 10,
            color: empty ? 'var(--c-text-dim)' : 'var(--c-text-sub)',
            fontSize: 12, fontWeight: 500,
            cursor: empty ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => { if (!empty) { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.background = 'rgba(37,99,235,0.06)' } }}
          onMouseLeave={e => { if (!empty) { e.currentTarget.style.borderColor = 'var(--c-border-md)'; e.currentTarget.style.color = 'var(--c-text-sub)'; e.currentTarget.style.background = 'var(--c-bg-glass)' } }}
        >
          ❄️ Freeze Sale
        </button>
      </div>
    </div>
  )
}
