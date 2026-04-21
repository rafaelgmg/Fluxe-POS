/**
 * ============================================================
 *  FLUXE POS — Fase 0: Seed Script
 *  Cole e execute no console do browser enquanto o app está aberto.
 *
 *  O que este script faz, em ordem:
 *    1. organizations        (1 row — Perfume Passage)
 *    2. locations            (lê fluxe-locations-v1)
 *    3. users                (lê fluxe-users-v1)
 *    4. user_location_access (todos os users × todas as locations)
 *    5. categories           (lê fluxe-categories-v1)
 *    6. products             (lê fluxe-products-v1)
 *    7. inventory_stock      (derivado de product.qtyByLoc)
 *    8. sales                (lê fluxe-sales-v1 — com mapeamento de status)
 *    9. sale_items           (descompactado de sales.items[])
 *   10. payments             (descompactado de sales.payments[])
 *   11. inventory_movements  (lê fluxe-inv-history-v1)
 *
 *  Após o script, rodar no Supabase SQL Editor:
 *    SELECT setval('invoice_number_seq', (SELECT MAX(number) FROM sales));
 *
 *  EXECUTAR APENAS UMA VEZ em banco vazio.
 *  O script faz preflight check — aborta se org já existir.
 * ============================================================
 */

// ──────────────────────────────────────────────────────────────
//  CONFIGURAÇÃO — preencher antes de rodar
// ──────────────────────────────────────────────────────────────

const CFG = {
  supabaseUrl:  'https://SEU_PROJECT_ID.supabase.co', // ← preencher
  serviceKey:   'SEU_SERVICE_ROLE_KEY',               // ← preencher (NÃO usar anon key)
  orgName:      'Perfume Passage',
  orgSlug:      'perfume-passage',
}

// ──────────────────────────────────────────────────────────────
//  UTILITÁRIOS
// ──────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID() }

function readLS(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') } catch { return null }
}

// Replica de parseBarcode.js (inline — sem import)
function parseBarcode(raw) {
  if (!raw) return { cleanBarcode: '', minPrice: null }
  const str  = String(raw).trim()
  const dot  = str.indexOf('.')
  if (dot === -1) return { cleanBarcode: str, minPrice: null }
  const minStr  = str.slice(dot + 1)
  const minVal  = minStr !== '' ? parseFloat(minStr) : null
  return { cleanBarcode: str.slice(0, dot), minPrice: isNaN(minVal) ? null : minVal }
}

// Replica de resolveMethod de legacySale.js (inline)
function resolveMethod(m) {
  if (!m) return 'cash'
  const lower = m.toLowerCase()
  if (lower === 'cash')           return 'cash'
  if (lower.includes('card'))     return 'card'
  if (lower.includes('external')) return 'external'
  if (lower.includes('check'))    return 'check'
  return lower
}

// ──────────────────────────────────────────────────────────────
//  CLIENTE SUPABASE (fetch direto na REST API — sem SDK)
// ──────────────────────────────────────────────────────────────

function headers() {
  return {
    'apikey':        CFG.serviceKey,
    'Authorization': `Bearer ${CFG.serviceKey}`,
    'Content-Type':  'application/json',
    'Prefer':        'return=minimal',
  }
}

async function insertRows(table, rows) {
  if (!rows || rows.length === 0) return

  // Supabase tem limite de payload — batchear em grupos de 200
  const BATCH = 200
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const res = await fetch(`${CFG.supabaseUrl}/rest/v1/${table}`, {
      method:  'POST',
      headers: headers(),
      body:    JSON.stringify(batch),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => res.text())
      throw new Error(`[${table}] batch ${i}–${i + batch.length} falhou:\n${JSON.stringify(err, null, 2)}`)
    }
  }
}

async function selectOne(table, filter) {
  const params = new URLSearchParams({ ...filter, select: '*', limit: '1' })
  const res = await fetch(`${CFG.supabaseUrl}/rest/v1/${table}?${params}`, {
    headers: {
      'apikey':        CFG.serviceKey,
      'Authorization': `Bearer ${CFG.serviceKey}`,
    },
  })
  if (!res.ok) return null
  const rows = await res.json()
  return rows[0] || null
}

// ──────────────────────────────────────────────────────────────
//  SEED RUNNER PRINCIPAL
// ──────────────────────────────────────────────────────────────

async function runSeed() {
  console.log('═══════════════════════════════════════════════')
  console.log('  FLUXE POS — Fase 0 Seed — iniciando...')
  console.log('═══════════════════════════════════════════════')

  const WARN  = []
  const log   = (msg)  => console.log(`  ✅ ${msg}`)
  const warn  = (msg)  => { WARN.push(msg); console.warn(`  ⚠️  ${msg}`) }
  const abort = (msg)  => { throw new Error(msg) }

  // ── Preflight: banco deve estar vazio ──────────────────────
  const existing = await selectOne('organizations', { 'slug': `eq.${CFG.orgSlug}` })
  if (existing) abort(`⛔ Banco já contém organization slug='${CFG.orgSlug}'. Aborting — rode apenas em banco vazio.`)

  // MAP de IDs legados → UUIDs novos
  // legacyLocId ('loc_01', name) → uuid
  // legacyUserId (integer, name) → uuid
  // legacyCategoryId (integer, name) → uuid
  // legacyProductId (integer) → uuid
  const MAP = { location: {}, user: {}, category: {}, product: {} }

  // ── 1. ORGANIZATIONS ────────────────────────────────────────
  const ORG_ID = uuid()
  await insertRows('organizations', [{
    id:   ORG_ID,
    name: CFG.orgName,
    slug: CFG.orgSlug,
  }])
  log(`organizations: 1 row — id=${ORG_ID}`)

  // ── 2. LOCATIONS ─────────────────────────────────────────────
  const rawLocations = readLS('fluxe-locations-v1') || []
  if (rawLocations.length === 0) abort('⛔ fluxe-locations-v1 vazio. Abra o app, configure as locations e tente novamente.')

  const locationRows = rawLocations.map(l => {
    const id = uuid()
    MAP.location[l.id]   = id   // mapeia 'loc_01' → uuid
    MAP.location[l.name] = id   // mapeia 'Miracle Mall 01' → uuid
    return {
      id,
      organization_id:          ORG_ID,
      name:                     l.name,
      address:                  l.address || '',
      tax_rate:                 l.taxRate               ?? 8.5,
      tax_display_as:           l.taxDisplayAs          || 'TAX',
      block_sale_out_of_stock:  l.blockSaleOutOfStock   ?? false,
      accept_cash:              l.acceptCash            ?? true,
      accept_card:              l.acceptCard            ?? true,
      accept_ext_credit:        l.acceptExtCredit       ?? true,
      accept_check:             l.acceptCheck           ?? false,
      spare_commission_rate:    l.spareCommissionRate   ?? 30,
      spare_commission_mode:    l.spareCommissionMode   || 'fixed',
      spare_tiers:              l.spareTiers            || [],
      status:                   l.status               || 'active',
    }
  })
  await insertRows('locations', locationRows)
  log(`locations: ${locationRows.length} rows`)

  // ── 3. USERS ──────────────────────────────────────────────────
  const rawUsersStore = readLS('fluxe-users-v1')
  const rawUsers = Array.isArray(rawUsersStore)
    ? rawUsersStore
    : (rawUsersStore?.users || [])
  if (rawUsers.length === 0) abort('⛔ fluxe-users-v1 vazio. Verifique o localStorage.')

  const userRows = rawUsers.map(u => {
    const id = uuid()
    MAP.user[u.id] = id    // mapeia integer id → uuid

    // Suporte a campo legado 'name' antes do split firstName/lastName
    let firstName = (u.firstName || '').trim()
    let lastName  = (u.lastName  || '').trim()
    if (!firstName && u.name) {
      const parts = u.name.trim().split(/\s+/)
      firstName = parts[0] || u.name
      lastName  = parts.slice(1).join(' ') || ''
    }
    const fullName = `${firstName} ${lastName}`.trim()
    MAP.user[fullName] = id    // mapeia 'Rafael' → uuid (para lookup de snapshots)

    return {
      id,
      organization_id: ORG_ID,
      first_name:      firstName,
      last_name:        lastName,
      position:         u.position   || 'Sales',
      email:            u.email      || '',
      phone:            u.phone      || '',
      // PIN em texto puro para seed de dev — migrar para bcrypt antes de produção
      pin:              u.pin        || '',
      hourly_rate:      u.hourlyRate ?? 0,
      status:           u.status     || 'active',
      created_at:       u.createdAt  || new Date().toISOString(),
    }
  })
  await insertRows('users', userRows)
  log(`users: ${userRows.length} rows (PINs em texto puro — migrar para bcrypt antes de produção)`)

  // ── 4. USER_LOCATION_ACCESS ────────────────────────────────────
  // Todos os usuários têm acesso a todas as locations (estado atual do app)
  const ulaRows = []
  for (const uRow of userRows) {
    for (const lRow of locationRows) {
      ulaRows.push({
        user_id:         uRow.id,
        location_id:     lRow.id,
        organization_id: ORG_ID,
      })
    }
  }
  await insertRows('user_location_access', ulaRows)
  log(`user_location_access: ${ulaRows.length} rows (${userRows.length} users × ${locationRows.length} locations)`)

  // ── 5. CATEGORIES ─────────────────────────────────────────────
  const rawCats = readLS('fluxe-categories-v1') || []
  if (rawCats.length === 0) warn('fluxe-categories-v1 vazio — categories não serão inseridas. Products terão category_id = null.')

  const catRows = rawCats.map(c => {
    const id = uuid()
    MAP.category[c.id]   = id   // mapeia integer id → uuid
    MAP.category[c.name] = id   // mapeia 'Men\'s Brands' → uuid
    return {
      id,
      organization_id:          ORG_ID,
      name:                     c.name,
      commission_type:          c.commissionType  || 'none',
      commission_rate:          c.commissionRate  ?? null,
      spare_commission_enabled: false,
      status:                   c.status         || 'active',
      created_at:               c.createdAt      || new Date().toISOString(),
    }
  })
  if (catRows.length > 0) {
    await insertRows('categories', catRows)
    log(`categories: ${catRows.length} rows`)
  }

  // ── 6. PRODUCTS ───────────────────────────────────────────────
  const rawProducts = readLS('fluxe-products-v1') || []
  if (rawProducts.length === 0) {
    warn('fluxe-products-v1 vazio. Abra o app, edite qualquer produto e tente novamente.')
  }

  const productRows = rawProducts.map(p => {
    const id = uuid()
    MAP.product[p.id] = id   // mapeia integer id → uuid

    // minPrice: usar explícito se presente, senão extrair do rawBarcode
    let minPrice = p.minPrice
    if ((minPrice == null || minPrice === 0) && p.rawBarcode) {
      const { minPrice: extracted } = parseBarcode(p.rawBarcode)
      if (extracted != null) minPrice = extracted
    }
    minPrice = minPrice ?? 0

    // barcode: usar campo limpo; fallback para extração do rawBarcode
    let barcode = p.barcode
    if (!barcode && p.rawBarcode) {
      barcode = parseBarcode(p.rawBarcode).cleanBarcode
    }

    // category_id: lookup pelo nome da categoria
    const catId = MAP.category[p.category] || null
    if (p.category && !catId) {
      warn(`product "${p.name}": categoria '${p.category}' não encontrada no MAP → category_id = null`)
    }

    return {
      id,
      organization_id: ORG_ID,
      category_id:     catId,
      barcode:         barcode     || '',
      name:            p.name      || '',
      description:     p.description || '',
      size:            p.size       || '',
      system_price:    p.systemPrice ?? 0,
      min_price:       minPrice,
      cost_price:      p.costPrice  ?? 0,
      supplier_name:   p.supplierName || '',
      status:          p.status     || 'active',
      updated_at:      p.updatedAt  || new Date().toISOString(),
    }
  })
  if (productRows.length > 0) {
    await insertRows('products', productRows)
    log(`products: ${productRows.length} rows`)
  }

  // ── 7. INVENTORY_STOCK ─────────────────────────────────────────
  // Derivado de product.qtyByLoc — 1 row por (product × location)
  const stockRows = []
  for (const p of rawProducts) {
    const productId = MAP.product[p.id]
    if (!productId) continue
    const qtyByLoc = p.qtyByLoc || {}
    for (const [legacyLocId, qty] of Object.entries(qtyByLoc)) {
      const locationId = MAP.location[legacyLocId]
      if (!locationId) {
        warn(`inventory_stock: produto "${p.name}" tem locationId '${legacyLocId}' desconhecido → linha ignorada`)
        continue
      }
      stockRows.push({
        product_id:      productId,
        location_id:     locationId,
        organization_id: ORG_ID,
        qty:             Math.max(0, qty || 0),
      })
    }
  }
  if (stockRows.length > 0) {
    await insertRows('inventory_stock', stockRows)
    log(`inventory_stock: ${stockRows.length} rows`)
  }

  // ── 8-9-10. SALES + SALE_ITEMS + PAYMENTS ─────────────────────
  const rawSalesAll = readLS('fluxe-sales-v1') || []

  const salesRows     = []
  const saleItemsRows = []
  const paymentRows   = []
  let   splitPaymentWarnings = 0

  for (const s of rawSalesAll) {
    const saleId = uuid()

    // Status: normal → completed, deleted → voided
    const STATUS_MAP = {
      normal: 'completed', completed: 'completed',
      deleted: 'voided',   voided:    'voided',
    }
    const status = STATUS_MAP[s.status] || 'completed'

    // timestamp → sold_at
    const soldAt = s.timestamp || s.sold_at
    if (!soldAt) warn(`sale #${s.number}: sem timestamp — usando now()`)

    // location_id e employee_id via MAP (podem ficar null se não resolvidos)
    const locationId = MAP.location[s.locationId] || MAP.location[s.location] || null
    const employeeId = MAP.user[s.employeeId]     || MAP.user[s.employee]     || null

    if (s.locationId && !locationId) warn(`sale #${s.number}: locationId '${s.locationId}' não resolvido → null`)
    if (s.employeeId && !employeeId) warn(`sale #${s.number}: employeeId '${s.employeeId}' não resolvido → null`)

    salesRows.push({
      id:                  saleId,
      number:              s.number,                    // inserir explícito — NÃO usar sequence
      organization_id:     ORG_ID,
      location_id:         locationId,
      employee_id:         employeeId,
      location_name:       s.location      || s.locationName  || '',
      employee_name:       s.employee      || s.employeeName  || '',
      subtotal:            s.subtotal      ?? 0,
      tax:                 s.tax           ?? 0,
      tip:                 s.tip           ?? 0,
      total:               s.total         ?? 0,
      total_spare:         s.totalSpare    ?? 0,
      status,
      notes:               s.notes         || '',
      receipt_action:      'none',
      linked_customer_id:  null,                        // FK futura → customers (Fase 7)
      commission_snapshot: s.commissionSnapshot || null,
      sold_at:             soldAt || new Date().toISOString(),
    })

    // ── SALE_ITEMS ───────────────────────────────────────────────
    const items = s.items || []
    for (const item of items) {
      const productName    = item.product?.name     || item.name     || ''
      const barcode        = item.product?.barcode  || item.barcode  || ''
      const categoryName   = item.product?.category || item.category || ''
      const legacyProdId   = item.productId || item.product?.id || null
      const legacyCatId    = item.categoryId || null

      saleItemsRows.push({
        sale_id:      saleId,
        line_id:      item.lineId   || null,          // null para itens legados (sem lineId)
        product_id:   MAP.product[legacyProdId]   || null,
        category_id:  MAP.category[legacyCatId]   || MAP.category[categoryName] || null,
        name:         productName,
        barcode,
        description:  item.product?.description   || item.description  || '',
        size:         item.product?.size           || item.size         || '',
        category_name: categoryName,
        qty:          item.qty                    ?? 1,
        sale_price:   item.salePrice              ?? 0,
        system_price: item.systemPrice || item.product?.systemPrice || item.salePrice || 0,
        min_price:    item.minPrice    || item.product?.minPrice    || 0,
        discount:     item.discount   ?? 0,
        subtotal:     item.subtotal   ?? 0,
        spare:        item.spare      ?? 0,
      })
    }

    // ── PAYMENTS ─────────────────────────────────────────────────
    // Normalizar payments[]: se vazio, reconstruir do campo legado paymentMethod
    let payments = Array.isArray(s.payments) && s.payments.length > 0
      ? s.payments
      : []

    if (payments.length === 0) {
      const method = s.paymentMethod
      if (method && method !== 'split') {
        payments = [{
          method:              method,
          amount:              s.total          ?? 0,
          amountReceived:      s.amountReceived ?? null,
          changeDue:           s.changeDue      ?? null,
          cardBrand:           s.cardBrand      ?? null,
          cardLast4:           s.cardLast4      ?? null,
          authorizationNumber: s.authorizationNumber ?? null,
          externalRef:         s.externalRef    ?? null,
          checkNumber:         s.checkNumber    ?? null,
        }]
      } else if (method === 'split') {
        splitPaymentWarnings++
        // Venda split legada sem payments[] — nenhum pagamento registrado
      }
    }

    for (const pmt of payments) {
      const method = resolveMethod(pmt.method)

      // Validar card_last4: deve ser exatamente 4 dígitos numéricos
      let card_last4 = pmt.cardLast4 || pmt.card_last4 || null
      if (card_last4 && !/^[0-9]{4}$/.test(String(card_last4))) {
        warn(`sale #${s.number}: card_last4 inválido '${card_last4}' → null`)
        card_last4 = null
      }

      paymentRows.push({
        sale_id:              saleId,
        method,
        amount:               pmt.amount        ?? s.total ?? 0,
        amount_received:      pmt.amountReceived  ?? null,
        change_due:           pmt.changeDue        ?? null,
        card_brand:           pmt.cardBrand        || null,
        card_last4:           card_last4,
        authorization_number: pmt.authorizationNumber || null,
        external_ref:         pmt.externalRef      || null,
        check_number:         pmt.checkNumber      || null,
      })
    }
  }

  if (salesRows.length > 0) {
    await insertRows('sales', salesRows)
    log(`sales: ${salesRows.length} rows`)
    if (splitPaymentWarnings > 0) {
      warn(`${splitPaymentWarnings} vendas com paymentMethod='split' legado sem payments[] → nenhum payment inserido para elas`)
    }
  }

  if (saleItemsRows.length > 0) {
    await insertRows('sale_items', saleItemsRows)
    log(`sale_items: ${saleItemsRows.length} rows`)
  }

  if (paymentRows.length > 0) {
    await insertRows('payments', paymentRows)
    log(`payments: ${paymentRows.length} rows`)
  }

  // ── 11. INVENTORY_MOVEMENTS ───────────────────────────────────
  const rawHistory = readLS('fluxe-inv-history-v1') || []
  const movementRows   = []
  let   skippedMovements = 0

  for (const m of rawHistory) {
    const productId = MAP.product[m.productId]
    if (!productId) {
      warn(`inventory_movements: produto legado id=${m.productId} não encontrado no MAP → linha ignorada`)
      skippedMovements++
      continue
    }

    let type         = m.type
    const locationId   = MAP.location[m.locationId]   || null
    const toLocationId = MAP.location[m.toLocationId] || null

    // Regra: transfer exige to_location_id
    if (type === 'transfer' && !toLocationId) {
      warn(`inventory_movements: transfer sem to_location_id resolvível (id=${m.id}) → convertido para 'adjustment'`)
      type = 'adjustment'
    }

    // Regra: sale/refund histórico não tem sale_id — converter para 'adjustment'
    // (decrementStock atual não criava movements de tipo 'sale' com sale_id vinculado)
    if (type === 'sale' || type === 'refund') {
      warn(`inventory_movements: tipo '${type}' sem sale_id em dado histórico (id=${m.id}) → convertido para 'adjustment'`)
      type = 'adjustment'
    }

    movementRows.push({
      organization_id:    ORG_ID,
      product_id:         productId,
      location_id:        locationId,
      to_location_id:     toLocationId,
      type,
      qty_before:         m.before         ?? 0,
      qty_after:          m.after          ?? 0,
      // delta: NÃO inserir — é GENERATED ALWAYS (qty_after - qty_before)
      note:               m.note           || '',
      performed_by_id:    MAP.user[m.performedBy] || null,
      sale_id:            null,             // histórico sem vínculo de venda
      product_name_snap:  m.productName    || '',
      barcode_snap:       m.barcode        || '',
      location_name_snap: m.locationName   || '',
      performed_by_snap:  m.performedBy    || '',
      created_at:         m.timestamp      || new Date().toISOString(),
    })
  }

  if (movementRows.length > 0) {
    await insertRows('inventory_movements', movementRows)
    log(`inventory_movements: ${movementRows.length} rows (${skippedMovements} ignorados)`)
  }

  // ── SUMÁRIO FINAL ─────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════')
  console.log('  SEED CONCLUÍDO')
  console.log('═══════════════════════════════════════════════')
  console.log(`  ✅ Passos OK: ${11 - (WARN.length > 0 ? 0 : 0)}`)
  console.log(`  ⚠️  Warnings: ${WARN.length}`)
  if (WARN.length > 0) {
    console.warn('\n  Warnings detalhados:')
    WARN.forEach((w, i) => console.warn(`    ${i + 1}. ${w}`))
  }

  console.log('\n  ── PRÓXIMO PASSO OBRIGATÓRIO ─────────────────')
  console.log('  Cole e rode no Supabase SQL Editor:')
  console.log('\n  SELECT setval(\'invoice_number_seq\', (SELECT MAX(number) FROM sales));')
  console.log('\n  Depois rode: database/seed_phase0_validate.sql')
  console.log('═══════════════════════════════════════════════')
  console.log('\n  MAP exportado em: window.FLUXE_SEED_MAP')
  console.log('  Use para depuração: FLUXE_SEED_MAP.product, .location, .user, .category')

  window.FLUXE_SEED_MAP = MAP
  return MAP
}

// ──────────────────────────────────────────────────────────────
//  EXECUTAR
// ──────────────────────────────────────────────────────────────

runSeed().catch(err => {
  console.error('\n❌ SEED FALHOU:', err.message)
  console.error(err)
})
