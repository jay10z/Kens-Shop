import supabase from './db-client.js';

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
      supabase.from('products').select('id, name, stock_quantity, active, low_stock_threshold, view_count, cart_count, purchase_count, price'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*'),
      supabase.from('product_events').select('product_id, event_type').gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ]);

    if (pResult.error || oResult.error || itemsResult.error || eventsResult.error) {
      throw (pResult.error || oResult.error || itemsResult.error || eventsResult.error);
    }

    const p = pResult.data;
    const o = oResult.data;
    const orderItems = itemsResult.data;
    const events = eventsResult.data;

    // Calculate Trending Scores
    const eventCounts = {};
    events.forEach(e => {
      if (!eventCounts[e.product_id]) eventCounts[e.product_id] = { view: 0, cart: 0, purchase: 0 };
      eventCounts[e.product_id][e.event_type] += 1;
    });

    const productsWithStats = p.map(product => {
      const counts = eventCounts[product.id] || { view: 0, cart: 0, purchase: 0 };
      const trendingScore = (counts.purchase * 5) + (counts.cart * 3) + (counts.view * 1);
      
      const revenue = orderItems
        .filter(i => i.product_id === product.id)
        .reduce((sum, i) => sum + (Number(i.price) * Number(i.quantity)), 0);

      return {
        ...product,
        trendingScore,
        revenue
      };
    });

    // Top widgets
    const trendingProduct = [...productsWithStats].sort((a, b) => b.trendingScore - a.trendingScore)[0];
    const bestSeller = [...productsWithStats].sort((a, b) => b.purchase_count - a.purchase_count)[0];
    const mostViewed = [...productsWithStats].sort((a, b) => b.view_count - a.view_count)[0];
    const mostCart = [...productsWithStats].sort((a, b) => b.cart_count - a.cart_count)[0];
    const highestRevenue = [...productsWithStats].sort((a, b) => b.revenue - a.revenue)[0];

    const today = new Date().toISOString().slice(0, 10);
    const delivered = o.filter(x => x.status === 'Delivered');

    const lowStockCount = p.filter(x => x.stock_quantity > 0 && x.stock_quantity <= (x.low_stock_threshold || 5)).length;
    const outOfStockCount = p.filter(x => x.stock_quantity === 0).length;

    return res.status(200).json({
      totalProducts: p.length,
      available: p.filter(x => x.active && x.stock_quantity > 0).length,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      ordersToday: o.filter(x => x.created_at.slice(0, 10) === today).length,
      pending: o.filter(x => x.status === 'Pending').length,
      delivered: delivered.length,
      revenue: delivered.reduce((s, x) => s + Number(x.total), 0),
      recent: o.slice(0, 5),
      
      // New Analytics Widgets
      trendingProduct: trendingProduct || null,
      bestSeller: bestSeller || null,
      mostViewed: mostViewed || null,
      mostCart: mostCart || null,
      highestRevenue: highestRevenue || null
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
