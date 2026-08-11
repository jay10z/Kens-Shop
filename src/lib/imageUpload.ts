/** Client-side image helpers for admin product uploads. */

export const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_UPLOAD_EDGE = 1600;
export const UPLOAD_TIMEOUT_MS = 90000;

export type ImageValidationError = 'invalid_type' | 'too_large';

export function validateImageFile(file: File): ImageValidationError | null {
  const type = (file.type || '').toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) return 'invalid_type';
  if (file.size > MAX_IMAGE_BYTES) return 'too_large';
  return null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ''));
    r.onerror = () => reject(new Error('read_failed'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode_failed'));
    img.src = src;
  });
}

/** Resize/compress for reliable JSON uploads (avoids Vercel body-size failures). */
export async function prepareImageForUpload(file: File): Promise<{
  fileName: string;
  contentType: string;
  fileBase64: string;
}> {
  const dataUrl = await readAsDataUrl(file);
  let img: HTMLImageElement;
  try {
    img = await loadImage(dataUrl);
  } catch {
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('read_failed');
    return {
      fileName: file.name,
      contentType: file.type || 'image/jpeg',
      fileBase64: base64,
    };
  }

  const scale = Math.min(1, MAX_UPLOAD_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_failed');
  ctx.drawImage(img, 0, 0, w, h);

  const preferPng = file.type === 'image/png';
  const preferWebp = file.type === 'image/webp';
  const mime = preferPng ? 'image/png' : preferWebp ? 'image/webp' : 'image/jpeg';
  const quality = preferPng ? undefined : 0.85;
  const outUrl = canvas.toDataURL(mime, quality as number | undefined);
  let fileBase64 = outUrl.split(',')[1];
  let contentType = mime;
  let fileName = file.name.replace(/\.[^.]+$/, '') + (mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg');

  if (!fileBase64) throw new Error('encode_failed');

  // If still huge after compress, force JPEG
  if (fileBase64.length > 3.5 * 1024 * 1024) {
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.75);
    const jpegB64 = jpegUrl.split(',')[1];
    if (!jpegB64) throw new Error('encode_failed');
    fileBase64 = jpegB64;
    contentType = 'image/jpeg';
    fileName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
  }

  return { fileName, contentType, fileBase64 };
}
