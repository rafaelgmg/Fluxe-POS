/**
 * printEODReceipt.js
 * End-of-Day receipt — 80mm / Star TSP100III compatible.
 * Structure mirrors NOVA POS EOD with improved readability.
 */

import { loadLocationConfig } from './locationConfig'

// ── Standard payment method definitions ────────────────────────────────────────
const METHODS = [
  { key: 'cash',        summary: 'Cash',             inLbl: 'Total Cash In',          outLbl: 'Total Cash Out'          },
  { key: 'external',    summary: 'Ext. Credit',       inLbl: 'Total Ext. Credit In',   outLbl: 'Total Ext. Credit Out'   },
  { key: 'card',        summary: 'Credit Cards',      inLbl: 'Total Credit Cards In',  outLbl: 'Total Credit Cards Out'  },
  { key: 'check',       summary: 'Checks',            inLbl: 'Total Checks In',        outLbl: 'Total Checks Out'        },
  { key: 'storecredit', summary: 'Store Credit Out',  inLbl: 'Store Credit In',        outLbl: 'Store Credit Out'        },
]

function fmt$(n) { return '$' + (n || 0).toFixed(2) }

/**
 * @param {object}   opts
 * @param {string}   opts.location
 * @param {string}   opts.dateLabel          e.g. "Monday, April 26, 2026"
 * @param {string}   opts.printedAt          e.g. "4/29/2026 4:05:21 PM"
 * @param {string}  [opts.printedBy]
 * @param {number}  [opts.netRevenue]        subtotal sum (no tax)
 * @param {number}  [opts.taxRevenue]
 * @param {number}  [opts.grossRevenue]      net + tax
 * @param {number}  [opts.transactionCount]
 * @param {number}  [opts.taxRatePct]
 * @param {Array}   [opts.payMethodsDetailed] [{ label, in, out }] — preferred
 * @param {Array}   [opts.payMethods]         [{ label, total }]   — legacy fallback
 * @param {Array}   [opts.employeeSummary]    [{ name, subtotal, count }]
 * @param {Array}   [opts.productsSummary]    [{ name, qty }]
 * @param {number}  [opts.voidedCount]
 * @param {number}  [opts.refundAmount]
 * @param {string}  [opts.notes]
 * @param {object}  [opts.locCfg]
 * @param {string}  [opts.printMode]         'browser' | 'iframe'
 * @param {Function}[opts.onStatus]
 */
export function printEODReceipt({
  location,
  dateLabel,
  printedAt,
  printedBy        = '',
  netRevenue       = 0,
  taxRevenue       = 0,
  grossRevenue     = 0,
  transactionCount = 0,
  taxRatePct       = 8.5,
  payMethodsDetailed = null,
  payMethods         = [],       // legacy
  employeeSummary  = [],
  productsSummary  = [],
  voidedCount      = 0,
  refundAmount     = 0,
  notes            = '',
  locCfg           = null,
  printMode        = 'browser',
  onStatus         = null,
}) {
  const cfg = locCfg || loadLocationConfig(location) || {}

  // ── Location header ──────────────────────────────────────────────────────────
  const rawHeader   = (cfg.receiptHeader || '').trim()
  const headerLines = rawHeader
    ? rawHeader.split('\n').map(l => l.trim()).filter(Boolean)
    : []

  let headerHtml
  if (headerLines.length > 0) {
    headerHtml = `<div class="loc-name">${headerLines[0]}</div>` +
      headerLines.slice(1).map(l => `<div class="loc-sub">${l}</div>`).join('')
  } else {
    const city = cfg.city
      ? `${cfg.city}, ${cfg.state || ''}`.trim().replace(/,$/, '')
      : cfg.state || ''
    headerHtml = `<div class="loc-name">${cfg.name || location}</div>`
    if (cfg.address) headerHtml += `<div class="loc-sub">${cfg.address}</div>`
    if (city)        headerHtml += `<div class="loc-sub">${city}</div>`
  }

  // ── Build per-method in/out map ──────────────────────────────────────────────
  // Prefer payMethodsDetailed; fall back to payMethods (legacy, no out split).
  const detailMap = {}
  if (payMethodsDetailed && payMethodsDetailed.length > 0) {
    payMethodsDetailed.forEach(m => {
      detailMap[m.label] = { in: m.in || 0, out: m.out || 0 }
    })
  } else {
    payMethods.forEach(m => {
      detailMap[m.label] = { in: m.total || 0, out: 0 }
    })
  }

  // All method keys that appear — standard ones always shown (at $0 if absent)
  const allKeys = [...new Set([...METHODS.map(m => m.key), ...Object.keys(detailMap)])]

  // ── Payment SUMMARY rows (bold, one total per method) ────────────────────────
  const summaryHtml = METHODS.map(m => {
    const d    = detailMap[m.key] || { in: 0, out: 0 }
    // For most methods show "in"; for storecredit show "out" (matches NOVA)
    const net  = m.key === 'storecredit' ? d.out : d.in
    return `<div class="row bold-lg"><span>${m.summary}:</span><span>${fmt$(net)}</span></div>`
  }).join('\n  ')

  // ── Employee rows ────────────────────────────────────────────────────────────
  const empHtml = employeeSummary.length > 0
    ? employeeSummary.map(e => {
        const name = e.name.length > 20 ? e.name.slice(0, 19) + '…' : e.name
        return `<div class="row"><span>${name}</span><span>${fmt$(e.subtotal)}</span></div>`
      }).join('\n  ')
    : '<p class="center">No data</p>'

  // ── Refund block ─────────────────────────────────────────────────────────────
  const refundHtml = voidedCount === 0
    ? '<p class="bold-text">No Refunds</p>'
    : `<div class="row"><span>Voided sales</span><span>${voidedCount}</span></div>` +
      `<div class="row bold-text"><span>Total voided</span><span>${fmt$(refundAmount)}</span></div>`

  // ── Payment Methods DETAIL rows (In + Out per method) ────────────────────────
  const detailRows = allKeys.map(key => {
    const def  = METHODS.find(m => m.key === key)
    const d    = detailMap[key] || { in: 0, out: 0 }
    const inLbl  = def ? def.inLbl  : `${key} In`
    const outLbl = def ? def.outLbl : `${key} Out`
    return `<div class="row sm"><span>${inLbl}:</span><span>${fmt$(d.in)}</span></div>` +
           `<div class="row sm"><span>${outLbl}:</span><span>${fmt$(d.out)}</span></div>`
  }).join('\n  ')

  // ── Notes (only if non-empty) ────────────────────────────────────────────────
  const notesHtml = notes.trim()
    ? `<hr class="dash" />
  <p class="bold-text" style="margin-bottom:3px;">Additional Notes:</p>
  <p class="notes-text">${notes.trim().replace(/\n/g, '<br/>')}</p>`
    : ''

  // ── Printed-by line ──────────────────────────────────────────────────────────
  const byLine = printedBy
    ? `<div class="meta">Printed by: ${printedBy}</div>`
    : ''

  // ── Gross validation: net + tax should equal gross ───────────────────────────
  // (calculated by caller — we trust the values passed in)

  // ── Full HTML ────────────────────────────────────────────────────────────────
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
      line-height: 1.55;
      width: 302px;
      margin: 0 auto;
      padding: 8px 4px 16px;
      color: #000;
      background: #fff;
    }

    .loc-name { font-size:15px; font-weight:bold; text-align:center; margin-bottom:1px; }
    .loc-sub  { font-size:12px; text-align:center; line-height:1.4; }

    hr.solid { border:none; border-top:2px solid #000; margin:6px 0; }
    hr.dash  { border:none; border-top:1px dashed #555; margin:6px 0; }

    .title   { font-size:14px; font-weight:bold; margin:4px 0 1px; }
    .meta    { font-size:12px; line-height:1.5; }

    /* key-value rows */
    .row { display:flex; justify-content:space-between; margin:2px 0; font-size:13px; }
    .row.sm span { font-size:12px; }

    /* large bold rows — Net / Tax / Gross + payment summary */
    .row.bold-lg span { font-size:16px; font-weight:bold; }

    /* section labels */
    .sec { font-size:12px; font-weight:bold; margin:4px 0 2px; }

    .bold-text { font-weight:bold; font-size:13px; margin:2px 0; }
    .center { text-align:center; font-size:12px; color:#444; margin:3px 0; }
    .notes-text { font-size:12px; line-height:1.5; white-space:pre-wrap; margin-top:2px; }

    @media print {
      body { width:302px; margin:0; padding:4px 2px 16px; }
      @page { margin:3mm 2mm; size:80mm auto; }
    }
  </style>
</head>
<body>

  ${headerHtml}
  <hr class="solid" />

  <p class="title">End of Day Report: ${cfg.name || location}</p>
  <div class="meta">Report for date: ${dateLabel}</div>
  <div class="meta">Printed at: ${printedAt}</div>
  ${byLine}

  <hr class="solid" />

  <div class="row bold-lg"><span>Net:</span><span>${fmt$(netRevenue)}</span></div>
  <div class="row bold-lg"><span>Tax:</span><span>${fmt$(taxRevenue)}</span></div>
  <div class="row bold-lg"><span>Gross:</span><span>${fmt$(grossRevenue)}</span></div>

  <hr class="dash" />

  ${summaryHtml}

  <hr class="dash" />

  <p class="sec">Sales by employee:</p>
  <p class="sec">Employee Name / Total Sales</p>
  ${empHtml}

  <hr class="dash" />

  ${refundHtml}

  <hr class="dash" />

  <p class="sec">Payment Methods:</p>
  ${detailRows}

  ${notesHtml}

  <div style="height:16px"></div>

</body>
</html>`

  if (printMode === 'iframe') {
    _printViaIframe(html, onStatus)
  } else {
    _printViaBrowserWindow(html, onStatus)
  }
}

// ── iframe mode ────────────────────────────────────────────────────────────────
function _printViaIframe(html, onStatus) {
  onStatus?.('printing')
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:302px;height:1px;border:0;overflow:hidden;'
  document.body.appendChild(iframe)

  let done = false
  const cleanup = () => {
    if (done) return; done = true
    try { document.body.removeChild(iframe) } catch {}
  }

  try {
    iframe.contentDocument.open()
    iframe.contentDocument.write(html)
    iframe.contentDocument.close()
  } catch { onStatus?.('error'); cleanup(); return }

  iframe.contentWindow.addEventListener('afterprint', () => { onStatus?.('done'); setTimeout(cleanup, 500) })
  setTimeout(() => {
    try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch { onStatus?.('error'); cleanup() }
  }, 250)
  setTimeout(() => { onStatus?.('done'); cleanup() }, 120_000)
}

// ── browser mode ───────────────────────────────────────────────────────────────
function _printViaBrowserWindow(html, onStatus) {
  onStatus?.('printing')
  const win = window.open('', '_blank', 'width=420,height=700,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
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
  win.onload = () => { if (printed) return; printed = true; win.focus(); win.print() }
  setTimeout(() => { if (printed) return; printed = true; try { win.focus(); win.print() } catch {} }, 450)
}
