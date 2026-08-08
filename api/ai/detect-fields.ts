/**
 * api/ai/detect-fields.ts — Vercel serverless POST /api/ai/detect-fields
 *
 * Serverless port of server/src/routes/detectFields.ts. Per-page vision pass
 * over a blank form; results are merged with the pageIndex enforced
 * server-side so a model slip can never misplace a field.
 *
 * Body:  { pages: [{ pageIndex, image_base64, mimeType }], dpi? }
 * Reply: { fields: [{ label, fieldType, bbox, pageIndex, options?, hint? }] }
 */

import { UpstreamError } from './_lib/opencodeGo.js';
import { chatJson } from './_lib/chatJson.js';
import { DETECT_FIELDS_SYSTEM, detectFieldsUserPrompt } from './_lib/prompts.js';
import {
  HttpError,
  normalizeBBox,
  parsePagesBody,
  sendError,
  type HandlerRequest,
  type HandlerResponse,
  type NormalizedBBox,
} from './_lib/validate.js';

type FieldType = 'text' | 'checkbox' | 'image' | 'signature';
const KNOWN_TYPES = new Set<FieldType>(['text', 'checkbox', 'image', 'signature']);

interface RawField {
  label?: unknown;
  fieldType?: unknown;
  bbox?: unknown;
  options?: unknown;
  hint?: unknown;
}

interface FieldReply {
  label: string;
  fieldType: FieldType;
  bbox: NormalizedBBox;
  pageIndex: number;
  options?: string[];
  hint?: string;
}

function normalizeFields(raw: unknown, pageIndex: number): FieldReply[] {
  if (!Array.isArray(raw)) return [];
  const fields: FieldReply[] = [];
  for (const entry of raw as RawField[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const bbox = normalizeBBox(entry.bbox);
    if (!bbox) continue;

    const fieldType =
      typeof entry.fieldType === 'string' && KNOWN_TYPES.has(entry.fieldType as FieldType)
        ? (entry.fieldType as FieldType)
        : 'text';
    const label =
      typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : 'Untitled field';

    let options: string[] | undefined;
    if (Array.isArray(entry.options)) {
      const cleaned = entry.options
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter((option) => option.length > 0);
      if (cleaned.length > 0) options = cleaned;
    }

    const field: FieldReply = { label, fieldType, bbox, pageIndex };
    if (options) field.options = options;
    if (typeof entry.hint === 'string' && entry.hint.trim()) field.hint = entry.hint.trim();
    fields.push(field);
  }
  return fields;
}

export default async function handler(req: HandlerRequest, res: HandlerResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed.', code: 'method_not_allowed' });
  }
  try {
    const pages = parsePagesBody(req.body);
    const allFields: FieldReply[] = [];

    for (const page of pages) {
      let parsed: { fields?: unknown };
      try {
        parsed = await chatJson<{ fields?: unknown }>(
          {
            system: DETECT_FIELDS_SYSTEM,
            userText: detectFieldsUserPrompt(page.pageIndex),
            images: [{ imageBase64: page.imageBase64, mimeType: page.mimeType }],
            maxTokens: 4096,
          },
          'detect-fields'
        );
      } catch (error) {
        if (error instanceof UpstreamError) {
          throw new HttpError(
            error.message,
            error.status === 0 ? 502 : error.status,
            'detect_upstream_failed'
          );
        }
        throw error;
      }

      allFields.push(...normalizeFields(parsed.fields, page.pageIndex));
    }

    return res.status(200).json({ fields: allFields });
  } catch (error) {
    return sendError(res, error);
  }
}
