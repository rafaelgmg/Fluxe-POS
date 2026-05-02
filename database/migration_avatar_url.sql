-- migration_avatar_url.sql
-- Adds avatar_url to users table and v_users view.
-- Run once against the production Supabase database.
--
-- After applying this migration:
--   1. Go to Supabase Dashboard → Storage → New Bucket
--      Name: avatars  |  Public bucket: YES
--   2. Set bucket policy to allow authenticated reads (public) and
--      authenticated/service writes. Or apply the RLS policies below.

-- ── Step 1: Add column ────────────────────────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ── Step 2: Rebuild v_users view with avatar_url ──────────────────────────────
-- Must DROP first — PostgreSQL does not allow CREATE OR REPLACE to reorder columns.

DROP VIEW IF EXISTS v_users;

CREATE VIEW v_users AS
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
  avatar_url,
  created_at,
  updated_at
FROM users;

GRANT SELECT ON v_users TO anon, authenticated;

-- ── Step 3: Storage bucket (run via Supabase SQL Editor) ──────────────────────
-- Supabase does not allow bucket creation via plain SQL.
-- Create the bucket manually in Dashboard → Storage, OR via API:
--
--   POST /storage/v1/bucket
--   { "id": "avatars", "name": "avatars", "public": true }
--
-- Then add a storage policy to allow uploads by authenticated users:
--
--   INSERT INTO storage.policies (name, bucket_id, command, definition)
--   VALUES (
--     'avatars-upload',
--     'avatars',
--     'INSERT',
--     'auth.role() = ''authenticated'''
--   );
