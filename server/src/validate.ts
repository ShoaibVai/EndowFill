/**
 * validate.ts — Shared request validation + bbox normalization helpers.
 *
 * Every route rejects with an HttpError carrying a statusCode and a stable
 * machine-readable `code`; the central error handler in index.ts serializes
 * it as `{ message, code }` — the shape the frontend's ApiError expects.
 */

import { BODY_LIMIT_BYTES } from './config.js';

/** Error mapped straight onto the HTTP response by the central handler. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** One rasterized page sent by the client. */
export interface PagePayload {
  pageIndex: number;
  imageBase64: string;
  mimeType: string;
}

const MAX_PAGES_PER_REQUEST = 20;
const MIN_IMAGE_BASE64_LENGTH = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate `{ pages: [...] }` request bodies (OCR + detect-fields).
 * Enforces the same 25 MiB decode cap the frontend advertises (413).
 */
export function parsePagesBody(body: unknown): PagePayload[] {
  if (!isRecord(body) || !Array.isArray(body.pages)) {
    throw new HttpError('Request body must be { pages: [...] }.', 400, 'bad_request');
  }
  if (body.pages.length === 0) {
    throw new HttpError('At least one page is required.', 400, 'no_pages');
  }
  if (body.pages.length > MAX_PAGES_PER_REQUEST) {
    throw new HttpError(
      `Too many pages in one request (max ${MAX_PAGES_PER_REQUEST}).`,
      413,
      'too_many_pages'
    );
  }

  let totalBytes = 0;
  const pages = body.pages.map((raw, index): PagePayload => {
    if (!isRecord(raw)) {
      throw new HttpError(`pages[${index}] must be an object.`, 400, 'bad_request');
    }
    const imageBase64 = raw.image_base64;
    if (typeof imageBase64 !== 'string' || imageBase64.length < MIN_IMAGE_BASE64_LENGTH) {
      throw new HttpError(`pages[${index}].image_base64 is missing or too small.`, 400, 'bad_request');
    }
    const mimeType = typeof raw.mimeType === 'string' ? raw.mimeType : 'image/jpeg';
    if (!mimeType.startsWith('image/')) {
      throw new HttpError(`pages[${index}].mimeType must be an image type.`, 400, 'bad_mime');
    }
    totalBytes += Math.floor((imageBase64.length * 3) / 4);
    const pageIndex =
      typeof raw.pageIndex === 'number' && Number.isInteger(raw.pageIndex) && raw.pageIndex >= 0
        ? raw.pageIndex
        : index;
    return { pageIndex, imageBase64, mimeType };
  });

  if (totalBytes > BODY_LIMIT_BYTES) {
    throw new HttpError(
      `Decoded payload exceeds ${BODY_LIMIT_BYTES / (1024 * 1024)} MiB.`,
      413,
      'file_too_large'
    );
  }

  return pages;
}

// ── Bbox normalization ───────────────────────────────────────────────────────

export interface NormalizedBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toFiniteNumber(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
}

/**
 * Normalize a model-provided bbox into clamped 0..1 page-relative geometry.
 * Returns null for degenerate boxes (model hallucination guard). The model
 * occasionally emits pixel-ish values > 1 for large images; values far above
 * 1 are rejected rather than clamped into nonsense.
 */
export function normalizeBBox(raw: unknown): NormalizedBBox | null {
  if (!isRecord(raw)) return null;
  const x = toFiniteNumber(raw.x);
  const y = toFiniteNumber(raw.y);
  const width = toFiniteNumber(raw.width);
  const height = toFiniteNumber(raw.height);
  if (x === null || y === null || width === null || height === null) return null;
  if (x < -0.05 || y < -0.05 || width <= 0.001 || height <= 0.001) return null;
  if (x > 1.2 || y > 1.2 || width > 1.5 || height > 1.5) return null;
  const cx = clamp01(x);
  const cy = clamp01(y);
  // A box pushed past the right/bottom edge clamps to a zero-width/height box
  // — reject those instead of handing a degenerate geometry to the overlay.
  const cw = Math.min(clamp01(width), 1 - cx);
  const ch = Math.min(clamp01(height), 1 - cy);
  if (cw <= 0.001 || ch <= 0.001) return null;
  return { x: cx, y: cy, width: cw, height: ch };
}
