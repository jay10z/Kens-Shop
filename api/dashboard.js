import supabase from './db-client.js';
import {
  buildEventCounts,
  decorateProduct,
  getTrendingCutoffISO,
  topTrending,
  topBestSellers,
} from './ranking.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const [pResult, oResult, itemsResult, eventsResult] = await Promise.all([
      supabase.from('products').select('id, name, stock_quantity, active, low_stock_threshold, view_count, cart_count, purchase_count, price, created_at, featured, display_priority'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*'),
      supabase.from('product_events').select('product_id, event_type').gte('created_at', getTrendingCutoffISO()),
    ]);

    if (pResult.error || oResult.error || itemsResult.error || eventsResult.error) {
      throw (pResult.error || oResult.error || itemsResult.error || eventsResult.error);
    }

    const p = pResult.data;
    const o = oResult.data;
    const orderItems = itemsResult.data;
    const eventCounts = buildEventCounts(eventsResult.data || []);

    const productsWithStats = p.map((product) => {
      const decorated = decorateProduct(product, eventCounts);
      const revenue = orderItems
        .filter((i) => i.product_id === product.id)
        .reduce((sum, i) => sum + Number(i.price) * Number(i.quantity), 0);
      return { ...decorated, revenue };
    });

    const trendingProduct = topTrending(productsWithStats, 1)[0] || null;
    const bestSeller = topBestSellers(productsWithStats, 1)[0] || null;
    const mostViewed = [...productsWithStats].sort((a, b) => b.view_count - a.view_count)[0] || null;
    const mostCart = [...productsWithStats].sort((a, b) => b.cart_count - a.cart_count)[0] || null;
    const highestRevenue = [...productsWithStats].sort((a, b) => b.revenue - a.revenue)[0] || null;

    const today = new Date().toISOString().slice(0, 10);
    const delivered = o.filter((x) => x.status === 'Delivered');

    // Inventory priority: 1 in-stock, 2 low-stock, 3 out-of-stock
    const lowStock = productsWithStats.filter((x) => x.stockPriority === 2).length;
    const outOfStock = productsWithStats.filter((x) => x.stockPriority === 3).length;
    const available = productsWithStats.filter((x) => x.active && x.stockPriority !== 3).length;

    return res.status(200).json({
      totalProducts: p.length,
      available,
      lowStock,
      outOfStock,
      ordersToday: o.filter((x) => x.created_at.slice(0, 10) === today).length,
      pending: o.filter((x) => x.status === 'Pending').length,
      delivered: delivered.length,
      revenue: delivered.reduce((s, x) => s + Number(x.total), 0),
      recent: o.slice(0, 5),
      trendingProduct,
      bestSeller,
      mostViewed,
      mostCart,
      highestRevenue,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
