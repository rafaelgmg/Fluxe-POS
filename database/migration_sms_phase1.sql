-- ─────────────────────────────────────────────────────────────────────────────
-- migration_sms_phase1.sql
-- CRM Messaging Phase 1 — SMS consent tracking + message log
--
-- Run once in Supabase SQL Editor.
-- Safe to re-run: all statements use IF NOT EXISTS / DO $$ guards.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add SMS consent columns to customers ───────────────────────────────────

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sms_consent_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (sms_consent_status IN ('unknown', 'opted_in', 'opted_out')),

  ADD COLUMN IF NOT EXISTS sms_consent_source TEXT
    CHECK (sms_consent_source IN ('checkout', 'manual', 'imported', 'reply')),

  ADD COLUMN IF NOT EXISTS sms_opted_out_at TIMESTAMPTZ;

COMMENT ON COLUMN customers.sms_consent_status IS
  'unknown = not yet determined; opted_in = affirmative; opted_out = replied STOP or manually removed';

COMMENT ON COLUMN customers.sms_consent_source IS
  'How the consent status was last set';

-- ── 2. customer_messages table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customer_messages (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID        NOT NULL REFERENCES organizations(id),
  location_id        UUID        REFERENCES locations(id),
  customer_id        UUID        NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sent_by_user_id    UUID        REFERENCES users(id),

  direction          TEXT        NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  channel            TEXT        NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'whatsapp')),
  body               TEXT        NOT NULL,

  status             TEXT        NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  twilio_message_sid TEXT,
  error_message      TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE customer_messages IS
  'All SMS/WhatsApp messages sent to or received from customers. Outbound = sent by staff, inbound = customer reply.';

-- ── 3. Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_customer_messages_customer_id
  ON customer_messages (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_messages_org_id
  ON customer_messages (organization_id);

CREATE INDEX IF NOT EXISTS idx_customer_messages_created_at
  ON customer_messages (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_messages_twilio_sid
  ON customer_messages (twilio_message_sid)
  WHERE twilio_message_sid IS NOT NULL;

-- ── 4. Auto-update updated_at trigger ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION _update_customer_messages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_messages_updated_at ON customer_messages;
CREATE TRIGGER trg_customer_messages_updated_at
  BEFORE UPDATE ON customer_messages
  FOR EACH ROW EXECUTE FUNCTION _update_customer_messages_updated_at();

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE customer_messages ENABLE ROW LEVEL SECURITY;

-- Machine account / authenticated users can SELECT messages within their org
DROP POLICY IF EXISTS "org_members_read_messages" ON customer_messages;
CREATE POLICY "org_members_read_messages"
  ON customer_messages FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Machine account / authenticated users can INSERT outbound messages within their org
DROP POLICY IF EXISTS "org_members_insert_messages" ON customer_messages;
CREATE POLICY "org_members_insert_messages"
  ON customer_messages FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Service role (used by Express backend) bypasses RLS — no extra policy needed.

-- ── 6. Backfill: mark existing opted-in customers ─────────────────────────────
-- Customers who explicitly gave marketing_consent get sms_consent_status = 'opted_in'
-- so the legacy field continues to work in Phase 1.

UPDATE customers
SET
  sms_consent_status = 'opted_in',
  sms_consent_source = 'imported'
WHERE
  marketing_consent   = TRUE
  AND sms_consent_status = 'unknown';

-- ── Done ──────────────────────────────────────────────────────────────────────
-- Verify with:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'customers'
--   AND column_name LIKE 'sms%';
--
--   SELECT count(*) FROM customer_messages;
