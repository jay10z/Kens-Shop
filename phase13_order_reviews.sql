-- ============================================================
-- Phase 13 — Post-delivery customer reviews
-- ============================================================
-- Additive only.
-- Does not alter Phase 12 functions, stock_policy, products,
-- product_events, order items, or order totals.
-- Does not backfill orders that are already Delivered.
-- A review invitation is created only when an order's status
-- changes into Delivered after this migration is applied.
--
-- The raw review token is never stored. order_reviews.token_hash
-- is the hex SHA-256 of the URL-safe token.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.order_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  rating integer,
  comment text,
  display_name text,
  status text NOT NULL DEFAULT 'invited',
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  submitted_at timestamptz,
  moderated_at timestamptz,
  CONSTRAINT order_reviews_status_check
    CHECK (status IN ('invited', 'pending', 'approved', 'rejected')),
  CONSTRAINT order_reviews_comment_len
    CHECK (comment IS NULL OR char_length(comment) <= 1000),
  CONSTRAINT order_reviews_display_name_len
    CHECK (display_name IS NULL OR char_length(display_name) <= 80),
  CONSTRAINT order_reviews_submission_check
    CHECK (
      (status = 'invited' AND rating IS NULL AND submitted_at IS NULL)
      OR (
        status IN ('pending', 'approved', 'rejected')
        AND rating BETWEEN 1 AND 5
        AND submitted_at IS NOT NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS order_reviews_status_idx
  ON public.order_reviews (status);

COMMENT ON TABLE public.order_reviews IS
  'One post-delivery review invitation per order. No product, stock, or purchase relationship.';

-- ── token helpers ────────────────────────────────────────────
-- pgcrypto may live in public (local Postgres) or extensions (Supabase).

CREATE OR REPLACE FUNCTION public.ks_new_review_token()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $fn$
DECLARE
  v_raw bytea;
BEGIN
  BEGIN
    v_raw := public.gen_random_bytes(32);
  EXCEPTION
    WHEN undefined_function THEN
      v_raw := extensions.gen_random_bytes(32);
  END;
  RETURN rtrim(translate(encode(v_raw, 'base64'), '+/', '-_'), '=');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.review_token_hash(p_token text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_hash bytea;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_hash := public.digest(convert_to(p_token, 'UTF8'), 'sha256');
  EXCEPTION
    WHEN undefined_function THEN
      v_hash := extensions.digest(convert_to(p_token, 'UTF8'), 'sha256');
  END;
  RETURN encode(v_hash, 'hex');
END;
$fn$;

-- ── invitation trigger ───────────────────────────────────────
-- AFTER UPDATE only. Does not write the orders row, products,
-- stock, purchase_count, product_events, or totals.
-- The raw token is placed in a transaction-local setting so the
-- delivery function can return it once. It is not written to a table.

CREATE OR REPLACE FUNCTION public.orders_create_review_invitation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_token text;
  v_inserted uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM 'Delivered' OR OLD.status = 'Delivered' THEN
    RETURN NULL;
  END IF;

  v_token := public.ks_new_review_token();
  INSERT INTO public.order_reviews (order_id, token_hash, status)
  VALUES (NEW.id, public.review_token_hash(v_token), 'invited')
  ON CONFLICT (order_id) DO NOTHING
  RETURNING id INTO v_inserted;

  IF v_inserted IS NOT NULL THEN
    PERFORM set_config('app.review_token', v_token, true);
  END IF;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS orders_review_invitation_after_delivered ON public.orders;

CREATE TRIGGER orders_review_invitation_after_delivered
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'Delivered' AND OLD.status <> 'Delivered')
  EXECUTE FUNCTION public.orders_create_review_invitation();

-- ── delivery write used by the admin API ─────────────────────
-- Updates status only. The trigger creates the invitation.
-- Refuses to skip confirmation for on_confirm orders that are still pending.

CREATE OR REPLACE FUNCTION public.mark_order_delivered(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_order public.orders;
  v_token text;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF v_order.stock_policy = 'on_confirm'
     AND v_order.status IN ('Pending', 'Discussing on WhatsApp') THEN
    RAISE EXCEPTION 'CONFIRM_REQUIRED';
  END IF;

  PERFORM set_config('app.review_token', '', true);

  UPDATE public.orders
  SET status = 'Delivered',
      updated_at = timezone('utc', now())
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  v_token := NULLIF(current_setting('app.review_token', true), '');
  PERFORM set_config('app.review_token', '', true);

  RETURN jsonb_build_object(
    'order', to_jsonb(v_order) - 'review_token',
    'review_token', v_token
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.review_invitation_available(p_token text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $fn$
DECLARE
  v_status text;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN false;
  END IF;

  SELECT status INTO v_status
  FROM public.order_reviews
  WHERE token_hash = public.review_token_hash(p_token);

  RETURN COALESCE(v_status = 'invited', false);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.submit_order_review(
  p_token text,
  p_rating integer,
  p_comment text,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_comment text;
  v_name text;
  v_id uuid;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9_-]{43}$' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVIEW_UNAVAILABLE');
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REVIEW');
  END IF;

  v_comment := NULLIF(btrim(COALESCE(p_comment, '')), '');
  v_name := NULLIF(btrim(COALESCE(p_display_name, '')), '');

  IF v_comment IS NOT NULL AND char_length(v_comment) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REVIEW');
  END IF;
  IF v_name IS NOT NULL AND char_length(v_name) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_REVIEW');
  END IF;

  UPDATE public.order_reviews
  SET rating = p_rating,
      comment = v_comment,
      display_name = v_name,
      status = 'pending',
      submitted_at = timezone('utc', now())
  WHERE token_hash = public.review_token_hash(p_token)
    AND status = 'invited'
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVIEW_UNAVAILABLE');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.moderate_order_review(p_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_next text;
BEGIN
  SELECT status INTO v_status
  FROM public.order_reviews
  WHERE id = p_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVIEW_NOT_FOUND');
  END IF;

  IF p_action = 'approve' AND v_status = 'pending' THEN
    v_next := 'approved';
  ELSIF p_action = 'reject' AND v_status = 'pending' THEN
    v_next := 'rejected';
  ELSIF p_action = 'remove' AND v_status = 'approved' THEN
    v_next := 'rejected';
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'REVIEW_CONFLICT');
  END IF;

  UPDATE public.order_reviews
  SET status = v_next,
      moderated_at = timezone('utc', now())
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'status', v_next);
END;
$fn$;

-- Replaces the stored hash. Returns the new raw token once.
-- Refuses after the customer has submitted, so a used review cannot be reopened.

CREATE OR REPLACE FUNCTION public.regenerate_order_review_token(p_order_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_status text;
  v_token text;
  v_id uuid;
BEGIN
  SELECT status INTO v_status
  FROM public.order_reviews
  WHERE order_id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REVIEW_NOT_FOUND';
  END IF;

  IF v_status IS DISTINCT FROM 'invited' THEN
    RAISE EXCEPTION 'REVIEW_ALREADY_SUBMITTED';
  END IF;

  v_token := public.ks_new_review_token();
  UPDATE public.order_reviews
  SET token_hash = public.review_token_hash(v_token)
  WHERE order_id = p_order_id
  RETURNING id INTO v_id;

  RETURN v_token;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.list_approved_reviews()
RETURNS TABLE (
  rating integer,
  comment text,
  display_name text,
  approved_at timestamptz
)
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT r.rating, r.comment, r.display_name, r.moderated_at
  FROM public.order_reviews r
  WHERE r.status = 'approved'
  ORDER BY r.moderated_at DESC NULLS LAST, r.submitted_at DESC;
$fn$;

-- ── RLS: no anon/authenticated policies ──────────────────────

ALTER TABLE public.order_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_reviews FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.order_reviews FROM PUBLIC;

DO $grant$
DECLARE
  fn text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.order_reviews FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.order_reviews FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_reviews TO service_role;
  END IF;

  FOREACH fn IN ARRAY ARRAY[
    'public.ks_new_review_token()',
    'public.review_token_hash(text)',
    'public.orders_create_review_invitation()',
    'public.mark_order_delivered(uuid)',
    'public.review_invitation_available(text)',
    'public.submit_order_review(text, integer, text, text)',
    'public.moderate_order_review(uuid, text)',
    'public.regenerate_order_review_token(uuid)',
    'public.list_approved_reviews()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      IF fn <> 'public.orders_create_review_invitation()' THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
      END IF;
    END IF;
  END LOOP;
END
$grant$;
