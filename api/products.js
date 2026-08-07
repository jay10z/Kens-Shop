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

function isMissingHiddenColumn(error) {
  return /column products\.hidden does not exist/i.test(error?.message || '');
}

/**
 * Query products, optionally filtering hidden=false.
 * If the DB has not been migrated yet (no `hidden` column), retry without the filter
 * so the storefront never 500s on a schema drift.
 */
async function queryProducts(applyFilters, { single = false } = {}) {
  const exec = async (filterHidden) => {
    let q = supabase.from('products').select('*');
    q = applyFilters(q, filterHidden);
    return single ? await q.single() : await q;
  };

  let result = await exec(true);
  if (result.error && isMissingHiddenColumn(result.error)) {
    result = await exec(false);
  }
  return result;
}

function stripUnknownProductFields(payload) {
  // Soft-compat: drop ranking/meta fields that are not DB columns.
  const {
    category,
    trendingScore,
    isNewArrival,
    stockPriority,
    isBestSeller,
    ...rest
  } = payload || {};
  return rest;
}

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
      const filterHiddenForPublic = req.query.admin !== 'true' || !isAdmin;

      if (req.query.slug) {
        const { data: product, error } = await queryProducts(
          (q, filterHidden) => {
            q = q.eq('slug', req.query.slug);
            if (filterHidden && filterHiddenForPublic) q = q.eq('hidden', false);
            return q;
          },
          { single: true }
        );
        if (error) throw error;

        const decorated = decorateProduct(product, eventCounts, categories);

        const { data: relatedRaw } = await queryProducts((q, filterHidden) => {
          q = q.eq('category_id', product.category_id).neq('id', product.id);
          if (filterHidden) q = q.eq('hidden', false);
          return q;
        });

        const related = rankProducts(relatedRaw || [], eventCounts, categories).slice(0, 4);

        return res.status(200).json({ product: decorated, related });
      }

      const { data: products, error } = await queryProducts((q, filterHidden) => {
        if (filterHidden && filterHiddenForPublic) q = q.eq('hidden', false);
        return q;
      });
      if (error) throw error;

      return res.status(200).json(rankProducts(products || [], eventCounts, categories));
    }

    if (!(await admin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { name } = req.body;
      if (!name) return res.status(400).json({ error: 'Name is required' });

      let payload = {
        ...stripUnknownProductFields(req.body),
        slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`,
      };

      let { data, error } = await supabase.from('products').insert(payload).select().single();
      if (error && isMissingHiddenColumn(error) && 'hidden' in payload) {
        const { hidden, ...rest } = payload;
        payload = rest;
        ({ data, error } = await supabase.from('products').insert(payload).select().single());
      }
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...raw } = req.body;
      let payload = stripUnknownProductFields(raw);

      if (payload.display_priority === '') payload.display_priority = null;

      let { data, error } = await supabase.from('products').update(payload).eq('id', id).select().single();
      if (error && isMissingHiddenColumn(error) && 'hidden' in payload) {
        const { hidden, ...rest } = payload;
        payload = rest;
        ({ data, error } = await supabase.from('products').update(payload).eq('id', id).select().single());
      }
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
