import supabase from './_lib/db-client.js';
import { requireAdmin } from './_lib/adminAuth.js';
import { decorateCustomers, matchesCustomerQuery, summarizeCustomers } from './_lib/customerStats.js';

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

function publicCustomer(row) {
  if (!row) return null;
  const history = (row.order_history || [])
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((o) => ({
      id: o.id,
      order_number: o.order_number,
      created_at: o.created_at,
      total: o.total,
      status: o.status,
    }));
  return {
    id: row.id,
    full_name: row.full_name,
    phone: row.phone,
    email: row.email || null,
    created_at: row.created_at,
    order_count: row.order_count,
    total_spent: row.total_spent,
    last_order_at: row.last_order_at,
    customer_type: row.customer_type,
    average_order_value: row.average_order_value,
    orders: history,
  };
}

function queryParam(req, name) {
  if (req.query && req.query[name] != null) return String(req.query[name]);
  try {
    return new URL(req.url, 'http://localhost').searchParams.get(name) || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    if (!(await requireAdmin(req, res))) return;

    const [customersResult, ordersResult] = await Promise.all([
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
    ]);

    if (customersResult.error) {
      console.error('[customers] list:', customersResult.error.message || customersResult.error);
      const msg = customersResult.error.message || '';
      if (/Could not find the table 'public\.customers'/i.test(msg)) {
        return res.status(200).json({ customers: [], summary: summarizeCustomers([]) });
      }
      return res.status(500).json({ error: 'Unable to load customers. Please try again.', code: 'CUSTOMERS_LOAD_FAILED' });
    }
    if (ordersResult.error) {
      console.error('[customers] orders:', ordersResult.error.message || ordersResult.error);
      return res.status(500).json({ error: 'Unable to load customers. Please try again.', code: 'CUSTOMERS_LOAD_FAILED' });
    }

    const decorated = decorateCustomers(customersResult.data || [], ordersResult.data || []);
    const id = queryParam(req, 'id').trim();
    if (id) {
      const one = decorated.find((c) => c.id === id);
      if (!one) return res.status(404).json({ error: 'Customer not found.', code: 'CUSTOMER_NOT_FOUND' });
      return res.status(200).json(publicCustomer(one));
    }

    const q = queryParam(req, 'q').trim();
    const filtered = q ? decorated.filter((c) => matchesCustomerQuery(c, q)) : decorated;
    const customers = filtered
      .sort((a, b) => String(b.last_order_at || b.created_at || '').localeCompare(String(a.last_order_at || a.created_at || '')))
      .map((c) => publicCustomer(c));

    return res.status(200).json({
      customers,
      summary: summarizeCustomers(decorated),
    });
  } catch (e) {
    console.error('[customers]', e);
    return res.status(500).json({ error: 'Unable to load customers. Please try again.', code: 'CUSTOMERS_LOAD_FAILED' });
  }
}
