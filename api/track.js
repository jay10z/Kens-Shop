import supabase from './db-client.js';

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { product_id, event_type } = req.body;
    
    if (!product_id || !['view', 'cart'].includes(event_type)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Insert into product_events for trending score
    const { error: eventError } = await supabase
      .from('product_events')
      .insert({ product_id, event_type });

    if (eventError) throw eventError;

    // We don't have a simple increment via Supabase API without RPC,
    // so we fetch the current value, then update. 
    // This is a naive increment suitable for hobby tier traffic.
    const column = event_type === 'view' ? 'view_count' : 'cart_count';
    const { data: product } = await supabase
      .from('products')
      .select(column)
      .eq('id', product_id)
      .single();

    if (product) {
      await supabase
        .from('products')
        .update({ [column]: (product[column] || 0) + 1 })
        .eq('id', product_id);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
