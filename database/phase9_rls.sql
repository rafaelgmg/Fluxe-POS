-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 9: Row Level Security
-- Fluxe POS — multi-tenant isolation via Supabase Auth JWT claims
--
-- ── PRE-REQUISITES (run before this file) ────────────────────────────────────
--
--  1. Create a Supabase Auth machine account for the organization:
--       Dashboard → Authentication → Users → Add user
--       Email: pos-machine@perfumepassage.local  (any email, never used for email)
--       Password: <strong random password>
--
--  2. Set org_id in app_metadata via Supabase Auth API or SQL:
--
--       UPDATE auth.users
--       SET    raw_app_meta_data = raw_app_meta_data || '{"org_id": "<ORG_UUID>"}'::jsonb
--       WHERE  email = 'pos-machine@perfumepassage.local';
--
--       Verify: SELECT raw_app_meta_data FROM auth.users WHERE email = '...';
--       Expected: {"provider": "email", "providers": ["email"], "org_id": "<ORG_UUID>"}
--
--  3. Add to .env (REQUIRED — getOrgId() must not need a DB query with RLS):
--
--       VITE_ORG_MACHINE_EMAIL=pos-machine@perfumepassage.local
--       VITE_ORG_MACHINE_PASSWORD=<strong-password>
--       VITE_SUPABASE_ORG_ID=<org-uuid>    ← becomes REQUIRED in Phase 9
--
--  4. Deploy the frontend with initOrgSession() changes FIRST.
--     Verify the app loads and data appears correctly.
--     ONLY THEN run this SQL file.
--
-- ── APPLY ORDER ──────────────────────────────────────────────────────────────
--  1. Run Step 1 (auth_org_id function)
--  2. Run Step 2 (ENABLE RLS — idempotent)
--  3. Run Step 3 (DROP old policies — clean slate)
--  4. Run Step 4 (CREATE policies)
--  5. Validate with Step 5
--
-- ── ATOMICITY RISK ───────────────────────────────────────────────────────────
--  If you apply Step 2 without Step 4, ALL reads from anon/authenticated
--  are blocked immediately. Run Steps 2–4 in a single SQL Editor session.
--
-- ── service_role bypass ──────────────────────────────────────────────────────
--  Supabase service_role key always bypasses RLS. Migrations and admin
--  operations using service_role are unaffected by these policies.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 1: Auth helper — extract org_id from JWT app_metadata
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns the org UUID from the machine account JWT claim.
-- Returns NULL when:
--   · caller is anon (no user JWT, or JWT has no app_metadata.org_id)
--   · app_metadata.org_id is missing or malformed
--
-- SECURITY DEFINER is NOT needed here because auth.jwt() is a built-in
-- Supabase function accessible to all roles.

CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      auth.jwt() -> 'app_metadata' ->> 'org_id',
      ''
    ),
    ''
  )::UUID
$$;

-- Grant execute to authenticated and anon so it can be used in policies
GRANT EXECUTE ON FUNCTION auth_org_id() TO authenticated, anon;


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 2: Enable RLS on all tables
-- (ALTER TABLE ... ENABLE ROW LEVEL SECURITY is idempotent — safe to re-run)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations           ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_location_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_stock     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 3: Drop existing policies (clean slate before recreating)
-- ═══════════════════════════════════════════════════════════════════════════

-- organizations
DROP POLICY IF EXISTS "org_select"  ON organizations;

-- locations
DROP POLICY IF EXISTS "org_isolation_select" ON locations;
DROP POLICY IF EXISTS "org_isolation_insert" ON locations;
DROP POLICY IF EXISTS "org_isolation_update" ON locations;
DROP POLICY IF EXISTS "org_isolation_delete" ON locations;

-- users
DROP POLICY IF EXISTS "org_isolation_select" ON users;
DROP POLICY IF EXISTS "org_isolation_insert" ON users;
DROP POLICY IF EXISTS "org_isolation_update" ON users;
DROP POLICY IF EXISTS "org_isolation_delete" ON users;

-- user_location_access
DROP POLICY IF EXISTS "org_isolation_select" ON user_location_access;
DROP POLICY IF EXISTS "org_isolation_insert" ON user_location_access;
DROP POLICY IF EXISTS "org_isolation_delete" ON user_location_access;

-- categories
DROP POLICY IF EXISTS "org_isolation_select" ON categories;
DROP POLICY IF EXISTS "org_isolation_insert" ON categories;
DROP POLICY IF EXISTS "org_isolation_update" ON categories;
DROP POLICY IF EXISTS "org_isolation_delete" ON categories;

-- products
DROP POLICY IF EXISTS "org_isolation_select" ON products;
DROP POLICY IF EXISTS "org_isolation_insert" ON products;
DROP POLICY IF EXISTS "org_isolation_update" ON products;
DROP POLICY IF EXISTS "org_isolation_delete" ON products;

-- inventory_stock
DROP POLICY IF EXISTS "org_isolation_select" ON inventory_stock;
DROP POLICY IF EXISTS "org_isolation_insert" ON inventory_stock;
DROP POLICY IF EXISTS "org_isolation_update" ON inventory_stock;
DROP POLICY IF EXISTS "org_isolation_delete" ON inventory_stock;

-- sales
DROP POLICY IF EXISTS "org_isolation_select" ON sales;
DROP POLICY IF EXISTS "org_isolation_insert" ON sales;
DROP POLICY IF EXISTS "org_isolation_update" ON sales;

-- sale_items (no organization_id column — join to sales)
DROP POLICY IF EXISTS "org_isolation_select" ON sale_items;
DROP POLICY IF EXISTS "org_isolation_insert" ON sale_items;

-- payments (no organization_id column — join to sales)
DROP POLICY IF EXISTS "org_isolation_select" ON payments;
DROP POLICY IF EXISTS "org_isolation_insert" ON payments;

-- inventory_movements
DROP POLICY IF EXISTS "org_isolation_select" ON inventory_movements;
DROP POLICY IF EXISTS "org_isolation_insert" ON inventory_movements;

-- customers
DROP POLICY IF EXISTS "org_isolation_select" ON customers;
DROP POLICY IF EXISTS "org_isolation_insert" ON customers;
DROP POLICY IF EXISTS "org_isolation_update" ON customers;
DROP POLICY IF EXISTS "org_isolation_delete" ON customers;


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 4: Create RLS policies
-- ═══════════════════════════════════════════════════════════════════════════


-- ── organizations ─────────────────────────────────────────────────────────────
-- A tenant can only see their own organization row.
-- INSERT/UPDATE/DELETE on organizations is service_role only (admin/infra).

CREATE POLICY "org_select" ON organizations
  FOR SELECT TO authenticated
  USING (id = auth_org_id());

-- anon: no policy → blocked. verify_employee_pin RPC (SECURITY DEFINER)
-- can read users without needing anon access to this table.


-- ── locations ─────────────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON locations
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON locations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON locations
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE on locations: not expected from client (admin/service_role only)
-- Omitted intentionally.


-- ── users ─────────────────────────────────────────────────────────────────────
-- SELECT includes the pin column — the app's fromSupabaseUser() strips it.
-- A future phase should add column-level security or a view that excludes pin.

CREATE POLICY "org_isolation_select" ON users
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON users
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON users
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE on users: app only deactivates (status='inactive'), not hard deletes.
-- Omitted intentionally — use service_role for admin user deletion.


-- ── user_location_access ──────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON user_location_access
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON user_location_access
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

-- DELETE cascades from users/locations. Direct DELETE from client not expected.


-- ── categories ────────────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON categories
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON categories
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON categories
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_delete" ON categories
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());


-- ── products ──────────────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON products
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON products
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON products
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_delete" ON products
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());


-- ── inventory_stock ───────────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON inventory_stock
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON inventory_stock
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

-- Phase 4: stock is updated via PATCH after each sale.
CREATE POLICY "org_isolation_update" ON inventory_stock
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- DELETE cascades from products/locations. Direct DELETE not expected from client.


-- ── sales ─────────────────────────────────────────────────────────────────────
-- UPDATE allowed for status changes (void). No DELETE (ledger-style).

CREATE POLICY "org_isolation_select" ON sales
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

-- UPDATE only: voiding a sale (status = 'voided'). Financials are immutable.
CREATE POLICY "org_isolation_update" ON sales
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- No DELETE policy on sales — sales are never hard deleted.


-- ── sale_items ────────────────────────────────────────────────────────────────
-- No organization_id column — isolation enforced via parent sale FK.
-- Correlated subquery: PostgreSQL optimizes this with the idx_sale_items_sale index.

CREATE POLICY "org_isolation_select" ON sale_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = sale_items.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

CREATE POLICY "org_isolation_insert" ON sale_items
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = sale_items.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

-- No UPDATE (sale_items are immutable after INSERT).
-- No DELETE (cascade from sales only).


-- ── payments ──────────────────────────────────────────────────────────────────
-- Same pattern as sale_items.

CREATE POLICY "org_isolation_select" ON payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = payments.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

CREATE POLICY "org_isolation_insert" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM sales
      WHERE  sales.id = payments.sale_id
        AND  sales.organization_id = auth_org_id()
    )
  );

-- No UPDATE or DELETE — payments are immutable.


-- ── inventory_movements ───────────────────────────────────────────────────────
-- INSERT allowed: sale movements (Phase 4) and refund movements (Phase 8).
-- No UPDATE or DELETE — inventory ledger is immutable.

CREATE POLICY "org_isolation_select" ON inventory_movements
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());


-- ── customers (Phase 7) ───────────────────────────────────────────────────────

CREATE POLICY "org_isolation_select" ON customers
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON customers
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- Soft-delete preferred (archived=true). Hard DELETE is admin only.
CREATE POLICY "org_isolation_delete" ON customers
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());


-- ═══════════════════════════════════════════════════════════════════════════
-- Step 5: Validation queries
-- ═══════════════════════════════════════════════════════════════════════════

-- List all RLS policies created (expected: ~30 rows)
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;

-- Verify RLS is enabled on all expected tables
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'organizations', 'locations', 'users', 'user_location_access',
    'categories', 'products', 'inventory_stock',
    'sales', 'sale_items', 'payments', 'inventory_movements', 'customers'
  )
ORDER BY tablename;

-- Test isolation: simulate authenticated role with a known org_id
-- (Replace with your actual org UUID and run in SQL Editor as postgres/service_role)
--
-- SET request.jwt.claims = '{"sub": "machine-uuid", "role": "authenticated", "app_metadata": {"org_id": "<YOUR_ORG_UUID>"}}';
-- SELECT COUNT(*) FROM sales;      -- Should return your org's row count
-- SELECT COUNT(*) FROM products;   -- Should return your org's row count
--
-- SET request.jwt.claims = '{"sub": "other-uuid", "role": "authenticated", "app_metadata": {"org_id": "00000000-0000-0000-0000-000000000000"}}';
-- SELECT COUNT(*) FROM sales;      -- Should return 0 (no rows for fake org)
-- SELECT COUNT(*) FROM products;   -- Should return 0


-- ─────────────────────────────────────────────────────────────────────────────
-- Known risks and future improvements:
--
-- 1. Column-level: users.pin / users.pin_hash are visible to authenticated role.
--    The app's fromSupabaseUser() strips them client-side. For full DB-level
--    protection, create a view (v_users) that excludes these columns and grant
--    SELECT only on the view, not the base table.
--
-- 2. sale_items / payments: no organization_id column — isolation via correlated
--    subquery. At scale, consider adding organization_id to both tables and
--    creating a direct policy. Current approach is correct and fast enough for
--    a kiosk with thousands (not millions) of rows.
--
-- 3. anon role: ALL tables are blocked for anon (no anon policies created).
--    Only the verify_employee_pin RPC (SECURITY DEFINER) is callable by anon.
--    The app falls back to localStorage when Supabase reads are blocked.
--
-- 4. Token refresh: the machine account JWT expires (default 1 hour in Supabase).
--    The frontend schedules a token refresh before expiry. If refresh fails,
--    Supabase reads will fail until the next successful sign-in (app restart).
-- ─────────────────────────────────────────────────────────────────────────────
