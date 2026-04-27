/**
 * printReceipt.js
 * Thermal receipt generator — 80mm / Star TSP100III compatible.
 *
 * Bug fixed: items from the live cart have shape { product: {...}, qty, salePrice }
 * while serialized invoices (from localStorage) have flat shape { name, qty, salePrice }.
 * We resolve name/size/description from BOTH shapes so the receipt works immediately
 * after a sale (cart shape) AND when reprinting from UserReport (serialized shape).
 */

import { loadLocationConfig } from './locationConfig'

function fmt$(n) {
  return '$' + (n || 0).toFixed(2)
}

// MM/DD/YYYY HH:mm
function fmtDateTime(ts) {
  const d = new Date(ts)
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const dd   = String(d.getDate()).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const min  = String(d.getMinutes()).padStart(2, '0')
  return `${mm}/${dd}/${yyyy}  ${hh}:${min}`
}

/**
 * Resolve item fields from both cart-shape and serialized-shape.
 * Cart shape:       { product: { name, size, description }, qty, salePrice, discount, subtotal }
 * Serialized shape: { name, size, description, qty, salePrice, discount, subtotal }
 */
function resolveItem(item) {
  return {
    name:        item.product?.name        || item.name        || '(no name)',
    size:        item.product?.size        || item.size        || '',
    description: item.product?.description || item.description || '',
    qty:         item.qty  || 1,
    salePrice:   item.salePrice || 0,
    discount:    item.discount  || 0,
    subtotal:    item.subtotal  || (item.salePrice || 0) * (item.qty || 1),
  }
}

export function printReceipt(invoice, locCfg) {
  const cfg = locCfg || loadLocationConfig(invoice.location) || {}

  // ── Location data ──────────────────────────────────────────────────────────
  const locationName  = cfg.name       || invoice.location || 'Miracle Mall 01'
  const address       = cfg.address    || ''
  const city          = cfg.city       ? `${cfg.city}, ${cfg.state || ''}`.trim().replace(/,$/, '') : (cfg.state || '')
  const phone         = cfg.phone      || ''
  const taxLabel      = cfg.taxDisplayAs || 'TAX'
  const showDiscounts = cfg.showDiscounts !== false
  const showPrices    = cfg.showPrices    !== false
  const showRep       = cfg.showRep       !== false
  const refundPolicy  = cfg.refundPolicy  || 'No Refunds. Exchanges within 14 days.'
  const receiptFooter = cfg.receiptFooter || 'Thank you for your purchase!'

  // ── Receipt header block ───────────────────────────────────────────────────
  // If receiptHeader is configured in LocationSettings, use it as the full header
  // (split by newline, first line = bold name, rest = small lines).
  // Falls back to individual structured fields (name + address + city + phone).
  const rawHeader  = (cfg.receiptHeader || '').trim()
  const headerLines = rawHeader ? rawHeader.split('\n').map(l => l.trim()).filter(Boolean) : []
  const headerHtml = headerLines.length > 0
    ? `<div class="loc-name">${headerLines[0]}</div>
  ${headerLines.slice(1).map(l => `  <div class="loc-sub">${l}</div>`).join('\n')}
  ${phone ? `  <div class="loc-sub">${phone}</div>` : ''}`
    : `<div class="loc-name">${locationName}</div>
  ${address ? `  <div class="loc-sub">${address}</div>` : ''}
  ${city    ? `  <div class="loc-sub">${city}</div>`    : ''}
  ${phone   ? `  <div class="loc-sub">${phone}</div>`   : ''}`

  // ── Invoice numbers ────────────────────────────────────────────────────────
  const tip    = invoice.tip ?? 0
  const hasTip = tip > 0
  const subtotal = invoice.subtotal ?? (invoice.total - invoice.tax - tip)
  const tax      = invoice.tax   ?? 0
  const total    = invoice.total ?? 0

  // ── Item rows ──────────────────────────────────────────────────────────────
  const itemRows = (invoice.items || []).map(raw => {
    const item = resolveItem(raw)
    let html = `<tr>
        <td class="iname">${item.name}${item.size ? `<br><span class="dim">${item.size}</span>` : ''}</td>
        <td class="iqty">${item.qty}</td>
        ${showPrices ? `<td class="iprice">${fmt$(item.salePrice)}</td>` : '<td></td>'}
      </tr>`

    if (showDiscounts && item.discount > 0) {
      html += `<tr class="subrow">
        <td colspan="2" class="dim">  *discount</td>
        <td class="iprice dim">-${fmt$(item.discount * item.qty)}</td>
      </tr>`
    }

    return html
  }).join('')

  // ── Totals block ───────────────────────────────────────────────────────────
  const totalsRows = `
    <tr class="sep-row"><td colspan="3"><hr class="dashed" /></td></tr>
    <tr class="trow">
      <td colspan="2">Subtotal</td>
      <td class="iprice">${fmt$(subtotal)}</td>
    </tr>
    <tr class="trow">
      <td colspan="2">${taxLabel}</td>
      <td class="iprice">${fmt$(tax)}</td>
    </tr>
    ${hasTip ? `<tr class="trow"><td colspan="2">Tip</td><td class="iprice">${fmt$(tip)}</td></tr>` : ''}
    <tr class="grand">
      <td colspan="2">TOTAL</td>
      <td class="iprice">${fmt$(total)}</td>
    </tr>`

  // ── Footer lines ───────────────────────────────────────────────────────────
  function buildPaymentLine(p) {
    const method = p.method || p.paymentMethod || ''
    const label  = method.charAt(0).toUpperCase() + method.slice(1)
    let detail = ''
    if (method === 'cash') {
      if (p.amountReceived != null) detail += `  |  Received: ${fmt$(p.amountReceived)}`
      if (p.changeDue      != null) detail += `  |  Change: ${fmt$(p.changeDue)}`
    } else if (method === 'card' && p.cardBrand) {
      const brand = p.cardBrand.charAt(0).toUpperCase() + p.cardBrand.slice(1)
      const last4 = p.cardLast4 ? ` ****${p.cardLast4}` : ''
      const auth  = p.authorizationNumber ? `  |  Auth: ${p.authorizationNumber}` : ''
      detail = ` — ${brand}${last4}${auth}`
    } else if (method === 'external' && p.externalRef) {
      detail = ` — ${p.externalRef}`
    } else if (method === 'check' && p.checkNumber) {
      detail = ` — Check #${p.checkNumber}`
    }
    const amt = p.amount != null ? `  ${fmt$(p.amount)}` : ''
    return `<p class="c">Payment: <b>${label}</b>${detail}${amt}</p>`
  }

  let payLine = ''
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    payLine = invoice.payments.map(p => buildPaymentLine(p)).join('\n')
  } else if (invoice.paymentMethod) {
    payLine = buildPaymentLine(invoice)
  }

  const notesLine = invoice.notes
    ? `<p class="c" style="font-style:italic;color:#555">${invoice.notes}</p>` : ''

  const repLine = showRep && invoice.employee
    ? `<p class="c">Sales Rep: ${invoice.employee}</p>` : ''

  // ── HTML ───────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt #${invoice.number}</title>
  <style>
    *  { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 12px;
      width: 302px;
      margin: 0 auto;
      padding: 8px 4px;
      color: #000;
      background: #fff;
    }

    /* ── Header ── */
    .loc-name { font-size:15px; font-weight:bold; text-align:center; margin-bottom:2px; }
    .loc-sub  { font-size:11px; text-align:center; color:#333; line-height:1.4; }

    /* ── Dividers ── */
    .dashed { border:none; border-top:1px dashed #666; margin:5px 0; }
    .solid  { border:none; border-top:2px solid #000; margin:5px 0; }

    /* ── Meta ── */
    .meta { font-size:11px; margin:4px 0; }
    .mrow { display:flex; justify-content:space-between; }

    /* ── Items table ── */
    table { width:100%; border-collapse:collapse; }
    td { vertical-align:top; padding:2px 0; font-size:11px; }
    .thead td { font-size:10px; color:#555; border-bottom:1px solid #999; padding-bottom:3px; }
    .iname  { width:58%; }
    .iqty   { width:10%; text-align:center; }
    .iprice { width:32%; text-align:right; white-space:nowrap; }
    .dim    { color:#555; font-size:10px; }
    .subrow td { padding-top:0; font-size:10px; }
    .sep-row td { padding:0; }

    /* ── Totals ── */
    .trow td { padding-top:2px; }
    .grand td {
      padding-top:4px;
      font-size:13px;
      font-weight:bold;
      border-top:1px solid #000;
      margin-top:4px;
    }

    /* ── Footer ── */
    .c       { text-align:center; font-size:11px; margin:3px 0; }
    .policy  { text-align:center; font-size:10px; color:#444; margin:4px 0; }
    .thanks  { text-align:center; font-size:12px; font-weight:bold; margin:6px 0 2px; }
    .barcode { text-align:center; font-size:10px; color:#888; margin-top:6px; letter-spacing:2px; }

    @media print {
      body { width:302px; margin:0; padding:4px 2px; }
      @page { margin:4mm 2mm; size:80mm auto; }
    }
  </style>
</head>
<body>

  <!-- Location header (driven by LocationSettings → receiptHeader) -->
  ${headerHtml}

  <hr class="solid" />

  <!-- Receipt # and date/time on same block -->
  <div class="meta">
    <div class="mrow">
      <span>Receipt #${invoice.number}</span>
      <span>${fmtDateTime(invoice.timestamp)}</span>
    </div>
  </div>

  <hr class="dashed" />

  <!-- Items -->
  <table>
    <thead>
      <tr class="thead">
        <td class="iname">Product</td>
        <td class="iqty">Qty</td>
        ${showPrices ? '<td class="iprice">Price</td>' : '<td></td>'}
      </tr>
    </thead>
    <tbody>
      ${itemRows}
      ${totalsRows}
    </tbody>
  </table>

  <hr class="solid" />

  ${payLine}
  ${repLine}
  ${notesLine}

  <hr class="dashed" />

  <p class="policy">${refundPolicy}</p>
  <p class="thanks">${receiptFooter.toUpperCase()}</p>

  <div class="barcode">|||  ${String(invoice.number).padStart(8, '0')}  |||</div>
  <div style="height:20px"></div>

</body>
</html>`

  // ── Open & print ──────────────────────────────────────────────────────────
  const win = window.open('', '_blank', 'width=420,height=640,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    // Popup blocked — blob fallback
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, target: '_blank' }).click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return
  }
  win.document.write(html)
  win.document.close()
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
