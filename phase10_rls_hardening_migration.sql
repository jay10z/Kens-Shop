-- ============================================================
-- Phase 10 — RLS hardening (additive; no data changes)
-- ============================================================
-- Architecture:
--   • Browser uses the anon key for Auth only (no direct table writes).
--   • Storefront + admin mutations go through Vercel /api/* with the
--     service_role key, which BYPASSES RLS.
--   • These policies lock down direct PostgREST access with the anon /
--     authenticated keys.
--
-- Safe to re-run. Does NOT UPDATE/DELETE/INSERT any business rows.
-- ============================================================

-- ── helpers: drop policies if re-applying ────────────────────
DO $$
BEGIN
  -- products
  DROP POLICY IF EXISTS products_public_select ON public.products;
  -- categories
  DROP POLICY IF EXISTS categories_public_select ON public.categories;
  -- hero_slides
  DROP POLICY IF EXISTS hero_slides_public_select ON public.hero_slides;
  -- faqs
  DROP POLICY IF EXISTS faqs_public_select ON public.faqs;
  -- testimonials
  DROP POLICY IF EXISTS testimonials_public_select ON public.testimonials;
  -- product_events / orders / order_items / customers intentionally have
  -- no anon/authenticated policies (deny-by-default when RLS is on).
END $$;

-- ── enable RLS (idempotent) ──────────────────────────────────
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faqs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners in the API role path (does not affect service_role).
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;
ALTER TABLE public.categories FORCE ROW LEVEL SECURITY;
ALTER TABLE public.hero_slides FORCE ROW LEVEL SECURITY;
ALTER TABLE public.faqs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.testimonials FORCE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.product_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.customers FORCE ROW LEVEL SECURITY;

-- ── PUBLIC READ (anon + authenticated) ───────────────────────
-- Matches current public API behaviour: hidden=false (active filter is H2 — not here).
CREATE POLICY products_public_select
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (COALESCE(hidden, false) = false);

CREATE POLICY categories_public_select
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Matches public GET /api/hero (enabled slides only).
CREATE POLICY hero_slides_public_select
  ON public.hero_slides
  FOR SELECT
  TO anon, authenticated
  USING (COALESCE(enabled, false) = true);

CREATE POLICY faqs_public_select
  ON public.faqs
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY testimonials_public_select
  ON public.testimonials
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ── PRIVATE TABLES (customers, orders, order_items, product_events) ──
-- RLS enabled + FORCE RLS + NO policies for anon/authenticated
-- ⇒ direct browser/PostgREST access is denied.
-- Service role (Vercel APIs) bypasses RLS for checkout, track, admin.

-- Explicitly revoke broad grants if present (safe if already revoked).
REVOKE ALL ON TABLE public.customers FROM anon, authenticated;
REVOKE ALL ON TABLE public.orders FROM anon, authenticated;
REVOKE ALL ON TABLE public.order_items FROM anon, authenticated;
REVOKE ALL ON TABLE public.product_events FROM anon, authenticated;

-- Public tables: SELECT only for anon/authenticated (writes via service role).
REVOKE ALL ON TABLE public.products FROM anon, authenticated;
REVOKE ALL ON TABLE public.categories FROM anon, authenticated;
REVOKE ALL ON TABLE public.hero_slides FROM anon, authenticated;
REVOKE ALL ON TABLE public.faqs FROM anon, authenticated;
REVOKE ALL ON TABLE public.testimonials FROM anon, authenticated;

GRANT SELECT ON TABLE public.products TO anon, authenticated;
GRANT SELECT ON TABLE public.categories TO anon, authenticated;
GRANT SELECT ON TABLE public.hero_slides TO anon, authenticated;
GRANT SELECT ON TABLE public.faqs TO anon, authenticated;
GRANT SELECT ON TABLE public.testimonials TO anon, authenticated;

-- ============================================================
-- Policy matrix (post-migration)
--
-- TABLE            | RLS | SELECT (anon/auth)      | INSERT/UPDATE/DELETE (anon/auth) | service_role
-- -----------------|-----|-------------------------|--------------------------------------|-------------
-- products         | ON  | hidden=false            | DENIED                                | full bypass
-- categories       | ON  | all rows                | DENIED                                | full bypass
-- hero_slides      | ON  | enabled=true            | DENIED                                | full bypass
-- faqs             | ON  | all rows                | DENIED                                | full bypass
-- testimonials     | ON  | all rows                | DENIED                                | full bypass
-- customers        | ON  | DENIED                  | DENIED                                | full bypass
-- orders           | ON  | DENIED                  | DENIED                                | full bypass
-- order_items      | ON  | DENIED                  | DENIED                                | full bypass
-- product_events   | ON  | DENIED                  | DENIED                                | full bypass
-- ============================================================
