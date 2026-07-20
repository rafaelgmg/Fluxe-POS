-- migration_bonus_rules.sql
-- Tabela para sync cross-kiosk das bonus rules (substitui localStorage isolado por dispositivo).
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS bonus_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date            date        NOT NULL,
  location        text        NOT NULL,
  tiers           jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, date, location)
);

ALTER TABLE bonus_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_select" ON bonus_rules
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_isolation_insert" ON bonus_rules
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_update" ON bonus_rules
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

CREATE POLICY "org_isolation_delete" ON bonus_rules
  FOR DELETE TO authenticated
  USING (organization_id = auth_org_id());
