import { SOCIAL } from './brand';

const digits = (value: string) => value.replace(/\D/g, '');
const FALLBACK_KEY = 'ks-wa-order-fallback';
const FALLBACK_TTL_MS = 60 * 60 * 1000; // 1 hour

export type OrderLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  color?: string;
  model?: string;
};

export type OrderMessageInput = {
  orderNumber: string;
  lines: OrderLine[];
  total: number;
  storeName: string;
  formatMoney: (value: number) => string;
  messageTemplate: (
    orderNumber: string,
    lines: string,
    total: string,
    storeName: string
  ) => string;
  customerName?: string;
  customerEmail?: string;
  lang?: 'en' | 'fr';
};

export type WhatsAppFallback = {
  url: string;
  orderNumber: string;
  ts: number;
};

/** Format cart/order lines for the WhatsApp body (plain text). */
export function formatOrderLines(
  lines: OrderLine[],
  formatMoney: (value: number) => string
): string {
  return lines
    .map((line) => {
      const meta = [line.color, line.model].filter(Boolean).join(' · ');
      const label = meta ? `${line.name} (${meta})` : line.name;
      return `• ${label} × ${line.quantity} — ${formatMoney(line.unitPrice)}`;
    })
    .join('\n');
}

/** Build the full bilingual WhatsApp order message from confirmed order data. */
export function buildWhatsAppOrderMessage(input: OrderMessageInput): string {
  const linesText = formatOrderLines(input.lines, input.formatMoney);
  let text = String(
    input.messageTemplate(
      input.orderNumber,
      linesText,
      input.formatMoney(input.total),
      input.storeName
    )
  );

  const name = (input.customerName || '').trim();
  const email = (input.customerEmail || '').trim();
  if (name || email) {
    const bits = [name, email].filter(Boolean).join(' · ');
    text += input.lang === 'fr' ? `\n\nClient : ${bits}` : `\n\nCustomer: ${bits}`;
  }

  return text;
}

/**
 * Build a WhatsApp deep link with URL-encoded prefilled text.
 * Uses api.whatsapp.com/send — generally more reliable on mobile than wa.me for ?text=.
 */
export function buildWhatsAppOrderLink(
  message: string,
  phone: string = SOCIAL.whatsappNumber
): string {
  const num = digits(phone);
  if (!num) return '';
  const body = String(message || '').trim();
  const encoded = encodeURIComponent(body);
  return `https://api.whatsapp.com/send?phone=${num}&text=${encoded}`;
}

export function storeWhatsAppFallback(data: WhatsAppFallback): void {
  try {
    sessionStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
  } catch {
    /* private mode */
  }
}

export function readWhatsAppFallback(): WhatsAppFallback | null {
  try {
    const raw = sessionStorage.getItem(FALLBACK_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as WhatsAppFallback;
    if (!data?.url || !data?.orderNumber) return null;
    if (Date.now() - (data.ts || 0) > FALLBACK_TTL_MS) {
      sessionStorage.removeItem(FALLBACK_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearWhatsAppFallback(): void {
  try {
    sessionStorage.removeItem(FALLBACK_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Open WhatsApp via same-tab navigation (no popup).
 * Call only after the message URL is fully built — do not set React state before this.
 */
export function navigateToWhatsApp(url: string): void {
  if (!url) return;
  // location.replace avoids back-button returning to a half-updated cart state
  window.location.replace(url);
}
