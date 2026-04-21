-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 6: PIN hash migration + verify_employee_pin RPC
--
-- Run this ONCE in the Supabase SQL Editor.
-- Steps:
--   1. Enable pgcrypto (required for crypt/gen_salt)
--   2. Add pin_hash column to users
--   3. Migrate existing plaintext PINs → bcrypt hashes
--   4. Create verify_employee_pin() RPC (SECURITY DEFINER — never exposes hash)
--   5. Validation queries
--
-- After running and validating:
--   - The frontend will call verify_employee_pin() RPC instead of comparing locally
--   - pin_hash is never returned to the client
--   - The plain `pin` column can be dropped in Phase 9 (after RLS is enabled)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Enable pgcrypto ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ── Step 2: Add pin_hash column ───────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;


-- ── Step 3: Migrate existing plaintext PINs → bcrypt hashes ──────────────────
--
-- Option A: If the `users` table has a `pin` column with plaintext PINs.
--   Run this to hash them all at once:
--
-- UPDATE users
--   SET pin_hash = crypt(pin, gen_salt('bf', 8))
-- WHERE pin IS NOT NULL
--   AND pin != ''
--   AND pin_hash IS NULL;
--
-- Option B: If there is no `pin` column (schema never stored plaintext),
--   seed pin_hash manually using the PINs you know:
--
-- UPDATE users SET pin_hash = crypt('1234', gen_salt('bf', 8))
--   WHERE first_name = 'Rafael' AND pin_hash IS NULL;
-- UPDATE users SET pin_hash = crypt('5678', gen_salt('bf', 8))
--   WHERE first_name = 'Natalia' AND pin_hash IS NULL;
-- UPDATE users SET pin_hash = crypt('9012', gen_salt('bf', 8))
--   WHERE first_name = 'Nate' AND pin_hash IS NULL;
--
-- Uncomment whichever option applies and run it.


-- ── Step 4: verify_employee_pin RPC ──────────────────────────────────────────
--
-- SECURITY DEFINER: runs with the privileges of the function owner (postgres),
-- not the calling role. This means:
--   - The function can read pin_hash even when the calling role (anon) cannot
--   - pin_hash is NEVER returned to the client — only non-secret fields
--   - Even without RLS enabled, the hash itself stays server-side
--
-- Parameters:
--   p_org_id        — Organization UUID (from getOrgId())
--   p_employee_name — Full name as displayed in the frontend (trimmed)
--   p_pin           — Plaintext PIN entered by the employee
--
-- Returns one row on success (correct PIN), empty result set on failure.
-- The client interprets empty result as "wrong PIN".

CREATE OR REPLACE FUNCTION verify_employee_pin(
  p_org_id        UUID,
  p_employee_name TEXT,
  p_pin           TEXT
)
RETURNS TABLE(
  id         UUID,
  first_name TEXT,
  last_name  TEXT,
  position   TEXT,
  photo      TEXT
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
    u.position,
    u.photo::TEXT
  FROM users u
  WHERE u.organization_id = p_org_id
    AND trim(concat_ws(' ', u.first_name, COALESCE(u.last_name, ''))) = trim(p_employee_name)
    AND u.pin_hash IS NOT NULL
    AND u.pin_hash = crypt(p_pin, u.pin_hash)   -- bcrypt comparison (pgcrypto)
    AND u.status = 'active'
  LIMIT 1;
END;
$$;

-- Revoke direct execute from public; grant to anon so the REST API can call it
REVOKE ALL ON FUNCTION verify_employee_pin(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_employee_pin(UUID, TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_employee_pin(UUID, TEXT, TEXT) TO authenticated;


-- ── Step 5: Validation ────────────────────────────────────────────────────────

-- Check that all active users have a pin_hash set
SELECT id, first_name, last_name,
  CASE WHEN pin_hash IS NULL THEN 'MISSING pin_hash' ELSE 'OK' END AS hash_status
FROM users
WHERE status = 'active'
ORDER BY first_name;

-- Test the RPC directly (replace UUID and name/PIN with real values):
-- SELECT * FROM verify_employee_pin(
--   (SELECT id FROM organizations LIMIT 1),
--   'Rafael',
--   '1234'
-- );
-- Expected: one row returned on correct PIN, empty set on wrong PIN.


-- ── Phase 9 cleanup (DO NOT run yet — wait for RLS to be enabled) ─────────────
-- Once RLS is active and you've verified all logins work via RPC:
--
-- ALTER TABLE users DROP COLUMN IF EXISTS pin;
-- ─────────────────────────────────────────────────────────────────────────────
