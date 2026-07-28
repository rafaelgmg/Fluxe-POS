/**
 * ImportProductsScreen.jsx
 * Admin → Products → Import from Excel / CSV
 *
 * Flow:
 *  1. Upload .xlsx / .csv file
 *  2. Map columns (auto-detected, user-adjustable)
 *  3. Preview + options (duplicate handling, location for qty)
 *  4. Import → localStorage + Supabase
 */

import { useState, useRef, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { LOCATIONS_CFG } from '../config/branding'
import { loadAllProducts, saveAllProducts } from '../utils/productsStorage'
import { writeProductToSupabase, updateProductInSupabase } from '../services/supabaseWrite'
import { localId } from '../domain/utils/ids'
import { normalizeProduct } from '../domain/adapters/legacyProduct'

// ── Design tokens ──────────────────────────────────────────────────────────────
const BG     = 'var(--c-bg)'
const CARD   = 'var(--c-bg-card)'
const PANEL  = 'var(--c-bg-panel)'
const BORDER = 'var(--c-border)'
const BLUE   = '#3b82f6'
const GREEN  = '#22c55e'
const RED    = '#ef4444'
const AMBER  = '#f59e0b'
const MUTED  = 'var(--c-text-muted)'
const TEXT   = 'var(--c-text)'
const DIM    = 'var(--c-text-sub)'

const inp = (extra = {}) => ({
  padding: '7px 10px', background: BG, border: `1px solid ${BORDER}`,
  borderRadius: 4, color: TEXT, fontSize: 12, outline: 'none',
  width: '100%', boxSizing: 'border-box', ...extra,
})

// ── Fluxe fields the user can map to ──────────────────────────────────────────
const FLUXE_FIELDS = [
  { key: 'name',         label: 'Product Name',   required: true  },
  { key: 'barcode',      label: 'Barcode / SKU',  required: true  },
  { key: 'systemPrice',  label: 'System Price',   required: true  },
  { key: 'minPrice',     label: 'Min Price',      required: false },
  { key: 'costPrice',    label: 'Cost Price',     required: false },
  { key: 'category',     label: 'Category',       required: false },
  { key: 'description',  label: 'Description',    required: false },
  { key: 'size',         label: 'Size / Unit',    required: false },
  { key: 'supplierName', label: 'Supplier',       required: false },
  { key: 'qty',          label: 'Quantity',       required: false },
  { key: '_ignore',      label: '— Ignore —',     required: false },
]

// ── Auto-detect column → Fluxe field ──────────────────────────────────────────
const DETECT_RULES = [
  { field: 'name',         patterns: ['item name','product name','item','name','produto','nombre'] },
  { field: 'barcode',      patterns: ['barcode','upc','sku','code','codigo','bar code','item code','item #','item number'] },
  { field: 'systemPrice',  patterns: ['price','retail price','system price','selling price','sale price','unit price','preco','precio'] },
  { field: 'minPrice',     patterns: ['min price','minimum price','floor price','min','preco minimo'] },
  { field: 'costPrice',    patterns: ['cost','cost price','unit cost','purchase price','custo'] },
  { field: 'category',     patterns: ['category','department','type','class','group','categoria'] },
  { field: 'description',  patterns: ['description','notes','note','obs','descricao','descripcion','details'] },
  { field: 'size',         patterns: ['size','unit','weight','volume','tamanho','talla'] },
  { field: 'supplierName', patterns: ['supplier','vendor','brand','manufacturer','fornecedor'] },
  { field: 'qty',          patterns: ['qty','quantity','stock','on hand','count','estoque','cantidad','available'] },
]

function autoDetect(header) {
  const h = header.toLowerCase().trim()
  for (const rule of DETECT_RULES) {
    if (rule.patterns.some(p => h === p || h.includes(p))) return rule.field
  }
  return '_ignore'
}

// ── Parse number safely ────────────────────────────────────────────────────────
function parseNum(val) {
  if (val == null || val === '') return 0
  const n = parseFloat(String(val).replace(/[$,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// ── Build Fluxe product from a mapped row ─────────────────────────────────────
function buildProduct(row, mapping, qtyLocId, existingProducts) {
  const get = (field) => {
    const col = Object.entries(mapping).find(([, f]) => f === field)?.[0]
    return col != null ? row[col] : undefined
  }

  const name        = String(get('name')        || '').trim()
  const barcode     = String(get('barcode')      || '').trim()
  const systemPrice = parseNum(get('systemPrice'))
  const minPrice    = parseNum(get('minPrice'))
  const costPrice   = parseNum(get('costPrice'))
  const category    = String(get('category')     || '').trim()
  const description = String(get('description')  || '').trim()
  const size        = String(get('size')         || '').trim()
  const supplierName = String(get('supplierName') || '').trim()
  const qty         = parseInt(String(get('qty') || '0')) || 0

  if (!name || !barcode) return null

  const qtyByLoc = {}
  if (qtyLocId && qty > 0) qtyByLoc[qtyLocId] = qty

  const existing = existingProducts.find(p => p.barcode === barcode)

  return {
    id:           existing ? existing.id : localId(),
    name, barcode, systemPrice, minPrice, costPrice,
    category, description, size, supplierName,
    qtyByLoc:     existing ? { ...(existing.qtyByLoc || {}), ...qtyByLoc } : qtyByLoc,
    qty,
    status:       'active',
    supplierName,
    updatedAt:    new Date().toISOString(),
    _isUpdate:    !!existing,
  }
}

// ── Step components ────────────────────────────────────────────────────────────

function StepBadge({ n, active, done }) {
  const bg = done ? GREEN : active ? BLUE : BORDER
  const color = done || active ? '#fff' : MUTED
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', background: bg, color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 11, fontWeight: 700, flexShrink: 0, transition: 'all 0.2s',
    }}>{done ? '✓' : n}</div>
  )
}

function StepHeader({ steps, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 28 }}>
      {steps.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <StepBadge n={i + 1} active={current === i} done={current > i} />
            <span style={{ color: current === i ? TEXT : MUTED, fontSize: 12, fontWeight: current === i ? 700 : 400 }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 1, background: current > i ? GREEN : BORDER, margin: '0 12px' }} />
          )}
        </div>
      ))}
    </div>
  )
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────
function StepUpload({ onParsed }) {
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef()

  const processFile = useCallback((file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      setError('Please upload an .xlsx, .xls, or .csv file.')
      return
    }
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb   = XLSX.read(data, { type: 'array' })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!rows.length) { setError('File is empty or has no data rows.'); return }
        onParsed(rows, file.name)
      } catch (err) {
        setError('Failed to read file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [onParsed])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files[0])
  }, [processFile])

  return (
    <div>
      <p style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Upload your product file</p>
      <p style={{ color: MUTED, fontSize: 12, marginBottom: 24, lineHeight: 1.6 }}>
        Export your products from NOVA as Excel or CSV, then upload the file here.<br />
        Supported formats: <strong style={{ color: TEXT }}>.xlsx · .xls · .csv</strong>
      </p>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? BLUE : BORDER}`,
          borderRadius: 12, padding: '48px 24px', textAlign: 'center',
          cursor: 'pointer', transition: 'all 0.2s',
          background: dragging ? `${BLUE}08` : CARD,
        }}
      >
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        <p style={{ color: dragging ? BLUE : TEXT, fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
          {dragging ? 'Drop file here' : 'Click or drag & drop'}
        </p>
        <p style={{ color: MUTED, fontSize: 12 }}>.xlsx · .xls · .csv</p>
        <input
          ref={fileRef} type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={e => processFile(e.target.files[0])}
        />
      </div>

      {error && (
        <div style={{ marginTop: 16, padding: '10px 14px', background: `${RED}12`, border: `1px solid ${RED}44`, borderRadius: 6, color: RED, fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ marginTop: 28, padding: '14px 16px', background: `${BLUE}08`, border: `1px solid ${BLUE}22`, borderRadius: 8 }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>How to export from NOVA:</p>
        <ol style={{ color: MUTED, fontSize: 11, lineHeight: 2, paddingLeft: 18, margin: 0 }}>
          <li>Login to NOVA → Inventory → Products</li>
          <li>Click <strong style={{ color: TEXT }}>Export</strong> (top right)</li>
          <li>Choose <strong style={{ color: TEXT }}>Excel (.xlsx)</strong> or CSV</li>
          <li>Save the file and upload it here</li>
        </ol>
      </div>
    </div>
  )
}

// ── Step 2: Column Mapping ─────────────────────────────────────────────────────
function StepMapping({ rows, fileName, mapping, setMapping, qtyLocId, setQtyLocId, onNext, onBack }) {
  const headers    = Object.keys(rows[0] || {})
  const retailLocs = LOCATIONS_CFG.filter(l => l.location_type !== 'warehouse')

  const requiredMapped = ['name', 'barcode', 'systemPrice'].every(f =>
    Object.values(mapping).includes(f)
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
        <p style={{ color: TEXT, fontWeight: 700, fontSize: 15 }}>Map columns</p>
        <span style={{ color: MUTED, fontSize: 11 }}>{fileName} · {rows.length} rows · {headers.length} columns</span>
      </div>
      <p style={{ color: MUTED, fontSize: 12, marginBottom: 20 }}>
        Match each column from your file to a Fluxe field. Required fields are marked with *.
      </p>

      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        {/* Header row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 0, background: PANEL, padding: '8px 16px', borderBottom: `1px solid ${BORDER}` }}>
          <span style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>YOUR COLUMN</span>
          <span />
          <span style={{ color: MUTED, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>FLUXE FIELD</span>
        </div>

        {headers.map((col, i) => {
          const selected = mapping[col] || '_ignore'
          const isIgnored = selected === '_ignore'
          return (
            <div key={col} style={{
              display: 'grid', gridTemplateColumns: '1fr 24px 1fr', gap: 0,
              padding: '8px 16px', alignItems: 'center',
              borderBottom: i < headers.length - 1 ? `1px solid ${BORDER}` : 'none',
              background: isIgnored ? 'transparent' : `${BLUE}06`,
            }}>
              <div>
                <p style={{ color: isIgnored ? DIM : TEXT, fontSize: 12, fontWeight: 600 }}>{col}</p>
                <p style={{ color: MUTED, fontSize: 10, marginTop: 1 }}>
                  e.g. {String(rows[0][col] ?? '').slice(0, 30) || '—'}
                </p>
              </div>
              <span style={{ color: isIgnored ? BORDER : BLUE, fontSize: 16, textAlign: 'center' }}>→</span>
              <select
                value={selected}
                onChange={e => setMapping(m => ({ ...m, [col]: e.target.value }))}
                style={{ ...inp(), cursor: 'pointer', colorScheme: 'dark', fontSize: 12 }}
              >
                {FLUXE_FIELDS.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}{f.required ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          )
        })}
      </div>

      {/* Qty location picker */}
      {Object.values(mapping).includes('qty') && (
        <div style={{ marginBottom: 20, padding: '14px 16px', background: `${AMBER}08`, border: `1px solid ${AMBER}30`, borderRadius: 8 }}>
          <p style={{ color: AMBER, fontWeight: 700, fontSize: 12, marginBottom: 8 }}>
            Which location should receive the imported quantity?
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {retailLocs.map(l => (
              <button key={l.id} onClick={() => setQtyLocId(l.id)} style={{
                padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: `1px solid ${qtyLocId === l.id ? AMBER : BORDER}`,
                background: qtyLocId === l.id ? `${AMBER}18` : 'transparent',
                color: qtyLocId === l.id ? AMBER : MUTED, cursor: 'pointer',
              }}>{l.name}</button>
            ))}
            <button onClick={() => setQtyLocId(null)} style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${qtyLocId === null ? BORDER : BORDER}`,
              background: qtyLocId === null ? 'rgba(100,116,139,0.15)' : 'transparent',
              color: MUTED, cursor: 'pointer',
            }}>Import without stock</button>
          </div>
        </div>
      )}

      {!requiredMapped && (
        <div style={{ marginBottom: 16, padding: '10px 14px', background: `${RED}10`, border: `1px solid ${RED}33`, borderRadius: 6, color: RED, fontSize: 12 }}>
          Required fields not yet mapped: {['name','barcode','systemPrice'].filter(f => !Object.values(mapping).includes(f)).map(f => FLUXE_FIELDS.find(x => x.key === f)?.label).join(', ')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} style={{ padding: '9px 20px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer' }}>
          ← Back
        </button>
        <button onClick={onNext} disabled={!requiredMapped} style={{
          padding: '9px 24px', borderRadius: 6, border: 'none',
          background: requiredMapped ? BLUE : BORDER,
          color: requiredMapped ? '#fff' : MUTED, fontSize: 12, fontWeight: 700,
          cursor: requiredMapped ? 'pointer' : 'not-allowed',
        }}>
          Preview Import →
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Preview ────────────────────────────────────────────────────────────
function StepPreview({ products, dupMode, setDupMode, onImport, onBack, importing }) {
  const newCount    = products.filter(p => !p._isUpdate).length
  const updateCount = products.filter(p => p._isUpdate).length
  const invalid     = products.filter(p => !p)

  const toShow = dupMode === 'skip'
    ? products.filter(p => p && !p._isUpdate)
    : products.filter(p => p)

  return (
    <div>
      <p style={{ color: TEXT, fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Preview</p>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { label: 'New products',  value: newCount,    color: GREEN },
          { label: 'Already exist', value: updateCount, color: AMBER },
          { label: 'Skipped rows',  value: invalid.length, color: MUTED },
        ].map(c => (
          <div key={c.label} style={{ flex: 1, minWidth: 120, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: '12px 16px', textAlign: 'center' }}>
            <p style={{ color: c.color, fontWeight: 800, fontSize: 22 }}>{c.value}</p>
            <p style={{ color: MUTED, fontSize: 11 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Duplicate handling */}
      {updateCount > 0 && (
        <div style={{ marginBottom: 16, padding: '14px 16px', background: `${AMBER}08`, border: `1px solid ${AMBER}30`, borderRadius: 8 }}>
          <p style={{ color: AMBER, fontWeight: 700, fontSize: 12, marginBottom: 10 }}>
            {updateCount} product{updateCount !== 1 ? 's' : ''} already exist in Fluxe (same barcode). What should we do?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { v: 'skip',   l: 'Skip them',       d: 'Keep existing data unchanged' },
              { v: 'update', l: 'Update them',      d: 'Overwrite name, price, category, etc.' },
            ].map(opt => (
              <button key={opt.v} onClick={() => setDupMode(opt.v)} style={{
                flex: 1, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                border: `1px solid ${dupMode === opt.v ? AMBER : BORDER}`,
                background: dupMode === opt.v ? `${AMBER}14` : 'transparent',
                color: dupMode === opt.v ? TEXT : MUTED, transition: 'all 0.15s',
              }}>
                <p style={{ fontWeight: 700, fontSize: 12 }}>{opt.l}</p>
                <p style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>{opt.d}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Table preview */}
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 600 }}>
            <thead>
              <tr style={{ background: PANEL }}>
                {['Status', 'Name', 'Barcode', 'Price', 'Min Price', 'Cost', 'Category', 'Qty'].map(h => (
                  <th key={h} style={{ padding: '8px 10px', color: MUTED, fontWeight: 700, fontSize: 10, letterSpacing: 0.4, textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {toShow.slice(0, 50).map((p, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${BORDER}`, background: i % 2 === 0 ? 'transparent' : `${PANEL}44` }}>
                  <td style={{ padding: '6px 10px' }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: p._isUpdate ? `${AMBER}15` : `${GREEN}15`,
                      color: p._isUpdate ? AMBER : GREEN,
                      border: `1px solid ${p._isUpdate ? AMBER : GREEN}33`,
                    }}>{p._isUpdate ? 'UPDATE' : 'NEW'}</span>
                  </td>
                  <td style={{ padding: '6px 10px', color: TEXT, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</td>
                  <td style={{ padding: '6px 10px', color: DIM, fontFamily: 'monospace' }}>{p.barcode}</td>
                  <td style={{ padding: '6px 10px', color: TEXT }}>${p.systemPrice?.toFixed(2)}</td>
                  <td style={{ padding: '6px 10px', color: AMBER }}>${p.minPrice?.toFixed(2)}</td>
                  <td style={{ padding: '6px 10px', color: DIM }}>${p.costPrice?.toFixed(2)}</td>
                  <td style={{ padding: '6px 10px', color: DIM }}>{p.category || '—'}</td>
                  <td style={{ padding: '6px 10px', color: DIM }}>{Object.values(p.qtyByLoc || {}).reduce((a, b) => a + b, 0) || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {toShow.length > 50 && (
          <p style={{ color: MUTED, fontSize: 11, padding: '8px 14px', borderTop: `1px solid ${BORDER}` }}>
            Showing first 50 of {toShow.length} products.
          </p>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={onBack} disabled={importing} style={{ padding: '9px 20px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, fontSize: 12, cursor: 'pointer' }}>
          ← Back
        </button>
        <button onClick={onImport} disabled={importing || toShow.length === 0} style={{
          padding: '9px 28px', borderRadius: 6, border: 'none',
          background: importing ? BORDER : BLUE,
          color: importing ? MUTED : '#fff', fontSize: 13, fontWeight: 700,
          cursor: importing ? 'not-allowed' : 'pointer',
        }}>
          {importing ? 'Importing…' : `Import ${toShow.length} product${toShow.length !== 1 ? 's' : ''}`}
        </button>
        {toShow.length === 0 && (
          <span style={{ color: MUTED, fontSize: 12 }}>Nothing to import.</span>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Result ─────────────────────────────────────────────────────────────
function StepResult({ result, onDone, onImportMore }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <p style={{ color: TEXT, fontWeight: 800, fontSize: 22, marginBottom: 8 }}>Import complete!</p>

      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
        {[
          { label: 'Imported',  value: result.imported,  color: GREEN },
          { label: 'Updated',   value: result.updated,   color: AMBER },
          { label: 'Errors',    value: result.errors,    color: result.errors ? RED : MUTED },
        ].map(c => (
          <div key={c.label} style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 10, padding: '16px 24px', minWidth: 100, textAlign: 'center' }}>
            <p style={{ color: c.color, fontWeight: 800, fontSize: 28 }}>{c.value}</p>
            <p style={{ color: MUTED, fontSize: 12 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {result.errors > 0 && (
        <p style={{ color: MUTED, fontSize: 12, marginBottom: 20 }}>
          {result.errors} product{result.errors !== 1 ? 's' : ''} failed to sync to Supabase and were saved locally only.
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button onClick={onImportMore} style={{ padding: '10px 24px', borderRadius: 6, border: `1px solid ${BORDER}`, background: 'transparent', color: TEXT, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Import another file
        </button>
        <button onClick={onDone} style={{ padding: '10px 24px', borderRadius: 6, border: 'none', background: BLUE, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Done
        </button>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function ImportProductsScreen({ onBack }) {
  const [step,     setStep]     = useState(0)   // 0=upload 1=mapping 2=preview 3=result
  const [rows,     setRows]     = useState([])
  const [fileName, setFileName] = useState('')
  const [mapping,  setMapping]  = useState({})
  const [qtyLocId, setQtyLocId] = useState(() => LOCATIONS_CFG.filter(l => l.location_type !== 'warehouse')[0]?.id || null)
  const [dupMode,  setDupMode]  = useState('skip')
  const [importing, setImporting] = useState(false)
  const [result,   setResult]   = useState(null)

  const STEPS = ['Upload', 'Map Columns', 'Preview', 'Done']

  // ── Step 1 → 2: file parsed ──────────────────────────────────────────────────
  const handleParsed = (parsedRows, name) => {
    setRows(parsedRows)
    setFileName(name)
    // Auto-detect mapping
    const headers = Object.keys(parsedRows[0] || {})
    const auto = {}
    headers.forEach(h => { auto[h] = autoDetect(h) })
    setMapping(auto)
    setStep(1)
  }

  // ── Step 2 → 3: preview products ────────────────────────────────────────────
  const previewProducts = () => {
    const existing = loadAllProducts()
    return rows
      .map(row => buildProduct(row, mapping, qtyLocId, existing))
      .filter(Boolean)
  }

  // ── Step 3: run import ───────────────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true)
    const existing    = loadAllProducts()
    const products    = previewProducts()
    const toProcess   = dupMode === 'skip' ? products.filter(p => !p._isUpdate) : products

    let imported = 0, updated = 0, errors = 0
    const nextProducts = [...existing]

    for (const p of toProcess) {
      const clean = normalizeProduct(p)
      const idx   = nextProducts.findIndex(e => e.barcode === clean.barcode)

      if (idx >= 0) {
        nextProducts[idx] = { ...nextProducts[idx], ...clean, id: nextProducts[idx].id }
        try { await updateProductInSupabase(nextProducts[idx]) } catch { errors++ }
        updated++
      } else {
        nextProducts.push(clean)
        try { await writeProductToSupabase(clean) } catch { errors++ }
        imported++
      }
    }

    saveAllProducts(nextProducts)
    setResult({ imported, updated, errors })
    setImporting(false)
    setStep(3)
  }

  const reset = () => { setStep(0); setRows([]); setFileName(''); setMapping({}); setResult(null) }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '10px 16px', background: CARD, borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: MUTED, fontSize: 18, cursor: 'pointer' }}>←</button>
        <span style={{ color: '#3498db', fontWeight: 700, fontSize: 13 }}>🧴 Products</span>
        <span style={{ color: MUTED, fontSize: 11 }}>Import from Excel / CSV</span>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', maxWidth: 760 }}>
        {step < 3 && <StepHeader steps={STEPS} current={step} />}

        {step === 0 && <StepUpload onParsed={handleParsed} />}

        {step === 1 && (
          <StepMapping
            rows={rows} fileName={fileName}
            mapping={mapping} setMapping={setMapping}
            qtyLocId={qtyLocId} setQtyLocId={setQtyLocId}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}

        {step === 2 && (
          <StepPreview
            products={previewProducts()}
            dupMode={dupMode} setDupMode={setDupMode}
            onImport={handleImport}
            onBack={() => setStep(1)}
            importing={importing}
          />
        )}

        {step === 3 && result && (
          <StepResult result={result} onDone={onBack} onImportMore={reset} />
        )}
      </div>
    </div>
  )
}
