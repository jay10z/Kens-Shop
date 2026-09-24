/**
 * Page-view privacy rules shared by the storefront analytics layer.
 * Review links carry a secret token in the path and must never be sent
 * to Google Analytics, including as a later page's referrer.
 */

export function shouldTrackPagePath(path) {
  const pathname = String(path || '').split('?')[0].split('#')[0] || '/';
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return false;
  if (pathname === '/review' || pathname.startsWith('/review/')) return false;
  return true;
}

/** Drop review URLs so a later page view cannot forward the token. */
export function analyticsReferrer(referrer) {
  if (!referrer) return undefined;
  try {
    const url = new URL(referrer);
    if (url.pathname === '/review' || url.pathname.startsWith('/review/')) {
      return `${url.origin}/`;
    }
    return referrer;
  } catch {
    return undefined;
  }
}
