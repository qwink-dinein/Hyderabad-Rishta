import type { Biodata, Lang } from './types';

/**
 * Server-side input rules shared by the demo backend, the client and tests.
 * The Supabase twin lives in supabase/migrations/20261102000000_security_hardening.sql.
 */

/** Largest photo a member may pick (the original, before on-device compression). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Largest photo the backend will store after compression (a 1600px JPEG is ~300–600 KB). */
export const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024;
/** Biodata text (everything except photos) — a full, honest biodata is ~4 KB. */
export const MAX_BIODATA_TEXT_BYTES = 32 * 1024;
export const MAX_ARRAY_ITEMS = 50;
export const MAX_FIELD_CHARS = 2000;
export const MAX_IDEM_KEY = 100;
export const MAX_PUSH_TOKEN = 200;
export const MAX_SEARCH_PAGE = 50;
export const MAX_REPORTS_PER_DAY = 10;
export const LANGS: readonly Lang[] = ['en', 'ur', 'te'];

const INTERNAL_PATH = /^\/(?!\/)[A-Za-z0-9/_?=&.%-]*$/;
const PHOTO_ID = /^[A-Za-z0-9_-]{1,64}$/;
const DATA_IMAGE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$/;
/** Local files picked on a phone, and storage paths once uploaded (`<userId>/<photo>.jpg`). */
const LOCAL_IMAGE = /^(file|content|ph|assets-library):\/\/[^\s"'<>]{1,500}$/;
const STORAGE_PATH = /^[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\.(jpg|jpeg|png|webp)$/;

/** A link the app may navigate to: internal paths only; anything else falls back to the inbox. */
export function safeDeepLink(link: string | undefined | null, fallback = '/notifications'): string {
  return typeof link === 'string' && link.length <= 300 && INTERNAL_PATH.test(link) ? link : fallback;
}
export const isInternalLink = (link: string) => safeDeepLink(link, '') === link;
export const isHttpsUrl = (url: string) => /^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/[^\s"'<>]*)?$/.test(url) && url.length <= 500;

/** Approximate decoded size of a data URI. */
export const dataUriBytes = (uri: string) => Math.floor(((uri.length - uri.indexOf(',') - 1) * 3) / 4);

export function photoProblem(p: { id?: unknown; uri?: unknown }): string | null {
  if (typeof p?.id !== 'string' || !PHOTO_ID.test(p.id)) return 'v.photoInvalid';
  if (typeof p.uri !== 'string') return 'v.photoInvalid';
  if (p.uri.startsWith('data:')) {
    if (!DATA_IMAGE.test(p.uri)) return 'v.photoType';
    return dataUriBytes(p.uri) > MAX_PHOTO_BYTES ? 'v.photoTooLarge' : null;
  }
  return LOCAL_IMAGE.test(p.uri) || STORAGE_PATH.test(p.uri) ? null : 'v.photoInvalid';
}

/** Walks the biodata (minus photos) and rejects oversized strings, arrays, deep nesting or bulk. */
export function biodataProblem(b: Biodata): string | null {
  if (!b || typeof b !== 'object' || !Array.isArray(b.photos)) return 'v.invalid';
  if (b.photos.length > 3) return 'v.maxPhotos';
  for (const p of b.photos) {
    const e = photoProblem(p);
    if (e) return e;
  }
  const { photos: _photos, ...text } = b;
  let bad: string | null = null;
  const walk = (v: unknown, depth: number) => {
    if (bad) return;
    if (depth > 4) bad = 'v.invalid';
    else if (typeof v === 'string') {
      if (v.length > MAX_FIELD_CHARS) bad = 'v.tooLong';
    } else if (Array.isArray(v)) {
      if (v.length > MAX_ARRAY_ITEMS) bad = 'v.tooMany';
      else v.forEach((x) => walk(x, depth + 1));
    } else if (v && typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(text, 0);
  if (bad) return bad;
  return new TextEncoder().encode(JSON.stringify(text)).length > MAX_BIODATA_TEXT_BYTES ? 'v.tooLong' : null;
}
