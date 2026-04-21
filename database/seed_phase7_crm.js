/**
 * seed_phase7_crm.js — Migrate CRM customers from localStorage export to Supabase.
 *
 * Usage:
 *   1. In the browser console (on the Fluxe POS app), run:
 *        copy(localStorage.getItem('fluxe-crm-v1'))
 *      This copies the raw JSON to your clipboard.
 *   2. Paste it into a file: customers_export.json
 *   3. Run: node database/seed_phase7_crm.js
 *
 * The script:
 *   - Reads customers_export.json from the current directory
 *   - Upserts each customer to Supabase via REST API
 *   - Deduplicates by phone_normalized, then email (via ON CONFLICT DO UPDATE)
 *   - Prints a summary at the end
 *
 * Environment variables (required):
 *   SUPABASE_URL       — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY — service_role key (bypasses RLS for seed)
 *   ORG_ID             — UUID of the organization from `organizations` table
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SUPABASE_URL = process.env.SUPABASE_URL        || ''
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || ''
const ORG_ID       = process.env.ORG_ID               || ''

if (!SUPABASE_URL || !SUPABASE_KEY || !ORG_ID) {
  console.error('Missing environment variables: SUPABASE_URL, SUPABASE_SERVICE_KEY, ORG_ID')
  process.exit(1)
}

function normalizePhone(phone) {
  return (phone || '').replace(/\D/g, '')
}

function toRow(local) {
  const phoneNorm = normalizePhone(local.phone)
  return {
    organization_id:      ORG_ID,
    first_name:           (local.firstName || '').trim(),
    last_name:            (local.lastName  || '').trim(),
    phone:                local.phone      || '',
    phone_normalized:     phoneNorm,
    email:                (local.email     || '').trim(),
    birthday:             local.birthday   || '',
    fragrance_preferences: JSON.stringify(
      Array.isArray(local.fragrancePreferences) ? local.fragrancePreferences
      : local.fragrancePreferences ? [local.fragrancePreferences] : []
    ),
    marketing_consent:    local.marketingConsent  ?? false,
    preferred_channel:    local.preferredChannel  || '',
    notes:                local.notes             || '',
    tags:                 JSON.stringify(Array.isArray(local.tags) ? local.tags : []),
    crm_score:            local.crmScore          ?? 0,
    purchases:            JSON.stringify(Array.isArray(local.purchases) ? local.purchases : []),
    last_interaction:     local.lastInteraction   || null,
    archived:             local.archived          ?? false,
    archived_at:          local.archivedAt        || null,
    legacy_local_id:      local.id                || null,
    captured_at:          local.capturedAt        || local.createdAt || new Date().toISOString(),
    created_at:           local.createdAt         || new Date().toISOString(),
  }
}

async function upsertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/customers`, {
    method: 'POST',
    headers: {
      apikey:          SUPABASE_KEY,
      Authorization:   `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      Prefer:          'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Upsert failed ${res.status}: ${text}`)
  }
}

async function main() {
  const exportPath = join(__dirname, 'customers_export.json')
  let raw
  try {
    raw = readFileSync(exportPath, 'utf-8')
  } catch {
    console.error(`Could not read ${exportPath}`)
    console.error('Export your CRM data first (see instructions at top of this file).')
    process.exit(1)
  }

  const local = JSON.parse(raw)
  if (!Array.isArray(local)) {
    console.error('customers_export.json must be a JSON array')
    process.exit(1)
  }

  console.log(`Seeding ${local.length} customers to Supabase org ${ORG_ID}...`)

  const rows     = local.map(toRow)
  const BATCH    = 50
  let   inserted = 0
  let   errors   = 0

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    try {
      await upsertBatch(batch)
      inserted += batch.length
      process.stdout.write(`  ${inserted}/${rows.length}\r`)
    } catch (err) {
      console.error(`\n  Batch ${i}-${i + BATCH} failed:`, err.message)
      errors += batch.length
    }
  }

  console.log(`\nDone. Inserted/updated: ${inserted - errors}  Errors: ${errors}`)
}

main()
