-- migration_transfer_draft.sql
-- Adds 'draft' status to inventory_transfers so Transfer Suggestions
-- can be saved without moving stock until explicitly completed.
--
-- SAFE: only relaxes the check constraint and adds a nullable column.
-- No data migration needed. No stock is altered.

-- 1. Drop the old status check and recreate with 'draft' + 'cancelled'
ALTER TABLE public.inventory_transfers
  DROP CONSTRAINT IF EXISTS inventory_transfers_status_check;

ALTER TABLE public.inventory_transfers
  ADD CONSTRAINT inventory_transfers_status_check
  CHECK (status IN ('draft', 'sent', 'received', 'cancelled'));

-- 2. Add created_by column (who created the draft — e.g. "Dashboard Owner")
ALTER TABLE public.inventory_transfers
  ADD COLUMN IF NOT EXISTS created_by TEXT NOT NULL DEFAULT '';

-- 3. Index for fast draft lookup per org
CREATE INDEX IF NOT EXISTS idx_transfers_draft
  ON public.inventory_transfers (organization_id, status)
  WHERE status = 'draft';
