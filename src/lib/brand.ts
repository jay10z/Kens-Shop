/**
 * Central storefront branding & social config.
 * Change brand text / slogan / links here (or via VITE_* env) — not across the app.
 */
export const BRAND = {
  /** Primary wordmark — e.g. KEN'S */
  name: "KEN'S",
  /** Accent word — e.g. SHOP */
  nameAccent: 'SHOP',
  /** Combined display name */
  get fullName() {
    return `${this.name} ${this.nameAccent}`;
  },
  /**
   * Optional slogan under the logo.
   * Leave empty to keep the brand mark clean (no extra space).
   */
  slogan: '',
};

const digits = (value: string) => value.replace(/\D/g, '');

export const SOCIAL = {
  whatsappNumber: import.meta.env.VITE_WHATSAPP_NUMBER || '15551234567',
  instagramUrl: import.meta.env.VITE_INSTAGRAM_URL || 'https://www.instagram.com/',
  tiktokUrl: import.meta.env.VITE_TIKTOK_URL || 'https://www.tiktok.com/',
  email: import.meta.env.VITE_CONTACT_EMAIL || 'contact@kensshop.com',
};

export function whatsappUrl(text?: string) {
  const base = `https://wa.me/${digits(SOCIAL.whatsappNumber)}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** True for absolute / protocol URLs that must use <a>, not React Router. */
export function isExternalHref(href?: string | null) {
  if (!href) return false;
  return /^(https?:|mailto:|tel:|sms:|\/\/)/i.test(href.trim()) || /^wa\.me\//i.test(href.trim());
}

export function slugifyCategory(name: string) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Canonical image keys — never match on display language alone. */
export const CATEGORY_IMAGES: Record<string, string> = {
  perfumes:
    'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=900&q=80',
  watches:
    'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=900&q=80',
  accessories:
    'https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&w=900&q=80',
};

const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  perfumes: 'perfumes',
  parfums: 'perfumes',
  watches: 'watches',
  montres: 'watches',
  accessories: 'accessories',
  accessoires: 'accessories',
};

/** Phase-4 display_order → canonical key (stable when names are localized). */
const CATEGORY_ORDER_KEYS: Record<number, string> = {
  1: 'perfumes',
  2: 'watches',
  3: 'accessories',
};

export function categoryImageUrl(cat: { slug?: string; name?: string; display_order?: number }) {
  const raw = (cat.slug || slugifyCategory(cat.name || '')).toLowerCase();
  const fromSlug = CATEGORY_SLUG_ALIASES[raw] || (CATEGORY_IMAGES[raw] ? raw : '');
  const fromOrder =
    cat.display_order != null ? CATEGORY_ORDER_KEYS[Number(cat.display_order)] : undefined;
  const key = fromSlug || fromOrder || 'accessories';
  return CATEGORY_IMAGES[key] || CATEGORY_IMAGES.accessories;
}

/** Default hero image assets (copy comes from i18n at render time). */
export const DEFAULT_HERO_ASSETS = [
  {
    id: 'default-1',
    image_url:
      'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=2000&q=88',
    cta_href: '/shop',
    display_order: 1,
    enabled: true,
    key: '1' as const,
  },
  {
    id: 'default-2',
    image_url:
      'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=2000&q=88',
    cta_href: '/shop',
    display_order: 2,
    enabled: true,
    key: '2' as const,
  },
  {
    id: 'default-3',
    image_url:
      'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=2000&q=88',
    cta_href: '/shop',
    display_order: 3,
    enabled: true,
    key: '3' as const,
  },
];
