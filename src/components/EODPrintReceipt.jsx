/**
 * EODPrintReceipt — hidden div rendered to DOM at all times.
 * Only becomes visible via @media print in index.css.
 * window.print() triggers the browser to render only #eod-print-area.
 */

const fmt$ = (n) => `$${(n || 0).toFixed(2)}`

const PAY_LABELS = { cash: 'Cash', card: 'Credit Cards', external: 'Ext. Credit', check: 'Checks' }

export default function EODPrintReceipt({
  location,
  dateLabel,
  printedAt,
  printedBy,
  netRevenue,
  taxRevenue,
  grossRevenue,
  transactionCount,
  payMethods = [],
  employeeSummary = [],   // [{ name, subtotal, count }]
  productsSummary = [],   // [{ name, qty }]
  voidedCount = 0,
  refundAmount = 0,
  notes = '',
}) {
  const LINE = '─'.repeat(32)

  const row = (label, value, bold = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
      <span style={{ fontWeight: bold ? 700 : 400 }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 400 }}>{value}</span>
    </div>
  )

  const section = (title) => (
    <div style={{ margin: '10px 0 6px' }}>
      <div style={{ borderTop: '1px dashed #000', marginBottom: 6 }} />
      <p style={{ fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{title}</p>
    </div>
  )

  return (
    <div id="eod-print-area" style={{ display: 'none' }}>
      <div style={{
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: 12,
        color: '#000',
        background: '#fff',
        padding: '12px 16px',
        maxWidth: 320,
        margin: '0 auto',
        lineHeight: 1.5,
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 10 }}>
          <p style={{ fontWeight: 700, fontSize: 14 }}>END OF DAY REPORT</p>
          <p style={{ fontSize: 12 }}>{location}</p>
          <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />
          <p style={{ fontSize: 11 }}>Report for date: {dateLabel}</p>
          <p style={{ fontSize: 11 }}>Printed at: {printedAt}</p>
          {printedBy && <p style={{ fontSize: 11 }}>Printed by: {printedBy}</p>}
        </div>

        {/* Revenue */}
        {section('Revenue')}
        {row('Net:', fmt$(netRevenue), true)}
        {row('Tax:', fmt$(taxRevenue))}
        {row('Gross:', fmt$(grossRevenue), true)}
        {row('Transactions:', transactionCount)}

        {/* Payment Methods */}
        {payMethods.length > 0 && (<>
          {section('Payment Methods')}
          {payMethods.map(m => row(PAY_LABELS[m.label] || m.label + ':', fmt$(m.total)))}
        </>)}

        {/* Sales by Employee */}
        {employeeSummary.length > 0 && (<>
          {section('Sales by Employee')}
          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 10 }}>Employee Name</span>
            <span style={{ fontWeight: 700, fontSize: 10 }}>Total Sales</span>
          </div>
          {employeeSummary.map(e => row(e.name, fmt$(e.subtotal)))}
        </>)}

        {/* Products Sold */}
        {productsSummary.length > 0 && (<>
          {section('Products Sold')}
          <div style={{ marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 700, fontSize: 10 }}>Product</span>
            <span style={{ fontWeight: 700, fontSize: 10 }}>Qty</span>
          </div>
          {productsSummary.map(p => row(
            p.name.length > 22 ? p.name.slice(0, 21) + '…' : p.name,
            `x${p.qty}`
          ))}
        </>)}

        {/* Refunds */}
        {section('Refunds')}
        {voidedCount === 0
          ? <p>No Refunds</p>
          : (<>
              {row('Voided sales:', voidedCount)}
              {row('Total voided:', fmt$(refundAmount))}
            </>)
        }

        {/* Notes */}
        {notes.trim() && (<>
          {section('Additional Notes')}
          <p style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{notes.trim()}</p>
        </>)}

        {/* Footer */}
        <div style={{ borderTop: '1px dashed #000', marginTop: 12, paddingTop: 8, textAlign: 'center' }}>
          <p style={{ fontSize: 10 }}>No Refunds. Exchanges within 14 days.</p>
        </div>

      </div>
    </div>
  )
}
