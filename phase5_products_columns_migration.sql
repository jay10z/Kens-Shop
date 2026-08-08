-- Phase 5 — Additive products columns migration
-- Run in Supabase SQL Editor (safe for live data).
-- Does NOT drop tables, delete rows, or recreate products.
--
-- WHY: The app expects colors, models, short_description, low_stock_threshold,
-- featured, hidden, display_priority, etc. schema.sql lists them, but the LIVE
-- database may never have received sprint1 / smart_ranking migrations.
-- PostgREST error: Could not find the 'colors' column of 'products' in the schema cache

BEGIN;

-- Required product fields (additive only)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_priority INTEGER,
  ADD COLUMN IF NOT EXISTS purchase_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cart_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5,
  ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS models TEXT[] DEFAULT '{}';

-- Normalize NULLs on existing rows only where needed (no other data changes)
UPDATE products SET featured = false WHERE featured IS NULL;
UPDATE products SET hidden = false WHERE hidden IS NULL;
UPDATE products SET purchase_count = 0 WHERE purchase_count IS NULL;
UPDATE products SET view_count = 0 WHERE view_count IS NULL;
UPDATE products SET cart_count = 0 WHERE cart_count IS NULL;
UPDATE products SET low_stock_threshold = 5 WHERE low_stock_threshold IS NULL;
UPDATE products SET colors = '{}'::text[] WHERE colors IS NULL;
UPDATE products SET models = '{}'::text[] WHERE models IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_hidden ON products(hidden);
CREATE INDEX IF NOT EXISTS idx_products_display_priority ON products(display_priority);

COMMIT;

-- Refresh PostgREST schema cache so the new columns are visible immediately
NOTIFY pgrst, 'reload schema';

-- ── Verification (run after the migration) ─────────────────────────────
-- Expect one row per column with data_type = ARRAY for colors/models.
/*
SELECT column_name, data_type, udt_name, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'products'
  AND column_name IN (
    'colors',
    'models',
    'short_description',
    'low_stock_threshold',
    'featured',
    'hidden',
    'display_priority',
    'stock_quantity',
    'images'
  )
ORDER BY column_name;
*/
