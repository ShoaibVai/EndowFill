/**
 * FieldToSchema.ts — Convert AI-detected form fields (POST /api/ai/detect-fields)
 * into a pdfme Designer template.
 *
 * Verified against the INSTALLED pdfme packages (package.json: ^6.1.1):
 *   node_modules/@pdfme/schemas/dist exports text, checkbox, image, signature
 *   plugins with these shapes (checked in the .d.ts files + bundled
 *   defaultSchema objects):
 *
 *   | Detected type | pdfme schema type | Shape notes                                         |
 *   |---------------|-------------------|-----------------------------------------------------|
 *   | text          | 'text'            | TextSchema = Schema & { alignment, verticalAlignment, fontSize, lineHeight, characterSpacing, fontColor, ... } |
 *   | checkbox      | 'checkbox'        | CheckboxSchema = Schema & { color }; ONE box per schema; content 'false'/'true' toggles; default box 8x8mm. A detected group with options becomes N checkbox schemas laid out inside the bbox. |
 *   | image         | 'image'           | ImageSchema = Schema                                 |
 *   | signature     | 'signature'       | SignatureSchema = Schema                             |
 *
 * Positions and sizes are in MILLIMETERS (pdfme Designer convention — the
 * common package exports pt2mm for converting from PDF points).
 *
 * The produced `schemas` use the store's Record shape
 * (ISchemaPage = Record<fieldName, props>), which EditorCanvas.tsx already
 * converts into the Designer's nested-array form on open.
 */

import { pt2mm } from '@pdfme/common';
import type { DetectedFieldType, OcrBBox, ReviewField } from '../../types/scan.types';
import type { ISchemaField, ISchemaPage } from '../../types/pdfme.types';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Page dimensions in PDF points (pdf.js viewport at scale 1). */
export interface PageSizePt {
  width: number;
  height: number;
}

/** Result of converting the reviewed fields into a pdfme template. */
export interface FieldTemplateBuild {
  /** Store-shaped schema pages: one Record per page, keyed by field name. */
  schemas: ISchemaPage[];
  /** Flat field list for the store's schemaFields (mirrors EditorCanvas). */
  schemaFields: ISchemaField[];
}

/** One named schema record ready to be merged into a page. */
interface SchemaRecord {
  type: string;
  content?: string;
  position: { x: number; y: number };
  width: number;
  height: number;
  rotate?: number;
  /** text-only */
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
  fontSize?: number;
  lineHeight?: number;
  characterSpacing?: number;
  fontColor?: string;
  backgroundColor?: string;
  /** checkbox-only */
  color?: string;
  /** filled in at assembly time */
  name?: string;
  [key: string]: unknown;
}

// ── Geometry conversion ───────────────────────────────────────────────────────

/** Round to 3 decimals so generated JSON stays compact and deterministic. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Clamp a millimetre value to a sane field size. */
function clampMm(value: number, min = 2, max = 200): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Convert a normalized page-relative bbox (top-left origin) into pdfme
 * millimetre geometry using the page's point size. pdf.js viewports and the
 * pdfme Designer share a top-left origin, so no axis flip is needed.
 */
export function bboxToMm(bbox: OcrBBox, pageSize: PageSizePt): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return {
    x: round3(pt2mm(bbox.x * pageSize.width)),
    y: round3(pt2mm(bbox.y * pageSize.height)),
    width: round3(clampMm(pt2mm(bbox.width * pageSize.width), 1)),
    height: round3(clampMm(pt2mm(bbox.height * pageSize.height), 1)),
  };
}

// ── Per-type schema builders ──────────────────────────────────────────────────

/** pdfme text schema (empty content; alignment/fontColor defaults for the Designer). */
function buildTextSchema(bbox: OcrBBox, pageSize: PageSizePt): SchemaRecord {
  const { x, y, width, height } = bboxToMm(bbox, pageSize);
  return {
    type: 'text',
    content: '',
    position: { x, y },
    width,
    height,
    rotate: 0,
    alignment: 'left',
    verticalAlignment: 'top',
    fontSize: 11,
    lineHeight: 1,
    characterSpacing: 0,
    fontColor: '#000000',
    backgroundColor: '',
  };
}

/**
 * pdfme checkbox schema(s). pdfme 6 renders ONE square per checkbox schema
 * (content 'false' = unchecked), so a detected group with options becomes one
 * checkbox per option laid out inside the detected bbox — horizontally when
 * the box is wider than tall, vertically otherwise. Without options a single
 * checkbox is centered in the bbox.
 */
function buildCheckboxSchemas(
  bbox: OcrBBox,
  pageSize: PageSizePt,
  options: string[] | undefined
): SchemaRecord[] {
  const { x, y, width, height } = bboxToMm(bbox, pageSize);
  const parsed = (options ?? [])
    .map((option) => option.trim())
    .filter((option) => option.length > 0);

  const checkbox = (px: number, py: number, size: number): SchemaRecord => ({
    type: 'checkbox',
    content: 'false',
    position: { x: round3(px), y: round3(py) },
    width: round3(size),
    height: round3(size),
    rotate: 0,
    color: '#000000',
  });

  if (parsed.length === 0) {
    const size = clampMm(Math.min(width, height), 2, 8);
    return [checkbox(x + (width - size) / 2, y + (height - size) / 2, size)];
  }

  const horizontal = width >= height;
  const count = parsed.length;
  const slot = horizontal ? width / count : height / count;
  const size = clampMm(horizontal ? Math.min(slot, height) : Math.min(slot, width), 2, 8);

  return parsed.map((_, index) => {
    const px = horizontal
      ? x + index * slot + (slot - size) / 2
      : x + (width - size) / 2;
    const py = horizontal
      ? y + (height - size) / 2
      : y + index * slot + (slot - size) / 2;
    return checkbox(px, py, size);
  });
}

/** pdfme image schema (empty content — filled during generation/form). */
function buildImageSchema(bbox: OcrBBox, pageSize: PageSizePt): SchemaRecord {
  const { x, y, width, height } = bboxToMm(bbox, pageSize);
  return { type: 'image', content: '', position: { x, y }, width, height, rotate: 0 };
}

/** pdfme signature schema (same shape as image in pdfme 6.1.1). */
function buildSignatureSchema(bbox: OcrBBox, pageSize: PageSizePt): SchemaRecord {
  const { x, y, width, height } = bboxToMm(bbox, pageSize);
  return { type: 'signature', content: '', position: { x, y }, width, height, rotate: 0 };
}

// ── Field naming ──────────────────────────────────────────────────────────────

/** Slugify a label into a safe pdfme field name segment. */
function slugify(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'field';
}

/** Unique field name within the whole template (pdfme requires unique names). */
function uniqueName(label: string, used: Set<string>, fallbackIndex: number): string {
  const base = slugify(label) === 'field' && used.has('field') ? `field_${fallbackIndex}` : slugify(label);
  let name = base;
  let counter = 2;
  while (used.has(name)) {
    name = `${base}_${counter}`;
    counter += 1;
  }
  used.add(name);
  return name;
}

// ── Template assembly ────────────────────────────────────────────────────────

function isKnownType(value: unknown): value is DetectedFieldType {
  return (
    typeof value === 'string' &&
    (value === 'text' || value === 'checkbox' || value === 'image' || value === 'signature')
  );
}

/**
 * Build the pdfme Designer template (store shape) from the reviewed fields.
 * `pageSizes` must have one entry per PDF page (pt, from pdf.js viewport
 * scale 1). Fields whose pageIndex is out of range are clamped to the last
 * page so a bad model value can never produce a schema-less template.
 */
export function buildTemplateFromFields(
  fields: ReviewField[],
  pageSizes: PageSizePt[]
): FieldTemplateBuild {
  const pages = pageSizes.length > 0 ? pageSizes.length : 1;
  const usedNames = new Set<string>();
  const schemas: ISchemaPage[] = Array.from({ length: pages }, () => ({}));
  const schemaFields: ISchemaField[] = [];

  fields.forEach((field, index) => {
    const pageIndex = Math.max(0, Math.min(field.pageIndex ?? 0, pages - 1));
    const pageSize = pageSizes[pageIndex] ?? { width: 595, height: 842 };
    const type = isKnownType(field.fieldType) ? field.fieldType : 'text';
    const baseName = uniqueName(field.label, usedNames, index + 1);

    let records: SchemaRecord[];
    if (type === 'checkbox') {
      records = buildCheckboxSchemas(field.bbox, pageSize, field.options);
    } else if (type === 'image') {
      records = [buildImageSchema(field.bbox, pageSize)];
    } else if (type === 'signature') {
      records = [buildSignatureSchema(field.bbox, pageSize)];
    } else {
      records = [buildTextSchema(field.bbox, pageSize)];
    }

    records.forEach((record, optionIndex) => {
      const name = records.length > 1 ? `${baseName}_${optionIndex + 1}` : baseName;
      usedNames.add(name);
      schemas[pageIndex][name] = { ...record, name };
      schemaFields.push({
        name,
        type: record.type,
        position: record.position as { x: number; y: number },
        width: record.width as number,
        height: record.height as number,
        fontSize: record.type === 'text' ? (record.fontSize as number) : undefined,
        fontColor: record.type === 'text' ? (record.fontColor as string) : undefined,
        alignment: record.type === 'text' ? (record.alignment as ISchemaField['alignment']) : undefined,
        required: false,
      });
    });
  });

  return { schemas, schemaFields };
}
