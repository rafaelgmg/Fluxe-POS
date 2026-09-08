-- migration_org_settings.sql
-- Stores per-organization branding & configuration so each tenant can be
-- customized without touching code. Row-level security ensures each machine
-- account only reads its own org row.

CREATE TABLE IF NOT EXISTS org_settings (
  organization_id   uuid         PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  business_name     text         NOT NULL DEFAULT 'My Business',
  business_short    text         NOT NULL DEFAULT 'MY BUSINESS',
  industry          text,
  tax_rate          float        NOT NULL DEFAULT 0.085,
  currency_symbol   text         NOT NULL DEFAULT '$',
  locations         jsonb        NOT NULL DEFAULT '[]'::jsonb,
  colors            jsonb,
  receipt_footer    text         NOT NULL DEFAULT 'No Refunds. Exchanges within 14 days.',
  receipt_legal     text         NOT NULL DEFAULT 'Thank you for your purchase!',
  crm_sms_signature text,
  updated_at        timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_settings_select" ON org_settings
  FOR SELECT TO authenticated
  USING (organization_id = auth_org_id());

CREATE POLICY "org_settings_update" ON org_settings
  FOR UPDATE TO authenticated
  USING  (organization_id = auth_org_id())
  WITH CHECK (organization_id = auth_org_id());

-- Seed row — replace 'your-org-uuid-here' with your actual organization UUID
-- Find it: SELECT id FROM organizations LIMIT 1; (run in Supabase SQL Editor)
INSERT INTO org_settings (
  organization_id,
  business_name,
  business_short,
  industry,
  tax_rate,
  currency_symbol,
  locations,
  receipt_footer,
  receipt_legal,
  crm_sms_signature
) VALUES (
  'your-org-uuid-here',
  'Perfume Passage',
  'PERFUME PASSAGE',
  'Perfume & Fragrance',
  0.085,
  '$',
  '[
    {
      "id": "loc_01",
      "name": "Miracle Mall 01",
      "address": "3663 Las Vegas Blvd, Las Vegas, Nevada",
      "region": "Las Vegas",
      "phone": "",
      "business_type": "retail",
      "location_type": "retail"
    },
    {
      "id": "loc_02",
      "name": "Perfume Passage",
      "address": "Las Vegas, Nevada",
      "region": "Las Vegas",
      "phone": "",
      "business_type": "retail",
      "location_type": "retail"
    }
  ]'::jsonb,
  'No Refunds. Exchanges within 14 days.',
  'Thank you for your purchase!',
  '— Perfume Passage'
)
ON CONFLICT (organization_id) DO NOTHING;
