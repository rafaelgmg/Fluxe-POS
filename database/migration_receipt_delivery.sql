-- Apply after migration_receipt_queue.sql. No existing request is released.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.receipt_queue ADD COLUMN delivery_mode text NOT NULL DEFAULT 'test'
  CHECK (delivery_mode IN ('test', 'live'));
CREATE INDEX receipt_queue_live_ready ON public.receipt_queue (organization_id, requested_at, id)
  WHERE delivery_mode = 'live' AND status = 'pending' AND attempts = 0;

-- Same validation, immutable body and idempotency as enqueue_receipt; release
-- occurs in the SAME transaction. Only an explicit authenticated send calls this.
CREATE FUNCTION public.request_receipt_send(
  p_org_id uuid, p_sale_id uuid, p_requested_by uuid, p_recipient text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  v_result jsonb;
  v_row public.receipt_queue%ROWTYPE;
  v_count integer;
BEGIN
  v_result := public.enqueue_receipt(p_org_id, p_sale_id, p_requested_by, p_recipient);
  IF v_result ? 'error' THEN RETURN v_result; END IF;
  SELECT * INTO v_row FROM public.receipt_queue
    WHERE id = (v_result->>'id')::uuid AND organization_id = p_org_id
      AND sale_id = p_sale_id AND recipient = p_recipient
      AND channel = 'sms' AND purpose = 'receipt' FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invalid_request'); END IF;
  IF v_row.status = 'held' AND v_row.attempts = 0 AND v_row.provider_message_id IS NULL THEN
    -- enqueue_receipt holds the per-org/recipient advisory lock until commit.
    -- Also limit releases of old held requests, not just newly created rows.
    SELECT count(*) INTO v_count FROM public.receipt_queue
      WHERE organization_id = p_org_id AND recipient = p_recipient
        AND delivery_mode = 'live' AND status <> 'held'
        AND updated_at > now() - interval '24 hours';
    IF v_count >= 3 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
    UPDATE public.receipt_queue SET status = 'pending', delivery_mode = 'live', last_error_code = NULL
      WHERE id = v_row.id RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('id', v_row.id, 'status', v_row.status,
    'duplicate', (v_result->>'duplicate')::boolean);
EXCEPTION WHEN lock_not_available OR deadlock_detected THEN
  RETURN jsonb_build_object('error', 'queue_busy');
END;
$$;
REVOKE ALL ON FUNCTION public.request_receipt_send(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_receipt_send(uuid,uuid,uuid,text) TO service_role;

-- SKIP LOCKED and the transition happen atomically across backend replicas.
CREATE FUNCTION public.claim_receipt_send(p_org_id uuid, p_recipient text DEFAULT NULL)
RETURNS SETOF public.receipt_queue
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH candidate AS (
    SELECT id FROM public.receipt_queue
    WHERE organization_id = p_org_id AND delivery_mode = 'live'
      AND channel = 'sms' AND purpose = 'receipt'
      AND status = 'pending' AND attempts = 0 AND provider_message_id IS NULL
      AND (p_recipient IS NULL OR recipient = p_recipient)
    ORDER BY requested_at, id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE public.receipt_queue q SET status = 'processing', attempts = 1, last_error_code = NULL
  FROM candidate c WHERE q.id = c.id RETURNING q.*;
$$;
REVOKE ALL ON FUNCTION public.claim_receipt_send(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_receipt_send(uuid,text) TO service_role;
COMMIT;
