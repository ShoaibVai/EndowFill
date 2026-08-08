/**
 * utils/aiChunk.ts — chunked AI requests for size-capped deployments.
 *
 * Vercel functions hard-cap request bodies at 4.5 MB (413
 * FUNCTION_PAYLOAD_TOO_LARGE before the function runs), so a multi-page
 * rasterized upload can be rejected before the AI server even sees it.
 * These helpers split `{ pages }` payloads into byte-bounded chunks, POST
 * each chunk to the same endpoints, and merge the responses — transparently
 * to the callers (AIScanPage, AIFieldsPage, useBulkScanQueue). The
 * self-hosted Fastify backend accepts the same requests unchanged.
 */

import { api } from './apiClient';
import type { RasterPage } from './pdfRaster';
import type { DetectFieldsResult, OcrResult } from '../types/scan.types';

/**
 * Decoded-byte budget per request. Vercel's wire limit is 4.5 MB and base64
 * expands 4:3, so ~3.25 MiB of decoded image data stays safely under it
 * (the serverless endpoints enforce the same cap in validate.ts).
 */
const MAX_DECODED_BYTES_PER_CHUNK = 3.25 * 1024 * 1024;

function decodedBytes(page: RasterPage): number {
  return Math.floor((page.image_base64.length * 3) / 4);
}

/**
 * Greedily pack pages into chunks whose decoded size fits the per-request
 * cap. A single page larger than the cap forms its own chunk (the backend
 * then answers with a readable 413 instead of the platform's generic one).
 */
export function chunkPages(
  pages: RasterPage[],
  maxBytes: number = MAX_DECODED_BYTES_PER_CHUNK
): RasterPage[][] {
  const chunks: RasterPage[][] = [];
  let current: RasterPage[] = [];
  let currentBytes = 0;
  for (const page of pages) {
    const bytes = decodedBytes(page);
    if (current.length > 0 && currentBytes + bytes > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(page);
    currentBytes += bytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

export interface AiScanOptions {
  dpi: number;
  /** Optional original file name (echoed in progress labels). */
  filename?: string;
  /** Per-chunk progress label, e.g. "Scanning pages 3-5 of 8…". */
  onChunkProgress?: (label: string) => void;
}

/**
 * OCR all pages via POST /api/ai/ocr, splitting into size-bounded chunks.
 * Responses are merged in order; `pageCount` is the total across chunks.
 */
export async function runOcr(pages: RasterPage[], options: AiScanOptions): Promise<OcrResult> {
  const chunks = chunkPages(pages);
  const merged: OcrResult = { pageCount: 0, pages: [] };
  let scanned = 0;
  for (const chunk of chunks) {
    const from = scanned + 1;
    const to = scanned + chunk.length;
    scanned = to;
    if (chunks.length > 1) {
      options.onChunkProgress?.(
        `Scanning pages ${from}-${to} of ${pages.length} (${options.dpi} DPI)…`
      );
    }
    const result = await api.post<OcrResult>('/ai/ocr', {
      pages: chunk,
      dpi: options.dpi,
      ...(options.filename ? { filename: options.filename } : {}),
    });
    merged.pageCount += result.pageCount;
    merged.pages.push(...result.pages);
  }
  return merged;
}

/**
 * Detect fillable fields via POST /api/ai/detect-fields, splitting into
 * size-bounded chunks. Field lists are merged in page order.
 */
export async function runDetectFields(
  pages: RasterPage[],
  dpi: number,
  onChunkProgress?: (label: string) => void
): Promise<DetectFieldsResult> {
  const chunks = chunkPages(pages);
  const fields: DetectFieldsResult['fields'] = [];
  let scanned = 0;
  for (const chunk of chunks) {
    const from = scanned + 1;
    const to = scanned + chunk.length;
    scanned = to;
    if (chunks.length > 1) {
      onChunkProgress?.(`Detecting fields on pages ${from}-${to} of ${pages.length}…`);
    }
    const result = await api.post<DetectFieldsResult>('/ai/detect-fields', {
      pages: chunk,
      dpi,
    });
    fields.push(...result.fields);
  }
  return { fields };
}
