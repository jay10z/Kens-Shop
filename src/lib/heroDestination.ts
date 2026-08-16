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

export type HeroCategory = {
  id: string | number;
  name?: string;
  slug?: string;
  display_order?: number;
};

export function categoryDestinationKey(cat?: HeroCategory | null): Exclude<HeroDestinationKey, 'shop'> | null {
  if (!cat) return null;
  const fromOrder =
    cat.display_order != null ? ORDER_TO_KEY[Number(cat.display_order)] : undefined;
  const raw = (cat.slug || slugifyCategory(cat.name || '')).toLowerCase();
  const fromSlug = SLUG_ALIASES[raw];
  return fromSlug || fromOrder || null;
}

/** Internal shop URL for a destination (category UUID or full catalogue). */
export function heroShopHref(categoryId?: string | number | null): string {
  if (categoryId == null || categoryId === '') return '/shop';
  return `/shop?category=${categoryId}`;
}

/**
 * Resolve CTA href + display label for a hero slide.
 * - category_id → filtered catalogue (stable across EN/FR label renames)
 * - external cta_href → unchanged
 * - otherwise → /shop (or existing internal cta_href)
 */
export function resolveHeroCta(
  slide: {
    category_id?: string | number | null;
    cta_href?: string | null;
    cta_label?: string | null;
  },
  categories: HeroCategory[],
  t: (key: string, ...args: any[]) => any
): { href: string; label: string } {
  const catId = slide.category_id;
  if (catId != null && String(catId).trim()) {
    const cat = categories.find((c) => String(c.id) === String(catId));
    const key = categoryDestinationKey(cat);
    const label =
      (key ? t(`home.heroCta.${key}`) : '') ||
      slide.cta_label ||
      t('home.heroCta.shop') ||
      t('home.exploreBtn');
    return { href: heroShopHref(catId), label: String(label) };
  }

  const href = (slide.cta_href || '/shop').trim() || '/shop';
  if (isExternalHref(href)) {
    return { href, label: String(slide.cta_label || t('home.heroCta.shop') || t('home.exploreBtn')) };
  }

  // Legacy slides that already stored /shop?category=<id> without category_id
  try {
    const u = new URL(href, 'https://kens.shop');
    if (u.pathname === '/shop') {
      const legacyCat = u.searchParams.get('category');
      if (legacyCat && legacyCat !== 'all') {
        const cat = categories.find((c) => String(c.id) === legacyCat);
        const key = categoryDestinationKey(cat);
        const label =
          (key ? t(`home.heroCta.${key}`) : '') ||
          slide.cta_label ||
          t('home.heroCta.shop');
        return { href: heroShopHref(legacyCat), label: String(label) };
      }
      return {
        href: '/shop',
        label: String(slide.cta_label || t('home.heroCta.shop') || t('home.exploreBtn')),
      };
    }
  } catch {
    /* keep raw href */
  }

  return {
    href,
    label: String(slide.cta_label || t('home.heroCta.shop') || t('home.exploreBtn')),
  };
}
