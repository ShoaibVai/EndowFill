/**
 * api/ai/ocr.ts — Vercel serverless POST /api/ai/ocr
 *
 * Serverless port of server/src/routes/ocr.ts. Calls the OpenCode Go API
 * directly, so AI scanning works on Vercel deployments without the
 * self-hosted Fastify server.
 *
 * Body:  { pages: [{ pageIndex, image_base64, mimeType }], dpi?, filename? }
 * Reply: { pageCount, pages: [{ pageIndex, markdown, detections: [...] }] }
 *
 * Errors: { message, code } — the shape the frontend's ApiError expects.
 *
 * Note: Vercel caps request bodies at 4.5 MB and function duration at
 * 300s (Hobby), so large multi-page uploads should use the self-hosted
 * backend instead (see validate.ts).
 */

import { UpstreamError } from './_lib/opencodeGo.js';
import { chatJson } from './_lib/chatJson.js';
import { OCR_SYSTEM, ocrUserPrompt } from './_lib/prompts.js';
import {
  HttpError,
  normalizeBBox,
  parsePagesBody,
  sendError,
  type HandlerRequest,
  type HandlerResponse,
  type NormalizedBBox,
} from './_lib/validate.js';

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

export default async function handler(req: HandlerRequest, res: HandlerResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.', code: 'method_not_allowed' });
  }
  try {
    const pages = parsePagesBody(req.body);
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
          throw new HttpError(
            error.message,
            error.status === 0 ? 502 : error.status,
            'ocr_upstream_failed'
          );
        }
        throw error;
      }
      results.push({
        pageIndex: page.pageIndex,
        markdown: typeof parsed.markdown === 'string' ? parsed.markdown : '',
        detections: normalizeDetections(parsed.detections, page.pageIndex),
      });
    }

    return res.status(200).json({ pageCount: results.length, pages: results });
  } catch (error) {
    return sendError(res, error);
  }
}
