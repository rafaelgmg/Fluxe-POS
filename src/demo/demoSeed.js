/**
 * demoSeed.js — Demo environment for Fluxe POS marketing screenshots.
 *
 * Activate:  navigate to /?demo=true
 * Clear:     navigate to /?demo=clear
 *
 * Safety:    real production data is backed up before seeding and restored on clear.
 *            Demo never writes to Supabase — all data is localStorage-only.
 */

// ── Keys ─────────────────────────────────────────────────────────────────────
const DEMO_MODE_KEY     = 'fluxe-demo-mode'
const DEMO_BACKUP_KEY   = 'fluxe-demo-backup'
const DEMO_SESSION_KEY  = 'fluxe-demo-pos-session'
const KIOSK_SESSION_KEY = 'fluxe-kiosk-session-v1'

// All localStorage keys that will be replaced during demo mode
const SEEDED_KEYS = [
  'fluxe-users-v1',
  'fluxe-categories-v1',
  'fluxe-products-v1',
  'fluxe-sales-v1',
  'fluxe-invoice-counter-v1',
  'fluxe-crm-v1',
  KIOSK_SESSION_KEY,
]

// ── Public helpers ────────────────────────────────────────────────────────────

export function isDemoMode() {
  return localStorage.getItem(DEMO_MODE_KEY) === '1'
}

/** Pre-built posSession for demo — read by App.jsx when isDemoMode() is true. */
export const DEMO_POS_SESSION = {
  location:   'Fluxe Demo Store',
  locationId: 'loc_demo',
  account:    'demo',
}

// ── Demo static data ──────────────────────────────────────────────────────────

const EMPLOYEES = [
  { id: 101, firstName: 'Alex',   lastName: 'Morgan',  position: 'Manager', email: '', phone: '', pin: '1111', status: 'active', photo: null, hourlyRate: 0, createdAt: '2024-01-01T00:00:00.000Z', supabaseId: null },
  { id: 102, firstName: 'Sophia', lastName: 'Carter',  position: 'Sales',   email: '', phone: '', pin: '2222', status: 'active', photo: null, hourlyRate: 0, createdAt: '2024-01-01T00:00:00.000Z', supabaseId: null },
  { id: 103, firstName: 'Daniel', lastName: 'Lee',     position: 'Sales',   email: '', phone: '', pin: '3333', status: 'active', photo: null, hourlyRate: 0, createdAt: '2024-01-01T00:00:00.000Z', supabaseId: null },
  { id: 104, firstName: 'Emma',   lastName: 'Brooks',  position: 'Sales',   email: '', phone: '', pin: '4444', status: 'active', photo: null, hourlyRate: 0, createdAt: '2024-01-01T00:00:00.000Z', supabaseId: null },
]

const CATEGORIES = [
  { id: 1, name: "Women's Brands", status: 'active', sortIndex: 0, commissionRate: null, commissionType: null, notes: '', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 2, name: "Men's Brands",   status: 'active', sortIndex: 1, commissionRate: null, commissionType: null, notes: '', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 3, name: 'Niche',          status: 'active', sortIndex: 2, commissionRate: null, commissionType: null, notes: '', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 4, name: "Men's NC",       status: 'active', sortIndex: 3, commissionRate: null, commissionType: null, notes: '', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 5, name: 'Unisex',         status: 'active', sortIndex: 4, commissionRate: null, commissionType: null, notes: '', createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 6, name: 'Armaf Oil',      status: 'active', sortIndex: 5, commissionRate: null, commissionType: null, notes: '', createdAt: '2024-01-01T00:00:00.000Z' },
]

// systemPrice = displayed price | minPrice = hidden floor
const PRODUCTS = [
  { id: 201, barcode: 'DM-001', rawBarcode: 'DM-001.65',  name: 'Ocean Essence',     description: 'EDP Spray',           size: '1.7oz', category: "Women's Brands", systemPrice: 180, minPrice: 65,  qty: 24, costPrice: 40, status: 'active', qtyByLoc: { loc_demo: 24 } },
  { id: 202, barcode: 'DM-002', rawBarcode: 'DM-002.80',  name: 'Midnight Noir',     description: 'EDP for Men',         size: '2.5oz', category: "Men's Brands",   systemPrice: 220, minPrice: 80,  qty: 18, costPrice: 45, status: 'active', qtyByLoc: { loc_demo: 18 } },
  { id: 203, barcode: 'DM-003', rawBarcode: 'DM-003.110', name: 'Velvet Amber',      description: 'Extrait de Parfum',   size: '2.0oz', category: 'Niche',          systemPrice: 280, minPrice: 110, qty: 12, costPrice: 70, status: 'active', qtyByLoc: { loc_demo: 12 } },
  { id: 204, barcode: 'DM-004', rawBarcode: 'DM-004.45',  name: 'Arctic Fresh',      description: 'Eau de Toilette',     size: '3.4oz', category: "Men's NC",       systemPrice: 220, minPrice: 45,  qty: 30, costPrice: 22, status: 'active', qtyByLoc: { loc_demo: 30 } },
  { id: 205, barcode: 'DM-005', rawBarcode: 'DM-005.25',  name: 'Golden Oud',        description: 'Perfume Oil',         size: '28ml',  category: 'Armaf Oil',      systemPrice: 80,  minPrice: 25,  qty: 40, costPrice: 14, status: 'active', qtyByLoc: { loc_demo: 40 } },
  { id: 206, barcode: 'DM-006', rawBarcode: 'DM-006.90',  name: 'Signature No. 01',  description: "Women's Edition",    size: '1.6oz', category: "Women's Brands", systemPrice: 240, minPrice: 90,  qty: 15, costPrice: 55, status: 'active', qtyByLoc: { loc_demo: 15 } },
  { id: 207, barcode: 'DM-007', rawBarcode: 'DM-007.70',  name: 'Signature No. 02',  description: 'Unisex Collection',  size: '3.4oz', category: 'Unisex',         systemPrice: 200, minPrice: 70,  qty: 20, costPrice: 48, status: 'active', qtyByLoc: { loc_demo: 20 } },
]

const CRM_CUSTOMERS = [
  { id: 'crm-001', firstName: 'Mia',      lastName: 'Johnson',   phone: '+17025550101', email: 'mia.j@email.com',      notes: 'Loves floral scents',   capturedBy: 'Alex Morgan',   capturedAt: daysAgo(2).toISOString(),  location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-002', firstName: 'James',    lastName: 'Williams',  phone: '+17025550102', email: '',                     notes: 'Looking for bold woods', capturedBy: 'Sophia Carter', capturedAt: daysAgo(5).toISOString(),  location: 'Fluxe Demo Store', smsConsent: false, archived: false },
  { id: 'crm-003', firstName: 'Ava',      lastName: 'Martinez',  phone: '+17025550103', email: 'ava.m@email.com',      notes: 'Gift for husband',       capturedBy: 'Daniel Lee',    capturedAt: daysAgo(7).toISOString(),  location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-004', firstName: 'Liam',     lastName: 'Brown',     phone: '+17025550104', email: '',                     notes: '',                       capturedBy: 'Emma Brooks',   capturedAt: daysAgo(9).toISOString(),  location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-005', firstName: 'Olivia',   lastName: 'Davis',     phone: '+17025550105', email: 'olivia.d@email.com',   notes: 'Repeat customer',        capturedBy: 'Alex Morgan',   capturedAt: daysAgo(11).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-006', firstName: 'Noah',     lastName: 'Garcia',    phone: '+17025550106', email: '',                     notes: 'Prefers light fresh',    capturedBy: 'Sophia Carter', capturedAt: daysAgo(13).toISOString(), location: 'Fluxe Demo Store', smsConsent: false, archived: false },
  { id: 'crm-007', firstName: 'Emma',     lastName: 'Wilson',    phone: '+17025550107', email: 'emma.w@email.com',     notes: 'Tourist from Chicago',   capturedBy: 'Daniel Lee',    capturedAt: daysAgo(15).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-008', firstName: 'Ethan',    lastName: 'Anderson',  phone: '+17025550108', email: '',                     notes: '',                       capturedBy: 'Emma Brooks',   capturedAt: daysAgo(16).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-009', firstName: 'Isabella', lastName: 'Taylor',    phone: '+17025550109', email: 'isabel.t@email.com',   notes: 'Interested in Niche',    capturedBy: 'Alex Morgan',   capturedAt: daysAgo(18).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-010', firstName: 'William',  lastName: 'Thomas',    phone: '+17025550110', email: '',                     notes: 'Buys for wife',          capturedBy: 'Sophia Carter', capturedAt: daysAgo(20).toISOString(), location: 'Fluxe Demo Store', smsConsent: false, archived: false },
  { id: 'crm-011', firstName: 'Sofia',    lastName: 'Hernandez', phone: '+17025550111', email: 'sofia.h@email.com',    notes: '',                       capturedBy: 'Daniel Lee',    capturedAt: daysAgo(21).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-012', firstName: 'Mason',    lastName: 'Moore',     phone: '+17025550112', email: '',                     notes: 'Wants classic scents',   capturedBy: 'Emma Brooks',   capturedAt: daysAgo(22).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-013', firstName: 'Amelia',   lastName: 'Jackson',   phone: '+17025550113', email: 'amelia.j@email.com',   notes: 'Looking for gift set',   capturedBy: 'Alex Morgan',   capturedAt: daysAgo(24).toISOString(), location: 'Fluxe Demo Store', smsConsent: false, archived: false },
  { id: 'crm-014', firstName: 'Lucas',    lastName: 'Martin',    phone: '+17025550114', email: '',                     notes: '',                       capturedBy: 'Sophia Carter', capturedAt: daysAgo(25).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-015', firstName: 'Charlotte', lastName: 'White',   phone: '+17025550115', email: 'charlotte.w@email.com', notes: 'VIP — bought $480',     capturedBy: 'Daniel Lee',    capturedAt: daysAgo(26).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-016', firstName: 'Henry',    lastName: 'Harris',    phone: '+17025550116', email: '',                     notes: 'First time visitor',     capturedBy: 'Emma Brooks',   capturedAt: daysAgo(27).toISOString(), location: 'Fluxe Demo Store', smsConsent: false, archived: false },
  { id: 'crm-017', firstName: 'Evelyn',   lastName: 'Clark',     phone: '+17025550117', email: 'evelyn.c@email.com',   notes: '',                       capturedBy: 'Alex Morgan',   capturedAt: daysAgo(28).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-018', firstName: 'Alexander', lastName: 'Lewis',   phone: '+17025550118', email: '',                     notes: 'Group purchase x3',      capturedBy: 'Sophia Carter', capturedAt: daysAgo(29).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
  { id: 'crm-019', firstName: 'Harper',   lastName: 'Robinson',  phone: '+17025550119', email: 'harper.r@email.com',   notes: 'Tourist from NYC',       capturedBy: 'Daniel Lee',    capturedAt: daysAgo(30).toISOString(), location: 'Fluxe Demo Store', smsConsent: false, archived: false },
  { id: 'crm-020', firstName: 'Benjamin', lastName: 'Walker',   phone: '+17025550120', email: '',                     notes: 'Prefers Oud family',     capturedBy: 'Emma Brooks',   capturedAt: daysAgo(31).toISOString(), location: 'Fluxe Demo Store', smsConsent: true,  archived: false },
]

// ── Sale templates [employeeIdx, productIdx, salePrice, paymentMethod, daysAgo, hourOffset] ─
// employeeIdx: 0=Alex,1=Sophia,2=Daniel,3=Emma | productIdx: 0-6 (PRODUCTS array)
const SALE_TEMPLATES = [
  // Day 0 (today)
  [0, 0, 155, 'cash',     0, 11], // Alex — Ocean Essence — $155
  [1, 1, 190, 'card',     0, 13], // Sophia — Midnight Noir — $190
  [2, 3, 85,  'card',     0, 15], // Daniel — Arctic Fresh — $85
  // Day 1
  [3, 2, 240, 'cash',     1, 10], // Emma — Velvet Amber — $240
  [0, 5, 200, 'card',     1, 12], // Alex — Signature No. 01 — $200
  [1, 4, 55,  'cash',     1, 14], // Sophia — Golden Oud — $55
  [2, 6, 160, 'card',     1, 16], // Daniel — Signature No. 02 — $160
  // Day 2
  [3, 0, 140, 'card',     2, 11], // Emma — Ocean Essence — $140
  [0, 1, 200, 'card',     2, 13], // Alex — Midnight Noir — $200
  [1, 3, 90,  'cash',     2, 15], // Sophia — Arctic Fresh — $90
  // Day 3
  [2, 5, 210, 'card',     3, 10], // Daniel — Signature No. 01 — $210
  [3, 4, 60,  'cash',     3, 12], // Emma — Golden Oud — $60
  [0, 2, 250, 'external', 3, 14], // Alex — Velvet Amber — $250
  [1, 6, 170, 'card',     3, 16], // Sophia — Signature No. 02 — $170
  // Day 4
  [2, 0, 150, 'card',     4, 11], // Daniel — Ocean Essence — $150
  [3, 1, 185, 'cash',     4, 13], // Emma — Midnight Noir — $185
  // Day 5
  [0, 3, 95,  'card',     5, 10], // Alex — Arctic Fresh — $95
  [1, 5, 195, 'card',     5, 12], // Sophia — Signature No. 01 — $195
  [2, 4, 65,  'cash',     5, 14], // Daniel — Golden Oud — $65
  [3, 2, 255, 'card',     5, 16], // Emma — Velvet Amber — $255
  // Day 6
  [0, 6, 165, 'cash',     6, 11], // Alex — Signature No. 02 — $165
  [1, 0, 145, 'card',     6, 13], // Sophia — Ocean Essence — $145
  // Day 7
  [2, 1, 195, 'card',     7, 10], // Daniel — Midnight Noir — $195
  [3, 3, 80,  'cash',     7, 12], // Emma — Arctic Fresh — $80
  [0, 5, 220, 'external', 7, 14], // Alex — Signature No. 01 — $220
  // Day 8
  [1, 2, 245, 'card',     8, 11], // Sophia — Velvet Amber — $245
  [2, 4, 55,  'cash',     8, 13], // Daniel — Golden Oud — $55
  [3, 6, 175, 'card',     8, 15], // Emma — Signature No. 02 — $175
  // Day 9
  [0, 0, 160, 'card',     9, 10], // Alex — Ocean Essence — $160
  [1, 1, 185, 'cash',     9, 12], // Sophia — Midnight Noir — $185
  [2, 3, 90,  'card',     9, 14], // Daniel — Arctic Fresh — $90
  // Day 10
  [3, 5, 205, 'card',    10, 11], // Emma — Signature No. 01 — $205
  [0, 4, 70,  'cash',    10, 13], // Alex — Golden Oud — $70
  [1, 2, 260, 'card',    10, 15], // Sophia — Velvet Amber — $260
  // Day 11
  [2, 6, 155, 'cash',    11, 10], // Daniel — Signature No. 02 — $155
  [3, 0, 145, 'card',    11, 12], // Emma — Ocean Essence — $145
  // Day 12
  [0, 1, 190, 'card',    12, 11], // Alex — Midnight Noir — $190
  [1, 3, 85,  'cash',    12, 13], // Sophia — Arctic Fresh — $85
  [2, 5, 215, 'card',    12, 15], // Daniel — Signature No. 01 — $215
  // Day 13
  [3, 4, 60,  'external',13, 10], // Emma — Golden Oud — $60
  [0, 6, 170, 'card',    13, 12], // Alex — Signature No. 02 — $170
  [1, 2, 250, 'card',    13, 14], // Sophia — Velvet Amber — $250
  // Day 14
  [2, 0, 150, 'cash',    14, 11], // Daniel — Ocean Essence — $150
  [3, 1, 195, 'card',    14, 13], // Emma — Midnight Noir — $195
  // Day 15
  [0, 3, 95,  'card',    15, 10], // Alex — Arctic Fresh — $95
  [1, 5, 200, 'card',    15, 12], // Sophia — Signature No. 01 — $200
  [2, 4, 65,  'cash',    15, 14], // Daniel — Golden Oud — $65
  // Day 16
  [3, 6, 165, 'card',    16, 11], // Emma — Signature No. 02 — $165
  [0, 2, 255, 'card',    16, 13], // Alex — Velvet Amber — $255
  [1, 0, 140, 'cash',    16, 15], // Sophia — Ocean Essence — $140
  // Day 17
  [2, 1, 185, 'card',    17, 10], // Daniel — Midnight Noir — $185
  [3, 3, 85,  'cash',    17, 12], // Emma — Arctic Fresh — $85
  // Day 18
  [0, 5, 210, 'external',18, 11], // Alex — Signature No. 01 — $210
  [1, 4, 60,  'cash',    18, 13], // Sophia — Golden Oud — $60
  [2, 6, 170, 'card',    18, 15], // Daniel — Signature No. 02 — $170
  // Day 19
  [3, 0, 155, 'card',    19, 10], // Emma — Ocean Essence — $155
  [0, 1, 195, 'card',    19, 12], // Alex — Midnight Noir — $195
  // Day 20
  [1, 2, 245, 'card',    20, 11], // Sophia — Velvet Amber — $245
  [2, 3, 90,  'cash',    20, 13], // Daniel — Arctic Fresh — $90
  [3, 5, 205, 'card',    20, 15], // Emma — Signature No. 01 — $205
  // Day 21
  [0, 4, 65,  'cash',    21, 10], // Alex — Golden Oud — $65
  [1, 6, 160, 'card',    21, 12], // Sophia — Signature No. 02 — $160
  // Day 22
  [2, 0, 145, 'card',    22, 11], // Daniel — Ocean Essence — $145
  [3, 1, 190, 'card',    22, 13], // Emma — Midnight Noir — $190
  [0, 2, 260, 'external',22, 15], // Alex — Velvet Amber — $260
  // Day 23
  [1, 3, 80,  'cash',    23, 10], // Sophia — Arctic Fresh — $80
  [2, 5, 200, 'card',    23, 12], // Daniel — Signature No. 01 — $200
  // Day 24
  [3, 4, 55,  'cash',    24, 11], // Emma — Golden Oud — $55
  [0, 6, 175, 'card',    24, 13], // Alex — Signature No. 02 — $175
  [1, 0, 150, 'card',    24, 15], // Sophia — Ocean Essence — $150
  // Day 25
  [2, 1, 185, 'card',    25, 10], // Daniel — Midnight Noir — $185
  [3, 2, 250, 'cash',    25, 12], // Emma — Velvet Amber — $250
  // Day 26
  [0, 3, 90,  'card',    26, 11], // Alex — Arctic Fresh — $90
  [1, 5, 210, 'card',    26, 13], // Sophia — Signature No. 01 — $210
  [2, 4, 60,  'cash',    26, 15], // Daniel — Golden Oud — $60
  // Day 27
  [3, 6, 165, 'card',    27, 10], // Emma — Signature No. 02 — $165
  [0, 0, 155, 'card',    27, 12], // Alex — Ocean Essence — $155
  // Day 28
  [1, 1, 190, 'cash',    28, 11], // Sophia — Midnight Noir — $190
  [2, 2, 245, 'card',    28, 13], // Daniel — Velvet Amber — $245
  [3, 3, 85,  'card',    28, 15], // Emma — Arctic Fresh — $85
  // Day 29
  [0, 5, 200, 'card',    29, 10], // Alex — Signature No. 01 — $200
  [1, 4, 65,  'cash',    29, 12], // Sophia — Golden Oud — $65
  [2, 6, 170, 'card',    29, 14], // Daniel — Signature No. 02 — $170
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(n) {
  const d = new Date()
  d.setHours(12, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}

function buildTimestamp(daysBack, hour) {
  const d = new Date()
  d.setDate(d.getDate() - daysBack)
  d.setHours(hour, Math.floor(Math.random() * 59), 0, 0)
  return d.toISOString()
}

function buildSale(invoiceNum, template) {
  const [empIdx, prodIdx, salePrice, payMethod, daysBack, hour] = template
  const emp  = EMPLOYEES[empIdx]
  const prod = PRODUCTS[prodIdx]
  const TAX  = 0.085

  const empName  = `${emp.firstName} ${emp.lastName}`
  const subtotal = salePrice
  const tax      = parseFloat((subtotal * TAX).toFixed(2))
  const total    = parseFloat((subtotal + tax).toFixed(2))
  const spare    = salePrice - prod.minPrice

  const item = {
    lineId:      `${invoiceNum}-1`,
    productId:   prod.id,
    categoryId:  String(CATEGORIES.findIndex(c => c.name === prod.category) + 1),
    name:        prod.name,
    barcode:     prod.barcode,
    description: prod.description,
    size:        prod.size,
    category:    prod.category,
    qty:         1,
    salePrice,
    systemPrice: prod.systemPrice,
    minPrice:    prod.minPrice,
    discount:    prod.systemPrice - salePrice,
    subtotal:    salePrice,
    spare:       spare > 0 ? spare : 0,
    costPrice:   prod.costPrice,
  }

  return {
    number:             invoiceNum,
    timestamp:          buildTimestamp(daysBack, hour),
    location:           DEMO_POS_SESSION.location,
    locationId:         DEMO_POS_SESSION.locationId,
    employee:           empName,
    employeeId:         emp.id,
    items:              [item],
    subtotal,
    tax,
    total,
    tip:                0,
    status:             'normal',
    paymentMethod:      payMethod,
    payments:           [],
    totalSpare:         item.spare,
    commissionSnapshot: null,
    linkedCustomerId:   null,
    notes:              '',
    receiptAction:      'none',
  }
}

function buildSales() {
  return SALE_TEMPLATES.map((template, i) => buildSale(70001 + i, template))
}

// ── Main seed / clear functions ───────────────────────────────────────────────

export function seedDemoData() {
  // 1. Back up current data (only if not already in demo mode)
  if (!isDemoMode()) {
    const backup = {}
    for (const key of SEEDED_KEYS) {
      backup[key] = localStorage.getItem(key)
    }
    try { localStorage.setItem(DEMO_BACKUP_KEY, JSON.stringify(backup)) } catch {}
  }

  // 2. Write demo data
  localStorage.setItem('fluxe-users-v1',         JSON.stringify({ v: 1, users: EMPLOYEES }))
  localStorage.setItem('fluxe-categories-v1',    JSON.stringify(CATEGORIES))
  localStorage.setItem('fluxe-products-v1',      JSON.stringify(PRODUCTS))
  localStorage.setItem('fluxe-sales-v1',         JSON.stringify(buildSales()))
  localStorage.setItem('fluxe-invoice-counter-v1', String(70001 + SALE_TEMPLATES.length))
  localStorage.setItem('fluxe-crm-v1',           JSON.stringify(CRM_CUSTOMERS))
  localStorage.setItem(KIOSK_SESSION_KEY,        JSON.stringify({ email: 'demo', accountId: 'demo', role: 'admin' }))
  localStorage.setItem(DEMO_SESSION_KEY,         JSON.stringify(DEMO_POS_SESSION))

  // 3. Mark demo mode active
  localStorage.setItem(DEMO_MODE_KEY, '1')
}

export function clearDemoData() {
  // Restore production backup
  try {
    const raw = localStorage.getItem(DEMO_BACKUP_KEY)
    if (raw) {
      const backup = JSON.parse(raw)
      for (const [key, value] of Object.entries(backup)) {
        if (value === null) localStorage.removeItem(key)
        else localStorage.setItem(key, value)
      }
    }
  } catch {}

  // Remove demo-specific keys
  localStorage.removeItem(DEMO_MODE_KEY)
  localStorage.removeItem(DEMO_BACKUP_KEY)
  localStorage.removeItem(DEMO_SESSION_KEY)
}
