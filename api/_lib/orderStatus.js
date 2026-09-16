/**
 * Order status helpers (Phase 8).
 * Postgres CHECK is case-sensitive; the app treats known variants as equivalent
 * for reads/filters/counts without rewriting stored DB values.
 */

export const CANONICAL_ORDER_STATUSES = [
  'Pending',
  'Confirmed',
  'Processing',
  'Delivered',
  'Cancelled',
];

/** Legacy values still allowed by orders_status_check */
export const LEGACY_ORDER_STATUSES = [
  'Discussing on WhatsApp',
  'Preparing',
  'Out for Delivery',
];

const CANONICAL_BY_LOWER = Object.fromEntries(
  CANONICAL_ORDER_STATUSES.map((s) => [s.toLowerCase(), s])
);

const LEGACY_TO_CANONICAL = {
  'discussing on whatsapp': 'Pending',
  preparing: 'Processing',
  'out for delivery': 'Processing',
};

/**
 * Map any known stored/API status to a canonical admin lifecycle value.
 * Unknown values are returned trimmed (caller may treat as unknown).
 */
export function toCanonicalStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) return 'Pending';
  const lower = raw.toLowerCase();
  if (CANONICAL_BY_LOWER[lower]) return CANONICAL_BY_LOWER[lower];
  if (LEGACY_TO_CANONICAL[lower]) return LEGACY_TO_CANONICAL[lower];
  return raw;
}

/** True if status is one of the 10 DB-allowed values (any casing). */
export function isKnownOrderStatus(status) {
  const raw = String(status || '').trim();
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return Boolean(CANONICAL_BY_LOWER[lower] || LEGACY_TO_CANONICAL[lower]);
}

/**
 * Value to persist on status updates: always a canonical PascalCase status.
 * Does not rewrite historical rows; only used when the API writes a new status.
 */
export function statusForStorage(status) {
  if (!isKnownOrderStatus(status)) return null;
  return toCanonicalStatus(status);
}

export function isPendingStatus(status) {
  return toCanonicalStatus(status) === 'Pending';
}

export function isDeliveredStatus(status) {
  return toCanonicalStatus(status) === 'Delivered';
}

export function isCancelledStatus(status) {
  return toCanonicalStatus(status) === 'Cancelled';
}

export function statusMatchesFilter(status, filter) {
  if (!filter || filter === 'All') return true;
  return toCanonicalStatus(status) === filter;
}
