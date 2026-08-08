/**
 * routes/ocr.ts — POST /api/ai/ocr
 *
 * Body:  { pages: [{ pageIndex, image_base64, mimeType }], dpi?, filename? }
 * Reply: { pageCount, pages: [{ pageIndex, markdown, detections: [...] }] }
 *
 * Pages are processed sequentially: vision calls are slow (10-60s) and the
 * bulk-scan frontend processes files sequentially anyway, so parallelism
 * here would only add rate-limit risk.
 */

import type { FastifyInstance } from 'fastify';
import { UpstreamError } from '../opencodeGo.js';
import { chatJson } from '../chatJson.js';
import { OCR_SYSTEM, ocrUserPrompt } from '../prompts.js';
import { HttpError, normalizeBBox, parsePagesBody, type NormalizedBBox } from '../validate.js';

interface RawDetection {
  label?: unknown;
  text?: unknown;
  bbox?: unknown;
}

interface OcrPageModel {
  markdown?: unknown;
  detections?: unknown;
}

interface OcrDetectionReply {
  pageIndex: number;
  bbox: NormalizedBBox;
  label: string;
  text: string;
}

interface OcrPageReply {
  pageIndex: number;
  markdown: string;
  detections: OcrDetectionReply[];
}

function normalizeDetections(raw: unknown, pageIndex: number): OcrDetectionReply[] {
  if (!Array.isArray(raw)) return [];
  const detections: OcrDetectionReply[] = [];
  for (const entry of raw as RawDetection[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const bbox = normalizeBBox(entry.bbox);
    if (!bbox) continue;
    detections.push({
      pageIndex,
      bbox,
      label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : 'text',
      text: typeof entry.text === 'string' ? entry.text : '',
    });
  }
  return detections;
}

export function registerOcrRoute(app: FastifyInstance): void {
  app.post('/api/ai/ocr', async (request, reply) => {
    const pages = parsePagesBody(request.body);
    const results: OcrPageReply[] = [];

    for (const page of pages) {
      let parsed: OcrPageModel;
      try {
        parsed = await chatJson<OcrPageModel>(
          {
            system: OCR_SYSTEM,
            userText: ocrUserPrompt(page.pageIndex),
            images: [{ imageBase64: page.imageBase64, mimeType: page.mimeType }],
            maxTokens: 8192,
          },
          'ocr'
        );
      } catch (error) {
        if (error instanceof UpstreamError) {
          throw new HttpError(error.message, error.status === 0 ? 502 : error.status, 'ocr_upstream_failed');
        }
        throw error;
      }
      results.push({
        pageIndex: page.pageIndex,
        markdown: typeof parsed.markdown === 'string' ? parsed.markdown : '',
        detections: normalizeDetections(parsed.detections, page.pageIndex),
      });
    }

    return reply.send({ pageCount: results.length, pages: results });
  });
}
