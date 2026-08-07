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
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // select('*') survives schema drift; specific columns previously 500'd the dashboard.
    const [pResult, oResult, itemsResult, eventsResult] = await Promise.all([
      supabase.from('products').select('*'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*'),
      supabase
        .from('product_events')
        .select('product_id, event_type')
        .gte('created_at', getTrendingCutoffISO()),
    ]);

    if (pResult.error) throw pResult.error;
    // Orders / items / events may be empty or tables may be missing on older DBs
    const p = pResult.data || [];
    const o = oResult.error ? [] : oResult.data || [];
    const orderItems = itemsResult.error ? [] : itemsResult.data || [];
    const eventCounts = buildEventCounts(eventsResult.error ? [] : eventsResult.data || []);

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
      warnings: [
        oResult.error && `orders: ${oResult.error.message}`,
        itemsResult.error && `order_items: ${itemsResult.error.message}`,
        eventsResult.error && `product_events: ${eventsResult.error.message}`,
      ].filter(Boolean),
    });
  } catch (e) {
    console.error(e);
    // Never leave the admin UI spinning forever
    return res.status(200).json({
      ...emptyDashboard,
      error: e.message,
      warnings: [e.message],
    });
  }
}
