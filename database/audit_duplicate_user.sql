-- ============================================================
--  Audit & Fix: Duplicate employee (same name, two Supabase UUIDs)
--  Run each block separately in Supabase SQL Editor.
--  Replace 'Carlos' with the employee's first name if needed.
-- ============================================================

-- ── STEP 1: Find all Carlos records + their sales ────────────
-- Run this first to identify the canonical UUID (has most sales)
-- and the duplicate UUID (few or zero sales).

SELECT
  u.id                                    AS user_id,
  u.first_name || ' ' || u.last_name      AS full_name,
  u.position,
  u.status,
  u.created_at,
  COUNT(s.id)                             AS sales_count,
  COALESCE(SUM(s.total), 0)::numeric(10,2) AS total_revenue,
  MIN(s.created_at)                       AS first_sale,
  MAX(s.created_at)                       AS last_sale
FROM users u
LEFT JOIN sales s ON s.employee_id = u.id
WHERE u.first_name ILIKE '%Carlos%'
GROUP BY u.id, u.first_name, u.last_name, u.position, u.status, u.created_at
ORDER BY u.created_at;


-- ── STEP 2: Check sales by employee_name (string snapshot) ───
-- Sales store both employee_id (UUID) and employee_name (string).
-- This shows ALL sales attributed to "Carlos" by name, regardless of UUID.

SELECT
  s.id,
  s.employee_name,
  s.employee_id,
  s.total,
  s.location_name,
  s.created_at
FROM sales s
WHERE s.employee_name ILIKE '%Carlos%'
ORDER BY s.created_at;


-- ── STEP 3: Fix — after identifying canonical vs duplicate ────
-- Replace the UUIDs below with what you found in Step 1.
--
--   CANONICAL_UUID = the Carlos with MOST sales (keep this one)
--   DUPLICATE_UUID = the Carlos with ZERO or few sales (delete this one)
--
-- 3A. Move sales from duplicate UUID to canonical UUID
/*
UPDATE sales
SET employee_id = 'CANONICAL_UUID'
WHERE employee_id = 'DUPLICATE_UUID';
*/

-- 3B. Delete the duplicate user record
/*
DELETE FROM users
WHERE id = 'DUPLICATE_UUID';
*/


-- ── STEP 4: Verify after fix ──────────────────────────────────
-- Re-run Step 1 to confirm only one Carlos remains with all sales.

-- ── AFTER FIX ────────────────────────────────────────────────
-- Reload both kiosks (F5) so loadUsersAsync() re-fetches the
-- clean user list from Supabase and updates localStorage.
-- ============================================================
