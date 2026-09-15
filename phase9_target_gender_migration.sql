-- Phase 9 — Additive product target_gender (SAFE)
-- Run in Supabase SQL Editor.
-- Does NOT drop tables, delete products, or recreate the database.
--
-- Purpose:
--   Separate product TYPE (category: Watches / Perfumes / Accessories)
--   from TARGET AUDIENCE (men / women / unisex).
--
-- Existing products keep target_gender = NULL until classified in Admin.
-- Unclassified products must NOT appear in Men/Women storefront filters.

BEGIN;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS target_gender TEXT;

-- Drop legacy check if re-running; then enforce allowed values (NULL allowed)
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_target_gender_check;

ALTER TABLE products
  ADD CONSTRAINT products_target_gender_check
  CHECK (
    target_gender IS NULL
    OR target_gender IN ('men', 'women', 'unisex')
  );

CREATE INDEX IF NOT EXISTS idx_products_target_gender
  ON products(target_gender);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verification (optional):
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'products'
--   AND column_name = 'target_gender';
--
-- SELECT COUNT(*) AS total,
--        COUNT(target_gender) AS classified,
--        COUNT(*) FILTER (WHERE target_gender IS NULL) AS not_classified
-- FROM products;
