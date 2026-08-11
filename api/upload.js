import supabase from './db-client.js';

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'product-images';
const MAX_BYTES = 8 * 1024 * 1024; // 8MB raw (after client compress this is plenty)
const ALLOWED = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function friendly(error, code = 'UPLOAD_FAILED') {
  const msg = String(error?.message || error || '');
  if (/bucket not found|not found/i.test(msg)) {
    return {
      error: 'Photo storage is not ready. Please contact support.',
      code: 'STORAGE_BUCKET_MISSING',
    };
  }
  if (/payload|too large|entity too large|413/i.test(msg)) {
    return { error: 'This image is too large.', code: 'FILE_TOO_LARGE' };
  }
  if (/mime|content type|not allowed|invalid/i.test(msg)) {
    return { error: 'Unsupported format. Use JPG, PNG or WEBP.', code: 'INVALID_TYPE' };
  }
  return { error: 'Image upload failed. Please try again.', code };
}

async function ensureBucket() {
  try {
    const { data } = await supabase.storage.getBucket(BUCKET);
    if (data) return { ok: true };
  } catch {
    /* fall through to create */
  }
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: MAX_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  });
  // Ignore "already exists" races
  if (error && !/already exists|duplicate/i.test(error.message || '')) {
    console.error('[upload] ensureBucket:', error.message || error);
    return { ok: false, error };
  }
  return { ok: true };
}

function sanitizeName(name) {
  return String(name || 'image')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
}

function extFor(contentType, fileName) {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg';
  const m = String(fileName || '').match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || 'jpg').toLowerCase();
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user) {
      return res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    }

    const { fileName, fileBase64, contentType } = req.body || {};
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      return res.status(400).json({ error: 'Missing image data.', code: 'MISSING_FILE' });
    }

    const type = String(contentType || '').toLowerCase();
    if (!ALLOWED.has(type)) {
      return res.status(400).json(friendly({ message: 'invalid mime' }, 'INVALID_TYPE'));
    }

    let buffer;
    try {
      buffer = Buffer.from(fileBase64, 'base64');
    } catch {
      return res.status(400).json({ error: 'Invalid image data.', code: 'INVALID_FILE' });
    }

    if (!buffer.length) {
      return res.status(400).json({ error: 'Empty image file.', code: 'INVALID_FILE' });
    }
    if (buffer.length > MAX_BYTES) {
      return res.status(400).json(friendly({ message: 'too large' }, 'FILE_TOO_LARGE'));
    }

    const ensured = await ensureBucket();
    if (!ensured.ok) {
      return res.status(500).json(friendly(ensured.error, 'STORAGE_BUCKET_MISSING'));
    }

    const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${sanitizeName(fileName)}.${extFor(type, fileName)}`;

    let { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: type === 'image/jpg' ? 'image/jpeg' : type, upsert: false });

    if (uploadError && /bucket not found/i.test(uploadError.message || '')) {
      const retryEnsure = await ensureBucket();
      if (!retryEnsure.ok) {
        console.error('[upload] bucket missing:', uploadError.message);
        return res.status(500).json(friendly(uploadError, 'STORAGE_BUCKET_MISSING'));
      }
      ({ error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: type === 'image/jpg' ? 'image/jpeg' : type, upsert: false }));
    }

    if (uploadError) {
      console.error('[upload] storage:', uploadError.message || uploadError);
      return res.status(500).json(friendly(uploadError));
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (!data?.publicUrl) {
      return res.status(500).json({ error: 'Image upload failed. Please try again.', code: 'UPLOAD_FAILED' });
    }

    return res.status(200).json({ url: data.publicUrl, path });
  } catch (e) {
    console.error('[upload]', e?.message || e);
    return res.status(500).json(friendly(e));
  }
}
