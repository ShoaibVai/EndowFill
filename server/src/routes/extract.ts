/**
 * routes/extract.ts — POST /api/ai/extract
 *
 * Body:  { ocrResult: { pageCount, pages: [{ pageIndex, markdown, detections }] } }
 * Reply: { items: [{ id, label, value, category, confidence, sourceBBox, pageIndex }] }
 *
 * Deterministic label/value extraction over the OCR detections (no model
 * call): same-line "Label: value" pairs and stacked label-above-value rows
 * are recognized, classified into the frontend's categories, and linked
 * back to their source bbox so the review UI can draw highlight boxes.
 */

import type { FastifyInstance } from 'fastify';
import { extractItems, isKnownCategory } from '../ocr/extractRules.js';
import { HttpError, type NormalizedBBox } from '../validate.js';

const MAX_PAGES = 20;
const MAX_DETECTIONS = 300;

interface OcrDetectionInput {
  bbox?: unknown;
  text?: unknown;
}

interface OcrPageInput {
  pageIndex?: unknown;
  detections?: unknown;
}

interface ItemReply {
  id: string;
  label: string;
  value: string;
  category: string;
  confidence: number;
  sourceBBox: NormalizedBBox | null;
  pageIndex: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOcrResult(body: unknown): { pages: OcrPageInput[] } {
  if (!isRecord(body) || !isRecord(body.ocrResult) || !Array.isArray(body.ocrResult.pages)) {
    throw new HttpError('Request body must be { ocrResult: { pages: [...] } }.', 400, 'bad_request');
  }
  if (body.ocrResult.pages.length > MAX_PAGES) {
    throw new HttpError(`Too many pages in one request (max ${MAX_PAGES}).`, 413, 'too_many_pages');
  }
  return { pages: body.ocrResult.pages as OcrPageInput[] };
}

export function registerExtractRoute(
  app: FastifyInstance,
  rateLimit?: { max: number; timeWindow: number }
): void {
  app.post(
    '/api/ai/extract',
    { config: rateLimit ? { rateLimit } : undefined },
    async (request, reply) => {
      const { pages } = parseOcrResult(request.body);

      const normalizedPages = pages.map((page, position) => {
        const pageIndex =
          typeof page.pageIndex === 'number' && Number.isInteger(page.pageIndex)
            ? page.pageIndex
            : position;
        const rawDetections = Array.isArray(page.detections)
          ? (page.detections as OcrDetectionInput[])
          : [];
        const detections = rawDetections
          .slice(0, MAX_DETECTIONS)
          .filter(isRecord)
          .map((det) => ({
            pageIndex,
            bbox: det.bbox as NormalizedBBox | null,
            label: 'text',
            text: typeof det.text === 'string' ? det.text.trim() : '',
          }))
          .filter(
            (det): det is typeof det & { bbox: NormalizedBBox } =>
              det.text.length > 0 && det.bbox !== null
          );
        return { pageIndex, detections };
      });

      const drafts = extractItems(normalizedPages);

      const items: ItemReply[] = drafts.map((draft, index) => ({
        id: `item-${index + 1}`,
        label: draft.label,
        value: draft.value,
        category: isKnownCategory(draft.category) ? draft.category : 'other',
        confidence: Math.min(1, Math.max(0, draft.confidence)),
        sourceBBox: draft.sourceBBox,
        pageIndex: draft.pageIndex,
      }));

      return reply.send({ items });
    }
  );
}
