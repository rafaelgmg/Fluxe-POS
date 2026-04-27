-- migration_campaigns.sql
-- Adds 'dry_run' as a valid status in customer_messages
-- Run AFTER migration_sms_phase1.sql

-- Drop old status constraint and re-add with dry_run included
ALTER TABLE customer_messages
  DROP CONSTRAINT IF EXISTS customer_messages_status_check;

ALTER TABLE customer_messages
  ADD CONSTRAINT customer_messages_status_check
  CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'dry_run'));
