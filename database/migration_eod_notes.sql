-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: eod_notes
-- Stores End of Day notes per organization / location / date.
-- One row per (org, location, date) — unique constraint enables upsert.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS eod_notes (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_name   text        NOT NULL,
  report_date     date        NOT NULL,
  notes           text        NOT NULL DEFAULT '',
  created_by      text,
  updated_by      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),

  CONSTRAINT eod_notes_unique UNIQUE (organization_id, location_name, report_date)
);

-- Auto-update updated_at on every write
CREATE TRIGGER eod_notes_updated_at
  BEFORE UPDATE ON eod_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Index for the most common access pattern
CREATE INDEX IF NOT EXISTS eod_notes_org_loc_date
  ON eod_notes (organization_id, location_name, report_date DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE eod_notes ENABLE ROW LEVEL SECURITY;

-- Machine account (authenticated) can read/write only its own org
CREATE POLICY "eod_notes_select" ON eod_notes
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "eod_notes_insert" ON eod_notes
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "eod_notes_update" ON eod_notes
  FOR UPDATE TO authenticated
  USING (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());
