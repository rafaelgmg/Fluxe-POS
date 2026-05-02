-- migration_sale_payment_method.sql
-- Adds payment_method snapshot to the sales table.
--
-- WHY: The sales table stores no payment method — only the child `payments` rows do.
-- When the PostgREST join `payments(*)` returns empty (RLS timing, anon key, etc.),
-- normalizeSale cannot derive paymentMethod and byPaymentMethod falls back to 'unknown'.
-- Storing a snapshot directly on the sale row eliminates that dependency.
--
-- TEXT (not ENUM) because we need to store 'split' in addition to the ENUM values.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS payment_method TEXT;
