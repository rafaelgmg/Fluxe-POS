-- Migration: add cost_price snapshot to sale_items
-- Run once against existing Supabase database.
-- Existing rows default to 0 (acceptable — pre-migration sales have no cost data).

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10,2) NOT NULL DEFAULT 0;
