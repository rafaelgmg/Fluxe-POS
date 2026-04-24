/**
 * FrozenSalesModal.jsx
 *
 * Lista as vendas congeladas (❄️ Freeze Sale).
 * Permite retomar uma venda (carrega de volta no carrinho) ou descartá-la.
 *
 * Props:
 *   frozenSales  — array de { id, user, items, time, subtotal }
 *   onResume(id) — retoma a venda: carrega itens no carrinho e remove da lista
 *   onDiscard(id)— descarta a venda congelada sem retomar
 *   onClose()    — fecha o modal
 */

const BG     = '#030e1e'
const PANEL  = '#0d1526'
const CARD   = '#111d30'
const BORDER = '#253349'
const BLUE   = '#3b82f6'
const AMBER  = '#f59e0b'
const RED    = '#ef4444'
const MUTED  = '#94a3b8'
const DIM    = '#cbd0e0'
const TEXT   = '#f1f5f9'

function fmt$(n) {
  return '$' + (n || 0).toFixed(2)
}

function fmtTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function FrozenSalesModal({ frozenSales, onResume, onDiscard, onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,2,15,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: 'linear-gradient(160deg, #0d1829 0%, #0d1526 100%)',
        border: `1px solid ${BORDER}`, borderRadius: 12,
        width: 520, maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{
          padding: '18px 22px', borderBottom: `1px solid ${BORDER}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>❄️</span>
            <div>
              <p style={{ color: TEXT, fontWeight: 700, fontSize: 16 }}>Frozen Sales</p>
              <p style={{ color: MUTED, fontSize: 11 }}>
                {frozenSales.length} sale{frozenSales.length !== 1 ? 's' : ''} on hold
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: 'none',
              color: MUTED, fontSize: 20, cursor: 'pointer', lineHeight: 1,
            }}
          >×</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {frozenSales.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: MUTED, fontSize: 13 }}>No frozen sales</p>
            </div>
          )}

          {frozenSales.map((sale) => {
            const itemCount = sale.items.reduce((s, i) => s + (i.qty || 1), 0)
            const names = sale.items.slice(0, 3).map(i => i.product?.name || i.name || '?')
            const extra = sale.items.length > 3 ? ` +${sale.items.length - 3} more` : ''

            return (
              <div key={sale.id} style={{
                background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8,
                padding: '14px 16px',
              }}>
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <p style={{ color: DIM, fontSize: 11, marginBottom: 2 }}>
                      {sale.user ? `By ${sale.user}` : 'No seller'} · {fmtTime(sale.time)}
                    </p>
                    <p style={{ color: TEXT, fontSize: 13 }}>
                      {names.join(', ')}{extra}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ color: AMBER, fontSize: 16, fontWeight: 700 }}>{fmt$(sale.subtotal)}</p>
                    <p style={{ color: MUTED, fontSize: 11 }}>{itemCount} item{itemCount !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={() => onResume(sale.id)}
                    style={{
                      flex: 2, padding: '9px 0',
                      background: BLUE, border: 'none', borderRadius: 6,
                      color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = '#1d4ed8' }}
                    onMouseLeave={e => { e.currentTarget.style.background = BLUE }}
                  >
                    ▶ Resume Sale
                  </button>
                  <button
                    onClick={() => onDiscard(sale.id)}
                    style={{
                      flex: 1, padding: '9px 0',
                      background: 'transparent', border: `1px solid ${BORDER}`,
                      borderRadius: 6, color: MUTED, fontSize: 12, cursor: 'pointer',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = RED; e.currentTarget.style.color = RED }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
                  >
                    Discard
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: `1px solid ${BORDER}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '10px',
              background: 'transparent', border: `1px solid ${BORDER}`,
              borderRadius: 6, color: MUTED, fontSize: 13, cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
