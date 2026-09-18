-- ============================================================
-- Phase 11 — Atomic order reservation + stock decrement (H1)
-- ============================================================
-- Creates public.create_order_with_stock(...)
-- Called ONLY by Vercel /api/orders via the service_role client.
--
-- Safe to re-run (CREATE OR REPLACE). Does NOT rewrite business rows.
--
-- Production order_items columns used by this function:
--   order_id, product_id, product_name, quantity, price
-- Color/model may appear in the RPC *input* and *response* JSON for
-- WhatsApp/cart UX, but are NOT persisted to order_items (those columns
-- do not exist on the current production table).
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_order_with_stock(
  p_customer_id uuid,
  p_customer_name text,
  p_whatsapp_number text,
  p_order_number text,
  p_items jsonb,
  p_user_email text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_product_id uuid;
  v_qty_num numeric;
  v_qty int;
  v_color text;
  v_model text;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_demand jsonb := '{}'::jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_pid text;
  v_need int;
  v_row record;
  v_price numeric(10, 2);
  v_name text;
  v_total numeric(10, 2) := 0;
  v_order_id uuid;
  v_order_number text;
  v_now timestamptz := timezone('utc'::text, now());
  v_items_out jsonb := '[]'::jsonb;
  v_locked int := 0;
  v_updated int;
  v_line jsonb;
  v_prices jsonb := '{}'::jsonb;
  v_names jsonb := '{}'::jsonb;
BEGIN
  IF p_customer_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_CART' USING ERRCODE = 'P0001';
  END IF;

  IF p_order_number IS NULL OR length(trim(p_order_number)) = 0 THEN
    RAISE EXCEPTION 'INVALID_CART' USING ERRCODE = 'P0001';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
  END IF;

  -- Normalize lines + aggregate stock demand by product_id.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_product_id := NULLIF(trim(v_item->>'product_id'), '')::uuid;
    EXCEPTION
      WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
    END;

    IF v_product_id IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
    END IF;

    -- Quantity must be a JSON number that is an integer > 0 (reject strings/decimals).
    IF jsonb_typeof(v_item->'quantity') <> 'number' THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
    END IF;

    v_qty_num := (v_item->>'quantity')::numeric;
    IF v_qty_num IS NULL OR v_qty_num <= 0 OR v_qty_num <> trunc(v_qty_num) THEN
      RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
    END IF;
    v_qty := v_qty_num::int;

    v_color := NULLIF(trim(v_item->>'color'), '');
    v_model := NULLIF(trim(v_item->>'model'), '');

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_product_id,
        'quantity', v_qty,
        'color', v_color,
        'model', v_model
      )
    );

    v_pid := v_product_id::text;
    v_need := COALESCE((v_demand->>v_pid)::int, 0) + v_qty;
    v_demand := jsonb_set(v_demand, ARRAY[v_pid], to_jsonb(v_need), true);

    IF NOT (v_product_id = ANY (v_product_ids)) THEN
      v_product_ids := array_append(v_product_ids, v_product_id);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = 'P0001';
  END IF;

  -- Deterministic row locks (ordered by id) to avoid deadlocks under concurrency.
  FOR v_row IN
    SELECT p.id, p.price, p.stock_quantity, p.active, p.hidden, p.name
    FROM public.products p
    WHERE p.id = ANY (v_product_ids)
    ORDER BY p.id
    FOR UPDATE
  LOOP
    v_locked := v_locked + 1;
    v_pid := v_row.id::text;
    v_need := COALESCE((v_demand->>v_pid)::int, 0);

    IF v_row.active IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'PRODUCT_INACTIVE' USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_row.hidden, false) IS TRUE THEN
      RAISE EXCEPTION 'PRODUCT_HIDDEN' USING ERRCODE = 'P0001';
    END IF;

    IF COALESCE(v_row.stock_quantity, 0) < v_need THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
    END IF;

    v_prices := jsonb_set(v_prices, ARRAY[v_pid], to_jsonb(v_row.price::numeric(10, 2)), true);
    v_names := jsonb_set(v_names, ARRAY[v_pid], to_jsonb(v_row.name), true);
  END LOOP;

  IF v_locked <> cardinality(v_product_ids) THEN
    RAISE EXCEPTION 'PRODUCT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  -- Authoritative line prices + server total (preserve request line order).
  FOR v_line IN SELECT value FROM jsonb_array_elements(v_lines)
  LOOP
    v_pid := v_line->>'product_id';
    v_price := (v_prices->>v_pid)::numeric(10, 2);
    v_name := v_names->>v_pid;
    v_qty := (v_line->>'quantity')::int;
    v_total := (v_total + (v_price * v_qty))::numeric(10, 2);

    v_items_out := v_items_out || jsonb_build_array(
      jsonb_build_object(
        'product_id', (v_line->>'product_id')::uuid,
        'product_name', v_name,
        'quantity', v_qty,
        'price', v_price,
        'color', v_line->'color',
        'model', v_line->'model'
      )
    );
  END LOOP;

  -- Normalize JSON nulls for color/model in the *response* only
  -- (not written to order_items — production has no color/model columns).
  v_order_number := trim(p_order_number);

  INSERT INTO public.orders (
    order_number,
    total,
    status,
    customer_id,
    customer_name,
    whatsapp_number,
    user_email,
    created_at,
    updated_at
  )
  VALUES (
    v_order_number,
    v_total,
    'Pending',
    p_customer_id,
    NULLIF(trim(p_customer_name), ''),
    NULLIF(trim(p_whatsapp_number), ''),
    NULLIF(trim(p_user_email), ''),
    v_now,
    v_now
  )
  RETURNING id INTO v_order_id;

  -- Persist only columns that exist on production order_items.
  INSERT INTO public.order_items (
    order_id,
    product_id,
    product_name,
    quantity,
    price
  )
  SELECT
    v_order_id,
    (e->>'product_id')::uuid,
    e->>'product_name',
    (e->>'quantity')::int,
    (e->>'price')::numeric(10, 2)
  FROM jsonb_array_elements(v_items_out) AS t(e);

  -- Atomic decrement with stock guard (defense in depth after FOR UPDATE).
  FOR v_pid, v_need IN
    SELECT key, value::int FROM jsonb_each_text(v_demand)
  LOOP
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_need
    WHERE id = v_pid::uuid
      AND stock_quantity >= v_need;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated <> 1 THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'status', 'Pending',
    'customer_id', p_customer_id,
    'customer_name', NULLIF(trim(p_customer_name), ''),
    'whatsapp_number', NULLIF(trim(p_whatsapp_number), ''),
    'user_email', NULLIF(trim(p_user_email), ''),
    'created_at', v_now,
    'updated_at', v_now,
    'items', v_items_out
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_with_stock(uuid, text, text, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_with_stock(uuid, text, text, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.create_order_with_stock(uuid, text, text, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_with_stock(uuid, text, text, text, jsonb, text) TO service_role;

COMMENT ON FUNCTION public.create_order_with_stock(uuid, text, text, text, jsonb, text) IS
  'H1: Atomically validate catalog lines, create order + items, and decrement stock. service_role only. Accepts optional color/model in p_items JSON and echoes them in the response; does not persist color/model to order_items (production schema has no such columns).';
