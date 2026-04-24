-- Migration: create inventory_transfers table for cross-kiosk stock transfers
-- Run once against existing Supabase database.

CREATE TABLE IF NOT EXISTS inventory_transfers (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID        NOT NULL REFERENCES organizations(id),
  from_location_id    UUID        NOT NULL REFERENCES locations(id),
  from_location_name  TEXT        NOT NULL DEFAULT '',
  to_location_id      UUID        NOT NULL REFERENCES locations(id),
  to_location_name    TEXT        NOT NULL DEFAULT '',
  product_id          UUID        REFERENCES products(id) ON DELETE SET NULL,
  product_name        TEXT        NOT NULL DEFAULT '',
  barcode             TEXT        NOT NULL DEFAULT '',
  qty                 INTEGER     NOT NULL CHECK (qty > 0),
  note                TEXT        NOT NULL DEFAULT '',
  sent_by             TEXT        NOT NULL DEFAULT '',
  status              TEXT        NOT NULL DEFAULT 'sent'
                      CHECK (status IN ('sent', 'received', 'cancelled')),
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfers_to_location   ON inventory_transfers (to_location_id, status);
CREATE INDEX IF NOT EXISTS idx_transfers_from_location ON inventory_transfers (from_location_id);
CREATE INDEX IF NOT EXISTS idx_transfers_org           ON inventory_transfers (organization_id, sent_at DESC);
