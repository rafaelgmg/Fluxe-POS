-- ============================================================
--  Fluxe POS — New Client Onboarding Script
--  Run in: Supabase SQL Editor (your project)
--
--  BEFORE RUNNING:
--  1. Fill in the ① CONFIGURE section below
--  2. Run this script → copy the org_id from the output
--  3. Create Supabase Auth machine account (instructions below)
--  4. Update machine account app_metadata with the org_id
--  5. Give client their SetupScreen credentials
-- ============================================================


-- ============================================================
--  ① CONFIGURE — fill these in before running
-- ============================================================

DO $$
DECLARE
  -- Organization
  v_org_id      uuid   := gen_random_uuid();
  v_org_name    text   := 'Client Business Name';          -- ← company name
  v_org_slug    text   := 'client-business';               -- ← lowercase, no spaces

  -- Branding
  v_biz_short   text   := 'CLIENT BUSINESS';               -- ← all-caps short name
  v_industry    text   := 'Perfume & Fragrance';
  v_tax_rate    float  := 8.5;                             -- ← e.g. 8.5 for Nevada
  v_currency    text   := '$';
  v_sms_sig     text   := '— Client Business';             -- ← appended to SMS

  -- Receipt
  v_receipt_footer text := 'No Refunds. Exchanges within 14 days.';
  v_receipt_legal  text := 'This receipt confirms your purchase.';

  -- Locations (add / remove as needed — one entry per kiosk)
  v_locations jsonb := '[
    {
      "id": "loc_01",
      "name": "Location 1",
      "address": "123 Main St, Las Vegas, NV",
      "region": "Las Vegas",
      "phone": "",
      "business_type": "retail",
      "location_type": "retail"
    },
    {
      "id": "loc_02",
      "name": "Location 2",
      "address": "456 Strip Blvd, Las Vegas, NV",
      "region": "Las Vegas",
      "phone": "",
      "business_type": "retail",
      "location_type": "retail"
    }
  ]'::jsonb;

  -- Default manager (the client's main admin user)
  v_mgr_first  text := 'Manager';
  v_mgr_last   text := 'Name';
  v_mgr_pin    text := '1234';                             -- ← client sets own PIN later

BEGIN

  -- ── 1. Organization ──────────────────────────────────────
  INSERT INTO organizations (id, name, slug, created_at, updated_at)
  VALUES (v_org_id, v_org_name, v_org_slug, now(), now());

  -- ── 2. Locations ─────────────────────────────────────────
  -- One row per kiosk in the locations table (used for RLS + inventory)
  FOR i IN 0 .. jsonb_array_length(v_locations) - 1 LOOP
    INSERT INTO locations (
      id, organization_id, name, address,
      tax_rate, status, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_org_id,
      (v_locations -> i ->> 'name'),
      (v_locations -> i ->> 'address'),
      v_tax_rate,
      'active',
      now(), now()
    );
  END LOOP;

  -- ── 3. Org settings (branding) ───────────────────────────
  INSERT INTO org_settings (
    organization_id,
    business_name,
    business_short,
    industry,
    tax_rate,
    currency_symbol,
    locations,
    receipt_footer,
    receipt_legal,
    crm_sms_signature,
    updated_at
  ) VALUES (
    v_org_id,
    v_org_name,
    v_biz_short,
    v_industry,
    v_tax_rate,
    v_currency,
    v_locations,
    v_receipt_footer,
    v_receipt_legal,
    v_sms_sig,
    now()
  );

  -- ── 4. Default manager user ───────────────────────────────
  -- Client can add more employees via Admin → Users after first login.
  -- PIN stored as plaintext here — client should change via app.
  INSERT INTO users (
    organization_id,
    first_name, last_name,
    position, email, phone,
    pin, status,
    created_at, updated_at
  ) VALUES (
    v_org_id,
    v_mgr_first, v_mgr_last,
    'Manager', '', '',
    v_mgr_pin,
    'active',
    now(), now()
  );

  -- ── Output ────────────────────────────────────────────────
  RAISE NOTICE '';
  RAISE NOTICE '✅ Client onboarded successfully';
  RAISE NOTICE '   Org:    %  (%)', v_org_name, v_org_slug;
  RAISE NOTICE '   Org ID: %', v_org_id;
  RAISE NOTICE '';
  RAISE NOTICE '👉 NEXT STEP: Create machine account in Supabase Auth';
  RAISE NOTICE '   Email:    pos-machine@%.local', v_org_slug;
  RAISE NOTICE '   Then set app_metadata: { "org_id": "%" }', v_org_id;

END;
$$;


-- ============================================================
--  ② AFTER RUNNING — Manual steps in Supabase Dashboard
-- ============================================================
--
--  A. Create the machine account (Supabase Auth):
--     Authentication → Users → Add User
--     Email:    pos-machine@<slug>.local   (e.g. pos-machine@client-business.local)
--     Password: <strong password>          (you create it — give to client for SetupScreen)
--
--  B. Set org_id on the machine account:
--     Click the user → Edit → app_metadata:
--     { "org_id": "<org_id from NOTICE above>" }
--     Save.
--
--  C. Give the client these 4 credentials for the SetupScreen:
--     ┌─────────────────────────────────────────────────────┐
--     │  Supabase URL:   https://xxxx.supabase.co           │
--     │  Anon Key:       eyJ... (from Settings → API)       │
--     │  Machine Email:  pos-machine@<slug>.local           │
--     │  Machine Pass:   <password you created in step A>   │
--     └─────────────────────────────────────────────────────┘
--
--  D. Client opens the Fluxe URL and fills the Setup Screen.
--     Done — their kiosks are connected.
-- ============================================================
