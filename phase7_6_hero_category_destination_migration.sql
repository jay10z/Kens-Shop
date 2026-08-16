-- Phase 7.6 — Additive hero category destination (SAFE)
-- Run in Supabase SQL Editor on the LIVE database.
--
-- Purpose:
--   Allow each homepage hero slide CTA to open a specific product category
--   (or the full shop) without typing URLs manually.
--
-- Safe / idempotent:
--   - ADD COLUMN IF NOT EXISTS only
--   - no DROP / recreate
--   - no deletion of existing hero slides
--   - existing slides keep category_id NULL → continue linking to /shop

BEGIN;

ALTER TABLE public.hero_slides
  ADD COLUMN IF NOT EXISTS category_id UUID;

-- Attach FK only if missing (safe on re-run)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'hero_slides_category_id_fkey'
  ) THEN
    ALTER TABLE public.hero_slides
      ADD CONSTRAINT hero_slides_category_id_fkey
      FOREIGN KEY (category_id)
      REFERENCES public.categories(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_hero_slides_category_id
  ON public.hero_slides(category_id);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification (run after the migration) ─────────────────────────────
-- Expected: one row → category_id | uuid
/*
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'hero_slides'
  AND column_name = 'category_id';
*/
