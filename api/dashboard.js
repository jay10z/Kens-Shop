import supabase from './db-client.js';
import {
  buildEventCounts,
  decorateProduct,
  getTrendingCutoffISO,
  inventorySummary,
  productsRunningLow,
  topTrending,
  topBestSellers,
} from './ranking.js';

const emptyDashboard = {
  totalProducts: 0,
  available: 0,
  lowStock: 0,
  outOfStock: 0,
  ordersToday: 0,
  pending: 0,
  delivered: 0,
  revenue: 0,
  recent: [],
  trendingProduct: null,
  bestSeller: null,
  mostViewed: null,
  mostCart: null,
  highestRevenue: null,
  runningLow: [],
  insights: [],
};

/** Business-friendly signals from existing product stats (no external analytics). */
function buildBusinessInsights(products = []) {
  const insights = [];
  const pick = (list, type, limit = 3) =>
    list.slice(0, limit).map((p) => ({
      type,
      productId: p.id,
      productName: p.name,
      views: p.view_count || 0,
      carts: p.cart_count || 0,
      purchases: p.purchase_count || 0,
      stock: p.stock_quantity ?? 0,
    }));

  // Attracts attention but rarely sells
  const attentionNoSale = [...products]
    .filter((p) => (p.view_count || 0) >= 8 && (p.purchase_count || 0) === 0)
    .sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
  insights.push(...pick(attentionNoSale, 'high_views_low_purchases'));

  // Intent in cart but not converting
  const cartNoSale = [...products]
    .filter((p) => (p.cart_count || 0) >= 3 && (p.purchase_count || 0) === 0)
    .sort((a, b) => (b.cart_count || 0) - (a.cart_count || 0));
  insights.push(...pick(cartNoSale, 'high_carts_low_purchases'));

  // Sells well with little visibility
  const efficientSellers = [...products]
    .filter((p) => (p.purchase_count || 0) >= 2 && (p.view_count || 0) > 0 && (p.view_count || 0) <= 10)
    .sort((a, b) => (b.purchase_count || 0) - (a.purchase_count || 0));
  insights.push(...pick(efficientSellers, 'low_views_high_purchases'));

  // Popular and running low — restock soon
  const restockSoon = [...products]
    .filter(
      (p) =>
        (p.purchase_count || 0) >= 1 &&
        (p.stockPriority === 2 || ((p.stock_quantity ?? 0) > 0 && (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5)))
    )
    .sort((a, b) => (a.stock_quantity ?? 0) - (b.stock_quantity ?? 0));
  insights.push(...pick(restockSoon, 'high_purchases_low_stock'));

  return insights.slice(0, 8);
}

const QUERY_TIMEOUT_MS = 10000;

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function softQuery(label, queryFactory) {
  try {
    const result = await withTimeout(queryFactory(), QUERY_TIMEOUT_MS, label);
    if (result?.error) {
      console.error(`[dashboard] ${label}:`, result.error.message || result.error);
      return { data: [], error: result.error, warning: `${label}: ${result.error.message}` };
    }
    return { data: result?.data || [], error: null, warning: null };
  } catch (e) {
    console.error(`[dashboard] ${label}:`, e.message || e);
    return { data: [], error: e, warning: `${label}: ${e.message || 'failed'}` };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const warnings = [];

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    let user = null;
    try {
      const authResult = await withTimeout(
        supabase.auth.getUser(token),
        QUERY_TIMEOUT_MS,
        'auth'
      );
      user = authResult?.data?.user || null;
      if (authResult?.error) {
        console.error('[dashboard] auth:', authResult.error.message);
      }
    } catch (e) {
      console.error('[dashboard] auth:', e.message || e);
      return res.status(200).json({
        ...emptyDashboard,
        error: 'Authentication timed out. Please refresh and try again.',
        warnings: [`auth: ${e.message || 'timed out'}`],
      });
    }

    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Independent soft queries — one failure must not block the whole dashboard
    const [pResult, oResult, itemsResult, eventsResult] = await Promise.all([
      softQuery('products', () => supabase.from('products').select('*')),
      softQuery('orders', () =>
        supabase.from('orders').select('*').order('created_at', { ascending: false })
      ),
      softQuery('order_items', () => supabase.from('order_items').select('*')),
      softQuery('product_events', () =>
        supabase
          .from('product_events')
          .select('product_id, event_type')
          .gte('created_at', getTrendingCutoffISO())
      ),
    ]);

    for (const r of [pResult, oResult, itemsResult, eventsResult]) {
      if (r.warning) warnings.push(r.warning);
    }

    const p = pResult.data || [];
    const o = oResult.data || [];
    const orderItems = itemsResult.data || [];
    const eventCounts = buildEventCounts(eventsResult.data || []);

    const productsWithStats = p.map((product) => {
      const decorated = decorateProduct(product, eventCounts);
      const revenue = orderItems
        .filter((i) => i.product_id === product.id)
        .reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
      return { ...decorated, revenue };
    });

    const { available, lowStock, outOfStock } = inventorySummary(productsWithStats);

    const trendingProduct = topTrending(productsWithStats, 1)[0] || null;
    const bestSeller = topBestSellers(productsWithStats, 1)[0] || null;
    const mostViewed =
      [...productsWithStats]
        .filter((x) => (x.view_count || 0) > 0)
        .sort((a, b) => b.view_count - a.view_count)[0] || null;
    const mostCart =
      [...productsWithStats]
        .filter((x) => (x.cart_count || 0) > 0)
        .sort((a, b) => b.cart_count - a.cart_count)[0] || null;
    const highestRevenue =
      [...productsWithStats]
        .filter((x) => (x.revenue || 0) > 0)
        .sort((a, b) => b.revenue - a.revenue)[0] || null;

    const today = new Date().toISOString().slice(0, 10);
    const delivered = o.filter((x) => x.status === 'Delivered');

    const criticalFailure = Boolean(pResult.error);
    return res.status(200).json({
      ...emptyDashboard,
      totalProducts: p.length,
      available,
      lowStock,
      outOfStock,
      ordersToday: o.filter((x) => String(x.created_at || '').slice(0, 10) === today).length,
      pending: o.filter((x) => x.status === 'Pending').length,
      delivered: delivered.length,
      revenue: delivered.reduce((s, x) => s + Number(x.total), 0),
      recent: o.slice(0, 5),
      trendingProduct,
      bestSeller,
      mostViewed,
      mostCart,
      highestRevenue,
      runningLow: productsRunningLow(productsWithStats, 8),
      insights: buildBusinessInsights(productsWithStats),
      warnings,
      ...(criticalFailure
        ? { error: 'Some dashboard data could not be loaded. Partial results shown.' }
        : {}),
    });
  } catch (e) {
    console.error('[dashboard]', e);
    return res.status(200).json({
      ...emptyDashboard,
      error: e.message || 'Dashboard failed to load',
      warnings: [e.message || 'Dashboard failed to load'],
    });
  }
}
