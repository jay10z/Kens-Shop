/** Cameroon WhatsApp / mobile phone helpers (server). Do not store only the normalized form. */

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/**
 * Normalize to 237 + local digits (no leading 0).
 * Accepts +237 6XX XXX XXX, 2376XXXXXXXX, 6XXXXXXXX, 06XXXXXXXX, 00237...
 */
export function normalizeCameroonPhone(input) {
  let d = digitsOnly(input);
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('237')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (!d) return '';
  return `237${d}`;
}

/** Cameroon mobile numbers are 9 local digits (237 + 9 = 12 digits). */
export function isValidCameroonPhone(input) {
  return /^237\d{9}$/.test(normalizeCameroonPhone(input));
}

export function isValidEmail(input) {
  const s = String(input || '').trim();
  if (!s) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
