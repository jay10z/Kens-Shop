/**
 * Server-side administrator authorization.
 *
 * Primary: ADMIN_EMAILS (comma/semicolon/whitespace-separated), server-only.
 * Secondary: app_metadata.role in {'admin','owner'} — set only via service role / Dashboard.
 *
 * Never trust user_metadata for elevation.
 */
import supabase from './db-client.js';

export function parseAdminEmails(raw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '') {
  return new Set(
    String(raw || '')
      .split(/[,;\s]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function hasServerAdminRole(user) {
  const role = user?.app_metadata?.role;
  return role === 'admin' || role === 'owner';
}

export function isAdminEmail(email, allowlist = parseAdminEmails()) {
  if (!email) return false;
  if (allowlist.size === 0) return false;
  return allowlist.has(String(email).trim().toLowerCase());
}

export function isAdminUser(user) {
  if (!user) return false;
  return isAdminEmail(user.email) || hasServerAdminRole(user);
}

export async function getAuthUser(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** True only when the bearer token belongs to an allowlisted / role-tagged admin. */
export async function isAdminRequest(req) {
  const user = await getAuthUser(req);
  return isAdminUser(user);
}

/**
 * Enforce admin on a handler.
 * - 401: missing/invalid session
 * - 403: authenticated but not an administrator (or ADMIN_EMAILS unset with no role)
 * Returns the user, or null after writing the response.
 */
export async function requireAdmin(req, res) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = String(header).replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return null;
  }

  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return null;
  }

  if (!isAdminUser(user)) {
    if (parseAdminEmails().size === 0 && !hasServerAdminRole(user)) {
      console.error('[adminAuth] ADMIN_EMAILS is not configured — denying admin access');
    }
    res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    return null;
  }

  return user;
}
