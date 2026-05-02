-- migration_sale_payments_snapshot.sql
-- Adds payments_snapshot JSONB to sales table.
--
-- WHY: The payments(*) PostgREST join can return empty when the anon role
-- has no SELECT policy on the payments table (RLS blocks it).
-- Storing a snapshot directly on the sale row gives the EOD the full
-- per-method breakdown regardless of join availability.
--
-- Shape stored: [{"method":"cash","amount":100},{"method":"card","amount":50}]

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payments_snapshot JSONB DEFAULT '[]'::jsonb;
