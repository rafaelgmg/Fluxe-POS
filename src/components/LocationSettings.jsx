/**
 * LocationSettings.jsx
 *
 * Admin → Locations → Settings
 *
 * Storage key: fluxe-locations-v1
 * Structure: array of location objects (superset of LOCATIONS_CFG)
 *
 * Isolation rules:
 *  - id and name of existing locations (loc_01, loc_02) are preserved so
 *    sales / inventory / reports continue to match by location name/id.
 *  - Active/inactive only hides the location from new-sale login; historical
 *    data is never deleted.
 */

import { useState, useMemo } from 'react'
import { LOCATIONS_CFG } from '../config/branding'
import { loadUsers } from '../utils/usersStorage'

// ─── Storage ──────────────────────────────────────────────────────────────────
const LOC_KEY = 'fluxe-locations-v1'

/** Default extended shape merged onto each LOCATIONS_CFG entry */
function defaultExt(loc) {
  return {
    // ── base (from branding)
    id:       loc.id,
    name:     loc.name,
    region:   loc.region || 'Las Vegas',
    address:  loc.address || '',
    phone:    loc.phone   || '',
    active:   true,
    // ── contact
    address2: '', city: 'Las Vegas', state: 'Nevada',
    country: 'United States', zip: '',
    mall: '', storeNumber: '',
    phone2: '', email: '',
    manager: '', merchantNumber: '', priceList: '',
    // ── tax / receipt
    taxRate: 8.5,
    hasTax2: false, taxRate2: 0, taxDisplayAs: '',
    receiptHeader: `${loc.name}\n${loc.address || ''}`,
    receiptFooter: 'No Refunds. Exchanges within 14 days.',
    refundPolicy: 'Exchanges within 14 days.',
    showDiscounts: true, showPrices: true, showRep: true,
    allowTip: false, defaultTipPct: 18,
    // ── preferences (legacy POS behavior)
    requireLoginPerSale: false, autoPrintReceipt: false,
    autoOpenDrawer: true, requireCustomerCapture: false,
    // ── merchant
    terminalId: '', processorName: '', merchantAccountId: '',
    acceptCash: true, acceptCard: true, acceptExtCredit: true, acceptCheck: false,
    // ── features
    featureLayaway: false, featureGiftCards: false, featureQuotes: false,
    featureAppointments: false, featureCompetition: true,
    featureCRM: true, featureClockInOut: true,
    // ── competition config (per-location) — read by Competition.jsx at runtime
    // ✅ LIVE: competitionMode, competitionTimeframe, competitionViewTop, competitionShowRankingOnly
    // ○ SAVED: competitionRegions (future filter by region)
    competitionMode:             'individual_total', // 'none'|'teamwork_total'|'teamwork_highest'|'teamwork_products'|'individual_total'|'individual_highest'|'individual_products'
    competitionTimeframe:        'daily',            // 'daily'|'weekly'|'monthly'
    competitionViewTop:          5,                  // number of positions to show; 0 = all
    competitionShowRankingOnly:  false,              // hide podium, show ranked list only
    competitionRegions:          [],                 // [] = all regions (structure only)

    // ════════════════════════════════════════════════════════
    // Alerts / Notifications (per-location, per-event)
    // All alert sending is STRUCTURE ONLY — wired in future with SMS/email/push
    // ════════════════════════════════════════════════════════
    locationAlerts: {
      openLocation:         { enabled: false, recipients: [] },
      closeLocation:        { enabled: false, recipients: [] },
      employeeCheckIn:      { enabled: false, recipients: [] },
      employeeCheckOut:     { enabled: false, recipients: [] },
      employeeHoursChanged: { enabled: false, recipients: [] },
      lowStock:             { enabled: false, recipients: [], threshold: 10  },
      highSaleAlert:        { enabled: false, recipients: [], threshold: 500 },
      endOfDayReport:       { enabled: false, recipients: [] },
    },

    // ── integration
    externalSystemId: '', apiEndpoint: '', syncMode: 'manual', integrationNotes: '',

    // ════════════════════════════════════════════════════════
    // A. Sales preferences
    // ════════════════════════════════════════════════════════
    minPriceRestriction:            false,  // block sale below min price (structure only)
    spareTransferTime:              0,       // minutes — time window to transfer spare between invoices (structure only)
    listModeDefault:                false,   // change sales screen to list mode (structure only)
    allowSaleWithoutEmployee:       false,   // allow completing a sale with no employee selected
    includeTaxInPrice:              false,   // product prices already include tax (structure only)
    askCustomerAfterSale:           false,   // same as requireCustomerCapture — prompt, allow skip
    enforceCustomerDuringSale:      false,   // block completing sale without customer info (structure only)
    onlyAcceptRegionGiftCards:      false,   // only accept gift cards issued in same region (structure only)
    defaultGiftCardExpiration:      365,     // days (structure only)
    blockCrossLocationInvoiceReview: false,  // employees cannot review invoices from other locations (structure only)
    allowEmployeesViewAppointments: false,   // employees can view all appointments at this location (structure only)

    // ════════════════════════════════════════════════════════
    // B. Security
    // ════════════════════════════════════════════════════════
    enableCashCount:     false,  // enable cash count module (structure only)
    drawerOnlyAfterSale: false,  // open drawer ONLY after a sale — overrides autoOpenDrawer

    // ════════════════════════════════════════════════════════
    // C. Timezone
    // ════════════════════════════════════════════════════════
    timezone: 'America/Los_Angeles',

    // ════════════════════════════════════════════════════════
    // D. Users / Clock
    // ════════════════════════════════════════════════════════
    addMinutesFirstClockIn:  0,  // add N min to first clock-in of the day (structure only)
    addMinutesLastClockOut:  0,  // add N min to last clock-out of the day (structure only)
    autoClockOutAfter:       0,  // auto clock-out after N hours of inactivity; 0 = disabled (structure only)

    // ════════════════════════════════════════════════════════
    // E. Inventory
    // ════════════════════════════════════════════════════════
    blockSaleOutOfStock:        false,  // ✅ WIRED — blocks adding 0-qty items to cart
    hideQtyInInventoryCount:    false,  // structure only
    hideStatusInInventoryCount: false,  // structure only

    // ════════════════════════════════════════════════════════
    // F. Inventory History
    // ════════════════════════════════════════════════════════
    saveInventoryHistory:          false,    // structure only
    inventoryHistoryFrequency:     'daily',  // 'daily' | 'weekly' | 'monthly' (structure only)
    inventoryHistoryTime:          '23:00',  // HH:mm (structure only)

    // ════════════════════════════════════════════════════════
    // G. Reports
    // ════════════════════════════════════════════════════════
    hideTotalsUntilPrinted:        false,  // structure only
    hideInventoryChangesInEOD:     false,  // structure only
    hideSalesPerEmployeeInEOD:     false,  // structure only
    printMasterZInEOD:             false,  // structure only
    blockEmployeeSalaryReview:     false,  // structure only
    blockEmployeeSalaryMobile:     false,  // structure only

    // ── meta
    createdAt: new Date().toISOString(),
    updatedAt: null,
  }
}

// Fields that are identity (never copied across locations)
const IDENTITY_FIELDS = new Set([
  'id','name','region','address','address2','city','state','country','zip',
  'mall','storeNumber','phone','phone2','email','manager','merchantNumber',
  'priceList','createdAt','updatedAt','active',
  'receiptHeader',   // location-specific header
  'locationAlerts',  // alerts have their own dedicated copy flow
])

export function loadLocations() {
  try {
    const raw = localStorage.getItem(LOC_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      // Ensure all branding locations exist (merge new branding entries in)
      const ids = new Set(saved.map(l => l.id))
      LOCATIONS_CFG.forEach(l => { if (!ids.has(l.id)) saved.push(defaultExt(l)) })
      return saved
    }
  } catch {}
  return LOCATIONS_CFG.map(defaultExt)
}

function saveLocations(list) {
  try { localStorage.setItem(LOC_KEY, JSON.stringify(list)) } catch {}
}

function nextLocId(list) {
  const nums = list.map(l => parseInt(l.id.replace('loc_', '')) || 0)
  return `loc_${(Math.max(...nums, 0) + 1).toString().padStart(2, '0')}`
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#020817'
const PANEL  = '#0a0f1e'
const CARD   = '#0f172a'
const BORDER = '#1e293b'
const BLUE   = '#2563eb'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const AMBER  = '#f59e0b'
const MUTED  = '#475569'
const TEXT   = '#f1f5f9'
const DIM    = '#94a3b8'
const LOC_COLOR = '#e74c3c'

// ─── Shared UI helpers ────────────────────────────────────────────────────────
const inp = (extra = {}) => ({
  padding: '7px 10px', background: BG, border: `1px solid ${BORDER}`,
  borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none',
  width: '100%', boxSizing: 'border-box', ...extra,
})

function Lbl({ children }) {
  return <label style={{ display: 'block', color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>{children}</label>
}

function Field({ label, children, half, third }) {
  const w = half ? '50%' : third ? '33.33%' : '100%'
  return (
    <div style={{ width: w, boxSizing: 'border-box', paddingRight: 8, marginBottom: 12 }}>
      <Lbl>{label}</Lbl>
      {children}
    </div>
  )
}

function Row({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', marginRight: -8 }}>{children}</div>
}

function Section({ title, children, sub }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>{title}</p>
        {sub && <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{sub}</p>}
      </div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px 4px' }}>
        {children}
      </div>
    </div>
  )
}

function Toggle({ label, checked, onChange, description, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 12, marginBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
      <button onClick={() => !disabled && onChange(!checked)} style={{
        width: 36, height: 20, borderRadius: 10, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: checked ? BLUE : '#1e293b', position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          position: 'absolute', top: 3, left: checked ? 18 : 3, transition: 'left 0.2s',
        }} />
      </button>
      <div>
        <p style={{ color: disabled ? MUTED : TEXT, fontSize: 12, fontWeight: 600 }}>{label}</p>
        {description && <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>{description}</p>}
      </div>
    </div>
  )
}

function Placeholder({ icon, label, description }) {
  return (
    <div style={{ padding: '40px 24px', textAlign: 'center', color: MUTED }}>
      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}>{icon}</div>
      <p style={{ color: DIM, fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{label}</p>
      <p style={{ fontSize: 12, maxWidth: 360, margin: '0 auto', lineHeight: 1.6 }}>{description}</p>
    </div>
  )
}

// ─── Tab content ──────────────────────────────────────────────────────────────
function TabInformation({ form, set, isExisting }) {
  const textArea = { ...inp(), resize: 'vertical', fontFamily: 'inherit', minHeight: 60 }

  return (
    <div>
      <Section title="General Information">
        <Row>
          <Field label="LOCATION NAME *" >
            <input value={form.name} onChange={e => set('name', e.target.value)} style={inp()} />
            {isExisting && (
              <p style={{ color: AMBER, fontSize: 10, marginTop: 3 }}>
                ⚠️ Changing the name may affect sales matching and historical reports.
              </p>
            )}
          </Field>
          <Field label="REGION" half>
            <input value={form.region} onChange={e => set('region', e.target.value)} style={inp()} />
          </Field>
          <Field label="STATUS" half>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['active', 'Active', GREEN], ['inactive', 'Inactive', RED]].map(([val, lbl, color]) => (
                <button key={val} onClick={() => set('active', val === 'active')} style={{
                  flex: 1, padding: '7px', borderRadius: 4, border: `1px solid ${form.active === (val === 'active') ? color : BORDER}`,
                  background: form.active === (val === 'active') ? `${color}18` : 'transparent',
                  color: form.active === (val === 'active') ? color : MUTED,
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                }}>{lbl}</button>
              ))}
            </div>
          </Field>
        </Row>
        <Row>
          <Field label="PRICE LIST" half>
            <input value={form.priceList} onChange={e => set('priceList', e.target.value)} placeholder="e.g. Las Vegas Pricelist" style={inp()} />
          </Field>
          <Field label="STORE / CART #" half>
            <input value={form.storeNumber} onChange={e => set('storeNumber', e.target.value)} style={inp()} />
          </Field>
        </Row>
      </Section>

      <Section title="Contact Information">
        <Row>
          <Field label="ADDRESS 1">
            <input value={form.address} onChange={e => set('address', e.target.value)} style={inp()} />
          </Field>
          <Field label="ADDRESS 2">
            <input value={form.address2} onChange={e => set('address2', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <Row>
          <Field label="CITY" half>
            <input value={form.city} onChange={e => set('city', e.target.value)} style={inp()} />
          </Field>
          <Field label="STATE" half>
            <input value={form.state} onChange={e => set('state', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <Row>
          <Field label="COUNTRY" half>
            <input value={form.country} onChange={e => set('country', e.target.value)} style={inp()} />
          </Field>
          <Field label="ZIP / POSTAL CODE" half>
            <input value={form.zip} onChange={e => set('zip', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <Row>
          <Field label="MALL" half>
            <input value={form.mall} onChange={e => set('mall', e.target.value)} placeholder="Mall name if applicable" style={inp()} />
          </Field>
          <Field label="MERCHANT NUMBER" half>
            <input value={form.merchantNumber} onChange={e => set('merchantNumber', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <Row>
          <Field label="PRIMARY PHONE" half>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} style={inp()} />
          </Field>
          <Field label="SECONDARY PHONE" half>
            <input value={form.phone2} onChange={e => set('phone2', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <Row>
          <Field label="EMAIL ADDRESS" half>
            <input value={form.email} onChange={e => set('email', e.target.value)} type="email" style={inp()} />
          </Field>
          <Field label="LOCATION MANAGER" half>
            <input value={form.manager} onChange={e => set('manager', e.target.value)} style={inp()} />
          </Field>
        </Row>
      </Section>

      <Section title="Tax Settings">
        <Row>
          <Field label="TAX RATE (%)" third>
            <input value={form.taxRate} onChange={e => set('taxRate', e.target.value)} type="number" step="0.01" min="0" max="100" style={inp({ color: AMBER })} />
          </Field>
          <Field label="TAX DISPLAY AS" third>
            <input value={form.taxDisplayAs} onChange={e => set('taxDisplayAs', e.target.value)} placeholder="TAX / GST / VAT" style={inp()} />
          </Field>
          <Field label="2ND TAX RATE (%)" third>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.hasTax2} onChange={e => set('hasTax2', e.target.checked)} style={{ cursor: 'pointer' }} />
              <input value={form.taxRate2} onChange={e => set('taxRate2', e.target.value)} type="number" step="0.01" min="0" disabled={!form.hasTax2} style={inp({ color: form.hasTax2 ? AMBER : MUTED, opacity: form.hasTax2 ? 1 : 0.4 })} />
            </div>
          </Field>
        </Row>
      </Section>

      <Section title="Receipt Settings">
        <Row>
          <Field label="RECEIPT HEADER MESSAGE">
            <textarea value={form.receiptHeader} onChange={e => set('receiptHeader', e.target.value)} rows={3} style={textArea} />
          </Field>
          <Field label="RECEIPT FOOTER MESSAGE">
            <textarea value={form.receiptFooter} onChange={e => set('receiptFooter', e.target.value)} rows={3} style={textArea} />
          </Field>
        </Row>
        <Row>
          <Field label="REFUND POLICY">
            <input value={form.refundPolicy} onChange={e => set('refundPolicy', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <div style={{ paddingTop: 4 }}>
          <Toggle label="Show individual product discounts on receipt" checked={form.showDiscounts} onChange={v => set('showDiscounts', v)} />
          <Toggle label="Show individual product prices on receipt" checked={form.showPrices} onChange={v => set('showPrices', v)} />
          <Toggle label="Show sales representative on receipt" checked={form.showRep} onChange={v => set('showRep', v)} />
          <Toggle label="Allow Tip" checked={form.allowTip} onChange={v => set('allowTip', v)} description="Enable tip collection at checkout" />
          {form.allowTip && (
            <Row>
              <Field label="DEFAULT TIP %" third>
                <input value={form.defaultTipPct} onChange={e => set('defaultTipPct', e.target.value)} type="number" min="0" max="100" style={inp()} />
              </Field>
            </Row>
          )}
        </div>
      </Section>
    </div>
  )
}

// ── Numeric input helper for preferences ─────────────────────────────────────
function NumInput({ value, onChange, min = 0, max, suffix, width = 80, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number" min={min} max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        disabled={disabled}
        style={{ ...inp(), width, opacity: disabled ? 0.4 : 1 }}
      />
      {suffix && <span style={{ color: MUTED, fontSize: 11 }}>{suffix}</span>}
    </div>
  )
}

// ── Badge: "live" = wired, "saved" = structure only ──────────────────────────
function StatusBadge({ live }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 0.4, padding: '2px 6px',
      borderRadius: 8,
      background: live ? 'rgba(34,197,94,0.12)' : 'rgba(100,116,139,0.12)',
      border: `1px solid ${live ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.25)'}`,
      color: live ? GREEN : '#64748b',
      marginLeft: 8, verticalAlign: 'middle', flexShrink: 0,
    }}>{live ? '● LIVE' : '○ SAVED'}</span>
  )
}

// ── Group collapsible header ──────────────────────────────────────────────────
function PrefGroup({ icon, title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: open ? 'rgba(37,99,235,0.06)' : CARD,
          border: `1px solid ${open ? 'rgba(37,99,235,0.2)' : BORDER}`,
          borderRadius: open ? '8px 8px 0 0' : 8,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
      >
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 12, flex: 1, textAlign: 'left' }}>{title}</span>
        <span style={{ color: MUTED, fontSize: 13, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>
      {open && (
        <div style={{
          background: CARD, border: `1px solid ${open ? 'rgba(37,99,235,0.2)' : BORDER}`,
          borderTop: 'none', borderRadius: '0 0 8px 8px',
          padding: '4px 16px 4px',
        }}>
          {children}
        </div>
      )}
    </div>
  )
}

function TabPreferences({ form, set, allLocations = [] }) {
  const [copyFrom,       setCopyFrom]       = useState('')
  const [confirmCopy,    setConfirmCopy]    = useState(false)
  const [copyDone,       setCopyDone]       = useState(false)

  const otherLocations = allLocations.filter(l => l.id !== form.id)

  function executeCopy() {
    const src = allLocations.find(l => l.id === copyFrom)
    if (!src) return
    const patch = {}
    Object.keys(src).forEach(k => {
      if (!IDENTITY_FIELDS.has(k)) patch[k] = src[k]
    })
    Object.entries(patch).forEach(([k, v]) => set(k, v))
    setConfirmCopy(false)
    setCopyFrom('')
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 3000)
  }

  return (
    <div>

      {/* ── A. Sales ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8, marginTop: 4 }}>
        A — SALES
      </div>
      <div style={{ marginBottom: 20 }}>
        <PrefGroup icon="🏷️" title="Minimum Price Restriction">
          <Toggle
            label={<>Minimum price restriction <StatusBadge /></>}
            checked={form.minPriceRestriction}
            onChange={v => set('minPriceRestriction', v)}
            description="Block sales below each product's configured minimum price. Min prices are set per-product in Inventory."
          />
        </PrefGroup>
        <PrefGroup icon="🔄" title="Spare Transfer">
          <div style={{ paddingTop: 10, paddingBottom: 10 }}>
            <p style={{ color: TEXT, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Time to transfer spare from one invoice to another <StatusBadge />
            </p>
            <NumInput value={form.spareTransferTime} onChange={v => set('spareTransferTime', v)} suffix="minutes" width={90} />
            <p style={{ color: MUTED, fontSize: 11, marginTop: 6 }}>Set 0 to disable spare transfer between invoices.</p>
          </div>
        </PrefGroup>
        <PrefGroup icon="📋" title="Sales Screen & Employees" defaultOpen>
          <Toggle
            label={<>Change sales screen to list mode <StatusBadge /></>}
            checked={form.listModeDefault}
            onChange={v => set('listModeDefault', v)}
            description="Display products in a list instead of grid on the POS screen"
          />
          <Toggle
            label={<>Allow sales with no selected employee <StatusBadge live /></>}
            checked={form.allowSaleWithoutEmployee}
            onChange={v => set('allowSaleWithoutEmployee', v)}
            description="If disabled, a seller must be authenticated before completing a sale"
          />
          <Toggle
            label={<>Include tax in the product price <StatusBadge /></>}
            checked={form.includeTaxInPrice}
            onChange={v => set('includeTaxInPrice', v)}
            description="Product display prices are already tax-inclusive — tax is not added at checkout"
          />
        </PrefGroup>
        <PrefGroup icon="👤" title="Customer Capture" defaultOpen>
          <Toggle
            label={<>Ask for customer information after each sale <StatusBadge live /></>}
            checked={form.askCustomerAfterSale}
            onChange={v => {
              set('askCustomerAfterSale', v)
              set('requireCustomerCapture', v)  // keep legacy field in sync
            }}
            description="Shows the customer capture form after payment — employee can skip"
          />
          <Toggle
            label={<>Enforce customer collection — block sale without customer <StatusBadge /></>}
            checked={form.enforceCustomerDuringSale}
            onChange={v => set('enforceCustomerDuringSale', v)}
            description="Customer name + phone become required fields — sale cannot be completed without them"
          />
        </PrefGroup>
        <PrefGroup icon="🎁" title="Gift Cards & Checks">
          <Toggle
            label={<>Only accept gift cards from this region <StatusBadge /></>}
            checked={form.onlyAcceptRegionGiftCards}
            onChange={v => set('onlyAcceptRegionGiftCards', v)}
            description="Reject gift cards issued by other regions at this location"
          />
          <Toggle
            label={<>Allow check as payment <StatusBadge live /></>}
            checked={form.acceptCheck}
            onChange={v => set('acceptCheck', v)}
            description="Adds Check as a payment option in the payment modal"
          />
          <div style={{ paddingTop: 6, paddingBottom: 12 }}>
            <p style={{ color: TEXT, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
              Default Gift Card Expiration <StatusBadge />
            </p>
            <NumInput value={form.defaultGiftCardExpiration} onChange={v => set('defaultGiftCardExpiration', v)} suffix="days" width={90} />
          </div>
        </PrefGroup>
        <PrefGroup icon="🔒" title="Invoice Access">
          <Toggle
            label={<>Block employees from reviewing invoices from other locations <StatusBadge /></>}
            checked={form.blockCrossLocationInvoiceReview}
            onChange={v => set('blockCrossLocationInvoiceReview', v)}
          />
          <Toggle
            label={<>Allow employees to view all appointments <StatusBadge /></>}
            checked={form.allowEmployeesViewAppointments}
            onChange={v => set('allowEmployeesViewAppointments', v)}
          />
        </PrefGroup>
      </div>

      {/* ── B. Security ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        B — SECURITY
      </div>
      <div style={{ marginBottom: 20 }}>
        <PrefGroup icon="🔐" title="Cash Drawer & Count" defaultOpen>
          <Toggle
            label={<>Enable cash count <StatusBadge /></>}
            checked={form.enableCashCount}
            onChange={v => set('enableCashCount', v)}
            description="Activate the cash count module at this location"
          />
          <Toggle
            label={<>Open cash drawer ONLY after a sale has been made <StatusBadge live /></>}
            checked={form.drawerOnlyAfterSale}
            onChange={v => {
              set('drawerOnlyAfterSale', v)
              set('autoOpenDrawer', !v)  // keep legacy field in sync
            }}
            description="Prevents the drawer from being opened manually outside of a sale transaction"
          />
        </PrefGroup>
      </div>

      {/* ── C. Timezone ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        C — TIMEZONE
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ color: TEXT, fontWeight: 700, fontSize: 12 }}>Location Timezone</span>
            <StatusBadge live />
          </div>
          <p style={{ color: MUTED, fontSize: 11, marginBottom: 10 }}>Used for date/time display in reports and invoice timestamps.</p>
          <select
            value={form.timezone}
            onChange={e => set('timezone', e.target.value)}
            style={{ ...inp(), cursor: 'pointer', width: '100%' }}
          >
            {[
              ['America/New_York',      'Eastern Time (ET) — New York'],
              ['America/Chicago',       'Central Time (CT) — Chicago'],
              ['America/Denver',        'Mountain Time (MT) — Denver'],
              ['America/Los_Angeles',   'Pacific Time (PT) — Los Angeles / Las Vegas'],
              ['America/Phoenix',       'Arizona (MST, no DST)'],
              ['America/Anchorage',     'Alaska Time (AKT)'],
              ['Pacific/Honolulu',      'Hawaii Time (HST)'],
              ['America/Puerto_Rico',   'Puerto Rico (AST)'],
              ['America/Sao_Paulo',     'Brasília Time (BRT)'],
              ['Europe/London',         'GMT / London (BST)'],
              ['Europe/Paris',          'Central European (CET/CEST)'],
              ['UTC',                   'UTC'],
            ].map(([tz, label]) => (
              <option key={tz} value={tz}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── D. Users ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        D — USERS &amp; CLOCK
      </div>
      <div style={{ marginBottom: 20 }}>
        <PrefGroup icon="🕒" title="Clock In / Out Adjustments">
          <div style={{ paddingTop: 10, paddingBottom: 6 }}>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <div>
                <p style={{ color: TEXT, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Add to first clock-in <StatusBadge />
                </p>
                <NumInput value={form.addMinutesFirstClockIn} onChange={v => set('addMinutesFirstClockIn', v)} suffix="min" />
              </div>
              <div>
                <p style={{ color: TEXT, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Add to last clock-out <StatusBadge />
                </p>
                <NumInput value={form.addMinutesLastClockOut} onChange={v => set('addMinutesLastClockOut', v)} suffix="min" />
              </div>
              <div>
                <p style={{ color: TEXT, fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                  Auto clock-out after <StatusBadge />
                </p>
                <NumInput value={form.autoClockOutAfter} onChange={v => set('autoClockOutAfter', v)} suffix="hrs (0 = off)" width={80} />
              </div>
            </div>
          </div>
        </PrefGroup>
      </div>

      {/* ── E. Inventory ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        E — INVENTORY
      </div>
      <div style={{ marginBottom: 20 }}>
        <PrefGroup icon="📦" title="Stock Control &amp; Display" defaultOpen>
          <Toggle
            label={<>Block sale of items out of stock <StatusBadge live /></>}
            checked={form.blockSaleOutOfStock}
            onChange={v => set('blockSaleOutOfStock', v)}
            description="Prevents adding a product with 0 quantity to the cart"
          />
          <Toggle
            label={<>Hide quantity in the inventory count screen <StatusBadge /></>}
            checked={form.hideQtyInInventoryCount}
            onChange={v => set('hideQtyInInventoryCount', v)}
          />
          <Toggle
            label={<>Hide status column in the inventory count screen <StatusBadge /></>}
            checked={form.hideStatusInInventoryCount}
            onChange={v => set('hideStatusInInventoryCount', v)}
          />
        </PrefGroup>
      </div>

      {/* ── F. Inventory History ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        F — INVENTORY HISTORY
      </div>
      <div style={{ marginBottom: 20 }}>
        <PrefGroup icon="📊" title="Automated Snapshots">
          <Toggle
            label={<>Save Inventory History <StatusBadge /></>}
            checked={form.saveInventoryHistory}
            onChange={v => set('saveInventoryHistory', v)}
            description="Periodically capture a snapshot of inventory levels"
          />
          {form.saveInventoryHistory && (
            <Row>
              <Field label="FREQUENCY" half>
                <select
                  value={form.inventoryHistoryFrequency}
                  onChange={e => set('inventoryHistoryFrequency', e.target.value)}
                  style={{ ...inp(), cursor: 'pointer' }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <Field label="SNAPSHOT TIME (HH:MM)" half>
                <input
                  type="time"
                  value={form.inventoryHistoryTime}
                  onChange={e => set('inventoryHistoryTime', e.target.value)}
                  style={inp()}
                />
              </Field>
            </Row>
          )}
        </PrefGroup>
      </div>

      {/* ── G. Reports ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        G — REPORTS
      </div>
      <div style={{ marginBottom: 20 }}>
        <PrefGroup icon="📈" title="Visibility &amp; Access" defaultOpen>
          <Toggle
            label={<>Hide the location totals until they are printed <StatusBadge /></>}
            checked={form.hideTotalsUntilPrinted}
            onChange={v => set('hideTotalsUntilPrinted', v)}
          />
          <Toggle
            label={<>Hide inventory changes in the end of day report <StatusBadge /></>}
            checked={form.hideInventoryChangesInEOD}
            onChange={v => set('hideInventoryChangesInEOD', v)}
          />
          <Toggle
            label={<>Hide sales per employee in the end of day report <StatusBadge /></>}
            checked={form.hideSalesPerEmployeeInEOD}
            onChange={v => set('hideSalesPerEmployeeInEOD', v)}
          />
          <Toggle
            label={<>Print Master Z in the end of day report <StatusBadge /></>}
            checked={form.printMasterZInEOD}
            onChange={v => set('printMasterZInEOD', v)}
          />
          <Toggle
            label={<>Block employees from reviewing their salaries <StatusBadge /></>}
            checked={form.blockEmployeeSalaryReview}
            onChange={v => set('blockEmployeeSalaryReview', v)}
          />
          <Toggle
            label={<>Block employees from reviewing salaries via mobile app <StatusBadge /></>}
            checked={form.blockEmployeeSalaryMobile}
            onChange={v => set('blockEmployeeSalaryMobile', v)}
          />
        </PrefGroup>
      </div>

      {/* ── H. Price List ── */}
      <div style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.8, marginBottom: 8 }}>
        H — PRICE LIST
      </div>
      <div style={{ marginBottom: 28 }}>
        <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '14px 16px' }}>
          <p style={{ color: TEXT, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>Price List linked to this location</p>
          <p style={{ color: MUTED, fontSize: 11, marginBottom: 10 }}>
            Determines which price list is applied to products sold at this location. Must match a configured price list name.
          </p>
          <input
            value={form.priceList}
            onChange={e => set('priceList', e.target.value)}
            placeholder="e.g. Las Vegas Pricelist"
            style={inp()}
          />
        </div>
      </div>

      {/* ── Copy Preferences ── */}
      <div style={{
        background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.18)',
        borderRadius: 10, padding: '16px 18px',
      }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⧉ Copy Preferences from Another Location</p>
        <p style={{ color: MUTED, fontSize: 11, marginBottom: 14 }}>
          Copies all preference settings (Sales, Security, Timezone, Users, Inventory, Reports) from the selected location.
          Identity fields (name, address, manager, tax rate, receipt) are preserved.
        </p>

        {copyDone && (
          <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: GREEN, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
            ✓ Preferences copied successfully. Remember to save the location.
          </div>
        )}

        {!confirmCopy ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={copyFrom}
              onChange={e => { setCopyFrom(e.target.value); setConfirmCopy(false) }}
              style={{ ...inp(), width: 240, cursor: 'pointer' }}
            >
              <option value="">— Select source location —</option>
              {otherLocations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <button
              disabled={!copyFrom}
              onClick={() => setConfirmCopy(true)}
              style={{
                padding: '7px 16px', borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: copyFrom ? 'pointer' : 'not-allowed',
                background: copyFrom ? BLUE : '#1e293b', border: 'none', color: copyFrom ? '#fff' : MUTED,
                transition: 'all 0.15s',
              }}
            >
              Copy Preferences
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ color: AMBER, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              ⚠ This will overwrite all preference settings of <b>{form.name}</b> with those from <b>{otherLocations.find(l => l.id === copyFrom)?.name}</b>.
            </p>
            <p style={{ color: MUTED, fontSize: 11, marginBottom: 12 }}>
              Identity fields (name, address, manager, tax, receipts) will not be changed. This action only applies after you click Save Location.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={executeCopy}
                style={{ padding: '7px 18px', borderRadius: 4, background: AMBER, border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Yes, copy preferences
              </button>
              <button
                onClick={() => { setConfirmCopy(false); setCopyFrom('') }}
                style={{ padding: '7px 14px', borderRadius: 4, background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

function TabMerchant({ form, set }) {
  return (
    <div>
      <Section title="Payment Processing" sub="Merchant account credentials for this location">
        <Row>
          <Field label="MERCHANT ACCOUNT ID" half>
            <input value={form.merchantAccountId} onChange={e => set('merchantAccountId', e.target.value)} style={inp()} placeholder="e.g. 4445064190630" />
          </Field>
          <Field label="TERMINAL ID" half>
            <input value={form.terminalId} onChange={e => set('terminalId', e.target.value)} style={inp()} />
          </Field>
        </Row>
        <Row>
          <Field label="PROCESSOR NAME" half>
            <input value={form.processorName} onChange={e => set('processorName', e.target.value)} style={inp()} placeholder="e.g. Square, Stripe, Heartland" />
          </Field>
        </Row>
      </Section>

      <Section title="Accepted Payment Methods" sub="Enable or disable payment types accepted at this location">
        <Toggle label="Cash" checked={form.acceptCash} onChange={v => set('acceptCash', v)} description="Accept cash payments" />
        <Toggle label="Credit Card" checked={form.acceptCard} onChange={v => set('acceptCard', v)} description="Accept card payments via terminal" />
        <Toggle label="External Credit" checked={form.acceptExtCredit} onChange={v => set('acceptExtCredit', v)} description="Accept external credit / wire / transfer" />
        <Toggle label="Check" checked={form.acceptCheck} onChange={v => set('acceptCheck', v)} description="Accept check payments" />
      </Section>

      <Placeholder
        icon="💳"
        label="Card reader integration coming soon"
        description="Connect physical card terminals, configure card types (Visa, Amex, MC, Discover), and manage card processing rules per location."
      />
    </div>
  )
}

// ── Competition configuration card ────────────────────────────────────────────
function CompetitionCard({ form, set, allLocations = [] }) {
  const enabled  = !!form.featureCompetition
  const mode     = form.competitionMode     || 'individual_total'
  const timeframe = form.competitionTimeframe || 'daily'
  const viewTop  = Number(form.competitionViewTop  ?? 5)

  const regions = useMemo(() => {
    const s = new Set(allLocations.map(l => l.region).filter(Boolean))
    return [...s].sort()
  }, [allLocations])

  const TEAMWORK = [
    { id: 'teamwork_total',    label: 'Total Sales',    desc: 'Sum of revenue by location'     },
    { id: 'teamwork_highest',  label: 'Highest Sale',   desc: 'Best single transaction'        },
    { id: 'teamwork_products', label: '# Products',     desc: 'Total items sold by location'   },
  ]
  const INDIVIDUAL = [
    { id: 'individual_total',    label: 'Total Sales',  desc: 'Sum of revenue by employee'     },
    { id: 'individual_highest',  label: 'Highest Sale', desc: 'Best single transaction'        },
    { id: 'individual_products', label: '# Products',   desc: 'Total items sold by employee'   },
  ]
  const VIEW_TOP_OPTIONS = [3, 5, 10, 12, 0]  // 0 = All

  const modeBtn = (m) => {
    const active = mode === m.id
    return (
      <button key={m.id} onClick={() => set('competitionMode', m.id)} style={{
        flex: 1, padding: '9px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
        border: `1px solid ${active ? BLUE : BORDER}`,
        background: active ? `${BLUE}18` : 'transparent',
        color: active ? TEXT : MUTED,
        transition: 'all 0.15s', boxShadow: active ? `0 0 10px ${BLUE}20` : 'none',
      }}>
        <div style={{ fontSize: 11, fontWeight: active ? 700 : 600, marginBottom: 1 }}>{m.label}</div>
        <div style={{ fontSize: 9, color: active ? '#94a3b8' : '#334155' }}>{m.desc}</div>
      </button>
    )
  }

  return (
    <div style={{ marginBottom: 18 }}>
      {/* ── Toggle header ── */}
      <div style={{
        background: CARD,
        border: `1px solid ${enabled ? 'rgba(37,99,235,0.3)' : BORDER}`,
        borderRadius: enabled ? '8px 8px 0 0' : 8,
        padding: '0 16px', transition: 'border-color 0.15s',
      }}>
        <Toggle
          label="🏆  Competition / Podium"
          checked={enabled}
          onChange={v => set('featureCompetition', v)}
          description="Real-time sales competition — configure type, timeframe and display options below"
        />
      </div>

      {/* ── Config panel ── */}
      {enabled && (
        <div style={{
          background: '#060c1a',
          border: `1px solid rgba(37,99,235,0.2)`, borderTop: 'none',
          borderRadius: '0 0 8px 8px', padding: '18px 16px',
        }}>

          {/* None */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>NO COMPETITION</p>
            <button
              onClick={() => set('competitionMode', 'none')}
              style={{
                padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                border: `1px solid ${mode === 'none' ? '#64748b' : BORDER}`,
                background: mode === 'none' ? 'rgba(100,116,139,0.15)' : 'transparent',
                color: mode === 'none' ? '#94a3b8' : MUTED, transition: 'all 0.15s',
              }}
            >
              None — competition screen shows "no competition configured"
            </button>
          </div>

          {/* Teamwork */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
              🤝 TEAMWORK — Ranked by Location
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {TEAMWORK.map(modeBtn)}
            </div>
          </div>

          {/* Individual */}
          <div style={{ marginBottom: 20 }}>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>
              👤 INDIVIDUAL — Ranked by Employee
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {INDIVIDUAL.map(modeBtn)}
            </div>
          </div>

          {mode !== 'none' && (
            <>
              <div style={{ borderTop: `1px solid ${BORDER}`, margin: '4px 0 18px' }} />

              {/* Timeframe */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>COMPETITION TIMEFRAME</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v, l]) => {
                    const active = timeframe === v
                    return (
                      <button key={v} onClick={() => set('competitionTimeframe', v)} style={{
                        flex: 1, padding: '9px', borderRadius: 6, fontSize: 12,
                        fontWeight: active ? 700 : 400,
                        border: `1px solid ${active ? BLUE : BORDER}`,
                        background: active ? `${BLUE}18` : 'transparent',
                        color: active ? TEXT : MUTED, cursor: 'pointer', transition: 'all 0.15s',
                      }}>{l}</button>
                    )
                  })}
                </div>
              </div>

              {/* View Top */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 8 }}>VIEW TOP</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {VIEW_TOP_OPTIONS.map(n => {
                    const active = viewTop === n
                    return (
                      <button key={n} onClick={() => set('competitionViewTop', n)} style={{
                        flex: 1, padding: '9px', borderRadius: 6, fontSize: 12,
                        fontWeight: active ? 700 : 400,
                        border: `1px solid ${active ? BLUE : BORDER}`,
                        background: active ? `${BLUE}18` : 'transparent',
                        color: active ? TEXT : MUTED, cursor: 'pointer', transition: 'all 0.15s',
                      }}>{n === 0 ? 'All' : n}</button>
                    )
                  })}
                </div>
              </div>

              {/* Show Ranking Only */}
              <div style={{ marginBottom: regions.length > 0 ? 16 : 4 }}>
                <Toggle
                  label="Show Ranking Only (no podium)"
                  checked={!!form.competitionShowRankingOnly}
                  onChange={v => set('competitionShowRankingOnly', v)}
                  description="Displays an ordered list instead of the animated 1st/2nd/3rd podium"
                />
              </div>

              {/* Regions */}
              {regions.length > 0 && (
                <div style={{ paddingBottom: 8 }}>
                  <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.6, marginBottom: 4 }}>
                    SELECT REGIONS
                    <span style={{ color: '#334155', fontWeight: 400, marginLeft: 8, letterSpacing: 0 }}>○ saved — regional filter wired in future update</span>
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    {regions.map(r => {
                      const sel = (form.competitionRegions || []).includes(r)
                      return (
                        <button key={r} onClick={() => {
                          const cur = form.competitionRegions || []
                          set('competitionRegions', sel ? cur.filter(x => x !== r) : [...cur, r])
                        }} style={{
                          padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: sel ? 700 : 400,
                          border: `1px solid ${sel ? BLUE : BORDER}`,
                          background: sel ? `${BLUE}15` : 'transparent',
                          color: sel ? TEXT : MUTED, cursor: 'pointer', transition: 'all 0.15s',
                        }}>{r}</button>
                      )
                    })}
                  </div>
                  <p style={{ color: '#334155', fontSize: 10 }}>
                    Leave empty to include all regions. Selection is saved and will take effect once regional filtering is wired.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Other features ─────────────────────────────────────────────────────────────
function TabFeatures({ form, set, allLocations = [] }) {
  const otherFeatures = [
    { key: 'featureCRM',          label: 'CRM',                    icon: '👥', desc: 'Customer management and SMS follow-up' },
    { key: 'featureClockInOut',   label: 'Clock In / Out',         icon: '🕒', desc: 'Employee time tracking at this location' },
    { key: 'featureLayaway',      label: 'Layaway',                icon: '📦', desc: 'Allow customers to reserve items with partial payment' },
    { key: 'featureGiftCards',    label: 'Gift Cards',             icon: '🎁', desc: 'Issue and redeem gift cards' },
    { key: 'featureQuotes',       label: 'Quotes',                 icon: '📋', desc: 'Create and send price quotes to customers' },
    { key: 'featureAppointments', label: 'Appointments',           icon: '📅', desc: 'Schedule customer appointments' },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 13 }}>Location Features</p>
        <p style={{ color: MUTED, fontSize: 11, marginTop: 2 }}>Enable or disable modules and configure them for this specific location.</p>
      </div>

      {/* Competition — special expanded card */}
      <CompetitionCard form={form} set={set} allLocations={allLocations} />

      {/* Other features */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '16px 16px 4px' }}>
        {otherFeatures.map(f => (
          <Toggle key={f.key}
            label={`${f.icon}  ${f.label}`}
            checked={!!form[f.key]}
            onChange={v => set(f.key, v)}
            description={f.desc}
          />
        ))}
      </div>
    </div>
  )
}

function TabIntegration({ form, set }) {
  return (
    <div>
      <Section title="External System" sub="Identifiers for connecting this location to external platforms">
        <Row>
          <Field label="EXTERNAL SYSTEM ID" half>
            <input value={form.externalSystemId} onChange={e => set('externalSystemId', e.target.value)} style={inp()} placeholder="e.g. nova-loc-001" />
          </Field>
          <Field label="SYNC MODE" half>
            <select value={form.syncMode} onChange={e => set('syncMode', e.target.value)} style={{ ...inp(), cursor: 'pointer' }}>
              <option value="manual">Manual</option>
              <option value="auto">Automatic</option>
              <option value="disabled">Disabled</option>
            </select>
          </Field>
        </Row>
        <Row>
          <Field label="API ENDPOINT (future)">
            <input value={form.apiEndpoint} onChange={e => set('apiEndpoint', e.target.value)} style={inp()} placeholder="https://api.example.com/location/..." />
          </Field>
        </Row>
        <Row>
          <Field label="INTEGRATION NOTES">
            <textarea value={form.integrationNotes} onChange={e => set('integrationNotes', e.target.value)} rows={3} style={{ ...inp(), resize: 'vertical', fontFamily: 'inherit' }} />
          </Field>
        </Row>
      </Section>

      <Placeholder
        icon="🔗"
        label="Integrations coming soon"
        description="Connect this location to accounting software, e-commerce platforms, loyalty programs, and external reporting tools."
      />
    </div>
  )
}

// ─── Alerts / Notifications ───────────────────────────────────────────────────

const CHANNELS = [
  { key: 'sms',       label: 'SMS',   icon: '📱', color: '#22c55e', future: false },
  { key: 'email',     label: 'Email', icon: '✉',  color: '#2563eb', future: false },
  { key: 'mobileApp', label: 'App',   icon: '📲', color: '#8b5cf6', future: false },
  { key: 'whatsapp',  label: 'WA',    icon: '💬', color: '#25D366', future: true  },
]

const ALERT_GROUPS = [
  {
    group: 'A — Location Events',
    items: [
      { key: 'openLocation',  label: 'Open Location',  icon: '🔓', desc: 'Alert when the location is opened for business' },
      { key: 'closeLocation', label: 'Close Location', icon: '🔒', desc: 'Alert when the location is closed for the day'  },
    ],
  },
  {
    group: 'B — Employee Events',
    items: [
      { key: 'employeeCheckIn',      label: 'Employee Check In',      icon: '🟢', desc: 'Alert every time an employee clocks in'        },
      { key: 'employeeCheckOut',     label: 'Employee Check Out',     icon: '🔴', desc: 'Alert every time an employee clocks out'       },
      { key: 'employeeHoursChanged', label: 'Employee Hours Changed', icon: '✏️', desc: 'Alert when employee hours are manually edited'  },
    ],
  },
  {
    group: 'C — Future Alerts',
    future: true,
    items: [
      { key: 'lowStock',       label: 'Low Stock Alert',   icon: '📦', desc: 'Alert when a product falls below minimum threshold'  },
      { key: 'highSaleAlert',  label: 'High Sale Alert',   icon: '💰', desc: 'Alert when a single sale exceeds a configured amount' },
      { key: 'endOfDayReport', label: 'End of Day Report', icon: '📊', desc: 'Send the EOD summary to selected recipients'          },
    ],
  },
]

function alertInitials(name = '') {
  const p = name.trim().split(/\s+/)
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase()
}

// ── Single recipient row ──────────────────────────────────────────────────────
function RecipientRow({ user, channels = {}, onChannelToggle, onRemove }) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ')

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '9px 0', borderBottom: `1px solid rgba(30,41,59,0.5)`,
      flexWrap: 'wrap',
    }}>
      {/* Avatar */}
      <div style={{
        width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
        background: 'linear-gradient(135deg, #2563eb88, #7c3aed88)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 700, color: '#fff',
      }}>
        {alertInitials(fullName)}
      </div>

      {/* Name + role */}
      <div style={{ flex: '1 1 100px', minWidth: 0 }}>
        <div style={{ color: TEXT, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName}</div>
        <div style={{ color: MUTED, fontSize: 10 }}>{user.position}</div>
      </div>

      {/* Contact */}
      <div style={{ fontSize: 10, width: 148, flexShrink: 0, lineHeight: 1.6 }}>
        <div style={{ color: user.phone ? '#94a3b8' : '#2d3748' }}>📱 {user.phone || 'No phone'}</div>
        <div style={{ color: user.email ? '#94a3b8' : '#2d3748' }}>✉ {user.email ? (user.email.length > 18 ? user.email.slice(0,18)+'…' : user.email) : 'No email'}</div>
      </div>

      {/* Channel toggles */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        {CHANNELS.map(ch => {
          const active   = !ch.future && !!channels[ch.key]
          const noData   = ch.key === 'sms' ? !user.phone : ch.key === 'email' ? !user.email : false
          const disabled = ch.future || noData
          return (
            <button
              key={ch.key}
              onClick={() => !disabled && onChannelToggle(ch.key, !channels[ch.key])}
              title={ch.future ? `${ch.label} — coming soon` : noData ? `User has no ${ch.label} registered` : ch.label}
              style={{
                padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                border: `1px solid ${active ? ch.color : BORDER}`,
                background: active ? `${ch.color}1e` : 'transparent',
                color: active ? ch.color : disabled ? '#1e293b' : MUTED,
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: ch.future ? 0.45 : 1,
                transition: 'all 0.12s',
              }}
            >
              {ch.icon} {ch.label}
            </button>
          )
        })}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        title="Remove recipient"
        style={{ background: 'none', border: 'none', color: '#2d3748', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1, flexShrink: 0, transition: 'color 0.12s' }}
        onMouseEnter={e => { e.currentTarget.style.color = RED }}
        onMouseLeave={e => { e.currentTarget.style.color = '#2d3748' }}
      >✕</button>
    </div>
  )
}

// ── One alert event block ─────────────────────────────────────────────────────
function AlertBlock({ alertKey, label, desc, icon, isFuture, alertData, allUsers, onUpdate }) {
  const [showAdd,     setShowAdd]     = useState(false)
  const [selectedId,  setSelectedId]  = useState('')

  const data       = alertData || { enabled: false, recipients: [] }
  const recipients = data.recipients || []
  const usedIds    = new Set(recipients.map(r => r.userId))
  const available  = allUsers.filter(u => !usedIds.has(u.id))

  function setEnabled(v) {
    onUpdate({ ...data, enabled: v })
  }
  function addRecipient() {
    const uid = Number(selectedId)
    if (!uid) return
    onUpdate({
      ...data,
      recipients: [...recipients, { userId: uid, channels: { sms: false, email: false, mobileApp: false, whatsapp: false } }],
    })
    setSelectedId('')
    setShowAdd(false)
  }
  function removeRecipient(uid) {
    onUpdate({ ...data, recipients: recipients.filter(r => r.userId !== uid) })
  }
  function toggleChannel(uid, ch, v) {
    onUpdate({
      ...data,
      recipients: recipients.map(r => r.userId !== uid ? r : { ...r, channels: { ...r.channels, [ch]: v } }),
    })
  }

  return (
    <div>
      {/* Toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: `1px solid rgba(30,41,59,0.45)` }}>
        {/* Mini toggle */}
        <button
          onClick={() => setEnabled(!data.enabled)}
          style={{
            width: 34, height: 19, borderRadius: 10, border: 'none',
            background: data.enabled ? BLUE : '#1e293b',
            position: 'relative', flexShrink: 0, cursor: 'pointer', transition: 'background 0.2s',
          }}
        >
          <div style={{
            width: 13, height: 13, borderRadius: '50%', background: '#fff',
            position: 'absolute', top: 3, transition: 'left 0.2s',
            left: data.enabled ? 17 : 3,
          }} />
        </button>

        <span style={{ fontSize: 15, flexShrink: 0 }}>{icon}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: data.enabled ? TEXT : MUTED, fontSize: 12, fontWeight: 600 }}>{label}</span>
            {isFuture && <StatusBadge />}
          </div>
          <div style={{ color: MUTED, fontSize: 11, marginTop: 1 }}>{desc}</div>
        </div>

        {data.enabled && (
          <span style={{ color: MUTED, fontSize: 10, flexShrink: 0 }}>
            {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Recipients panel */}
      {data.enabled && (
        <div style={{ paddingLeft: 44, paddingBottom: 10 }}>
          {recipients.length === 0 && (
            <p style={{ color: '#2d3748', fontSize: 11, padding: '8px 0' }}>No recipients configured. Add at least one below.</p>
          )}

          {recipients.map(r => {
            const user = allUsers.find(u => u.id === r.userId)
            if (!user) return null
            return (
              <RecipientRow
                key={r.userId}
                user={user}
                channels={r.channels}
                onChannelToggle={(ch, v) => toggleChannel(r.userId, ch, v)}
                onRemove={() => removeRecipient(r.userId)}
              />
            )
          })}

          {/* Add recipient row */}
          <div style={{ paddingTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            {!showAdd && available.length > 0 && (
              <button
                onClick={() => setShowAdd(true)}
                style={{
                  padding: '5px 14px', borderRadius: 5, border: `1px dashed ${BORDER}`,
                  background: 'transparent', color: MUTED, fontSize: 11, cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = BLUE; e.currentTarget.style.color = TEXT }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED }}
              >
                + Add Recipient
              </button>
            )}
            {showAdd && (
              <>
                <select
                  value={selectedId}
                  onChange={e => setSelectedId(e.target.value)}
                  style={{ ...inp(), width: 220, cursor: 'pointer' }}
                  autoFocus
                >
                  <option value="">— Select user —</option>
                  {available.map(u => {
                    const name = [u.firstName, u.lastName].filter(Boolean).join(' ')
                    return <option key={u.id} value={u.id}>{name} · {u.position}</option>
                  })}
                </select>
                <button
                  onClick={addRecipient}
                  disabled={!selectedId}
                  style={{
                    padding: '5px 14px', borderRadius: 5, border: 'none', fontSize: 11, fontWeight: 700,
                    background: selectedId ? BLUE : '#1e293b',
                    color: selectedId ? '#fff' : MUTED,
                    cursor: selectedId ? 'pointer' : 'not-allowed',
                  }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAdd(false); setSelectedId('') }}
                  style={{ padding: '5px 10px', borderRadius: 5, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 11, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </>
            )}
            {!showAdd && available.length === 0 && recipients.length > 0 && (
              <p style={{ color: '#2d3748', fontSize: 10 }}>All active users have been added.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Alerts tab ────────────────────────────────────────────────────────────────
function TabAlerts({ form, set, allLocations = [] }) {
  const allUsers = useMemo(() => loadUsers().filter(u => u.status === 'active'), [])

  const [copyFrom,    setCopyFrom]    = useState('')
  const [confirmCopy, setConfirmCopy] = useState(false)
  const [copyDone,    setCopyDone]    = useState(false)

  const alerts         = form.locationAlerts || {}
  const otherLocations = allLocations.filter(l => l.id !== form.id)

  function updateAlert(alertKey, value) {
    set('locationAlerts', { ...alerts, [alertKey]: value })
  }

  function executeCopy() {
    const src = allLocations.find(l => l.id === copyFrom)
    if (!src?.locationAlerts) return
    // Deep copy so mutations don't bleed across locations
    set('locationAlerts', JSON.parse(JSON.stringify(src.locationAlerts)))
    setConfirmCopy(false)
    setCopyFrom('')
    setCopyDone(true)
    setTimeout(() => setCopyDone(false), 3500)
  }

  return (
    <div>

      {/* ── Info banner ── */}
      <div style={{
        background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.15)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 24,
        display: 'flex', gap: 10, alignItems: 'flex-start',
      }}>
        <span style={{ fontSize: 16, flexShrink: 0 }}>ℹ️</span>
        <div>
          <p style={{ color: '#60a5fa', fontSize: 12, fontWeight: 600, marginBottom: 2 }}>Alert channels are structured — sending not yet wired</p>
          <p style={{ color: MUTED, fontSize: 11, lineHeight: 1.5 }}>
            Configure which users receive each alert via SMS, Email, App or WhatsApp.
            The rules are saved per location and ready for integration with the notification backend.
          </p>
        </div>
      </div>

      {/* ── Alert groups ── */}
      {ALERT_GROUPS.map(group => (
        <div key={group.group} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <p style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.7 }}>{group.group}</p>
            {group.future && <StatusBadge />}
          </div>
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '0 16px' }}>
            {group.items.map((item, idx) => (
              <AlertBlock
                key={item.key}
                alertKey={item.key}
                label={item.label}
                desc={item.desc}
                icon={item.icon}
                isFuture={!!group.future}
                alertData={alerts[item.key]}
                allUsers={allUsers}
                onUpdate={v => updateAlert(item.key, v)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* ── Copy Alerts ── */}
      <div style={{
        background: 'rgba(37,99,235,0.05)', border: '1px solid rgba(37,99,235,0.18)',
        borderRadius: 10, padding: '16px 18px',
      }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>⧉ Copy Alerts from Another Location</p>
        <p style={{ color: MUTED, fontSize: 11, marginBottom: 14 }}>
          Copies all alert rules (events, recipients, channels) from the selected location into this one.
          Recipient users are copied by ID — make sure the same users exist here.
        </p>

        {copyDone && (
          <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, color: GREEN, fontSize: 12, fontWeight: 600, marginBottom: 12 }}>
            ✓ Alerts copied successfully. Click Save Location to persist.
          </div>
        )}

        {otherLocations.length === 0 ? (
          <p style={{ color: '#2d3748', fontSize: 12 }}>No other locations available to copy from.</p>
        ) : !confirmCopy ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={copyFrom}
              onChange={e => { setCopyFrom(e.target.value); setConfirmCopy(false) }}
              style={{ ...inp(), width: 240, cursor: 'pointer' }}
            >
              <option value="">— Select source location —</option>
              {otherLocations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <button
              disabled={!copyFrom}
              onClick={() => setConfirmCopy(true)}
              style={{
                padding: '7px 16px', borderRadius: 4, fontSize: 12, fontWeight: 700,
                background: copyFrom ? BLUE : '#1e293b', border: 'none',
                color: copyFrom ? '#fff' : MUTED,
                cursor: copyFrom ? 'pointer' : 'not-allowed', transition: 'all 0.15s',
              }}
            >
              Copy Alerts
            </button>
          </div>
        ) : (
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 8, padding: '12px 14px' }}>
            <p style={{ color: AMBER, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
              ⚠ This will overwrite all alert rules of <b>{form.name}</b> with those from{' '}
              <b>{otherLocations.find(l => l.id === copyFrom)?.name}</b>.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={executeCopy}
                style={{ padding: '7px 18px', borderRadius: 4, background: AMBER, border: 'none', color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Yes, copy alerts
              </button>
              <button
                onClick={() => { setConfirmCopy(false); setCopyFrom('') }}
                style={{ padding: '7px 14px', borderRadius: 4, background: 'transparent', border: `1px solid ${BORDER}`, color: MUTED, fontSize: 12, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

// ─── Edit Screen ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'info',        label: 'Location Information' },
  { id: 'prefs',       label: 'Location Preferences' },
  { id: 'merchant',    label: 'Merchant Services'     },
  { id: 'features',    label: 'Extra Features'        },
  { id: 'alerts',      label: 'Alerts'                },
  { id: 'integration', label: 'Integration'           },
]

function EditLocation({ location, onSave, onCancel, allLocations }) {
  const [tab,    setTab]    = useState('info')
  const [form,   setForm]   = useState({ ...location })
  const [saved,  setSaved]  = useState(false)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  const handleSave = () => {
    onSave({ ...form, updatedAt: new Date().toISOString() })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const isExisting = !!location.createdAt && location.id.startsWith('loc_0') &&
    ['loc_01', 'loc_02'].includes(location.id)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Sub-header */}
      <div style={{ padding: '10px 20px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>←</button>
        <span style={{ color: LOC_COLOR, fontSize: 14 }}>📍</span>
        <span style={{ color: TEXT, fontWeight: 700, fontSize: 14 }}>{form.name || 'New Location'}</span>
        {form.active
          ? <span style={{ padding: '2px 8px', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 10, color: GREEN, fontSize: 10, fontWeight: 700 }}>ACTIVE</span>
          : <span style={{ padding: '2px 8px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: RED, fontSize: 10, fontWeight: 700 }}>INACTIVE</span>
        }
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={{ padding: '7px 16px', background: 'transparent', border: `1px solid ${BORDER}`, borderRadius: 4, color: MUTED, fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{
            padding: '7px 20px', background: saved ? GREEN : BLUE, border: 'none',
            borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'background 0.3s',
          }}>
            {saved ? '✓ Saved!' : '💾 Save Location'}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: PANEL, borderBottom: `1px solid ${BORDER}`, display: 'flex', padding: '0 20px', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '11px 18px', border: 'none', cursor: 'pointer', fontSize: 12,
            fontWeight: tab === t.id ? 700 : 400,
            background: 'transparent',
            color: tab === t.id ? TEXT : MUTED,
            borderBottom: tab === t.id ? `2px solid ${LOC_COLOR}` : '2px solid transparent',
            transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 40px' }}>
        {tab === 'info'        && <TabInformation form={form} set={set} isExisting={isExisting} />}
        {tab === 'prefs'       && <TabPreferences  form={form} set={set} allLocations={allLocations} />}
        {tab === 'merchant'    && <TabMerchant      form={form} set={set} />}
        {tab === 'features'    && <TabFeatures      form={form} set={set} allLocations={allLocations} />}
        {tab === 'alerts'      && <TabAlerts        form={form} set={set} allLocations={allLocations} />}
        {tab === 'integration' && <TabIntegration   form={form} set={set} />}
      </div>
    </div>
  )
}

// ─── List Screen ──────────────────────────────────────────────────────────────
function LocationList({ locations, onEdit, onAdd }) {
  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const counts = useMemo(() => ({
    active:   locations.filter(l => l.active !== false).length,
    inactive: locations.filter(l => l.active === false).length,
    all:      locations.length,
  }), [locations])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return locations.filter(l => {
      const matchStatus = statusFilter === 'all'
        ? true
        : statusFilter === 'active'
          ? l.active !== false
          : l.active === false
      const matchSearch = !q || l.name.toLowerCase().includes(q) || (l.address || '').toLowerCase().includes(q)
      return matchStatus && matchSearch
    })
  }, [locations, search, statusFilter])

  const thS = { padding: '8px 12px', color: MUTED, fontWeight: 600, fontSize: 10, background: CARD, borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', letterSpacing: 0.4, textAlign: 'left' }
  const tdS = { padding: '10px 12px', fontSize: 12, color: DIM, borderBottom: `1px solid rgba(30,41,59,0.4)`, verticalAlign: 'middle' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search locations..."
          style={{ padding: '6px 12px', background: BG, border: `1px solid ${BORDER}`, borderRadius: 4, color: TEXT, fontSize: 13, width: 220, outline: 'none' }}
          onFocus={e => { e.target.style.borderColor = BLUE }}
          onBlur={e => { e.target.style.borderColor = BORDER }}
        />

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: 2, background: BG, border: `1px solid ${BORDER}`, borderRadius: 6, padding: 2 }}>
          {[
            { id: 'active',   label: 'Active',   color: GREEN },
            { id: 'inactive', label: 'Inactive', color: RED   },
            { id: 'all',      label: 'All',      color: MUTED },
          ].map(({ id, label, color }) => (
            <button key={id} onClick={() => setStatusFilter(id)} style={{
              padding: '4px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, transition: 'all 0.15s',
              background: statusFilter === id ? `${color}18` : 'transparent',
              color: statusFilter === id ? color : '#475569',
              outline: statusFilter === id ? `1px solid ${color}40` : 'none',
            }}>
              {label} <span style={{ opacity: 0.7 }}>{counts[id]}</span>
            </button>
          ))}
        </div>

        <span style={{ color: MUTED, fontSize: 12 }}>{filtered.length} location{filtered.length !== 1 ? 's' : ''}</span>

        <button onClick={onAdd} style={{
          marginLeft: 'auto', padding: '7px 16px', background: LOC_COLOR, border: 'none',
          borderRadius: 4, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        }}>📍 Add Location</button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 900 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {['#','Location Name','Address','Phone','Merchant #','Manager','Region','Status','Price List',''].map((h, i) => (
                <th key={i} style={{ ...thS, textAlign: i === 0 ? 'center' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 48, textAlign: 'center', color: '#334155' }}>No locations found</td></tr>
            )}
            {filtered.map((loc, i) => {
              const isActive = loc.active !== false
              return (
                <tr key={loc.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.4)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(231,76,60,0.04)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(15,23,42,0.4)' }}
                  onClick={() => onEdit(loc)}
                >
                  <td style={{ ...tdS, textAlign: 'center', color: '#334155', fontSize: 10 }}>{i + 1}</td>
                  <td style={{ ...tdS }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 14 }}>📍</span>
                      <span style={{ color: TEXT, fontWeight: 600 }}>{loc.name}</span>
                    </div>
                  </td>
                  <td style={{ ...tdS, maxWidth: 180 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {loc.address || <span style={{ color: '#334155' }}>—</span>}
                    </span>
                  </td>
                  <td style={tdS}>{loc.phone || <span style={{ color: '#334155' }}>—</span>}</td>
                  <td style={{ ...tdS, fontFamily: 'monospace', fontSize: 10 }}>{loc.merchantNumber || <span style={{ color: '#334155' }}>—</span>}</td>
                  <td style={tdS}>{loc.manager || <span style={{ color: '#334155' }}>—</span>}</td>
                  <td style={tdS}>{loc.region || <span style={{ color: '#334155' }}>—</span>}</td>
                  <td style={tdS}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      background: isActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                      border: `1px solid ${isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                      color: isActive ? GREEN : RED,
                    }}>{isActive ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td style={{ ...tdS, color: MUTED, fontSize: 11 }}>{loc.priceList || <span style={{ color: '#334155' }}>—</span>}</td>
                  <td style={tdS} onClick={e => { e.stopPropagation(); onEdit(loc) }}>
                    <button style={{
                      padding: '4px 12px', background: 'transparent', border: `1px solid ${LOC_COLOR}`,
                      borderRadius: 4, color: LOC_COLOR, fontSize: 11, cursor: 'pointer', fontWeight: 600,
                    }}>Edit</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function LocationSettings({ onBack }) {
  const [locations, setLocations] = useState(loadLocations)
  const [editing,   setEditing]   = useState(null)   // location object | null | 'new'

  const handleSave = (updated) => {
    setLocations(prev => {
      const exists = prev.find(l => l.id === updated.id)
      const next = exists
        ? prev.map(l => l.id === updated.id ? updated : l)
        : [...prev, updated]
      saveLocations(next)
      return next
    })
    setEditing(null)
  }

  const handleAdd = () => {
    const newLoc = defaultExt({
      id:      nextLocId(locations),
      name:    '',
      address: '',
      region:  'Las Vegas',
      phone:   '',
    })
    newLoc.createdAt = new Date().toISOString()
    newLoc.active    = true
    setEditing(newLoc)
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Module header */}
      <div style={{ padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer' }}>←</button>
        <span style={{ color: LOC_COLOR, fontWeight: 700, fontSize: 13 }}>📍 Locations</span>
        <span style={{ color: MUTED, fontSize: 11 }}>Settings</span>
      </div>

      {editing
        ? <EditLocation
            key={editing.id}
            location={editing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            allLocations={locations}
          />
        : <LocationList
            locations={locations}
            onEdit={setEditing}
            onAdd={handleAdd}
          />
      }
    </div>
  )
}
