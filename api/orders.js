import supabase from './_lib/db-client.js';
import { requireAdmin } from './_lib/adminAuth.js';
import { isValidCameroonPhone, isValidEmail, normalizeCameroonPhone } from './_lib/phone.js';
import { evaluateStatusUpdate, isKnownOrderStatus } from './_lib/orderStatus.js';

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

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
      error: 'We could not save your order. Please try again shortly.',
      code: 'SCHEMA_ORDER_ITEMS',
      migrationRequired: true,
    };
  }
  if (missing === 'customers' || missing === 'customer_id' || missing === 'normalized_phone') {
    return {
      error: 'We could not save your order. Please try again shortly.',
      code: 'SCHEMA_CUSTOMERS',
      migrationRequired: true,
    };
  }
  if (missing) {
    return {
      error: 'We could not save your order. Please try again shortly.',
      code: 'SCHEMA_ORDER_ITEMS',
      missingColumn: missing,
    };
  }
  return {
    error: 'We could not save your order. Please try again.',
    code: 'ORDER_CREATE_FAILED',
  };
}

function friendlyAdminError(_error, fallback = 'Something went wrong. Please try again.') {
  return { error: fallback, code: 'ORDERS_ERROR' };
}

const ORDER_VALIDATION_CODES = new Set([
  'PRODUCT_NOT_FOUND',
  'PRODUCT_INACTIVE',
  'PRODUCT_HIDDEN',
  'INSUFFICIENT_STOCK',
  'INVALID_QUANTITY',
  'INVALID_CART',
  'ORDER_NOT_PENDING',
  'ORDER_NOT_FOUND',
  'LEGACY_RESERVED_ORDER',
]);

function extractOrderRpcCode(error) {
  const message = String(error?.message || '');
  for (const code of ORDER_VALIDATION_CODES) {
    if (message === code || message.startsWith(`${code}:`) || message.includes(code)) return code;
  }
  const fallback = String(error?.details || error?.hint || '');
  if (/Could not find the function|schema cache|create_pending_order|update_pending_order|confirm_pending_order|create_order_with_stock/i.test(`${message} ${fallback}`)) {
    return 'SCHEMA_ORDER_LIFECYCLE';
  }
  return null;
}

function parseRpcProducts(error) {
  const raw = error?.details ?? error?.detail ?? '';
  if (typeof raw !== 'string' || !raw.trim().startsWith('[')) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rpcFailureResponse(error, fallbackCode = 'ORDER_UPDATE_FAILED') {
  const code = extractOrderRpcCode(error) || fallbackCode;
  const products = parseRpcProducts(error);
  const messages = {
    PRODUCT_NOT_FOUND: 'One or more products are no longer available.',
    PRODUCT_INACTIVE: 'One or more products are no longer for sale.',
    PRODUCT_HIDDEN: 'One or more products are no longer available.',
    INSUFFICIENT_STOCK: 'Not enough stock for one or more items.',
    INVALID_QUANTITY: 'Invalid quantity.',
    INVALID_CART: 'The order is invalid.',
    ORDER_NOT_PENDING: 'This order is no longer pending.',
    ORDER_NOT_FOUND: 'Order not found.',
    LEGACY_RESERVED_ORDER: 'This order was created before confirmation-time stock updates and cannot be edited or confirmed automatically.',
    SCHEMA_ORDER_LIFECYCLE: 'We could not update the order. Please try again shortly.',
  };
  const status = code === 'ORDER_NOT_FOUND'
    ? 404
    : code === 'ORDER_NOT_PENDING' || code === 'LEGACY_RESERVED_ORDER'
      ? 409
      : code === 'SCHEMA_ORDER_LIFECYCLE'
        ? 500
        : 400;
  return {
    status,
    body: {
      error: messages[code] || 'The order could not be updated.',
      code,
      ...(products.length ? { products } : {}),
      ...(code === 'SCHEMA_ORDER_LIFECYCLE' ? { migrationRequired: true } : {}),
    },
  };
}

function friendlyReservationError(error) {
  const code = extractOrderRpcCode(error);
  if (code === 'PRODUCT_NOT_FOUND') {
    return { status: 400, body: { error: 'One or more products are no longer available. Please refresh your cart.', code } };
  }
  if (code === 'PRODUCT_INACTIVE' || code === 'PRODUCT_HIDDEN') {
    return { status: 400, body: { error: 'One or more products are no longer available for sale. Please refresh your cart.', code } };
  }
  if (code === 'INSUFFICIENT_STOCK') {
    return { status: 400, body: { error: 'Not enough stock for one or more items. Please refresh your cart.', code } };
  }
  if (code === 'INVALID_QUANTITY') {
    return { status: 400, body: { error: 'Invalid quantity. Please refresh your cart and try again.', code } };
  }
  if (code === 'INVALID_CART') {
    return { status: 400, body: { error: 'Your cart is invalid. Please refresh and try again.', code } };
  }
  if (code === 'SCHEMA_ORDER_LIFECYCLE' || code === 'SCHEMA_ORDER_RESERVATION') {
    return {
      status: 500,
      body: {
        error: 'We could not save your order. Please try again shortly.',
        code,
        migrationRequired: true,
      },
    };
  }
  return { status: 500, body: friendlyOrderError(error) };
}

/** Client money fields are ignored — only identity + qty + options are forwarded to the RPC. */
function buildReservationItems(items) {
  const out = [];
  for (const item of items || []) {
    if (!item?.product_id) {
      return { ok: false, status: 400, body: { error: 'Your cart is invalid. Please refresh and try again.', code: 'INVALID_CART' } };
    }
    if (item.quantity == null || item.quantity === '') {
      return { ok: false, status: 400, body: { error: 'Invalid quantity. Please refresh your cart and try again.', code: 'INVALID_QUANTITY' } };
    }
    // Reject non-numeric / decimal / non-integer before RPC (strings like "2" are accepted).
    const raw = item.quantity;
    if (typeof raw === 'object') {
      return { ok: false, status: 400, body: { error: 'Invalid quantity. Please refresh your cart and try again.', code: 'INVALID_QUANTITY' } };
    }
    const asNum = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(asNum) || !Number.isInteger(asNum) || asNum <= 0) {
      return { ok: false, status: 400, body: { error: 'Invalid quantity. Please refresh your cart and try again.', code: 'INVALID_QUANTITY' } };
    }

    const row = {
      product_id: String(item.product_id),
      quantity: asNum,
    };
    if (item.color != null && String(item.color).trim()) row.color = String(item.color).trim();
    if (item.model != null && String(item.model).trim()) row.model = String(item.model).trim();
    out.push(row);
  }
  if (!out.length) {
    return { ok: false, status: 400, body: { error: 'Your cart is empty', code: 'EMPTY_CART' } };
  }
  return { ok: true, items: out };
}

function makeOrderNumber() {
  return `KS-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function createPendingOrder({ customer, items, orderNumber }) {
  const { data, error } = await supabase.rpc('create_pending_order', {
    p_customer_id: customer.id,
    p_customer_name: customer.full_name,
    p_whatsapp_number: customer.phone,
    p_user_email: customer.email || null,
    p_order_number: orderNumber,
    p_items: items,
  });
  return { data, error };
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
      // Client may still send price/total/product_name; they are ignored for money/availability.
      const { items, customer: customerRaw } = req.body || {};
      if (!items?.length) {
        return res.status(400).json({ error: 'Your cart is empty', code: 'EMPTY_CART' });
      }

      const normalized = buildReservationItems(items);
      if (!normalized.ok) return res.status(normalized.status).json(normalized.body);

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

      let orderNumber = makeOrderNumber();
      let { data: reserved, error: reserveError } = await createPendingOrder({
        customer,
        items: normalized.items,
        orderNumber,
      });

      // Rare order_number collision — retry once with a new number.
      if (reserveError && isUniqueViolation(reserveError)) {
        orderNumber = makeOrderNumber();
        ({ data: reserved, error: reserveError } = await createPendingOrder({
          customer,
          items: normalized.items,
          orderNumber,
        }));
      }

      if (reserveError || !reserved?.order_number) {
        console.error('[orders] create pending:', reserveError?.message || reserveError || 'empty order');
        const mapped = friendlyReservationError(reserveError || { message: 'ORDER_CREATE_FAILED' });
        return res.status(mapped.status).json(mapped.body);
      }

      const orderItems = Array.isArray(reserved.items) ? reserved.items : [];

      return res.status(201).json({
        id: reserved.id,
        order_number: reserved.order_number,
        total: reserved.total,
        status: reserved.status || 'Pending',
        customer_id: reserved.customer_id || customer.id,
        customer_name: reserved.customer_name || customer.full_name,
        whatsapp_number: reserved.whatsapp_number || customer.phone,
        user_email: reserved.user_email ?? customer.email ?? null,
        created_at: reserved.created_at,
        updated_at: reserved.updated_at,
        items: orderItems,
        customer: {
          id: customer.id,
          full_name: customer.full_name,
          phone: customer.phone,
          email: customer.email || null,
        },
      });
    }

    if (!(await requireAdmin(req, res))) return;

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
      const { id, status, action, items } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing order.', code: 'INVALID_ORDER' });

      if (action === 'edit_items') {
        const normalized = buildReservationItems(items);
        if (!normalized.ok) return res.status(normalized.status).json(normalized.body);
        const { data, error } = await supabase.rpc('update_pending_order', {
          p_order_id: id,
          p_items: normalized.items.map(({ product_id, quantity }) => ({ product_id, quantity })),
        });
        if (error || !data?.id) {
          console.error('[orders] edit:', error?.message || error || 'empty edit');
          const mapped = rpcFailureResponse(error || { message: 'ORDER_UPDATE_FAILED' });
          return res.status(mapped.status).json(mapped.body);
        }
        return res.status(200).json(data);
      }

      if (action === 'confirm') {
        const { data, error } = await supabase.rpc('confirm_pending_order', {
          p_order_id: id,
        });
        if (error || !data?.id) {
          console.error('[orders] confirm:', error?.message || error || 'empty confirm');
          const mapped = rpcFailureResponse(error || { message: 'ORDER_UPDATE_FAILED' });
          return res.status(mapped.status).json(mapped.body);
        }
        return res.status(200).json(data);
      }

      if (action) {
        return res.status(400).json({ error: 'Unknown order action.', code: 'INVALID_ACTION' });
      }

      if (!isKnownOrderStatus(status)) {
        return res.status(400).json({ error: 'Invalid order status.', code: 'INVALID_STATUS' });
      }

      let existing = null;
      let loadError = null;
      ({ data: existing, error: loadError } = await supabase
        .from('orders')
        .select('id,status,stock_policy')
        .eq('id', id)
        .maybeSingle());
      if (loadError && /stock_policy/i.test(loadError.message || '')) {
        ({ data: existing, error: loadError } = await supabase
          .from('orders')
          .select('id,status')
          .eq('id', id)
          .maybeSingle());
      }
      if (loadError) {
        console.error('[orders] status load:', loadError.message || loadError);
        return res.status(500).json({ error: 'Could not update the order status. Please try again.', code: 'STATUS_UPDATE_FAILED' });
      }
      if (!existing?.id) {
        return res.status(404).json({ error: 'Order not found.', code: 'ORDER_NOT_FOUND' });
      }

      const decision = evaluateStatusUpdate(existing.status, status, existing.stock_policy);
      if (!decision.ok) {
        return res.status(decision.http).json({ error: decision.error, code: decision.code });
      }
      if (decision.noop) return res.status(200).json(existing);

      const { data, error } = await supabase
        .from('orders')
        .update({ status: decision.next, updated_at: new Date().toISOString() })
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
