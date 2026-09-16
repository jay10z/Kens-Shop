import supabase from './_lib/db-client.js';
import { isValidCameroonPhone, isValidEmail, normalizeCameroonPhone } from './_lib/phone.js';
import { isKnownOrderStatus, statusForStorage } from './_lib/orderStatus.js';

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
  const tableMatch = msg.match(/Could not find the table 'public\.([^']+)'/i);
  if (tableMatch) return tableMatch[1];
  const pgMatch = msg.match(/column (?:order_items|orders|customers)\.(\w+) does not exist/i);
  if (pgMatch) return pgMatch[1];
  return null;
}

function isMissingRelation(error, name) {
  const msg = error?.message || '';
  return new RegExp(`table 'public\\.${name}'`, 'i').test(msg) || missingColumnFromError(error) === name;
}

function isUniqueViolation(error) {
  return error?.code === '23505' || /duplicate key|unique constraint/i.test(error?.message || '');
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
  if (missing === 'customers' || missing === 'customer_id' || missing === 'normalized_phone') {
    return {
      error: 'We could not reserve your order. Please try again shortly.',
      code: 'SCHEMA_CUSTOMERS',
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

function friendlyAdminError(_error, fallback = 'Something went wrong. Please try again.') {
  return { error: fallback, code: 'ORDERS_ERROR' };
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

function validateCustomerInput(raw) {
  const full_name = String(raw?.full_name || '').trim();
  const phone = String(raw?.phone || '').trim();
  const email = String(raw?.email || '').trim();

  if (!full_name) {
    return { ok: false, status: 400, body: { error: 'Please enter your full name.', code: 'INVALID_NAME' } };
  }
  if (!phone) {
    return { ok: false, status: 400, body: { error: 'Please enter your phone number.', code: 'INVALID_PHONE' } };
  }
  if (!isValidCameroonPhone(phone)) {
    return { ok: false, status: 400, body: { error: 'Please enter a valid Cameroon phone number.', code: 'INVALID_PHONE' } };
  }
  if (!isValidEmail(email)) {
    return { ok: false, status: 400, body: { error: 'Please enter a valid email address.', code: 'INVALID_EMAIL' } };
  }

  return {
    ok: true,
    customer: {
      full_name,
      phone,
      email: email || null,
      normalized_phone: normalizeCameroonPhone(phone),
    },
  };
}

async function findOrCreateCustomer({ full_name, phone, email, normalized_phone }) {
  const now = new Date().toISOString();
  const { data: existing, error: findError } = await supabase
    .from('customers')
    .select('*')
    .eq('normalized_phone', normalized_phone)
    .maybeSingle();

  if (findError) return { error: findError };

  const patch = { full_name, phone, updated_at: now };
  if (email) patch.email = email;

  if (existing?.id) {
    const { data, error } = await supabase.from('customers').update(patch).eq('id', existing.id).select().single();
    return { customer: data, error };
  }

  const insert = {
    full_name,
    phone,
    normalized_phone,
    email: email || null,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('customers').insert(insert).select().single();
  if (!error) return { customer: data, error: null };

  if (isUniqueViolation(error)) {
    const { data: again, error: againError } = await supabase
      .from('customers')
      .select('*')
      .eq('normalized_phone', normalized_phone)
      .maybeSingle();
    if (againError) return { error: againError };
    if (again?.id) {
      const { data: updated, error: updateError } = await supabase
        .from('customers')
        .update(patch)
        .eq('id', again.id)
        .select()
        .single();
      return { customer: updated, error: updateError };
    }
  }
  return { error };
}

async function attachCustomers(orders) {
  const ids = [...new Set((orders || []).map((o) => o.customer_id).filter(Boolean))];
  if (!ids.length) return orders;
  const { data, error } = await supabase.from('customers').select('id, full_name, phone, email, created_at').in('id', ids);
  if (error) {
    console.error('[orders] attach customers:', error.message || error);
    return orders;
  }
  const byId = new Map((data || []).map((c) => [c.id, c]));
  return (orders || []).map((order) => {
    const customer = order.customer_id ? byId.get(order.customer_id) || null : null;
    return {
      ...order,
      customer,
      customer_name: order.customer_name || customer?.full_name || null,
      whatsapp_number: order.whatsapp_number || customer?.phone || null,
      user_email: order.user_email || customer?.email || null,
    };
  });
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'POST') {
      const { items, total, customer: customerRaw } = req.body || {};
      if (!items?.length) {
        return res.status(400).json({ error: 'Your cart is empty', code: 'EMPTY_CART' });
      }

      for (const item of items) {
        if (!item?.product_id || !item?.quantity || item.price == null) {
          return res.status(400).json({ error: 'Your cart is invalid. Please refresh and try again.', code: 'INVALID_CART' });
        }
      }

      const validated = validateCustomerInput(customerRaw);
      if (!validated.ok) return res.status(validated.status).json(validated.body);

      const { customer, error: customerError } = await findOrCreateCustomer(validated.customer);
      if (customerError || !customer?.id) {
        console.error('[orders] customer:', customerError?.message || customerError);
        if (isMissingRelation(customerError, 'customers') || missingColumnFromError(customerError) === 'normalized_phone') {
          return res.status(500).json(friendlyOrderError(customerError));
        }
        return res.status(500).json({
          error: 'We could not save your details. Please try again.',
          code: 'CUSTOMER_CREATE_FAILED',
        });
      }

      const order_number = `KS-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const orderPayload = {
        order_number,
        total: Number(total) || 0,
        status: 'Pending',
        customer_id: customer.id,
        customer_name: customer.full_name,
        whatsapp_number: customer.phone,
        user_email: customer.email || null,
      };

      let { data: order, error } = await supabase.from('orders').insert(orderPayload).select().single();
      if (error) {
        const missing = missingColumnFromError(error);
        if (missing === 'customer_id' || missing === 'customer_name' || missing === 'whatsapp_number') {
          console.error('[orders] missing order column — run phase8_customers_orders_migration.sql:', missing);
          return res.status(500).json(friendlyOrderError(error));
        }
        console.error('[orders] create order:', error.message || error);
        return res.status(500).json(friendlyOrderError(error));
      }

      // 2. Insert order items (snapshot product_name for history)
      let rows = buildOrderItemRows(items, order.id);

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
        await supabase.from('orders').delete().eq('id', order.id);
        return res.status(500).json(friendlyOrderError(itemError));
      }
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
        return res.status(500).json({
          error: 'We could not reserve your order. Please try again.',
          code: 'ORDER_ITEMS_FAILED',
        });
      }

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

      return res.status(201).json({
        ...order,
        customer: {
          id: customer.id,
          full_name: customer.full_name,
          phone: customer.phone,
          email: customer.email || null,
        },
      });
    }

    if (!(await isAdmin(req))) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const [ordersResult, itemsResult, productsResult] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('order_items').select('*'),
        supabase.from('products').select('id,images,name'),
      ]);

      if (ordersResult.error || itemsResult.error || productsResult.error) {
        console.error('[orders] list:', ordersResult.error || itemsResult.error || productsResult.error);
        return res.status(500).json(friendlyAdminError(ordersResult.error || itemsResult.error || productsResult.error, 'Unable to load orders. Please try again.'));
      }

      const withCustomers = await attachCustomers(ordersResult.data || []);
      const data = withCustomers.map((order) => ({
        ...order,
        items: (itemsResult.data || [])
          .filter((item) => item.order_id === order.id)
          .map((item) => ({
            ...item,
            product: (productsResult.data || []).find((product) => product.id === item.product_id),
          })),
      }));

      return res.status(200).json(data);
    }

    if (req.method === 'PUT') {
      const { id, status } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing order.', code: 'INVALID_ORDER' });
      if (!isKnownOrderStatus(status)) {
        return res.status(400).json({ error: 'Invalid order status.', code: 'INVALID_STATUS' });
      }
      const nextStatus = statusForStorage(status);
      if (!nextStatus) {
        return res.status(400).json({ error: 'Invalid order status.', code: 'INVALID_STATUS' });
      }

      const { data, error } = await supabase
        .from('orders')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('[orders] status update:', error.message || error);
        return res.status(500).json({ error: 'Could not update the order status. Please try again.', code: 'STATUS_UPDATE_FAILED' });
      }
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('[orders]', e);
    if (req.method === 'POST') return res.status(500).json(friendlyOrderError(e));
    return res.status(500).json(friendlyAdminError(e));
  }
}
