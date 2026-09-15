import { isExternalHref, slugifyCategory } from './brand';

/** Stable storefront keys for the three main catalogue destinations. */
export type HeroDestinationKey = 'shop' | 'perfumes' | 'watches' | 'accessories';

const ORDER_TO_KEY: Record<number, Exclude<HeroDestinationKey, 'shop'>> = {
  1: 'perfumes',
  2: 'watches',
  3: 'accessories',
};

const SLUG_ALIASES: Record<string, Exclude<HeroDestinationKey, 'shop'>> = {
  perfumes: 'perfumes',
  parfums: 'perfumes',
  perfume: 'perfumes',
  watches: 'watches',
  montres: 'watches',
  watch: 'watches',
  accessories: 'accessories',
  accessoires: 'accessories',
  accessory: 'accessories',
};

/** Keywords in CTA / title used to infer destination for legacy slides. */
const TEXT_HINTS: Array<{ key: Exclude<HeroDestinationKey, 'shop'>; patterns: RegExp }> = [
  {
    key: 'watches',
    patterns: [/\bwatches?\b/i, /\bmontres?\b/i, /\bchronograph/i, /\btime[,\s]/i, /\ble temps\b/i],
  },
  {
    key: 'perfumes',
    patterns: [/\bperfumes?\b/i, /\bparfums?\b/i, /\bfragrances?\b/i, /\bscent\b/i],
  },
  {
    key: 'accessories',
    patterns: [/\baccessories\b/i, /\baccessoires?\b/i, /\bjewelr/i, /\bbijoux?\b/i],
  },
];

/** CTA copy that clearly means the full catalogue (not a category). */
const SHOP_ALL_CTA =
  /\b(explore|shop)\b.*\bcollection\b|\bentire\s+shop\b|\btous\s+les\s+produits\b|\bexplorer\b.*\bcollection\b|\bd[ée]couvrir\b.*\bcollection\b/i;

/** Known seed titles → default hero key for bilingual overlay (no schema change). */
const SEED_TITLE_TO_DEFAULT: Record<string, '1' | '2' | '3'> = {
  'quiet luxury.': '1',
  'time, refined.': '2',
  'scent & presence.': '3',
  'le luxe discret.': '1',
  'le temps, raffiné.': '2',
  'le temps, avec distinction.': '2',
  'parfum & présence.': '3',
};

export type HeroCategory = {
  id: string | number;
  name?: string;
  slug?: string;
  display_order?: number;
};

export function categoryDestinationKey(
  cat?: HeroCategory | null
): Exclude<HeroDestinationKey, 'shop'> | null {
  if (!cat) return null;
  const fromOrder =
    cat.display_order != null ? ORDER_TO_KEY[Number(cat.display_order)] : undefined;
  const raw = (cat.slug || slugifyCategory(cat.name || '')).toLowerCase();
  const fromSlug = SLUG_ALIASES[raw];
  return fromSlug || fromOrder || null;
}

export function findCategoryByDestinationKey(
  categories: HeroCategory[],
  key: Exclude<HeroDestinationKey, 'shop'>
): HeroCategory | undefined {
  return categories.find((c) => categoryDestinationKey(c) === key);
}

/** Infer destination key from free-text (legacy slides without category_id). */
export function inferDestinationKeyFromText(...parts: Array<string | null | undefined>): Exclude<
  HeroDestinationKey,
  'shop'
> | null {
  const hay = parts.filter(Boolean).join(' · ');
  if (!hay.trim()) return null;
  for (const hint of TEXT_HINTS) {
    if (hint.patterns.some((re) => re.test(hay))) return hint.key;
  }
  return null;
}

/** Internal shop URL for a destination (category UUID or full catalogue). */
export function heroShopHref(categoryId?: string | number | null): string {
  if (categoryId == null || categoryId === '') return '/shop';
  return `/shop?category=${encodeURIComponent(String(categoryId))}`;
}

function resolveDestination(
  slide: {
    category_id?: string | number | null;
    cta_href?: string | null;
    cta_label?: string | null;
    title?: string | null;
    subtitle?: string | null;
  },
  categories: HeroCategory[]
): { key: HeroDestinationKey; categoryId: string | null; href: string } {
  const hrefRaw = (slide.cta_href || '').trim();
  if (hrefRaw && isExternalHref(hrefRaw)) {
    return { key: 'shop', categoryId: null, href: hrefRaw };
  }

  // 1) Explicit category_id
  if (slide.category_id != null && String(slide.category_id).trim()) {
    const id = String(slide.category_id);
    const cat = categories.find((c) => String(c.id) === id);
    return {
      key: categoryDestinationKey(cat) || 'shop',
      categoryId: id,
      href: heroShopHref(id),
    };
  }

  // 2) Legacy /shop?category=<id>
  try {
    if (hrefRaw) {
      const u = new URL(hrefRaw, 'https://kens.shop');
      if (u.pathname === '/shop') {
        const legacyCat = u.searchParams.get('category');
        if (legacyCat && legacyCat !== 'all') {
          const cat = categories.find((c) => String(c.id) === legacyCat);
          return {
            key: categoryDestinationKey(cat) || 'shop',
            categoryId: legacyCat,
            href: heroShopHref(legacyCat),
          };
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 3) Infer from CTA label first (never from subtitle alone — general slides mention many categories)
  const ctaLabel = String(slide.cta_label || '').trim();
  if (ctaLabel && SHOP_ALL_CTA.test(ctaLabel)) {
    return { key: 'shop', categoryId: null, href: '/shop' };
  }
  const fromCta = inferDestinationKeyFromText(ctaLabel);
  if (fromCta) {
    const cat = findCategoryByDestinationKey(categories, fromCta);
    if (cat) {
      return { key: fromCta, categoryId: String(cat.id), href: heroShopHref(cat.id) };
    }
  }

  // 4) Fall back to title only (seed titles like "Time, refined.")
  const fromTitle = inferDestinationKeyFromText(slide.title);
  if (fromTitle) {
    const cat = findCategoryByDestinationKey(categories, fromTitle);
    if (cat) {
      return { key: fromTitle, categoryId: String(cat.id), href: heroShopHref(cat.id) };
    }
  }

  return { key: 'shop', categoryId: null, href: '/shop' };
}

/**
 * Resolve CTA href + display label for a hero slide.
 * Existing slides without category_id still map to the right catalogue via text inference.
 */
export function resolveHeroCta(
  slide: {
    category_id?: string | number | null;
    cta_href?: string | null;
    cta_label?: string | null;
    title?: string | null;
    subtitle?: string | null;
  },
  categories: HeroCategory[],
  t: (key: string, ...args: any[]) => any
): { href: string; label: string; destinationKey: HeroDestinationKey } {
  const dest = resolveDestination(slide, categories);

  if (isExternalHref(dest.href)) {
    return {
      href: dest.href,
      label: String(slide.cta_label || t('home.heroCta.shop') || t('home.exploreBtn')),
      destinationKey: 'shop',
    };
  }

  const label =
    (dest.key !== 'shop' ? t(`home.heroCta.${dest.key}`) : '') ||
    (dest.key === 'shop' ? t('home.heroCta.shop') : '') ||
    slide.cta_label ||
    t('home.exploreBtn');

  return { href: dest.href, label: String(label), destinationKey: dest.key };
}

/**
 * Localize known seed hero titles/subtitles without a schema migration.
 * Custom admin copy that does not match seed text is left unchanged (product/content).
 */
export function resolveHeroCopy(
  slide: {
    title?: string | null;
    subtitle?: string | null;
    cta_label?: string | null;
    category_id?: string | number | null;
    cta_href?: string | null;
  },
  categories: HeroCategory[],
  t: (key: string, ...args: any[]) => any
): { title: string; subtitle: string; cta: { href: string; label: string; destinationKey: HeroDestinationKey } } {
  const cta = resolveHeroCta(slide, categories, t);
  const seedKey =
    SEED_TITLE_TO_DEFAULT[String(slide.title || '').trim().toLowerCase()] ||
    (cta.destinationKey === 'watches'
      ? '2'
      : cta.destinationKey === 'perfumes'
        ? '3'
        : cta.destinationKey === 'shop' && /quiet luxury|luxe discret/i.test(String(slide.title || ''))
          ? '1'
          : null);

  if (seedKey) {
    return {
      title: String(t(`home.heroDefaults.${seedKey}.title`) || slide.title || ''),
      subtitle: String(t(`home.heroDefaults.${seedKey}.subtitle`) || slide.subtitle || ''),
      cta,
    };
  }

  return {
    title: String(slide.title || ''),
    subtitle: String(slide.subtitle || ''),
    cta,
  };
}
