-- Stage 3: prepare only. Apply explicitly after reviewing against the deployed schema.
-- No worker consumes this queue yet. New requests are HELD, never automatically sent.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE public.receipt_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  sale_id uuid NOT NULL,
  requested_by_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Immutable historical identifier; deliberately not a foreign key.
  requested_by_auth_user_snapshot uuid NOT NULL,
  CHECK (requested_by_auth_user_id IS NULL OR requested_by_auth_user_id = requested_by_auth_user_snapshot),
  recipient text NOT NULL CHECK (recipient ~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$'),
  channel text NOT NULL DEFAULT 'sms' CHECK (channel = 'sms'),
  purpose text NOT NULL DEFAULT 'receipt' CHECK (purpose = 'receipt'),
  message_body text NOT NULL CHECK (length(message_body) BETWEEN 1 AND 2000),
  consent_source text NOT NULL DEFAULT 'kiosk_receipt_request' CHECK (consent_source = 'kiosk_receipt_request'),
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'held' CHECK (status IN ('held','pending','processing','sent','failed','uncertain','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  provider_message_id text,
  last_error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, sale_id, channel, purpose),
  FOREIGN KEY (sale_id, organization_id) REFERENCES public.sales(id, organization_id)
);
CREATE INDEX receipt_queue_ready ON public.receipt_queue (status, next_attempt_at);
CREATE INDEX receipt_queue_recipient ON public.receipt_queue (organization_id, recipient, requested_at);

CREATE FUNCTION public.receipt_queue_before_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF ROW(NEW.organization_id, NEW.sale_id, NEW.recipient, NEW.channel, NEW.purpose,
         NEW.message_body, NEW.consent_source, NEW.requested_at, NEW.requested_by_auth_user_snapshot)
     IS DISTINCT FROM
     ROW(OLD.organization_id, OLD.sale_id, OLD.recipient, OLD.channel, OLD.purpose,
         OLD.message_body, OLD.consent_source, OLD.requested_at, OLD.requested_by_auth_user_snapshot) THEN
    RAISE EXCEPTION 'Receipt request audit fields are immutable' USING ERRCODE = '23514';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;
CREATE TRIGGER receipt_queue_before_update
BEFORE UPDATE ON public.receipt_queue
FOR EACH ROW EXECUTE FUNCTION public.receipt_queue_before_update();
REVOKE ALL ON FUNCTION public.receipt_queue_before_update() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.receipt_queue ENABLE ROW LEVEL SECURITY;
-- Browser JWTs must go through Express. No client policies or direct writes.
REVOKE ALL ON public.receipt_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.receipt_queue TO service_role;

CREATE FUNCTION public.enqueue_receipt(
  p_org_id uuid, p_sale_id uuid, p_requested_by uuid, p_recipient text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
SET lock_timeout = '3s'
AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
  v_existing public.receipt_queue%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_count integer;
  v_message text;
  v_items jsonb;
  v_item_count integer;
  v_item_subtotal numeric;
  v_payment_total numeric;
  v_payment_count integer;
BEGIN
  IF p_recipient IS NULL OR p_recipient !~ '^\+1[2-9][0-9]{2}[2-9][0-9]{6}$' THEN
    RETURN jsonb_build_object('error', 'invalid_request');
  END IF;
  PERFORM id FROM auth.users WHERE id = p_requested_by
    AND raw_app_meta_data ->> 'org_id' = p_org_id::text FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'organization_denied');
  END IF;
  -- Serialize requests for the same destination, across sales in this org.
  IF NOT pg_try_advisory_xact_lock(hashtextextended(p_org_id::text || ':' || p_recipient, 0)) THEN
    RETURN jsonb_build_object('error', 'queue_busy');
  END IF;
  -- Serialize all requests for this sale, including attempts to change destination.
  SELECT * INTO v_sale FROM public.sales
    WHERE id = p_sale_id AND organization_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'sale_not_found'); END IF;
  IF v_sale.status::text <> 'completed' THEN
    RETURN jsonb_build_object('error', 'sale_not_completed');
  END IF;
  -- Parent FOR UPDATE conflicts with FK checks for new children. Lock existing
  -- children as well so their amounts/names cannot change while building the receipt.
  PERFORM id FROM public.sale_items WHERE sale_id = p_sale_id ORDER BY id FOR SHARE;
  PERFORM id FROM public.payments WHERE sale_id = p_sale_id ORDER BY id FOR SHARE;
  SELECT count(*), sum(subtotal), jsonb_agg(jsonb_build_object(
    'name', name, 'qty', qty, 'subtotal', subtotal) ORDER BY created_at, id)
    INTO v_item_count, v_item_subtotal, v_items FROM public.sale_items WHERE sale_id = p_sale_id;
  SELECT count(*), sum(amount) INTO v_payment_count, v_payment_total
    FROM public.payments WHERE sale_id = p_sale_id;
  IF v_sale.total <= 0 OR v_sale.subtotal + v_sale.tax + v_sale.tip <> v_sale.total
     OR v_item_count = 0 OR v_payment_count = 0
     OR v_item_subtotal <> v_sale.subtotal OR v_payment_total <> v_sale.total THEN
    RETURN jsonb_build_object('error', 'sale_incomplete');
  END IF;
  IF EXISTS (SELECT 1 FROM public.customers WHERE organization_id = p_org_id
    AND phone_normalized IN (p_recipient, substring(p_recipient FROM 2), substring(p_recipient FROM 3))
    AND sms_consent_status = 'opted_out') THEN
    RETURN jsonb_build_object('error', 'opted_out');
  END IF;
  IF v_sale.linked_customer_id IS NOT NULL THEN
    SELECT * INTO v_customer FROM public.customers WHERE id = v_sale.linked_customer_id
      AND organization_id = p_org_id FOR SHARE;
    IF NOT FOUND OR v_customer.archived OR v_customer.sms_consent_status = 'opted_out'
      OR regexp_replace(v_customer.phone, '[^0-9]', '', 'g') NOT IN
        (substring(p_recipient FROM 2), substring(p_recipient FROM 3)) THEN
      RETURN jsonb_build_object('error', 'recipient_denied');
    END IF;
  END IF;
  SELECT * INTO v_existing FROM public.receipt_queue
    WHERE organization_id = p_org_id AND sale_id = p_sale_id AND channel = 'sms' AND purpose = 'receipt';
  IF FOUND THEN
    IF v_existing.recipient <> p_recipient THEN
      RETURN jsonb_build_object('error', 'recipient_conflict');
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', true);
  END IF;
  SELECT count(*) INTO v_count FROM public.receipt_queue
    WHERE organization_id = p_org_id AND recipient = p_recipient AND requested_at > now() - interval '24 hours';
  IF v_count >= 3 THEN RETURN jsonb_build_object('error', 'rate_limit'); END IF;
  -- Construct the authoritative body from the same locked snapshot checked above.
  -- The browser/server preview is informational and is never accepted by this RPC.
  SELECT string_agg(
    left(regexp_replace(item->>'name', E'[\r\n\t]', ' ', 'g'), 80)
    || ' x' || (item->>'qty') || ' - $' || ((item->>'subtotal')::numeric(10,2))::text,
    E'\n' ORDER BY ordinal)
    INTO v_message FROM jsonb_array_elements(v_items) WITH ORDINALITY AS lines(item, ordinal)
    WHERE ordinal <= 4;
  v_message := coalesce(nullif(left(regexp_replace(v_sale.location_name, E'[\r\n\t]', ' ', 'g'), 80), ''), 'Fluxe')
    || ' - Receipt #' || v_sale.number::text || E'\n' || v_message
    || CASE WHEN v_item_count > 4 THEN E'\n+' || (v_item_count - 4)::text || ' more items' ELSE '' END
    || E'\nTotal: $' || (v_sale.total::numeric(10,2))::text || E'\nThank you for shopping with us!';
  INSERT INTO public.receipt_queue (organization_id, sale_id, requested_by_auth_user_id,
    requested_by_auth_user_snapshot, recipient, message_body)
    VALUES (p_org_id, p_sale_id, p_requested_by, p_requested_by, p_recipient, v_message)
    RETURNING * INTO v_existing;
  RETURN jsonb_build_object('id', v_existing.id, 'status', v_existing.status, 'duplicate', false);
EXCEPTION
  WHEN lock_not_available OR deadlock_detected THEN
    RETURN jsonb_build_object('error', 'queue_busy');
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_receipt(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_receipt(uuid, uuid, uuid, text) TO service_role;
COMMIT;
