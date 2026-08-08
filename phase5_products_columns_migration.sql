-- Phase 5 — Additive products columns migration (SAFE)
-- Run in Supabase SQL Editor.
-- Does NOT drop tables, delete products, or recreate the database.
--
-- Live DB symptom:
--   Could not find the 'colors' column of 'products' in the schema cache
--
-- App representation for colors/models: TEXT[] (Postgres text array)
-- Admin form uses comma-separated text which the API converts to TEXT[].

BEGIN;

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

-- Fill NULLs only (does not overwrite real values)
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
CREATE INDEX IF NOT EXISTS idx_products_featured ON products(featured);

-- Behavioral analytics table (used by trending; safe if already exists)
CREATE TABLE IF NOT EXISTS product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'cart', 'purchase')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_product_events_product_id ON product_events(product_id);
CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON product_events(created_at);
CREATE INDEX IF NOT EXISTS idx_product_events_type_created_at ON product_events(event_type, created_at);

COMMIT;

NOTIFY pgrst, 'reload schema';
