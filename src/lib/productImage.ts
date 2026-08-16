/** First usable product image URL from products.images (cover). */
export function productCoverImage(images?: unknown): string {
  if (!Array.isArray(images)) return '';
  for (const item of images) {
    if (typeof item === 'string') {
      const url = item.trim();
      if (url) return url;
    }
  }
  return '';
}
