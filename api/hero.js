import supabase from './db-client.js';

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

async function isAdmin(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return false;
  const { data } = await supabase.auth.getUser(token);
  return !!data.user;
}

function missingColumnFromError(error) {
  const msg = error?.message || '';
  const cacheMatch = msg.match(/Could not find the '([^']+)' column/i);
  if (cacheMatch) return cacheMatch[1];
  const pgMatch = msg.match(/column hero_slides\.(\w+) does not exist/i);
  if (pgMatch) return pgMatch[1];
  return null;
}

function normalizeCategoryId(value) {
  if (value == null || value === '' || value === 'shop' || value === 'all') return null;
  return String(value);
}

function shopHrefForCategory(categoryId) {
  return categoryId ? `/shop?category=${categoryId}` : '/shop';
}

/** Keep display_order as contiguous 1..n matching admin list order. */
async function normalizeDisplayOrders(preferredIds = null) {
  const { data, error } = await supabase
    .from('hero_slides')
    .select('id, display_order, created_at')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;

  let rows = data || [];
  if (Array.isArray(preferredIds) && preferredIds.length) {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ordered = [];
    for (const id of preferredIds) {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    ordered.push(...byId.values());
    rows = ordered;
  }

  for (let i = 0; i < rows.length; i++) {
    const order = i + 1;
    if (Number(rows[i].display_order) !== order) {
      const { error: updateError } = await supabase
        .from('hero_slides')
        .update({ display_order: order })
        .eq('id', rows[i].id);
      if (updateError) throw updateError;
    }
  }
}

async function listAllSlides() {
  const { data, error } = await supabase
    .from('hero_slides')
    .select('*')
    .order('display_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

function buildSlidePayload(body = {}) {
  const category_id = normalizeCategoryId(body.category_id);
  const external =
    typeof body.cta_href === 'string' &&
    /^(https?:|mailto:|tel:|sms:|\/\/)/i.test(body.cta_href.trim());

  return {
    image_url: body.image_url,
    title: body.title || null,
    subtitle: body.subtitle || null,
    cta_label: body.cta_label || null,
    // Prefer category destination; preserve explicit external URLs when no category
    category_id,
    cta_href: category_id
      ? shopHrefForCategory(category_id)
      : external
        ? body.cta_href.trim()
        : body.cta_href || '/shop',
    display_order: body.display_order,
    enabled: body.enabled,
  };
}

async function insertSlide(payload) {
  let row = { ...payload };
  let { data, error } = await supabase.from('hero_slides').insert(row).select().single();
  if (error && missingColumnFromError(error) === 'category_id') {
    console.warn('[hero] category_id missing — run phase7_6_hero_category_destination_migration.sql');
    const { category_id: _drop, ...rest } = row;
    ({ data, error } = await supabase.from('hero_slides').insert(rest).select().single());
  }
  if (error) throw error;
  return data;
}

async function updateSlide(id, payload) {
  let row = { ...payload };
  delete row.id;
  delete row.created_at;
  let { data, error } = await supabase.from('hero_slides').update(row).eq('id', id).select().single();
  if (error && missingColumnFromError(error) === 'category_id') {
    console.warn('[hero] category_id missing — run phase7_6_hero_category_destination_migration.sql');
    const { category_id: _drop, ...rest } = row;
    ({ data, error } = await supabase.from('hero_slides').update(rest).eq('id', id).select().single());
  }
  if (error) throw error;
  return data;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const admin = await isAdmin(req);
      let q = supabase.from('hero_slides').select('*').order('display_order', { ascending: true });
      if (!admin || req.query.admin !== 'true') {
        q = q.eq('enabled', true);
      }
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const body = req.body || {};
      if (!body.image_url) return res.status(400).json({ error: 'Image is required' });

      const { count } = await supabase
        .from('hero_slides')
        .select('*', { count: 'exact', head: true });

      const payload = buildSlidePayload(body);
      payload.display_order = Number(body.display_order) || (count || 0) + 1;
      payload.enabled = body.enabled !== false;

      const data = await insertSlide(payload);
      await normalizeDisplayOrders();
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      // Stable reorder: client sends full id list in desired order → normalize to 1..n
      if (Array.isArray(req.body?.orderedIds)) {
        await normalizeDisplayOrders(req.body.orderedIds);
        return res.status(200).json(await listAllSlides());
      }

      const { id, created_at, ...raw } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });

      const payload = {};
      if ('image_url' in raw) payload.image_url = raw.image_url;
      if ('title' in raw) payload.title = raw.title || null;
      if ('subtitle' in raw) payload.subtitle = raw.subtitle || null;
      if ('cta_label' in raw) payload.cta_label = raw.cta_label || null;
      if ('enabled' in raw) payload.enabled = raw.enabled !== false;
      if ('display_order' in raw) payload.display_order = Number(raw.display_order) || 1;
      if ('category_id' in raw || 'cta_href' in raw) {
        const built = buildSlidePayload(raw);
        if ('category_id' in raw) payload.category_id = built.category_id;
        if ('category_id' in raw || 'cta_href' in raw) payload.cta_href = built.cta_href;
      }

      const data = await updateSlide(id, payload);
      if (payload.display_order !== undefined) await normalizeDisplayOrders();
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('hero_slides').delete().eq('id', id);
      if (error) throw error;
      await normalizeDisplayOrders();
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    const missingTable = /hero_slides/i.test(e.message || '') && /schema cache|does not exist/i.test(e.message || '');
    return res.status(500).json({
      error: missingTable
        ? 'hero_slides table is missing. Run phase4_hero_slides_migration.sql in Supabase.'
        : e.message,
    });
  }
}
