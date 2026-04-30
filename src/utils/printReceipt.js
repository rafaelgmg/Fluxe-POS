/**
 * printReceipt.js
 * Thermal receipt generator — 80mm / Star TSP100III compatible.
 * Visual hierarchy matches NOVA POS: bold hierarchy, clear totals, structured sections.
 *
 * Item shape duality (unchanged):
 *   Cart shape:       { product: { name, barcode, size, description }, qty, salePrice, discount, subtotal }
 *   Serialized shape: { name, barcode, size, description, qty, salePrice, discount, subtotal }
 */

import { loadLocationConfig } from './locationConfig'

function fmt$(n) {
  return '$' + (n || 0).toFixed(2)
}

function fmtDateTime(ts) {
  const d = new Date(ts)
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  const day     = d.getDate()
  const month   = d.toLocaleDateString('en-US', { month: 'long' })
  const year    = d.getFullYear()
  const time    = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${weekday}, ${day} ${month} ${year} ${time}`
}

function resolveItem(item) {
  return {
    name:        item.product?.name        || item.name        || '(no name)',
    barcode:     item.product?.barcode     || item.barcode     || '',
    size:        item.product?.size        || item.size        || '',
    description: item.product?.description || item.description || '',
    qty:         item.qty      || 1,
    salePrice:   item.salePrice || 0,   // list/original price shown to customer
    discount:    item.discount  || 0,   // per-unit discount amount
    subtotal:    item.subtotal  || (item.salePrice || 0) * (item.qty || 1),
  }
}

export function printReceipt(invoice, locCfg) {
  const cfg = locCfg || loadLocationConfig(invoice.location) || {}

  // ── Config flags ───────────────────────────────────────────────────────────
  const taxLabel      = cfg.taxDisplayAs || 'Tax'
  const showDiscounts = cfg.showDiscounts !== false
  const showPrices    = cfg.showPrices    !== false
  const showRep       = cfg.showRep       !== false
  const refundPolicy  = cfg.refundPolicy  || 'No Refunds. Exchanges within 14 days.'
  const receiptFooter = cfg.receiptFooter ||
    'This invoice shows up that the client is aware and agreed with: purchase, products, respective prices and the refunds policy.'

  // ── Header block ───────────────────────────────────────────────────────────
  const rawHeader   = (cfg.receiptHeader || '').trim()
  const headerLines = rawHeader ? rawHeader.split('\n').map(l => l.trim()).filter(Boolean) : []
  let headerHtml
  if (headerLines.length > 0) {
    headerHtml = `<div class="loc-name">${headerLines[0]}</div>` +
      headerLines.slice(1).map(l => `<div class="loc-sub">${l}</div>`).join('')
  } else {
    const city = cfg.city
      ? `${cfg.city}, ${cfg.state || ''}`.trim().replace(/,$/, '')
      : cfg.state || ''
    headerHtml = `<div class="loc-name">${cfg.name || invoice.location || 'Perfume Passage'}</div>`
    if (cfg.address) headerHtml += `<div class="loc-sub">${cfg.address}</div>`
    if (city)        headerHtml += `<div class="loc-sub">${city}</div>`
    if (cfg.phone)   headerHtml += `<div class="loc-sub">${cfg.phone}</div>`
  }

  // ── Invoice numbers ────────────────────────────────────────────────────────
  const tip      = invoice.tip ?? 0
  const subtotal = invoice.subtotal ?? (invoice.total - invoice.tax - tip)
  const tax      = invoice.tax   ?? 0
  const total    = invoice.total ?? 0

  // ── Total discount summary (for summary row between items and totals) ──────
  const totalDiscount = (invoice.items || []).reduce((sum, raw) => {
    const item = resolveItem(raw)
    return sum + (item.discount || 0) * (item.qty || 1)
  }, 0)
  const grossBeforeDiscount = subtotal + totalDiscount
  const discountPct = grossBeforeDiscount > 0
    ? (totalDiscount / grossBeforeDiscount * 100).toFixed(2)
    : '0.00'

  // ── Item rows ──────────────────────────────────────────────────────────────
  const itemRows = (invoice.items || []).map(raw => {
    const item    = resolveItem(raw)
    const lineNet = (item.salePrice - item.discount) * item.qty

    let nameCell = `<span class="iname-main">${item.name}</span>`
    if (item.barcode)     nameCell += `<br><span class="dim">${item.barcode}</span>`
    if (item.description) nameCell += `<br><span class="dim">${item.description}</span>`
    if (item.size)        nameCell += `<br><span class="dim">${item.size}</span>`

    let html = `<tr>
        <td class="iname">${nameCell}</td>
        <td class="iqty">${item.qty}</td>
        ${showPrices ? `<td class="iprice">${fmt$(item.salePrice)}</td>` : '<td></td>'}
      </tr>`

    if (showDiscounts && item.discount > 0) {
      html += `<tr class="discount-row">
        <td colspan="2" class="dim">&nbsp;&nbsp;*Discount: -${fmt$(item.discount * item.qty)}</td>
        <td class="iprice discount-net">${fmt$(lineNet)}</td>
      </tr>`
    }

    return html
  }).join('')

  // ── Total discount summary row (only when discounts exist) ────────────────
  const discountSummaryRow = totalDiscount > 0
    ? `<tr class="sep-row"><td colspan="3"><hr class="dashed" /></td></tr>
      <tr class="tdiscount-row">
        <td colspan="2">Total Discount - ${discountPct}%</td>
        <td class="iprice">${fmt$(totalDiscount)}</td>
      </tr>`
    : ''

  // ── Totals block ───────────────────────────────────────────────────────────
  const totalsRows = `
    <tr class="sep-row"><td colspan="3"><hr class="dashed" /></td></tr>
    <tr class="trow subtotal-row">
      <td colspan="2">Subtotal:</td>
      <td class="iprice">${fmt$(subtotal)}</td>
    </tr>
    <tr class="trow">
      <td colspan="2">${taxLabel}:</td>
      <td class="iprice">${fmt$(tax)}</td>
    </tr>
    <tr class="trow">
      <td colspan="2">Tip:</td>
      <td class="iprice">${fmt$(tip)}</td>
    </tr>
    <tr class="sep-row"><td colspan="3"><hr class="dashed" /></td></tr>
    <tr class="grand">
      <td colspan="2">Total:</td>
      <td class="iprice">${fmt$(total)}</td>
    </tr>`

  // ── Payment block ──────────────────────────────────────────────────────────
  function buildPaymentLine(p) {
    const method = p.method || p.paymentMethod || ''
    const label  = method.charAt(0).toUpperCase() + method.slice(1)
    const amt    = p.amount != null ? fmt$(p.amount) : (total ? fmt$(total) : '')
    let subDetail = ''

    if (method === 'cash') {
      if (p.amountReceived != null) subDetail += `Received: ${fmt$(p.amountReceived)}`
      if (p.changeDue      != null) subDetail += (subDetail ? '  |  ' : '') + `Change: ${fmt$(p.changeDue)}`
    } else if (method === 'card' && p.cardBrand) {
      const brand = p.cardBrand.charAt(0).toUpperCase() + p.cardBrand.slice(1)
      const last4 = p.cardLast4 ? ` ****${p.cardLast4}` : ''
      const auth  = p.authorizationNumber ? `  |  Auth: ${p.authorizationNumber}` : ''
      subDetail = `${brand}${last4}${auth}`
    } else if (method === 'external' && p.externalRef) {
      subDetail = p.externalRef
    } else if (method === 'check' && p.checkNumber) {
      subDetail = `Check #${p.checkNumber}`
    }

    return `<div class="pay-row"><span>${label}</span><span class="pay-amt">${amt}</span></div>` +
      (subDetail ? `<div class="pay-sub">${subDetail}</div>` : '')
  }

  let payBlock = ''
  if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
    payBlock = `<div class="section-head">Payment Method(s):</div>` +
      invoice.payments.map(p => buildPaymentLine(p)).join('')
  } else if (invoice.paymentMethod) {
    payBlock = `<div class="section-head">Payment Method(s):</div>` + buildPaymentLine(invoice)
  }

  // ── Sales rep block ────────────────────────────────────────────────────────
  const repBlock = showRep && invoice.employee
    ? `<div class="rep-label">Your sales representative(s):</div>` +
      `<div class="rep-name">${invoice.employee}</div>`
    : ''

  const notesLine = invoice.notes
    ? `<p class="notes-text">${invoice.notes}</p>` : ''

  // ── Full HTML ──────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Receipt #${invoice.number}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      line-height: 1.5;
      width: 302px;
      margin: 0 auto;
      padding: 8px 4px 16px;
      color: #000;
      background: #fff;
    }

    /* ── Header ── */
    .loc-name { font-size:16px; font-weight:bold; text-align:center; margin-bottom:2px; }
    .loc-sub  { font-size:12px; text-align:center; color:#222; line-height:1.5; }

    /* ── Dividers ── */
    .dashed { border:none; border-top:1px dashed #666; margin:5px 0; }
    .solid  { border:none; border-top:2px solid #000; margin:6px 0; }

    /* ── Invoice meta ── */
    .inv-num  { font-size:13px; margin:5px 0 2px; }
    .inv-date { font-size:12px; color:#222; margin:0 0 5px; }

    /* ── Items table ── */
    table { width:100%; border-collapse:collapse; margin-top:2px; }
    td { vertical-align:top; padding:2px 0; font-size:12px; }
    .thead td {
      font-size:11px; font-weight:bold; color:#000;
      border-bottom:1px solid #000; padding-bottom:4px;
    }
    .iname  { width:56%; }
    .iqty   { width:10%; text-align:center; }
    .iprice { width:34%; text-align:right; white-space:nowrap; }

    .iname-main { font-size:13px; }
    .dim        { color:#555; font-size:10px; line-height:1.6; display:block; }

    /* ── Discount rows ── */
    .discount-row td { font-size:11px; color:#555; padding-top:1px; }
    .discount-net    { font-weight:bold; color:#000; font-size:13px; }
    .sep-row td      { padding:0; }

    /* ── Total discount summary ── */
    .tdiscount-row td { font-size:12px; padding-top:2px; }

    /* ── Totals ── */
    .trow td         { padding-top:3px; font-size:13px; }
    .subtotal-row td { font-weight:bold; font-size:14px; padding-top:4px; }
    .grand td        { font-size:16px; font-weight:bold; padding-top:5px; }

    /* ── Section headers ── */
    .section-head { font-weight:bold; font-size:13px; margin:6px 0 3px; }

    /* ── Payment ── */
    .pay-row { display:flex; justify-content:space-between; font-size:13px; margin:1px 0; }
    .pay-amt { font-weight:bold; }
    .pay-sub { font-size:11px; color:#444; margin:0 0 3px 8px; }

    /* ── Sales rep ── */
    .rep-label { font-size:12px; color:#333; margin:6px 0 1px; }
    .rep-name  { font-size:13px; margin-bottom:3px; }

    /* ── Notes ── */
    .notes-text { font-size:11px; font-style:italic; color:#555; margin:3px 0; text-align:center; }

    /* ── Footer ── */
    .legal  { text-align:center; font-size:11px; color:#333; line-height:1.55; margin:4px 0; }
    .sig    { font-size:12px; margin:7px 0 4px; }
    .policy { text-align:center; font-size:11px; font-weight:bold; margin:4px 0; }
    .barcode{ text-align:center; font-size:10px; color:#888; margin-top:8px; letter-spacing:2px; }

    @media print {
      body { width:302px; margin:0; padding:4px 2px 16px; }
      @page { margin:3mm 2mm; size:80mm auto; }
    }
  </style>
</head>
<body>

  ${headerHtml}
  <hr class="solid" />

  <div class="inv-num">Invoice #: ${invoice.number}</div>
  <div class="inv-date">Date: ${fmtDateTime(invoice.timestamp)}</div>

  <hr class="dashed" />

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
      ${discountSummaryRow}
      ${totalsRows}
    </tbody>
  </table>

  <hr class="solid" />

  ${payBlock}

  <hr class="dashed" />

  ${repBlock}
  ${notesLine}

  <hr class="dashed" />

  <p class="legal">${receiptFooter}</p>
  <p class="sig">Signature ___________________________</p>
  <p class="policy">${refundPolicy}</p>

  <div class="barcode">||| ${String(invoice.number).padStart(8, '0')} |||</div>
  <div style="height:20px"></div>

</body>
</html>`

  // ── Open & print ──────────────────────────────────────────────────────────
  const win = window.open('', '_blank', 'width=420,height=640,toolbar=0,menubar=0,scrollbars=1')
  if (!win) {
    const blob = new Blob([html], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    Object.assign(document.createElement('a'), { href: url, target: '_blank' }).click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    return
  }
  win.document.write(html)
  win.document.close()
  let printed = false
  win.onload = () => { if (printed) return; printed = true; win.focus(); win.print() }
  setTimeout(() => { if (printed) return; printed = true; try { win.focus(); win.print() } catch {} }, 450)
}
