-- migration_location_type.sql
-- Adds location_type column to location_configs table.
-- Values: 'retail' (default) | 'warehouse'
-- retail  → appears in POS, sales, EOD, Competition, Dashboard sales
-- warehouse → appears in Inventory & Transfers only; hidden from POS/EOD/Competition

ALTER TABLE public.location_configs
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'retail';

-- Constraint: only valid values allowed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'location_configs_location_type_check'
  ) THEN
    ALTER TABLE public.location_configs
      ADD CONSTRAINT location_configs_location_type_check
      CHECK (location_type IN ('retail', 'warehouse'));
  END IF;
END$$;

-- Index for fast filtering
CREATE INDEX IF NOT EXISTS idx_location_configs_location_type
  ON public.location_configs (organization_id, location_type);
