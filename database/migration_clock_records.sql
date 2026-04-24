-- Migration: add clock_records table for cross-kiosk clock-in/clock-out sync
-- Run once against existing Supabase database.
-- Existing localStorage clock records are NOT migrated (historical data not needed).

CREATE TABLE IF NOT EXISTS clock_records (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID         NOT NULL REFERENCES organizations(id),
  location_id      UUID         REFERENCES locations(id) ON DELETE SET NULL,
  location_name    TEXT         NOT NULL DEFAULT '',
  employee_id      UUID         REFERENCES users(id)     ON DELETE SET NULL,
  employee_name    TEXT         NOT NULL,
  clock_in         TIMESTAMPTZ  NOT NULL,
  clock_out        TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clock_records_org_date ON clock_records (organization_id, clock_in DESC);
CREATE INDEX IF NOT EXISTS idx_clock_records_location ON clock_records (location_id) WHERE location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clock_records_employee ON clock_records (employee_id)  WHERE employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clock_records_active   ON clock_records (organization_id, clock_in DESC) WHERE clock_out IS NULL;

CREATE OR REPLACE TRIGGER trg_clock_records_updated_at
  BEFORE UPDATE ON clock_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
