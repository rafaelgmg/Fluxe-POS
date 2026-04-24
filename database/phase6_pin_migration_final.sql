-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 6 (final): PIN hash migration
--
-- Run ONCE in Supabase SQL Editor, in order.
--
-- Steps:
--   1. Enable pgcrypto
--   2. Add pin_hash column
--   3. Migrate existing plaintext PINs → bcrypt hashes
--   4. verify_employee_pin() RPC  — bcrypt comparison, SECURITY DEFINER
--   5. set_user_pin() RPC         — secure PIN write, SECURITY DEFINER
--   6. v_users view               — all columns except pin / pin_hash
--   7. Grants
--   8. Validation
--
-- After running:
--   • fetchUsers() queries v_users — pin/pin_hash never leave the DB
--   • All PIN verification goes through verify_employee_pin RPC
--   • upsertUserToSupabase() calls set_user_pin RPC (no plaintext over wire)
--   • Plain `pin` column cleanup: ALTER TABLE users DROP COLUMN pin
--     (only after confirming all logins work via RPC)
-- ─────────────────────────────────────────────────────────────────────────────


-- ── Step 1: Enable pgcrypto ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── Step 2: Add pin_hash column + set pin column default ─────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
-- Allow INSERT without pin (pin_hash is the new canonical field).
-- The NOT NULL constraint stays; DEFAULT '' satisfies it for new rows.
ALTER TABLE users ALTER COLUMN pin SET DEFAULT '';


-- ── Step 3: Migrate existing plaintext PINs → bcrypt hashes ──────────────────
-- Reads the existing `pin` column and hashes each value with bcrypt (cost 10).
-- Only updates rows that have a non-empty pin and no hash yet.
UPDATE users
SET pin_hash = crypt(pin, gen_salt('bf', 10))
WHERE pin   IS NOT NULL
  AND pin   != ''
  AND pin_hash IS NULL;


-- ── Step 4: verify_employee_pin RPC ──────────────────────────────────────────
-- SECURITY DEFINER: runs as postgres — reads pin_hash without exposing it.
-- Returns one row on success (correct PIN), empty set on failure.
-- The `photo` column does not exist in the users table schema; it is omitted.

DROP FUNCTION IF EXISTS verify_employee_pin(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION verify_employee_pin(
  p_org_id        UUID,
  p_employee_name TEXT,
  p_pin           TEXT
)
RETURNS TABLE(
  id         UUID,
  first_name TEXT,
  last_name  TEXT,
  "position" TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    u.last_name,
    u.position
  FROM users u
  WHERE u.organization_id = p_org_id
    AND trim(concat_ws(' ', u.first_name, COALESCE(u.last_name, ''))) = trim(p_employee_name)
    AND u.pin_hash IS NOT NULL
    AND u.pin_hash = crypt(p_pin, u.pin_hash)
    AND u.status = 'active'
  LIMIT 1;
END;
$$;


-- ── Step 5: set_user_pin RPC ──────────────────────────────────────────────────
-- Called by upsertUserToSupabase() after creating/updating a user.
-- Hashes the plaintext PIN server-side — no plaintext reaches the DB column.
-- Org isolation: only updates users belonging to the caller's org (from JWT).

CREATE OR REPLACE FUNCTION set_user_pin(
  p_user_id  UUID,
  p_plain_pin TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE users
  SET    pin_hash = crypt(p_plain_pin, gen_salt('bf', 10))
  WHERE  id              = p_user_id
    AND  organization_id = (auth.jwt() -> 'app_metadata' ->> 'org_id')::UUID;
END;
$$;


-- ── Step 6: v_users view ──────────────────────────────────────────────────────
-- Exposes all user fields EXCEPT pin and pin_hash.
-- fetchUsers() queries this view — hash never leaves the DB.

CREATE OR REPLACE VIEW v_users AS
SELECT
  id,
  organization_id,
  auth_user_id,
  first_name,
  last_name,
  position,
  email,
  phone,
  hourly_rate,
  status,
  created_at,
  updated_at
FROM users;


-- ── Step 7: Grants ────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION verify_employee_pin(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION verify_employee_pin(UUID, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION set_user_pin(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION set_user_pin(UUID, TEXT) TO authenticated;

GRANT SELECT ON v_users TO anon, authenticated;


-- ── Step 8: Validation ────────────────────────────────────────────────────────

-- All active users should have pin_hash set after the migration:
SELECT
  id,
  first_name,
  last_name,
  CASE WHEN pin_hash IS NULL THEN 'MISSING — set PIN manually' ELSE 'OK' END AS hash_status
FROM users
WHERE status = 'active'
ORDER BY first_name;

-- Confirm the view exists and returns no pin/pin_hash columns:
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'v_users'
ORDER BY ordinal_position;

-- Test RPC (replace org UUID and name/PIN with real values):
-- SELECT * FROM verify_employee_pin(
--   (SELECT id FROM organizations LIMIT 1),
--   'Rafael',
--   '1234'
-- );
-- Expected: one row on correct PIN, empty set on wrong PIN.

-- ── Cleanup (run AFTER confirming all logins work via RPC) ────────────────────
-- ALTER TABLE users DROP COLUMN IF EXISTS pin;
-- ─────────────────────────────────────────────────────────────────────────────
