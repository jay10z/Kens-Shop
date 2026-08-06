-- Phase 4: Hero slides table
-- Safe to run on existing databases.

CREATE TABLE IF NOT EXISTS hero_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  cta_label TEXT,
  cta_href TEXT DEFAULT '/shop',
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hero_slides_display_order ON hero_slides(display_order);
CREATE INDEX IF NOT EXISTS idx_hero_slides_enabled ON hero_slides(enabled);

-- Seed default slides only when the table is empty
INSERT INTO hero_slides (image_url, title, subtitle, cta_label, cta_href, display_order, enabled)
SELECT * FROM (VALUES
  (
    'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=2000&q=88',
    'Quiet luxury.',
    'A considered collection of perfumes, watches and accessories.',
    'Explore the collection',
    '/shop',
    1,
    true
  ),
  (
    'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=2000&q=88',
    'Time, refined.',
    'Exceptional watches selected for presence and precision.',
    'View watches',
    '/shop',
    2,
    true
  ),
  (
    'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=2000&q=88',
    'Scent & presence.',
    'Signature fragrances for evenings that linger.',
    'Discover perfumes',
    '/shop',
    3,
    true
  )
) AS v(image_url, title, subtitle, cta_label, cta_href, display_order, enabled)
WHERE NOT EXISTS (SELECT 1 FROM hero_slides LIMIT 1);
