-- Phase 7 — Additive order_items.product_name migration (SAFE)
-- Run in Supabase SQL Editor on the LIVE database.
--
-- Symptom:
--   Could not find the 'product_name' column of 'order_items' in the schema cache
--
-- Why:
--   The app snapshots the product label into order_items.product_name at checkout
--   so order history stays correct if a product is later renamed or deleted.
--
-- Safe / idempotent:
--   - ADD COLUMN IF NOT EXISTS only
--   - no DROP / recreate
--   - no deletion of orders or order items
--   - product_id → products(id) ON DELETE SET NULL is preserved (not altered)

BEGIN;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Backfill historical labels where the product still exists
UPDATE public.order_items oi
SET product_name = p.name
FROM public.products p
WHERE oi.product_id = p.id
  AND (oi.product_name IS NULL OR btrim(oi.product_name) = '');

COMMIT;

-- Refresh PostgREST schema cache so inserts can see the new column
NOTIFY pgrst, 'reload schema';

-- ── Verification (run after the migration) ─────────────────────────────
-- Expected: one row → product_name | text
/*
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_items'
  AND column_name = 'product_name';
*/
