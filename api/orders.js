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
  const pgMatch = msg.match(/column order_items\.(\w+) does not exist/i);
  if (pgMatch) return pgMatch[1];
  return null;
}

function friendlyOrderError(error) {
  const missing = missingColumnFromError(error);
  if (missing === 'product_name') {
    return {
      error: 'We could not reserve your order. Please try again shortly.',
      code: 'SCHEMA_ORDER_ITEMS',
      migrationRequired: true,
    };
  }
  if (missing) {
    return {
      error: 'We could not reserve your order. Please try again shortly.',
      code: 'SCHEMA_ORDER_ITEMS',
      missingColumn: missing,
    };
  }
  return {
    error: 'We could not reserve your order. Please try again.',
    code: 'ORDER_CREATE_FAILED',
  };
}

/** Build order_items rows with historical product_name snapshot */
function buildOrderItemRows(items, orderId) {
  return (items || []).map((x) => ({
    order_id: orderId,
    product_id: x.product_id || null,
    product_name: x.product_name ? String(x.product_name).trim() : null,
    quantity: Number(x.quantity),
    price: Number(x.price),
    color: x.color ? String(x.color).trim() : null,
    model: x.model ? String(x.model).trim() : null,
  }));
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const { items, total } = req.body || {};
      if (!items?.length) {
        return res.status(400).json({ error: 'Your cart is empty', code: 'EMPTY_CART' });
      }

      for (const item of items) {
        if (!item?.product_id || !item?.quantity || item.price == null) {
          return res.status(400).json({ error: 'Your cart is invalid. Please refresh and try again.', code: 'INVALID_CART' });
        }
      }

      const order_number = `KS-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Create the order
      const { data: order, error } = await supabase
        .from('orders')
        .insert({ order_number, total: Number(total) || 0, status: 'Pending' })
        .select()
        .single();

      if (error) {
        console.error('[orders] create order:', error.message || error);
        return res.status(500).json(friendlyOrderError(error));
      }

      // 2. Insert order items (snapshot product_name for history)
      let rows = buildOrderItemRows(items, order.id);

      // Fill missing product_name from products table when client omitted it
      const missingNames = rows.filter((r) => !r.product_name && r.product_id).map((r) => r.product_id);
      if (missingNames.length) {
        const { data: named } = await supabase.from('products').select('id,name').in('id', missingNames);
        const byId = new Map((named || []).map((p) => [p.id, p.name]));
        rows = rows.map((r) => ({
          ...r,
          product_name: r.product_name || byId.get(r.product_id) || null,
        }));
      }

      let { error: itemError } = await supabase.from('order_items').insert(rows);
      if (itemError && missingColumnFromError(itemError) === 'product_name') {
        console.error('[orders] order_items.product_name missing — run phase7_order_items_product_name_migration.sql');
        // Soft-compat: do not leave orphan orders without items if column is missing
        await supabase.from('orders').delete().eq('id', order.id);
        return res.status(500).json(friendlyOrderError(itemError));
      }
      // Soft-compat for optional color/model on older DBs
      if (itemError) {
        const missing = missingColumnFromError(itemError);
        if (missing === 'color' || missing === 'model') {
          console.warn(`[orders] omitting missing column on insert: ${missing}`);
          rows = rows.map(({ [missing]: _drop, ...rest }) => rest);
          ({ error: itemError } = await supabase.from('order_items').insert(rows));
          if (itemError && (missingColumnFromError(itemError) === 'color' || missingColumnFromError(itemError) === 'model')) {
            const missing2 = missingColumnFromError(itemError);
            rows = rows.map(({ [missing2]: _drop, ...rest }) => rest);
            ({ error: itemError } = await supabase.from('order_items').insert(rows));
          }
        }
      }
      if (itemError) {
        console.error('[orders] create items:', itemError.message || itemError);
        await supabase.from('orders').delete().eq('id', order.id);
        return res.status(500).json(friendlyOrderError(itemError));
      }

      // 3. Log purchase events and increment purchase_count (best-effort)
      try {
        const events = items.map((x) => ({
          product_id: x.product_id,
          event_type: 'purchase',
        }));
        await supabase.from('product_events').insert(events);

        for (const item of items) {
          const { data: p } = await supabase
            .from('products')
            .select('purchase_count')
            .eq('id', item.product_id)
            .single();
          if (p) {
            await supabase
              .from('products')
              .update({ purchase_count: (p.purchase_count || 0) + Number(item.quantity || 0) })
              .eq('id', item.product_id);
          }
        }
      } catch (analyticsErr) {
        console.error('[orders] purchase analytics (non-fatal):', analyticsErr?.message || analyticsErr);
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
        throw ordersResult.error || itemsResult.error || productsResult.error;
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
      const { id, items, order_number, created_at, updated_at, ...payload } = req.body || {};
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
    console.error('[orders]', e);
    return res.status(500).json(friendlyOrderError(e));
  }
}
