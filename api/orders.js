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
    if (req.method === 'POST') {
      const { items, total } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'Your cart is empty' });
      
      const order_number = `KS-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
      
      // 1. Create the order
      const { data: order, error } = await supabase
        .from('orders')
        .insert({ order_number, total, status: 'Pending' })
        .select()
        .single();
        
      if (error) throw error;
      
      // 2. Insert order items
      const rows = items.map((x) => ({ ...x, order_id: order.id }));
      const { error: itemError } = await supabase.from('order_items').insert(rows);
      if (itemError) throw itemError;

      // 3. Log purchase events and increment purchase_count
      const events = items.map((x) => ({
        product_id: x.product_id,
        event_type: 'purchase'
      }));
      await supabase.from('product_events').insert(events);

      for (const item of items) {
        // Fetch current count and increment
        const { data: p } = await supabase.from('products').select('purchase_count').eq('id', item.product_id).single();
        if (p) {
          await supabase.from('products').update({ purchase_count: (p.purchase_count || 0) + item.quantity }).eq('id', item.product_id);
        }
      }

      return res.status(201).json(order);
    }

    // Admin routes
    if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const [ordersResult, itemsResult, productsResult] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('order_items').select('*'),
        supabase.from('products').select('id,images,name'),
      ]);
      
      if (ordersResult.error || itemsResult.error || productsResult.error) {
        throw (ordersResult.error || itemsResult.error || productsResult.error);
      }
      
      const data = ordersResult.data.map((order) => ({
        ...order,
        items: itemsResult.data
          .filter((item) => item.order_id === order.id)
          .map((item) => ({
            ...item,
            product: productsResult.data.find((product) => product.id === item.product_id),
          })),
      }));
      
      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const { id, items, order_number, created_at, updated_at, ...payload } = req.body;
      payload.updated_at = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('orders')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
        
      if (error) throw error;
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
}
