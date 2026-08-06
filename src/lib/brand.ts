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
   * Optional slogan under the logo / hero eyebrow.
   * Leave empty for now — easy to set later in one place.
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

/** Default hero slides when the database has none yet */
export const DEFAULT_HERO_SLIDES = [
  {
    id: 'default-1',
    image_url:
      'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=2000&q=88',
    title: 'Quiet luxury.',
    subtitle: 'A considered collection of perfumes, watches and accessories.',
    cta_label: 'Explore the collection',
    cta_href: '/shop',
    display_order: 1,
    enabled: true,
  },
  {
    id: 'default-2',
    image_url:
      'https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&w=2000&q=88',
    title: 'Time, refined.',
    subtitle: 'Exceptional watches selected for presence and precision.',
    cta_label: 'View watches',
    cta_href: '/shop',
    display_order: 2,
    enabled: true,
  },
  {
    id: 'default-3',
    image_url:
      'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=2000&q=88',
    title: 'Scent & presence.',
    subtitle: 'Signature fragrances for evenings that linger.',
    cta_label: 'Discover perfumes',
    cta_href: '/shop',
    display_order: 3,
    enabled: true,
  },
];
