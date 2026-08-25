-- ─────────────────────────────────────────────────────────────────────────────
-- migration_product_image.sql
-- Adds image_url column to products table.
-- Also requires a Supabase Storage bucket named "product-images".
--
-- ── STEPS ────────────────────────────────────────────────────────────────────
-- 1. Run this SQL in the Supabase SQL Editor.
-- 2. In Supabase Dashboard → Storage → New bucket:
--      Name:   product-images
--      Public: YES (so images load without auth token)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;

-- Verify:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'products' AND column_name = 'image_url';
-- Expected: one row with data_type = 'text'
