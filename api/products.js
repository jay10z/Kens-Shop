import supabase from './db-client.js';
import {
  buildEventCounts,
  decorateProduct,
  getTrendingCutoffISO,
  rankProducts,
} from './ranking.js';

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

      const { data: categories, error: categoryError } = await supabase.from('categories').select('id,name');
      if (categoryError) throw categoryError;

      const thirtyDaysAgoStr = getTrendingCutoffISO();

      const { data: events } = await supabase
        .from('product_events')
        .select('product_id, event_type')
        .gte('created_at', thirtyDaysAgoStr);

      const eventCounts = buildEventCounts(events || []);

      if (req.query.slug) {
        let q = supabase.from('products').select('*').eq('slug', req.query.slug);
        if (!isAdmin) q = q.eq('hidden', false);
        const { data: product, error } = await q.single();
        if (error) throw error;

        const decorated = decorateProduct(product, eventCounts, categories);

        const { data: relatedRaw } = await supabase
          .from('products')
          .select('*')
          .eq('category_id', product.category_id)
          .eq('hidden', false)
          .neq('id', product.id);

        const related = rankProducts(relatedRaw || [], eventCounts, categories).slice(0, 4);

        return res.status(200).json({ product: decorated, related });
      }

      let q = supabase.from('products').select('*');
      if (req.query.admin !== 'true' || !isAdmin) {
        q = q.eq('hidden', false);
      }

      const { data: products, error } = await q;
      if (error) throw error;

      return res.status(200).json(rankProducts(products || [], eventCounts, categories));
    }

    if (!(await admin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const payload = {
        ...req.body,
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`,
      };

      const { data, error } = await supabase.from('products').insert(payload).select().single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, category, trendingScore, isNewArrival, stockPriority, isBestSeller, ...payload } = req.body;

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
