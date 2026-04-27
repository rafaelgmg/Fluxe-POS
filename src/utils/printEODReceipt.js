/**
 * printEODReceipt.js
 * End-of-Day receipt generator — 80mm / Star TSP100III compatible.
 * Same window.open() approach as printReceipt.js so the app's CSS cannot
 * interfere with the print output (avoids the @media print hidden-div issue).
 *
 * Reads receiptHeader and receiptFooter from LocationSettings config.
 */

import { loadLocationConfig } from './locationConfig'

const PAY_LABELS = {
  cash:     'Cash',
  card:     'Credit Cards',
  external: 'Ext. Credit',
  check:    'Checks',
}

function fmt$(n) {
  return '$' + (n || 0).toFixed(2)
}

/**
 * @param {object} opts
 * @param {string}   opts.location
 * @param {string}   opts.dateLabel       e.g. "Monday, April 26, 2026"
 * @param {string}   opts.printedAt       e.g. "10:45 PM"
 * @param {string}  [opts.printedBy]
 * @param {number}  [opts.netRevenue]
 * @param {number}  [opts.taxRevenue]
 * @param {number}  [opts.grossRevenue]
 * @param {number}  [opts.transactionCount]
 * @param {number}  [opts.taxRatePct]     e.g. 8.5
 * @param {Array}   [opts.payMethods]     [{ label, total }]
 * @param {Array}   [opts.employeeSummary] [{ name, subtotal, count }]
 * @param {Array}   [opts.productsSummary] [{ name, qty }]  — sorted by qty desc
 * @param {number}  [opts.voidedCount]
 * @param {number}  [opts.refundAmount]
 * @param {string}  [opts.notes]
 * @param {object}  [opts.locCfg]         preloaded LocationConfig; falls back to loadLocationConfig
 * @param {string}  [opts.printMode]      'browser' (window.open, default) | 'iframe' (hidden iframe, no popup)
 * @param {Function}[opts.onStatus]       callback(status) — 'printing' | 'done' | 'error'
 */
export function printEODReceipt({
  location,
  dateLabel,
  printedAt,
  printedBy     = '',
  netRevenue    = 0,
  taxRevenue    = 0,
  grossRevenue  = 0,
  transactionCount = 0,
  taxRatePct    = 8.5,
  payMethods    = [],
  employeeSummary = [],
  productsSummary = [],
  voidedCount   = 0,
  refundAmount  = 0,
  notes         = '',
  locCfg        = null,
  printMode     = 'browser',
  onStatus      = null,
}) {
  const cfg = locCfg || loadLocationConfig(location) || {}

  // ── Location header — same logic as printReceipt.js ────────────────────────
  const rawHeader   = (cfg.receiptHeader || '').trim()
  const headerLines = rawHeader
    ? rawHeader.split('\n').map(l => l.trim()).filter(Boolean)
    : []

  let headerHtml
  if (headerLines.length > 0) {
    headerHtml = `<div class="loc-name">${headerLines[0]}</div>` +
      headerLines.slice(1).map(l => `\n  <div class="loc-sub">${l}</div>`).join('')
  } else {
    const city = cfg.city
      ? `${cfg.city}, ${cfg.state || ''}`.trim().replace(/,$/, '')
      : cfg.state || ''
    headerHtml = `<div class="loc-name">${cfg.name || location}</div>`
    if (cfg.address) headerHtml += `\n  <div class="loc-sub">${cfg.address}</div>`
    if (city)        headerHtml += `\n  <div class="loc-sub">${city}</div>`
  }

  const receiptFooter = cfg.receiptFooter || 'No Refunds. Exchanges within 14 days.'

  // ── Payment methods ─────────────────────────────────────────────────────────
  const payHtml = payMethods.length > 0
    ? payMethods.map(m => {
        const label = PAY_LABELS[m.label] || m.label
        return `<div class="row"><span>${label}</span><span>${fmt$(m.total)}</span></div>`
      }).join('\n      ')
    : '<p class="dim-center">No payment data</p>'

  // ── Employee summary ────────────────────────────────────────────────────────
  const empTotalSales = employeeSummary.reduce((s, e) => s + e.subtotal, 0)
  const empTotalCount = employeeSummary.reduce((s, e) => s + e.count, 0)

  const empRows = employeeSummary.length > 0
    ? employeeSummary.map(e => {
        const name = e.name.length > 18 ? e.name.slice(0, 17) + '…' : e.name
        return `<tr>
          <td>${name}</td>
          <td class="right">${fmt$(e.subtotal)}</td>
          <td class="right">${e.count}</td>
        </tr>`
      }).join('\n        ')
    : '<tr><td colspan="3" class="dim-center">No data</td></tr>'

  const empFooterRow = employeeSummary.length > 0
    ? `<tr class="total-row">
          <td><b>TOTAL</b></td>
          <td class="right"><b>${fmt$(empTotalSales)}</b></td>
          <td class="right"><b>${empTotalCount}</b></td>
        </tr>`
    : ''

  // ── Products sold (max 12 lines) ────────────────────────────────────────────
  const MAX_PROD = 12
  const prodSlice = productsSummary.slice(0, MAX_PROD)
  const prodExtra = productsSummary.length - prodSlice.length

  const prodHtml = prodSlice.length > 0
    ? `<table>
      <thead><tr class="thead"><td>Product</td><td class="right">Qty</td></tr></thead>
      <tbody>
        ${prodSlice.map(p => {
          const name = p.name.length > 23 ? p.name.slice(0, 22) + '…' : p.name
          return `<tr><td>${name}</td><td class="right">x${p.qty}</td></tr>`
        }).join('\n        ')}
      </tbody>
    </table>
    ${prodExtra > 0 ? `<p class="dim-center" style="margin-top:2px;">+ ${prodExtra} more</p>` : ''}`
    : '<p class="dim-center">No products</p>'

  // ── Refunds ─────────────────────────────────────────────────────────────────
  const refundHtml = voidedCount === 0
    ? '<p style="text-align:center;font-size:13px;">No Refunds</p>'
    : `<div class="row"><span>Voided sales</span><span>${voidedCount}</span></div>
      <div class="row bold"><span>Total voided</span><span>${fmt$(refundAmount)}</span></div>`

  // ── Notes ───────────────────────────────────────────────────────────────────
  const notesHtml = notes.trim()
    ? `<hr class="dashed" />
      <div class="section-title">ADDITIONAL NOTES</div>
      <p style="font-size:13px;line-height:1.5;white-space:pre-wrap;margin-top:3px;">${notes.trim()}</p>`
    : ''

  const printedByLine = printedBy
    ? `<div style="text-align:center;font-size:12px;margin:1px 0;">Printed by: ${printedBy}</div>`
    : ''

  // ── Full HTML document ──────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>EOD — ${location} — ${dateLabel}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.5;
      width: 302px;
      margin: 0 auto;
      padding: 8px 4px;
      color: #000;
      background: #fff;
    }

    /* Header */
    .loc-name { font-size:16px; font-weight:bold; text-align:center; margin-bottom:2px; }
    .loc-sub  { font-size:12px; text-align:center; color:#222; line-height:1.4; }

    /* Dividers */
    .solid  { border:none; border-top:2px solid #000; margin:6px 0; }
    .dashed { border:none; border-top:1px dashed #555; margin:6px 0; }

    /* Section title */
    .section-title {
      font-size:12px; font-weight:bold; text-align:center;
      letter-spacing:1.5px; text-transform:uppercase; margin:5px 0 4px;
    }

    /* Key-value rows */
    .row {
      display:flex; justify-content:space-between;
      font-size:13px; margin:3px 0; line-height:1.5;
    }
    .row.bold  span { font-weight:bold; }
    .row.large span { font-size:15px; font-weight:bold; }

    /* Misc */
    .dim-center { text-align:center; font-size:12px; color:#555; margin:3px 0; }

    /* Tables */
    table { width:100%; border-collapse:collapse; }
    td { font-size:12px; padding:2px 0; vertical-align:top; }
    .thead td { font-size:11px; font-weight:bold; border-bottom:1px solid #000; padding-bottom:3px; }
    .right { text-align:right; white-space:nowrap; }
    .total-row td { border-top:1px solid #000; padding-top:3px; font-size:13px; }

    /* Footer */
    .footer-msg { text-align:center; font-size:13px; font-weight:bold;
      text-transform:uppercase; letter-spacing:0.5px; margin:5px 0 2px; }

    @media print {
      body { width:302px; margin:0; padding:4px 2px; }
      @page { margin:4mm 2mm; size:80mm auto; }
    }
  </style>
</head>
<body>

  ${headerHtml}
  <hr class="solid" />

  <div style="text-align:center; font-size:16px; font-weight:bold; margin:4px 0; letter-spacing:0.5px;">END OF DAY REPORT</div>
  <div style="text-align:center; font-size:12px; margin:2px 0;">${dateLabel}</div>
  <div style="text-align:center; font-size:12px; margin:1px 0;">Printed at: ${printedAt}</div>
  ${printedByLine}

  <hr class="dashed" />
  <div class="section-title">Revenue</div>
  <div class="row"><span>Net Revenue</span><span>${fmt$(netRevenue)}</span></div>
  <div class="row"><span>Tax (${taxRatePct}%)</span><span>${fmt$(taxRevenue)}</span></div>
  <div class="row large"><span>Gross Revenue</span><span>${fmt$(grossRevenue)}</span></div>
  <div class="row"><span>Transactions</span><span>${transactionCount}</span></div>

  <hr class="dashed" />
  <div class="section-title">Payment Methods</div>
  ${payHtml}

  <hr class="dashed" />
  <div class="section-title">Sales by Employee</div>
  <table>
    <thead><tr class="thead"><td>Employee</td><td class="right">Sales</td><td class="right">Trans</td></tr></thead>
    <tbody>
      ${empRows}
    </tbody>
    ${empFooterRow ? `<tfoot>${empFooterRow}</tfoot>` : ''}
  </table>

  <hr class="dashed" />
  <div class="section-title">Products Sold</div>
  ${prodHtml}

  <hr class="dashed" />
  <div class="section-title">Refunds</div>
  ${refundHtml}

  ${notesHtml}

  <hr class="solid" />
  <p class="footer-msg">${receiptFooter}</p>
  <div style="height:20px"></div>

</body>
</html>`

  // ── Dispatch to the configured print mode ──────────────────────────────────
  if (printMode === 'iframe') {
    _printViaIframe(html, onStatus)
  } else {
    _printViaBrowserWindow(html, onStatus)
  }
}

// ── iframe mode: no popup window, works silently with Chrome --kiosk-printing ─
function _printViaIframe(html, onStatus) {
  onStatus?.('printing')

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:302px;height:1px;border:0;overflow:hidden;'
  document.body.appendChild(iframe)

  let done = false
  const cleanup = () => {
    if (done) return
    done = true
    try { document.body.removeChild(iframe) } catch {}
  }

  try {
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
  } catch {
    onStatus?.('error')
    cleanup()
    return
  }

  // onafterprint fires after the dialog is closed (printed or cancelled)
  iframe.contentWindow.addEventListener('afterprint', () => {
    onStatus?.('done')
    setTimeout(cleanup, 500)
  })

  setTimeout(() => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch {
      onStatus?.('error')
      cleanup()
    }
  }, 250)

  // Failsafe: cleanup after 2 min if afterprint never fires (e.g. kiosk silent print)
  setTimeout(() => { onStatus?.('done'); cleanup() }, 120_000)
}

// ── browser mode: window.open (original behavior, works everywhere) ──────────
function _printViaBrowserWindow(html, onStatus) {
  onStatus?.('printing')

  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    // Popup blocked — blob fallback
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, target: '_blank' }).click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    onStatus?.('done')
    return
  }

  win.document.write(html)
  win.document.close()
  win.addEventListener('afterprint', () => { onStatus?.('done'); try { win.close() } catch {} })
  let printed = false
  win.onload = () => {
    if (printed) return
    printed = true
    win.focus(); win.print()
  }
  // Fallback: onload sometimes doesn't fire if document.write was used
  setTimeout(() => {
    if (printed) return
    printed = true
    try { win.focus(); win.print() } catch {}
  }, 450)
}
