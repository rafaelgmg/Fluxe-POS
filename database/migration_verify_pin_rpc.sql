-- Migration: create verify_employee_pin RPC
-- Compares PIN server-side — the PIN value is never returned to the client.
--
-- Phase notes:
--   • Current: PIN stored as plaintext (acceptable for dev / closed kiosk network).
--   • Phase 6 upgrade path: replace `u.pin = p_pin` with
--       `u.pin_hash IS NOT NULL AND crypt(p_pin, u.pin_hash) = u.pin_hash`
--     after running a one-time bcrypt migration on all existing PINs.
--
-- Usage (called by verifyEmployeePin() in supabaseAuth.js):
--   SELECT * FROM verify_employee_pin(
--     p_org_id        := '<org-uuid>',
--     p_employee_name := 'Natalia Menezes',
--     p_pin           := '5678'
--   );

CREATE OR REPLACE FUNCTION verify_employee_pin(
  p_org_id        UUID,
  p_employee_name TEXT,
  p_pin           TEXT
)
RETURNS TABLE (
  id         UUID,
  first_name TEXT,
  last_name  TEXT,
  "position" TEXT,
  photo      TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.first_name,
    u.last_name,
    u.position AS "position",
    NULL::TEXT AS photo
  FROM users u
  WHERE u.organization_id = p_org_id
    AND TRIM(LOWER(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')))
        = TRIM(LOWER(p_employee_name))
    AND u.pin  = p_pin
    AND u.status = 'active';
END;
$$;
