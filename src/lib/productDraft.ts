/**
 * sessionStorage drafts for the admin product modal.
 * Never stores auth tokens or credentials — form fields and uploaded image URLs only.
 */

export const PRODUCT_DRAFT_PREFIX = 'ks-product-draft:';

export type ProductDraftForm = {
  name: string;
  short_description: string;
  description: string;
  price: string | number;
  category_id: string | number;
  target_gender: string;
  stock_quantity: string | number;
  low_stock_threshold: string | number;
  colors: string;
  models: string;
  featured: boolean;
  hidden: boolean;
  active: boolean;
  display_priority: string | number;
};

export type ProductDraftImage = {
  id: string;
  preview: string;
  url: string;
  status: 'uploaded';
};

export type ProductDraft = {
  form: ProductDraftForm;
  images: ProductDraftImage[];
  savedAt: number;
};

export function productDraftKey(productId?: string | number | null): string {
  if (productId != null && productId !== '') return `${PRODUCT_DRAFT_PREFIX}${String(productId)}`;
  return `${PRODUCT_DRAFT_PREFIX}new`;
}

export function readProductDraft(key: string): ProductDraft | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProductDraft;
    if (!parsed || typeof parsed !== 'object' || !parsed.form) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist only uploaded https/http image URLs — never File/blob object URLs. */
export function serializableDraftImages(
  images: Array<{ id: string; preview?: string; url?: string; status: string }>
): ProductDraftImage[] {
  return images
    .filter((im) => im.status === 'uploaded' && typeof im.url === 'string' && /^https?:\/\//i.test(im.url))
    .map((im) => ({
      id: im.id,
      preview: im.url as string,
      url: im.url as string,
      status: 'uploaded' as const,
    }));
}

export function writeProductDraft(key: string, form: ProductDraftForm, images: ProductDraftImage[]): void {
  try {
    const draft: ProductDraft = { form, images, savedAt: Date.now() };
    sessionStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // Quota / private mode — drafts are a safety net, never block editing.
  }
}

export function clearProductDraft(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function clearAllProductDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PRODUCT_DRAFT_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
