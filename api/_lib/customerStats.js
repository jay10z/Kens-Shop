import { isCancelledStatus } from './orderStatus.js';

/** New = exactly one order. Returning = more than one order. */
export function customerTypeFromCount(orderCount) {
  return Number(orderCount) > 1 ? 'returning' : 'new';
}

/**
 * Build per-customer metrics from actual orders.
 * Guest checkout only creates a customer when an order is placed, so every
 * customer row is expected to have at least one order going forward.
 */
export function decorateCustomers(customers = [], orders = []) {
  const byId = new Map(
    (customers || []).map((c) => [
      c.id,
      {
        ...c,
        order_count: 0,
        total_spent: 0,
        last_order_at: null,
        orders: [],
      },
    ])
  );

  for (const order of orders || []) {
    const cid = order.customer_id;
    if (!cid || !byId.has(cid)) continue;
    const row = byId.get(cid);
    row.orders.push(order);
    row.order_count += 1;
    if (!isCancelledStatus(order.status)) {
      row.total_spent += Number(order.total) || 0;
    }
    if (!row.last_order_at || String(order.created_at) > String(row.last_order_at)) {
      row.last_order_at = order.created_at;
    }
  }

  return [...byId.values()].map((row) => {
    const { orders: history, ...rest } = row;
    const paidCount = history.filter((o) => !isCancelledStatus(o.status)).length;
    return {
      ...rest,
      customer_type: customerTypeFromCount(rest.order_count),
      average_order_value: paidCount > 0 ? rest.total_spent / paidCount : 0,
      order_history: history,
    };
  });
}

export function summarizeCustomers(decorated = []) {
  const totalCustomers = decorated.length;
  const returningCustomers = decorated.filter((c) => c.customer_type === 'returning').length;
  const newCustomers = decorated.filter((c) => c.customer_type === 'new').length;
  const repeatCustomerRate = totalCustomers > 0 ? returningCustomers / totalCustomers : 0;
  const spenders = decorated.filter((c) => (c.total_spent || 0) > 0);
  const averageCustomerSpend =
    spenders.length > 0
      ? spenders.reduce((s, c) => s + Number(c.total_spent || 0), 0) / spenders.length
      : 0;
  const topCustomers = [...decorated]
    .sort((a, b) => Number(b.total_spent || 0) - Number(a.total_spent || 0))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      full_name: c.full_name,
      phone: c.phone,
      order_count: c.order_count,
      total_spent: c.total_spent,
      customer_type: c.customer_type,
    }));

  return {
    totalCustomers,
    newCustomers,
    returningCustomers,
    repeatCustomerRate,
    averageCustomerSpend,
    topCustomers,
  };
}

export function matchesCustomerQuery(customer, q) {
  const needle = String(q || '').trim().toLowerCase();
  if (!needle) return true;
  const phoneDigits = String(customer.phone || '').replace(/\D/g, '');
  const needleDigits = needle.replace(/\D/g, '');
  const hay = [
    customer.full_name,
    customer.phone,
    customer.normalized_phone,
    customer.email,
  ]
    .map((v) => String(v || '').toLowerCase())
    .join(' ');
  if (hay.includes(needle)) return true;
  if (needleDigits && phoneDigits.includes(needleDigits)) return true;
  return false;
}
