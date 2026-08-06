/** Smart Product Ranking engine
 *
 * Computed fields (not stored in DB):
 *   trendingScore  = purchase×5 + cart×3 + view×1  (from product_events, last 30 days)
 *   isNewArrival   = created_at within last 30 days
 *   isBestSeller   = purchase_count > 0
 *   stockPriority  = 1 healthy | 2 low-stock | 3 out-of-stock (via low_stock_threshold)
 *
 * Master sort order:
 *   0. Out of stock always last
 *   1. display_priority (lower = higher; null last)
 *   2. featured
 *   3. trendingScore (desc)
 *   4. purchase_count / best sellers (desc)
 *   5. isNewArrival
 *   6. low stock deprioritized vs healthy
 *   7. created_at (newest first)
 */

export const TRENDING_WINDOW_DAYS = 30;
export const NEW_ARRIVAL_WINDOW_DAYS = 30;

export function getTrendingCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - TRENDING_WINDOW_DAYS);
  return d;
}

export function getNewArrivalCutoff() {
  const d = new Date();
  d.setDate(d.getDate() - NEW_ARRIVAL_WINDOW_DAYS);
  return d;
}

export function getTrendingCutoffISO() {
  return getTrendingCutoff().toISOString();
}

export function buildEventCounts(events = []) {
  const counts = {};
  for (const e of events) {
    if (!counts[e.product_id]) counts[e.product_id] = { view: 0, cart: 0, purchase: 0 };
    if (counts[e.product_id][e.event_type] !== undefined) {
      counts[e.product_id][e.event_type] += 1;
    }
  }
  return counts;
}

export function computeTrendingScore(counts = { view: 0, cart: 0, purchase: 0 }) {
  return (counts.purchase || 0) * 5 + (counts.cart || 0) * 3 + (counts.view || 0) * 1;
}

/** Inventory status levels — use everywhere instead of ad-hoc thresholds */
export const STOCK_HEALTHY = 1;
export const STOCK_LOW = 2;
export const STOCK_OUT = 3;

export function computeStockPriority(product) {
  const qty = product.stock_quantity ?? 0;
  const threshold = product.low_stock_threshold ?? 5;
  if (qty === 0) return STOCK_OUT;
  if (qty <= threshold) return STOCK_LOW;
  return STOCK_HEALTHY;
}

export function inventorySummary(products = []) {
  let available = 0;
  let lowStock = 0;
  let outOfStock = 0;
  for (const p of products) {
    const priority = p.stockPriority ?? computeStockPriority(p);
    if (priority === STOCK_OUT) {
      outOfStock += 1;
    } else if (priority === STOCK_LOW) {
      lowStock += 1;
      if (p.active !== false) available += 1;
    } else if (p.active !== false) {
      available += 1;
    }
  }
  return { available, lowStock, outOfStock };
}

/** Low-stock products ordered by scarcest first */
export function productsRunningLow(products = [], limit = 8) {
  return [...products]
    .filter((p) => (p.stockPriority ?? computeStockPriority(p)) === STOCK_LOW)
    .sort(
      (a, b) =>
        (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0) ||
        String(a.name || '').localeCompare(String(b.name || ''))
    )
    .slice(0, limit);
}

export function decorateProduct(
  product,
  eventCounts = {},
  categories = [],
  { trendingCutoff, newArrivalCutoff } = {}
) {
  const counts = eventCounts[product.id] || { view: 0, cart: 0, purchase: 0 };
  const arrivalCutoff = newArrivalCutoff || getNewArrivalCutoff();

  return {
    ...product,
    category: product.category ?? {
      name: categories.find((c) => c.id === product.category_id)?.name || 'KENS selection',
    },
    trendingScore: computeTrendingScore(counts),
    isNewArrival: new Date(product.created_at) >= arrivalCutoff,
    isBestSeller: (product.purchase_count || 0) > 0,
    stockPriority: computeStockPriority(product),
  };
}

export function compareProducts(a, b) {
  const aPriority = a.stockPriority ?? computeStockPriority(a);
  const bPriority = b.stockPriority ?? computeStockPriority(b);

  // Out of stock always last (hide via `hidden` to remove from catalog)
  const aOut = aPriority === STOCK_OUT;
  const bOut = bPriority === STOCK_OUT;
  if (aOut !== bOut) return aOut ? 1 : -1;

  // 1. Display priority (lower number wins; null/undefined last)
  if (a.display_priority !== b.display_priority) {
    if (a.display_priority === null || a.display_priority === undefined) return 1;
    if (b.display_priority === null || b.display_priority === undefined) return -1;
    return a.display_priority - b.display_priority;
  }
  // 2. Featured
  if (a.featured !== b.featured) return a.featured ? -1 : 1;
  // 3. Trending score
  if (a.trendingScore !== b.trendingScore) return b.trendingScore - a.trendingScore;
  // 4. Best sellers (lifetime purchase_count)
  if ((a.purchase_count || 0) !== (b.purchase_count || 0)) {
    return (b.purchase_count || 0) - (a.purchase_count || 0);
  }
  // 5. New arrivals
  if (a.isNewArrival !== b.isNewArrival) return a.isNewArrival ? -1 : 1;
  // 6. Low stock deprioritized vs healthy
  if (aPriority !== bPriority) return aPriority - bPriority;
  // 7. Newest first
  return new Date(b.created_at) - new Date(a.created_at);
}

export function rankProducts(products, eventCounts = {}, categories = []) {
  const trendingCutoff = getTrendingCutoff();
  const newArrivalCutoff = getNewArrivalCutoff();
  const opts = { trendingCutoff, newArrivalCutoff };

  return products
    .map((p) => decorateProduct(p, eventCounts, categories, opts))
    .sort(compareProducts);
}

/** Section helpers — expect already-decorated products */
export function topTrending(products, limit = 4) {
  return [...products]
    .filter((p) => (p.trendingScore || 0) > 0)
    .sort((a, b) => b.trendingScore - a.trendingScore || (b.purchase_count || 0) - (a.purchase_count || 0))
    .slice(0, limit);
}

export function topBestSellers(products, limit = 4) {
  return [...products]
    .filter((p) => (p.purchase_count || 0) > 0)
    .sort((a, b) => (b.purchase_count || 0) - (a.purchase_count || 0) || b.trendingScore - a.trendingScore)
    .slice(0, limit);
}

export function topNewArrivals(products, limit = 4) {
  return [...products]
    .filter((p) => p.isNewArrival)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, limit);
}
