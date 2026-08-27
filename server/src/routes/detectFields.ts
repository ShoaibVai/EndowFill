/**
 * routes/detectFields.ts — POST /api/ai/detect-fields
 *
 * Body:  { pages: [{ pageIndex, image_base64, mimeType }], dpi? }
 * Reply: { fields: [{ label, fieldType, bbox, pageIndex, options?, hint? }] }
 *
 * OCRs each page with the local engine, then applies geometry heuristics
 * (underlines → text/signature/photo fields, square outlines → checkbox
 * groups, "Label:" fallback) to locate fillable regions. All boxes are
 * normalized 0..1 page-relative.
 */

import type { FastifyInstance } from 'fastify';
import { OcrModelError, recognizeImage } from '../ocr/engine.js';
import { decodePage } from '../ocr/pages.js';
import {
  detectFields,
  type FieldDraft,
  type FieldType,
} from '../ocr/detectFieldsRules.js';
import { HttpError, parsePagesBody, type NormalizedBBox } from '../validate.js';

const KNOWN_TYPES = new Set<FieldType>(['text', 'checkbox', 'image', 'signature']);

interface FieldReply {
  label: string;
  fieldType: FieldType;
  bbox: NormalizedBBox;
  pageIndex: number;
  options?: string[];
  hint?: string;
}

function normalizeField(draft: FieldDraft): FieldReply {
  const fieldType = KNOWN_TYPES.has(draft.fieldType) ? draft.fieldType : 'text';
  const field: FieldReply = {
    label: draft.label.trim() || 'Untitled field',
    fieldType,
    bbox: draft.bbox,
    pageIndex: draft.pageIndex,
  };
  if (draft.options && draft.options.length > 0) field.options = draft.options;
  if (draft.hint) field.hint = draft.hint;
  return field;
}

export function registerDetectFieldsRoute(
  app: FastifyInstance,
  rateLimit?: { max: number; timeWindow: number }
): void {
  app.post(
    '/api/ai/detect-fields',
    { config: rateLimit ? { rateLimit } : undefined },
    async (request, reply) => {
      const pages = parsePagesBody(request.body);
      const allFields: FieldReply[] = [];

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
            throw new HttpError(error.message, 502, 'detect_upstream_failed');
          }
          throw error;
        }

        allFields.push(...detectFields(decoded.image, pageOcr.items, page.pageIndex).map(normalizeField));
      }

      return reply.send({ fields: allFields });
    }
  );
}
