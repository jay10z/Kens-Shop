import supabase from './db-client.js';

async function admin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  const { data } = await supabase.auth.getUser(token);
  return !!data.user;
}

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const isAdmin = await admin(req);
      if (req.query.admin === 'true' && !isAdmin) return res.status(401).json({ error: 'Unauthorized' });

      // Fetch Categories
      const { data: categories, error: categoryError } = await supabase.from('categories').select('id,name');
      if (categoryError) throw categoryError;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

      // If fetching a single product
      if (req.query.slug) {
        let q = supabase.from('products').select('*').eq('slug', req.query.slug);
        if (!isAdmin) q = q.eq('hidden', false);
        const { data: product, error } = await q.single();
        if (error) throw error;
        
        // Single products don't strictly need the full heavy sort, but we return it decorated
        product.category = { name: categories.find(c => c.id === product.category_id)?.name || 'KENS selection' };
        
        // Fetch related products (same category)
        const { data: related } = await supabase
          .from('products')
          .select('*')
          .eq('category_id', product.category_id)
          .eq('hidden', false)
          .neq('id', product.id)
          .limit(4);

        return res.status(200).json({ 
          product, 
          related: (related || []).map(r => ({...r, category: product.category})) 
        });
      }

      // Fetch all products
      let q = supabase.from('products').select('*');
      if (req.query.admin !== 'true' || !isAdmin) {
        q = q.eq('hidden', false);
      }
      
      const { data: products, error } = await q;
      if (error) throw error;

      // Fetch events from last 30 days to calculate Trending Score
      const { data: events } = await supabase
        .from('product_events')
        .select('product_id, event_type')
        .gte('created_at', thirtyDaysAgoStr);

      const eventCounts = {};
      (events || []).forEach(e => {
        if (!eventCounts[e.product_id]) eventCounts[e.product_id] = { view: 0, cart: 0, purchase: 0 };
        eventCounts[e.product_id][e.event_type] += 1;
      });

      // Decorate and calculate dynamic fields
      const decorated = products.map(p => {
        const counts = eventCounts[p.id] || { view: 0, cart: 0, purchase: 0 };
        const trendingScore = (counts.purchase * 5) + (counts.cart * 3) + (counts.view * 1);
        
        const createdDate = new Date(p.created_at);
        const isNewArrival = createdDate >= thirtyDaysAgo;

        const stockPriority = p.stock_quantity === 0 ? 3 : p.stock_quantity <= (p.low_stock_threshold || 5) ? 2 : 1;

        return {
          ...p,
          category: { name: categories.find(c => c.id === p.category_id)?.name || 'KENS selection' },
          trendingScore,
          isNewArrival,
          stockPriority
        };
      });

      // Master Ranking Engine Sort
      decorated.sort((a, b) => {
        // 1. Display Priority
        if (a.display_priority !== b.display_priority) {
          if (a.display_priority === null) return 1;
          if (b.display_priority === null) return -1;
          return a.display_priority - b.display_priority;
        }
        // 2. Featured
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        // 3. Trending Score
        if (a.trendingScore !== b.trendingScore) return b.trendingScore - a.trendingScore;
        // 4. Best Sellers (purchase_count)
        if (a.purchase_count !== b.purchase_count) return b.purchase_count - a.purchase_count;
        // 5. New Arrivals
        if (a.isNewArrival !== b.isNewArrival) return a.isNewArrival ? -1 : 1;
        // 6-8. Stock Priority
        if (a.stockPriority !== b.stockPriority) return a.stockPriority - b.stockPriority;
        // Fallback: newest first
        return new Date(b.created_at) - new Date(a.created_at);
      });

      return res.status(200).json(decorated);
    }

    if (!(await admin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });
      
      const payload = {
        ...req.body,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`
      };
      
      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, category, trendingScore, isNewArrival, stockPriority, ...payload } = req.body;
      
      // Clean up priority if empty string
      if (payload.display_priority === '') payload.display_priority = null;

      const { data, error } = await supabase.from('products').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase.from('products').delete().eq('id', req.body.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
