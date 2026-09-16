/**
 * Order status helpers (Phase 8).
 * Aligns admin UI filtering/labels with api/_lib/orderStatus.js.
 * Does not rewrite database values — interpretation only.
 */

export const CANONICAL_ORDER_STATUSES = [
  'Pending',
  'Confirmed',
  'Processing',
  'Delivered',
  'Cancelled',
] as const;

export type CanonicalOrderStatus = (typeof CANONICAL_ORDER_STATUSES)[number];

const CANONICAL_BY_LOWER: Record<string, CanonicalOrderStatus> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  processing: 'Processing',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const LEGACY_TO_CANONICAL: Record<string, CanonicalOrderStatus> = {
  'discussing on whatsapp': 'Pending',
  preparing: 'Processing',
  'out for delivery': 'Processing',
};

export function toCanonicalStatus(status: string): CanonicalOrderStatus | string {
  const raw = String(status || '').trim();
  if (!raw) return 'Pending';
  const lower = raw.toLowerCase();
  if (CANONICAL_BY_LOWER[lower]) return CANONICAL_BY_LOWER[lower];
  if (LEGACY_TO_CANONICAL[lower]) return LEGACY_TO_CANONICAL[lower];
  return raw;
}

export function statusMatchesFilter(status: string, filter: string): boolean {
  if (!filter || filter === 'All') return true;
  return toCanonicalStatus(status) === filter;
}
