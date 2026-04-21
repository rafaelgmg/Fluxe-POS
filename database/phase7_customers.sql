-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 7: CRM — customers table
--
-- Run ONCE in the Supabase SQL Editor.
--
-- Design decisions:
--   - phone_normalized stored by the app (digits only) — not GENERATED ALWAYS AS
--     so it can be updated freely without PostgreSQL immutability restrictions.
--   - purchases JSONB embedded (denormalized) for offline-first compat.
--     Phase 8+ will normalize via sales.linked_customer_id FK.
--   - Dedup: unique partial index on phone_normalized (when not archived),
--     and on lower(email) (when email != '' and not archived).
--   - Multi-tenant: every row tied to organization_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Table ──────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS customers (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identity
  first_name           TEXT        NOT NULL DEFAULT '',
  last_name            TEXT        NOT NULL DEFAULT '',
  phone                TEXT        NOT NULL DEFAULT '',
  phone_normalized     TEXT        NOT NULL DEFAULT '',  -- digits only, set by app
  email                TEXT        NOT NULL DEFAULT '',
  birthday             TEXT        NOT NULL DEFAULT '',  -- stored as 'YYYY-MM-DD' or ''

  -- Preferences
  fragrance_preferences JSONB      NOT NULL DEFAULT '[]',
  marketing_consent    BOOLEAN     NOT NULL DEFAULT FALSE,
  preferred_channel    TEXT        NOT NULL DEFAULT '',
  notes                TEXT        NOT NULL DEFAULT '',
  tags                 JSONB       NOT NULL DEFAULT '[]',
  crm_score            INTEGER     NOT NULL DEFAULT 0,

  -- Capture context
  captured_by_user_id  UUID        REFERENCES users(id) ON DELETE SET NULL,
  captured_location_id UUID        REFERENCES locations(id) ON DELETE SET NULL,
  captured_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Purchase history (denormalized, offline-first)
  purchases            JSONB       NOT NULL DEFAULT '[]',
  last_interaction     TIMESTAMPTZ,

  -- Lifecycle
  archived             BOOLEAN     NOT NULL DEFAULT FALSE,
  archived_at          TIMESTAMPTZ,

  -- Legacy local ID from localStorage (for migration dedup)
  legacy_local_id      TEXT,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── Deduplication indexes ──────────────────────────────────────────────────────

-- Phone dedup: one active (non-archived) customer per phone per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_phone_org
  ON customers (organization_id, phone_normalized)
  WHERE phone_normalized != '' AND archived = FALSE;

-- Email dedup: one active customer per email per org
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_email_org
  ON customers (organization_id, lower(email))
  WHERE email != '' AND archived = FALSE;


-- ── Auto-updated_at trigger ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ── RLS (prep — policies added in Phase 9) ────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;


-- ── Validation ────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) AS total_customers,
  COUNT(*) FILTER (WHERE archived = FALSE) AS active_customers
FROM customers;
