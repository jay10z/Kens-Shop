import supabase from './_lib/db-client.js';
import { requireAdmin } from './_lib/adminAuth.js';

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

function unavailable(res) {
  return res.status(404).json({
    error: 'This review link is unavailable.',
    code: 'REVIEW_UNAVAILABLE',
  });
}

function hasAuthHeader(req) {
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  return Boolean(String(header).replace(/^Bearer\s+/i, '').trim());
}

function isMissingRpc(error, name) {
  const msg = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`;
  return new RegExp(name, 'i').test(msg) && /schema cache|Could not find the function|does not exist/i.test(msg);
}

function toPublicReview(row) {
  if (!row || typeof row !== 'object') return null;
  const rating = Number(row.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const comment = typeof row.comment === 'string' && row.comment.trim() ? row.comment.slice(0, 1000) : null;
  const name = typeof row.display_name === 'string' ? row.display_name.trim().slice(0, 80) : '';
  return {
    rating,
    comment,
    display_name: name || null,
    approved_at: row.approved_at || null,
  };
}

function toAdminReview(row) {
  const order = row?.orders || {};
  return {
    id: row.id,
    rating: row.rating ?? null,
    comment: row.comment ?? null,
    display_name: row.display_name ?? null,
    status: row.status,
    created_at: row.created_at,
    submitted_at: row.submitted_at ?? null,
    moderated_at: row.moderated_at ?? null,
    order_number: order.order_number || null,
    customer_name: order.customer_name || null,
  };
}

async function publicList(res) {
  const { data, error } = await supabase.rpc('list_approved_reviews');
  if (error) {
    if (isMissingRpc(error, 'list_approved_reviews')) return res.status(200).json([]);
    console.error('[reviews] public list failed');
    return res.status(500).json({ error: 'Unable to load reviews. Please try again.', code: 'REVIEWS_ERROR' });
  }
  const rows = Array.isArray(data) ? data : [];
  return res.status(200).json(rows.map(toPublicReview).filter(Boolean).slice(0, 100));
}

function queryParam(req, name) {
  if (req.query && req.query[name] != null) return String(req.query[name]);
  try {
    return new URL(req.url || '', 'http://localhost').searchParams.get(name) || '';
  } catch {
    return '';
  }
}

async function adminList(req, res) {
  const requested = queryParam(req, 'status') || 'pending';
  const allowed = new Set(['pending', 'approved', 'rejected', 'invited', 'all']);
  const status = allowed.has(requested) ? requested : 'pending';

  let query = supabase
    .from('order_reviews')
    .select('id, rating, comment, display_name, status, created_at, submitted_at, moderated_at, orders(order_number, customer_name)')
    .order('created_at', { ascending: false })
    .limit(200);

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[reviews] admin list failed');
    return res.status(500).json({ error: 'Unable to load reviews. Please try again.', code: 'REVIEWS_ERROR' });
  }
  return res.status(200).json((data || []).map(toAdminReview));
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      if (hasAuthHeader(req)) {
        if (!(await requireAdmin(req, res))) return;
        return adminList(req, res);
      }
      return publicList(res);
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      if (action === 'regenerate') {
        if (!(await requireAdmin(req, res))) return;
        const orderId = String(body.order_id || '');
        if (!UUID_RE.test(orderId)) {
          return res.status(400).json({ error: 'Missing order.', code: 'INVALID_ORDER' });
        }
        const { data, error } = await supabase.rpc('regenerate_order_review_token', { p_order_id: orderId });
        if (error) {
          const message = error.message || '';
          if (message.includes('REVIEW_ALREADY_SUBMITTED')) {
            return res.status(409).json({
              error: 'This customer has already sent a review.',
              code: 'REVIEW_ALREADY_SUBMITTED',
            });
          }
          if (message.includes('REVIEW_NOT_FOUND')) {
            return res.status(404).json({ error: 'No review invitation exists for this order.', code: 'REVIEW_NOT_FOUND' });
          }
          console.error('[reviews] regenerate failed');
          return res.status(500).json({ error: 'Could not create a review link.', code: 'REVIEWS_ERROR' });
        }
        if (typeof data !== 'string' || !TOKEN_RE.test(data)) {
          console.error('[reviews] regenerate returned an unexpected result');
          return res.status(500).json({ error: 'Could not create a review link.', code: 'REVIEWS_ERROR' });
        }
        return res.status(200).json({ review_token: data });
      }

      const token = typeof body.token === 'string' ? body.token : '';
      if (!TOKEN_RE.test(token)) return unavailable(res);

      if (action === 'lookup') {
        const { data, error } = await supabase.rpc('review_invitation_available', { p_token: token });
        if (error) {
          console.error('[reviews] lookup failed');
          return res.status(500).json({ error: 'Unable to open this review link. Please try again.', code: 'REVIEWS_ERROR' });
        }
        if (data !== true) return unavailable(res);
        return res.status(200).json({ available: true });
      }

      if (action) {
        return res.status(400).json({ error: 'Unknown review action.', code: 'INVALID_ACTION' });
      }

      const rating = Number(body.rating);
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Please choose a rating from 1 to 5.', code: 'INVALID_REVIEW' });
      }
      const comment = body.comment == null ? '' : String(body.comment);
      const displayName = body.display_name == null ? '' : String(body.display_name);
      if (comment.trim().length > 1000 || displayName.trim().length > 80) {
        return res.status(400).json({ error: 'Please shorten your review and try again.', code: 'INVALID_REVIEW' });
      }

      const { data, error } = await supabase.rpc('submit_order_review', {
        p_token: token,
        p_rating: rating,
        p_comment: comment,
        p_display_name: displayName,
      });
      if (error) {
        console.error('[reviews] submit failed');
        return res.status(500).json({ error: 'Could not send your review. Please try again.', code: 'REVIEWS_ERROR' });
      }
      if (!data?.ok) {
        if (data?.code === 'INVALID_REVIEW') {
          return res.status(400).json({ error: 'Please check your review and try again.', code: 'INVALID_REVIEW' });
        }
        return unavailable(res);
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'PUT') {
      if (!(await requireAdmin(req, res))) return;
      const id = String(req.body?.id || '');
      const action = String(req.body?.action || '');
      if (!UUID_RE.test(id)) {
        return res.status(400).json({ error: 'Missing review.', code: 'INVALID_REVIEW' });
      }
      if (!['approve', 'reject', 'remove'].includes(action)) {
        return res.status(400).json({ error: 'Unknown review action.', code: 'INVALID_ACTION' });
      }
      const { data, error } = await supabase.rpc('moderate_order_review', {
        p_id: id,
        p_action: action,
      });
      if (error) {
        console.error('[reviews] moderate failed');
        return res.status(500).json({ error: 'Could not update this review.', code: 'REVIEWS_ERROR' });
      }
      if (!data?.ok) {
        const status = data?.code === 'REVIEW_NOT_FOUND' ? 404 : 409;
        return res.status(status).json({
          error: status === 404 ? 'Review not found.' : 'This review can no longer be changed that way.',
          code: data?.code || 'REVIEW_CONFLICT',
        });
      }
      return res.status(200).json({ ok: true, status: data.status });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch {
    console.error('[reviews] request failed');
    return res.status(500).json({ error: 'Something went wrong. Please try again.', code: 'REVIEWS_ERROR' });
  }
}
