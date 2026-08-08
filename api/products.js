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

/** Only these columns are written from the admin product form */
const WRITABLE_COLUMNS = [
  'name',
  'slug',
  'short_description',
  'description',
  'price',
  'category_id',
  'stock_quantity',
  'images',
  'active',
  'featured',
  'hidden',
  'display_priority',
  'low_stock_threshold',
  'colors',
  'models',
];

/** Never accept manual edits of analytics counters from the admin UI */
const FORBIDDEN_WRITE_COLUMNS = [
  'purchase_count',
  'view_count',
  'cart_count',
  'trendingScore',
  'isNewArrival',
  'isBestSeller',
  'stockPriority',
  'revenue',
  'category',
];

function missingColumnFromError(error) {
  const msg = error?.message || '';
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

/** Client-safe message; technical details stay in server logs */
function friendlySchemaError(missing) {
  if (missing === 'colors' || missing === 'models') {
    return {
      error: 'Product options could not be saved. Please try again.',
      code: 'SCHEMA_OPTIONS',
      missingColumn: missing,
      migrationRequired: true,
    };
  }
  if (missing === 'featured' || missing === 'hidden' || missing === 'active') {
    return {
      error: 'Visibility settings could not be saved. Please try again.',
      code: 'SCHEMA_VISIBILITY',
      missingColumn: missing,
      migrationRequired: true,
    };
  }
  if (missing === 'short_description' || missing === 'display_priority' || missing === 'low_stock_threshold') {
    return {
      error: 'Product details could not be saved. Please try again.',
      code: 'SCHEMA_PRODUCT',
      missingColumn: missing,
      migrationRequired: true,
    };
  }
  return {
    error: 'Product could not be saved. Please try again.',
    code: 'SCHEMA_UNKNOWN',
    missingColumn: missing || undefined,
    migrationRequired: Boolean(missing),
  };
}

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

function prepareProductPayload(body, { forInsert = false, name } = {}) {
  const raw = body || {};
  for (const key of FORBIDDEN_WRITE_COLUMNS) {
    delete raw[key];
  }

  const payload = {};
  for (const key of WRITABLE_COLUMNS) {
    if (key === 'slug' && !forInsert) continue;
    if (key in raw) payload[key] = raw[key];
  }

  if (forInsert && name) {
    payload.slug = `${String(name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')}-${Date.now().toString().slice(-5)}`;
  }

  if ('colors' in payload) payload.colors = normalizeSpecArray(payload.colors);
  if ('models' in payload) payload.models = normalizeSpecArray(payload.models);

  if (payload.display_priority === '' || payload.display_priority == null) {
    if ('display_priority' in payload) payload.display_priority = null;
  } else {
    const n = Number(payload.display_priority);
    payload.display_priority = Number.isFinite(n) && n >= 1 ? n : null;
  }

  if ('price' in payload) payload.price = Number(payload.price);
  if ('stock_quantity' in payload) payload.stock_quantity = Number(payload.stock_quantity);
  if ('low_stock_threshold' in payload) {
    const n = Number(payload.low_stock_threshold);
    payload.low_stock_threshold = Number.isFinite(n) && n >= 0 ? n : 5;
  }

  if ('featured' in payload) payload.featured = Boolean(payload.featured);
  if ('hidden' in payload) payload.hidden = Boolean(payload.hidden);
  if ('active' in payload) payload.active = Boolean(payload.active);

  if ('images' in payload) {
    payload.images = Array.isArray(payload.images)
      ? payload.images.filter((u) => typeof u === 'string' && u.trim())
      : [];
  }

  return payload;
}

/**
 * Soft-compat write:
 * - empty colors/models already omitted
 * - if a missing column had an empty/default value, strip and retry
 * - if colors/models had real values and column is missing → friendly schema error
 * - featured/hidden with real intent and missing column → friendly schema error
 */
async function writeProduct(method, payload, id) {
  let current = { ...payload };
  const maxAttempts = WRITABLE_COLUMNS.length + 2;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result =
      method === 'insert'
        ? await supabase.from('products').insert(current).select().single()
        : await supabase.from('products').update(current).eq('id', id).select().single();

    if (!result.error) return { data: result.data, error: null };

    const missing = missingColumnFromError(result.error);
    if (!missing || !(missing in current)) {
      console.error('[products] write error:', result.error?.message || result.error);
      return { data: null, error: result.error };
    }

    const value = current[missing];
    const isEmptyArray = Array.isArray(value) && value.length === 0;
    const isNullish = value == null || value === '';
    const isDefaultFalse = value === false && (missing === 'featured' || missing === 'hidden');
    const isDefaultTrue = value === true && missing === 'active';
    const isDefaultThresh = missing === 'low_stock_threshold' && (value === 5 || value == null);

    // Safe to strip defaults so core product save / Featured still works when possible
    if (
      isEmptyArray ||
      isNullish ||
      isDefaultFalse ||
      isDefaultTrue ||
      isDefaultThresh ||
      (missing === 'display_priority' && value == null)
    ) {
      console.warn(`[products] omitting missing column with empty/default value: ${missing}`);
      const { [missing]: _drop, ...rest } = current;
      current = rest;
      continue;
    }

    // Non-empty optional / visibility field that the live DB cannot store
    console.error(`[products] schema missing required column for write: ${missing}`, {
      value,
    });
    return {
      data: null,
      error: { ...friendlySchemaError(missing), technical: result.error.message },
    };
  }

  return {
    data: null,
    error: {
      ...friendlySchemaError(null),
      technical: 'Too many missing product columns',
    },
  };
}

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
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Product name is required.' });
      }

      const payload = prepareProductPayload(req.body, { forInsert: true, name: String(name).trim() });
      payload.name = String(name).trim();

      const { data, error } = await writeProduct('insert', payload);
      if (error) {
        if (error.code || error.migrationRequired) {
          return res.status(500).json(error);
        }
        const missing = missingColumnFromError(error);
        if (missing) return res.status(500).json(friendlySchemaError(missing));
        console.error('[products] insert failed:', error.message || error);
        return res.status(500).json({ error: 'Product could not be saved. Please try again.' });
      }
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, ...raw } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Product id is required.' });

      const payload = prepareProductPayload(raw, { forInsert: false });

      const { data, error } = await writeProduct('update', payload, id);
      if (error) {
        if (error.code || error.migrationRequired) {
          return res.status(500).json(error);
        }
        const missing = missingColumnFromError(error);
        if (missing) return res.status(500).json(friendlySchemaError(missing));
        console.error('[products] update failed:', error.message || error);
        return res.status(500).json({ error: 'Product could not be saved. Please try again.' });
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
    console.error('[products]', e);
    const missing = missingColumnFromError(e);
    if (missing) return res.status(500).json(friendlySchemaError(missing));
    return res.status(500).json({ error: 'Product could not be saved. Please try again.' });
  }
}
