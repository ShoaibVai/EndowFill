/**
 * routes/extract.ts — POST /api/ai/extract
 *
 * Body:  { ocrResult: { pageCount, pages: [{ pageIndex, markdown, detections }] } }
 * Reply: { items: [{ id, label, value, category, confidence, sourceBBox, pageIndex }] }
 *
 * Text-only call (no images): the model structures the OCR transcript into
 * labeled items and references the source region by index; this route maps
 * that index back to the region's bbox/pageIndex so the frontend can draw
 * highlight boxes without trusting model-echoed coordinates.
 */

import type { FastifyInstance } from 'fastify';
import { chatCompletion, UpstreamError } from '../opencodeGo.js';
import { extractJson } from '../jsonExtract.js';
import {
  EXTRACT_SYSTEM,
  extractUserPrompt,
  type ExtractDetectionInput,
} from '../prompts.js';
import { HttpError, type NormalizedBBox } from '../validate.js';

/** Cap per-page transcript size so multi-page scans stay well inside context. */
const MAX_MARKDOWN_CHARS_PER_PAGE = 8000;
const MAX_DETECTIONS = 200;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseOcrResult(body: unknown): { pages: OcrPageInput[] } {
  if (!isRecord(body) || !isRecord(body.ocrResult) || !Array.isArray(body.ocrResult.pages)) {
    throw new HttpError('Request body must be { ocrResult: { pages: [...] } }.', 400, 'bad_request');
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

export function registerExtractRoute(app: FastifyInstance): void {
  app.post('/api/ai/extract', async (request, reply) => {
    const { pages } = parseOcrResult(request.body);

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

    let content: string;
    try {
      content = await chatCompletion({
        system: EXTRACT_SYSTEM,
        userText: extractUserPrompt(transcripts, detections),
        maxTokens: 4096,
      });
    } catch (error) {
      if (error instanceof UpstreamError) {
        throw new HttpError(error.message, error.status === 0 ? 502 : error.status, 'extract_upstream_failed');
      }
      throw error;
    }

    const parsed = extractJson<{ items?: unknown }>(content, 'extract');
    return reply.send({ items: normalizeItems(parsed.items, detections) });
  });
}
