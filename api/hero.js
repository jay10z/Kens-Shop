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
      const { image_url, title, subtitle, cta_label, cta_href, display_order, enabled } = req.body || {};
      if (!image_url) return res.status(400).json({ error: 'Image is required' });

      const { data, error } = await supabase
        .from('hero_slides')
        .insert({
          image_url,
          title: title || null,
          subtitle: subtitle || null,
          cta_label: cta_label || null,
          cta_href: cta_href || '/shop',
          display_order: Number(display_order) || 0,
          enabled: enabled !== false,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(201).json(data);
    }

    if (req.method === 'PUT') {
      const { id, created_at, ...payload } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      if (payload.display_order !== undefined) payload.display_order = Number(payload.display_order) || 0;
      const { data, error } = await supabase.from('hero_slides').update(payload).eq('id', id).select().single();
      if (error) throw error;
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'id is required' });
      const { error } = await supabase.from('hero_slides').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
