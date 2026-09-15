/** Storefront collection filter (URL / UI). */
export type AudienceFilter = 'all' | 'men' | 'women';

/** Persisted product attribute (nullable until admin classifies). */
export type TargetGender = 'men' | 'women' | 'unisex';

export const TARGET_GENDERS: TargetGender[] = ['men', 'women', 'unisex'];

export function parseAudienceParam(raw: string | null | undefined): AudienceFilter {
  if (raw === 'men' || raw === 'women') return raw;
  return 'all';
}

export function normalizeTargetGender(value: unknown): TargetGender | null {
  if (value == null || value === '') return null;
  const v = String(value).trim().toLowerCase();
  if (v === 'men' || v === 'women' || v === 'unisex') return v;
  return null;
}

/**
 * ALL → every product
 * MEN → men + unisex (exclude null / women)
 * WOMEN → women + unisex (exclude null / men)
 */
export function matchesAudience(
  product: { target_gender?: string | null },
  filter: AudienceFilter,
): boolean {
  if (filter === 'all') return true;
  const g = normalizeTargetGender(product.target_gender);
  if (!g) return false;
  if (g === 'unisex') return true;
  return g === filter;
}

export function audienceSearchParams(
  gender: AudienceFilter,
  category?: string | null,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (gender !== 'all') params.gender = gender;
  if (category && category !== 'all') params.category = category;
  return params;
}
