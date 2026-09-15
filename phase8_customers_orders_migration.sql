-- Phase 8 — Additive customers + order intelligence (SAFE)
-- Run in Supabase SQL Editor on the LIVE database.
--
-- Why:
--   Guest checkout needs a customers table, phone matching, and orders.customer_id.
--   The live orders table currently has no customer_name / whatsapp_number / customer_id.
--
-- Safe / idempotent:
--   - CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS only
--   - no DROP of tables
--   - no deletion of products, orders, or order_items
--   - existing orders stay valid (customer_id is nullable; historical rows are not backfilled)
--   - legacy order statuses remain allowed so existing CHECK rows are not rewritten
--
-- After running: existing products, orders, and order_items must still be present.

BEGIN;

-- ── 1) Customers ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  email TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now());

-- Unique match key: same person must not become multiple rows because of +237 / 237 / local format
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_normalized_phone
  ON public.customers (normalized_phone);

CREATE INDEX IF NOT EXISTS idx_customers_created_at
  ON public.customers (created_at);

CREATE INDEX IF NOT EXISTS idx_customers_email
  ON public.customers (email)
  WHERE email IS NOT NULL;

-- ── 2) Link orders → customers (nullable so historical orders stay valid) ────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_customer_id_fkey'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id
  ON public.orders (customer_id);

-- Snapshot fields for admin/WhatsApp (present in canonical schema, missing on live DB)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_number TEXT;

-- ── 3) Order lifecycle ───────────────────────────────────────────────────────
-- New canonical values: Pending, Confirmed, Processing, Delivered, Cancelled
-- Legacy values are kept so existing rows remain valid.
-- Drop any existing status CHECK (name may differ between environments).
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (
    status IN (
      'Pending',
      'Confirmed',
      'Processing',
      'Delivered',
      'Cancelled',
      'Discussing on WhatsApp',
      'Preparing',
      'Out for Delivery'
    )
  );

COMMIT;

-- ── 4) RLS: customer records are admin/API-only (service role bypasses RLS) ─
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies for anon / authenticated.
-- Storefront never queries this table from the browser; /api uses the service role.

NOTIFY pgrst, 'reload schema';

-- ── Verification (run after the migration) ──────────────────────────────────
/*
SELECT COUNT(*) AS products FROM public.products;
SELECT COUNT(*) AS orders FROM public.orders;
SELECT COUNT(*) AS order_items FROM public.order_items;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
ORDER BY ordinal_position;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN ('customer_id', 'customer_name', 'whatsapp_number', 'status');
*/
