/**
 * routes/ocr.ts — POST /api/ai/ocr
 *
 * Body:  { pages: [{ pageIndex, image_base64, mimeType }], dpi?, filename? }
 * Reply: { pageCount, pages: [{ pageIndex, markdown, detections: [...] }] }
 *
 * Runs the local PaddleOCR ONNX engine per page: text regions become
 * `detections` (normalized 0..1 boxes) and a deterministic layout pass
 * reconstructs the `markdown` transcript. No external API calls.
 */

import type { FastifyInstance } from 'fastify';
import { OcrModelError, recognizeImage } from '../ocr/engine.js';
import { decodePage } from '../ocr/pages.js';
import { groupIntoLines, reconstructMarkdown } from '../ocr/markdown.js';
import { HttpError, normalizeBBox, parsePagesBody, type NormalizedBBox } from '../validate.js';

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

function medianHeight(items: { box: { height: number } }[]): number {
  if (items.length === 0) return 0;
  const heights = items.map((item) => item.box.height).sort((a, b) => a - b);
  const mid = Math.floor(heights.length / 2);
  return heights.length % 2 === 1 ? heights[mid] : (heights[mid - 1] + heights[mid]) / 2;
}

export function registerOcrRoute(
  app: FastifyInstance,
  rateLimit?: { max: number; timeWindow: number }
): void {
  app.post(
    '/api/ai/ocr',
    { config: rateLimit ? { rateLimit } : undefined },
    async (request, reply) => {
      const pages = parsePagesBody(request.body);
      const results: OcrPageReply[] = [];

      for (const page of pages) {
        let decoded;
        try {
          decoded = decodePage(page);
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError('Could not decode the page image.', 400, 'bad_image');
        }

        let pageOcr;
        try {
          pageOcr = await recognizeImage(decoded.bytes, decoded.image.width, decoded.image.height);
        } catch (error) {
          if (error instanceof OcrModelError) {
            throw new HttpError(error.message, 502, 'ocr_upstream_failed');
          }
          throw error;
        }

        const imageWidth = decoded.image.width;
        const imageHeight = decoded.image.height;
        const headingThreshold = medianHeight(pageOcr.items) * 1.45;

        const detections: OcrDetectionReply[] = pageOcr.items.map((item) => {
          const bbox = normalizeBBox({
            x: item.box.x / imageWidth,
            y: item.box.y / imageHeight,
            width: item.box.width / imageWidth,
            height: item.box.height / imageHeight,
          });
          return {
            pageIndex: page.pageIndex,
            bbox: bbox ?? { x: 0, y: 0, width: 0.01, height: 0.01 },
            label: item.box.height >= headingThreshold ? 'heading' : 'text',
            text: item.text,
          };
        });

        const lines = groupIntoLines(pageOcr.items);
        const markdown = reconstructMarkdown(pageOcr.items);

        results.push({ pageIndex: page.pageIndex, markdown, detections });
      }

      return reply.send({ pageCount: results.length, pages: results });
    }
  );
}
