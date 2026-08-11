/** Central FCFA / XAF price formatter. DB stores numeric amounts only — never "FCFA". */
export function formatPrice(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : Number(value ?? 0);
  if (!Number.isFinite(n)) return '0 FCFA';
  const formatted = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(Math.round(n));
  return `${formatted} FCFA`;
}

/** Alias used across the storefront/admin UI */
export const money = formatPrice;
