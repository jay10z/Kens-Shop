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

/** Soft-compat columns — safe to omit on older DBs without blocking the write */
const SOFT_OPTIONAL_COLUMNS = [
  'hidden',
  'featured',
  'display_priority',
  'low_stock_threshold',
  'purchase_count',
  'view_count',
  'cart_count',
];

/** Required by the admin product form — never silently drop these */
const REQUIRED_SCHEMA_COLUMNS = ['colors', 'models', 'short_description'];

function missingColumnFromError(error) {
  const msg = error?.message || '';
  // PostgREST: Could not find the 'colors' column of 'products' in the schema cache
  const cacheMatch = msg.match(/Could not find the '([^']+)' column/i);
  if (cacheMatch) return cacheMatch[1];
  const pgMatch = msg.match(/column products\.(\w+) does not exist/i);
  if (pgMatch) return pgMatch[1];
  return null;
}

function isMissingProductColumn(error, column) {
  const found = missingColumnFromError(error);
  if (found) return found === column;
  return new RegExp(`column products\\.${column} does not exist`, 'i').test(error?.message || '');
}

function migrationHint(column) {
  return (
    `Database is missing products.${column}. ` +
    `Run phase5_products_columns_migration.sql in the Supabase SQL Editor, then retry.`
  );
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
  if (result.error && isMissingProductColumn(result.error, 'hidden')) {
    result = await exec(false);
  }
  return result;
}

function stripUnknownProductFields(payload) {
  const {
    category,
    trendingScore,
    isNewArrival,
    stockPriority,
    isBestSeller,
    revenue,
    ...rest
  } = payload || {};
  return rest;
}

/** Normalize colors/models to text[] — accept array or comma-separated string */
function normalizeSpecArray(value) {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function prepareProductPayload(body) {
  const payload = stripUnknownProductFields(body);
  if ('colors' in payload) payload.colors = normalizeSpecArray(payload.colors);
  if ('models' in payload) payload.models = normalizeSpecArray(payload.models);
  if (payload.display_priority === '') payload.display_priority = null;
  if (payload.display_priority != null && payload.display_priority !== '') {
    const n = Number(payload.display_priority);
    payload.display_priority = Number.isFinite(n) ? n : null;
  }
  return payload;
}

/**
 * Retry insert/update after stripping soft-optional columns that PostgREST says are missing.
 * Missing colors/models/short_description always fail with a migration hint (never silent drop).
 */
async function writeProduct(method, payload, id) {
  let current = { ...payload };

  for (let attempt = 0; attempt < SOFT_OPTIONAL_COLUMNS.length + 1; attempt++) {
    const result =
      method === 'insert'
        ? await supabase.from('products').insert(current).select().single()
        : await supabase.from('products').update(current).eq('id', id).select().single();

    if (!result.error) return { data: result.data, error: null };

    const missing = missingColumnFromError(result.error);
    if (missing && REQUIRED_SCHEMA_COLUMNS.includes(missing)) {
      console.error(`[products] required column missing: ${missing}`);
      return { data: null, error: { message: migrationHint(missing), missingColumn: missing } };
    }
    if (missing && missing in current && SOFT_OPTIONAL_COLUMNS.includes(missing)) {
      console.error(`[products] soft-stripping missing column on write: ${missing}`);
      const { [missing]: _removed, ...rest } = current;
      current = rest;
      continue;
    }
    return { data: null, error: result.error };
  }

  return {
    data: null,
    error: { message: 'Too many missing product columns — apply phase5_products_columns_migration.sql' },
  };
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

        const decorated = decorateProduct(
          {
            ...product,
            colors: Array.isArray(product.colors) ? product.colors : [],
            models: Array.isArray(product.models) ? product.models : [],
          },
          eventCounts,
          categories
        );

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

      const normalized = (products || []).map((p) => ({
        ...p,
        colors: Array.isArray(p.colors) ? p.colors : [],
        models: Array.isArray(p.models) ? p.models : [],
      }));

      return res.status(200).json(rankProducts(normalized, eventCounts, categories));
    }

    if (!(await admin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { name } = req.body || {};
      if (!name) return res.status(400).json({ error: 'Name is required' });

      const payload = {
        ...prepareProductPayload(req.body),
        slug: `${String(name)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`,
      };

      const { data, error } = await writeProduct('insert', payload);
      if (error) {
        const missing = error.missingColumn || missingColumnFromError(error);
        if (missing) {
          return res.status(500).json({ error: error.message || migrationHint(missing), missingColumn: missing });
        }
        throw error;
      }
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...raw } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const payload = prepareProductPayload(raw);

      const { data, error } = await writeProduct('update', payload, id);
      if (error) {
        const missing = error.missingColumn || missingColumnFromError(error);
        if (missing) {
          return res.status(500).json({ error: error.message || migrationHint(missing), missingColumn: missing });
        }
        throw error;
      }
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
    const missing = missingColumnFromError(e);
    return res.status(500).json({
      error: missing ? migrationHint(missing) : e.message,
      ...(missing ? { missingColumn: missing } : {}),
    });
  }
}
