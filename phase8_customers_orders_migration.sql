-- Phase 8 — Additive customers + order intelligence (SAFE)
-- First successful production application of Phase 8.
-- Run once in Supabase SQL Editor on the LIVE database.
--
-- Why:
--   Guest checkout needs a customers table, phone matching, and orders.customer_id.
--   The live orders table currently has no customer_name / whatsapp_number / customer_id.
--
-- Status compatibility (PostgreSQL CHECK is case-sensitive):
--   Production already contains lowercase 'pending' and 'delivered'.
--   The application also uses PascalCase + legacy title-case statuses.
--   This migration widens the allowlist to cover known real values only.
--   It does NOT UPDATE or normalize existing order rows.
--
-- Safe / mostly idempotent:
--   - CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
--   - CREATE INDEX IF NOT EXISTS
--   - guarded foreign key (orders_customer_id_fkey)
--   - guarded status CHECK replace (drop known status-IN constraints, then ADD IF missing)
--   - no DROP of tables
--   - no DELETE/UPDATE of products, orders, or order_items
--   - no customer_id backfill (historical rows stay NULL)
--
-- Not perfectly idempotent:
--   - Re-running after a partial failure mid-transaction is safe (BEGIN/COMMIT).
--   - Re-running after success is mostly safe; the status CHECK block drops then
--     re-adds only when orders_status_check is missing after the drop loop.
--
-- After running: existing products, orders, and order_items must still be present
-- with unchanged row counts and unchanged status values.

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

-- ── 3) Order status CHECK — controlled replace ───────────────────────────────
-- Known real values only:
--   App canonical: Pending, Confirmed, Processing, Delivered, Cancelled
--   App legacy:    Discussing on WhatsApp, Preparing, Out for Delivery
--   Production:    pending, delivered
--
-- Drop only CHECK constraints that actually restrict orders.status via
-- a "status IN (...)" definition. Do not drop unrelated CHECKs that merely
-- mention the word "status".
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'orders'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ~* '\ystatus\y\s+IN\s*\('
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
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
          'Out for Delivery',
          'pending',
          'delivered'
        )
      );
  END IF;
END $$;

COMMIT;

-- ── 4) RLS: customer records are admin/API-only (service role bypasses RLS) ─
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Intentionally no policies for anon / authenticated.
-- Storefront never queries this table from the browser; /api uses the service role.

NOTIFY pgrst, 'reload schema';

-- ── Verification (read-only; run separately AFTER the migration) ────────────
/*
SELECT COUNT(*) AS products FROM public.products;
SELECT COUNT(*) AS orders FROM public.orders;
SELECT COUNT(*) AS order_items FROM public.order_items;

SELECT status, COUNT(*) AS n
FROM public.orders
GROUP BY status
ORDER BY status;

SELECT COUNT(*) AS customers FROM public.customers;

SELECT COUNT(*) AS orders_without_customer
FROM public.orders
WHERE customer_id IS NULL;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'customers'
ORDER BY ordinal_position;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'orders'
  AND column_name IN ('customer_id', 'customer_name', 'whatsapp_number', 'status')
ORDER BY column_name;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'orders_status_check';
*/
