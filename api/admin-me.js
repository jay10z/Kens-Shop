import { getAuthUser, isAdminUser, parseAdminEmails } from './_lib/adminAuth.js';

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

/**
 * GET /api/admin-me
 * Returns whether the current bearer session is an administrator.
 * Used by the SPA Protected gate — not a substitute for server-side requireAdmin.
 */
export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const header = req.headers?.authorization || '';
    const token = String(header).replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return res.status(401).json({ admin: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ admin: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const admin = isAdminUser(user);
    return res.status(200).json({
      admin,
      email: user.email || null,
      allowlistConfigured: parseAdminEmails().size > 0,
    });
  } catch (e) {
    console.error('[admin-me]', e?.message || e);
    return res.status(500).json({ admin: false, error: 'Unable to verify admin session', code: 'ADMIN_ME_FAILED' });
  }
}
