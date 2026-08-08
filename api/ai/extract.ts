/**
 * api/ai/extract.ts — Vercel serverless POST /api/ai/extract
 *
 * Serverless port of server/src/routes/extract.ts. Text-only OpenCode Go
 * call that structures an OCR transcript into labeled items; source regions
 * are referenced by index and mapped back server-side to bbox/pageIndex so
 * the frontend can draw highlight boxes without trusting model-echoed
 * coordinates.
 *
 * Body:  { ocrResult: { pageCount, pages: [{ pageIndex, markdown, detections }] } }
 * Reply: { items: [{ id, label, value, category, confidence, sourceBBox, pageIndex }] }
 */

import { UpstreamError } from './_lib/opencodeGo.js';
import { chatJson } from './_lib/chatJson.js';
import {
  EXTRACT_SYSTEM,
  extractUserPrompt,
  type ExtractDetectionInput,
} from './_lib/prompts.js';
import {
  HttpError,
  isRecord,
  sendError,
  type HandlerRequest,
  type HandlerResponse,
  type NormalizedBBox,
} from './_lib/validate.js';

/** Cap per-page transcript size so multi-page scans stay well inside context. */
const MAX_MARKDOWN_CHARS_PER_PAGE = 8000;
const MAX_DETECTIONS = 200;
/** Cap pages like the OCR/detect-fields routes so an unbounded pages array
 * cannot build an oversized prompt in one model call (cost + token-limit failure). */
const MAX_PAGES = 20;

const KNOWN_CATEGORIES = new Set([
  'identity',
  'contact',
  'address',
  'education',
  'date',
  'id_number',
  'image',
  'signature',
  'document',
  'other',
]);

interface OcrDetectionInput {
  pageIndex?: unknown;
  bbox?: unknown;
  label?: unknown;
  text?: unknown;
}

interface OcrPageInput {
  pageIndex?: unknown;
  markdown?: unknown;
  detections?: unknown;
}

interface FlatDetection extends ExtractDetectionInput {
  bbox: NormalizedBBox | null;
}

interface RawItem {
  label?: unknown;
  value?: unknown;
  category?: unknown;
  confidence?: unknown;
  detectionIndex?: unknown;
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

function parseOcrResult(body: unknown): { pages: OcrPageInput[] } {
  if (!isRecord(body) || !isRecord(body.ocrResult) || !Array.isArray(body.ocrResult.pages)) {
    throw new HttpError('Request body must be { ocrResult: { pages: [...] } }.', 400, 'bad_request');
  }
  if (body.ocrResult.pages.length > MAX_PAGES) {
    throw new HttpError(
      `Too many pages in one request (max ${MAX_PAGES}).`,
      413,
      'too_many_pages'
    );
  }
  return { pages: body.ocrResult.pages as OcrPageInput[] };
}

function flattenDetections(pages: OcrPageInput[]): FlatDetection[] {
  const flat: FlatDetection[] = [];
  pages.forEach((page, pagePosition) => {
    const pageIndex =
      typeof page.pageIndex === 'number' && Number.isInteger(page.pageIndex)
        ? page.pageIndex
        : pagePosition;
    const detections = Array.isArray(page.detections) ? (page.detections as OcrDetectionInput[]) : [];
    for (const detection of detections) {
      if (flat.length >= MAX_DETECTIONS) return;
      const text = typeof detection.text === 'string' ? detection.text.trim() : '';
      if (!text) continue;
      flat.push({
        index: flat.length,
        pageIndex,
        label: typeof detection.label === 'string' && detection.label.trim() ? detection.label : 'text',
        text: text.length > 500 ? `${text.slice(0, 500)}…` : text,
        bbox: isRecord(detection.bbox) ? (detection.bbox as unknown as NormalizedBBox) : null,
      });
    }
  });
  return flat;
}

function normalizeItems(raw: unknown, detections: FlatDetection[]): ItemReply[] {
  if (!Array.isArray(raw)) return [];
  const items: ItemReply[] = [];
  for (const entry of raw as RawItem[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const value = typeof entry.value === 'string' ? entry.value.trim() : '';
    if (!label || !value) continue;

    const category =
      typeof entry.category === 'string' && KNOWN_CATEGORIES.has(entry.category.toLowerCase())
        ? entry.category.toLowerCase()
        : 'other';
    const confidenceRaw =
      typeof entry.confidence === 'number' && Number.isFinite(entry.confidence)
        ? entry.confidence
        : 0.5;
    const confidence = Math.min(1, Math.max(0, confidenceRaw));

    let sourceBBox: NormalizedBBox | null = null;
    let pageIndex: number | null = null;
    if (typeof entry.detectionIndex === 'number' && Number.isInteger(entry.detectionIndex)) {
      const detection = detections[entry.detectionIndex];
      if (detection) {
        sourceBBox = detection.bbox;
        pageIndex = detection.pageIndex;
      }
    }

    items.push({
      id: `item-${items.length + 1}`,
      label,
      value,
      category,
      confidence,
      sourceBBox,
      pageIndex,
    });
  }
  return items;
}

export default async function handler(req: HandlerRequest, res: HandlerResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.', code: 'method_not_allowed' });
  }
  try {
    const { pages } = parseOcrResult(req.body);

    const transcripts = pages.map((page, position) => {
      const pageIndex =
        typeof page.pageIndex === 'number' && Number.isInteger(page.pageIndex)
          ? page.pageIndex
          : position;
      const markdown = typeof page.markdown === 'string' ? page.markdown : '';
      return {
        pageIndex,
        markdown:
          markdown.length > MAX_MARKDOWN_CHARS_PER_PAGE
            ? `${markdown.slice(0, MAX_MARKDOWN_CHARS_PER_PAGE)}\n…(truncated)`
            : markdown,
      };
    });
    const detections = flattenDetections(pages);

    let parsed: { items?: unknown };
    try {
      parsed = await chatJson<{ items?: unknown }>(
        {
          system: EXTRACT_SYSTEM,
          userText: extractUserPrompt(transcripts, detections),
          maxTokens: 4096,
        },
        'extract'
      );
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw new HttpError(
          error.message,
          error.status === 0 ? 502 : error.status,
          'extract_upstream_failed'
        );
      }
      throw error;
    }
    return res.status(200).json({ items: normalizeItems(parsed.items, detections) });
  } catch (error) {
    return sendError(res, error);
  }
}
