/**
 * Google Analytics 4 (gtag) — additional analytics layer.
 * Does not replace Supabase product_events (/api/track).
 *
 * Privacy: never send customer name, phone, email, WhatsApp number,
 * address, customer ID, order number, or other PII.
 */

import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

export const GA_CURRENCY = 'XAF';

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

let initialized = false;

function measurementId(): string {
  const id = String(import.meta.env.VITE_GA_MEASUREMENT_ID || '').trim();
  return id;
}

function gtag(...args: unknown[]) {
  if (typeof window === 'undefined') return;
  if (typeof window.gtag === 'function') {
    window.gtag(...args);
    return;
  }
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(args);
}

/** Load gtag once. Safe no-op if ID missing or script blocked. */
export function initAnalytics() {
  if (typeof window === 'undefined' || initialized) return;
  const id = measurementId();
  if (!id) return;

  initialized = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtagStub(...args: unknown[]) {
    window.dataLayer!.push(args);
  };

  // Disable automatic page_view — SPA routes are tracked manually once.
  gtag('js', new Date());
  gtag('config', id, {
    send_page_view: false,
  });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  script.onerror = () => {
    // Analytics unavailable must never break the storefront.
  };
  document.head.appendChild(script);
}

function isAdminPath(path: string) {
  return path === '/admin' || path.startsWith('/admin/');
}

/** SPA page view — call on route changes only (not on config). */
export function trackPageView(path: string, title?: string) {
  const id = measurementId();
  if (!id || !initialized) return;
  if (isAdminPath(path)) return;

  gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
    page_location: `${window.location.origin}${path}`,
    send_to: id,
  });
}

export type AnalyticsItem = {
  item_id: string;
  item_name?: string;
  item_category?: string;
  price?: number;
  quantity?: number;
};

function safeItem(input: {
  id?: string | number | null;
  name?: string | null;
  category?: string | null;
  price?: number | string | null;
  quantity?: number | null;
}): AnalyticsItem | null {
  if (input.id == null || input.id === '') return null;
  const item: AnalyticsItem = { item_id: String(input.id) };
  if (input.name) item.item_name = String(input.name).slice(0, 100);
  if (input.category) item.item_category = String(input.category).slice(0, 100);
  const price = Number(input.price);
  if (Number.isFinite(price)) item.price = price;
  const qty = Number(input.quantity);
  if (Number.isFinite(qty) && qty > 0) item.quantity = qty;
  return item;
}

function emit(eventName: string, params: Record<string, unknown>) {
  const id = measurementId();
  if (!id || !initialized) return;
  try {
    gtag('event', eventName, { ...params, send_to: id });
  } catch {
    // never break UX
  }
}

/** Product detail view (non-PII). */
export function trackViewItem(product: {
  id: string | number;
  name?: string;
  category?: string | null;
  price?: number;
}) {
  const item = safeItem({
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    quantity: 1,
  });
  if (!item) return;
  emit('view_item', {
    currency: GA_CURRENCY,
    value: item.price ?? 0,
    items: [item],
  });
}

/** Add to cart (non-PII). */
export function trackAddToCart(product: {
  id: string | number;
  name?: string;
  category?: string | null;
  price?: number;
  quantity?: number;
}) {
  const qty = product.quantity && product.quantity > 0 ? product.quantity : 1;
  const item = safeItem({
    id: product.id,
    name: product.name,
    category: product.category,
    price: product.price,
    quantity: qty,
  });
  if (!item) return;
  const value = (item.price ?? 0) * qty;
  emit('add_to_cart', {
    currency: GA_CURRENCY,
    value,
    items: [item],
  });
}

/** Begin checkout / order initiation (cart → customer step). */
export function trackBeginCheckout(input: {
  value: number;
  items: Array<{
    id: string | number;
    name?: string;
    category?: string | null;
    price?: number;
    quantity?: number;
  }>;
}) {
  const items = input.items
    .map((x) =>
      safeItem({
        id: x.id,
        name: x.name,
        category: x.category,
        price: x.price,
        quantity: x.quantity,
      })
    )
    .filter(Boolean) as AnalyticsItem[];
  if (!items.length) return;
  emit('begin_checkout', {
    currency: GA_CURRENCY,
    value: Number(input.value) || 0,
    items,
  });
}

/**
 * Successful order creation — no order number, customer ID, or contact PII.
 * Uses GA4 purchase without transaction_id.
 */
export function trackPurchase(input: {
  value: number;
  items: Array<{
    id: string | number;
    name?: string;
    category?: string | null;
    price?: number;
    quantity?: number;
  }>;
}) {
  const items = input.items
    .map((x) =>
      safeItem({
        id: x.id,
        name: x.name,
        category: x.category,
        price: x.price,
        quantity: x.quantity,
      })
    )
    .filter(Boolean) as AnalyticsItem[];
  if (!items.length) return;
  emit('purchase', {
    currency: GA_CURRENCY,
    value: Number(input.value) || 0,
    items,
  });
}

/**
 * Single SPA page-view strategy: listen to React Router location changes.
 * Skips admin routes. Dedupes identical path+search (StrictMode / remounts).
 */
export function GaRouteTracker() {
  const location = useLocation();
  const lastKey = useRef<string>('');

  useEffect(() => {
    const key = `${location.pathname}${location.search}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    trackPageView(key);
  }, [location.pathname, location.search]);

  return null;
}
