/**
 * scan.types.ts — TypeScript interfaces for the AI scan review flow.
 *
 * These model the shapes returned by the self-hosted AI endpoints
 * (POST /api/ai/ocr and POST /api/ai/extract) plus the app-side
 * enrichments used by the highlight-on-PDF review UI.
 *
 * Coordinate convention: every `bbox` is normalized to 0..1 and is
 * PAGE-RELATIVE with a TOP-LEFT origin (matching the rasterized page
 * image that the OCR model sees), which is what an absolutely-positioned
 * HTML overlay needs directly.
 */

/** Normalized page-relative bounding box (0..1, top-left origin). */
export interface OcrBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One raw OCR detection box as returned by POST /api/ai/ocr. */
export interface OcrDetection {
  pageIndex: number;
  bbox: OcrBBox;
  label: string;
  text: string;
}

/** One OCR'd page (markdown transcript + layout detections). */
export interface OcrPage {
  pageIndex: number;
  markdown: string;
  detections: OcrDetection[];
}

/** Response of POST /api/ai/ocr. */
export interface OcrResult {
  pageCount: number;
  pages: OcrPage[];
}

/**
 * A single extracted piece of information, as returned by
 * POST /api/ai/extract. `sourceBBox` links the item back to the OCR
 * detection region it came from; `pageIndex`/`detectionId` are filled
 * in client-side by matching `sourceBBox` against the OCR detections.
 */
export interface ExtractedItem {
  id: string;
  label: string;
  value: string;
  category: string;
  confidence: number;
  sourceBBox?: OcrBBox | null;
  pageIndex?: number | null;
  detectionId?: string | null;
}

/** Response of POST /api/ai/extract. */
export interface ExtractResult {
  items: ExtractedItem[];
}

/**
 * One file's worth of bulk scan results (BulkScanPage → Bulk Generate).
 * `filename` doubles as the label in the bulk-generate source-file picker.
 */
export interface BulkScanResult {
  /** Original file name (also used as the label in the bulk generate file picker). */
  filename: string;
  /** Extracted items for this document (may be empty when extraction found nothing). */
  items: ExtractedItem[];
  /** When the file finished scanning (ISO string, best-effort). */
  scannedAt?: string;
}

/**
 * App-side detection entry: an OCR box flattened across pages with a
 * stable id (derived from its position) so the overlay and the item
 * list can reference it. Manual boxes added in edit mode share this shape.
 */
export interface Detection {
  id: string;
  pageIndex: number;
  bbox: OcrBBox;
  label: string;
  text: string;
}

/** Editable slice of an ExtractedItem (label/value/category). */
export type ItemPatch = Partial<Pick<ExtractedItem, 'label' | 'value' | 'category'>>;

/** Payload serialized when the user exports the reviewed scan to JSON. */
export interface ScanExportPayload {
  fileName: string;
  dpi: number;
  exportedAt: string;
  pageCount: number;
  items: ExtractedItem[];
  detections: Detection[];
}

// ---------------------------------------------------------------------------
// Form field detection (flow 2 — turn a form PDF into a fillable PDF)
// ---------------------------------------------------------------------------

/**
 * Field types the AI can classify on a form PDF. Each maps to a pdfme
 * Designer schema in components/scan/FieldToSchema.ts:
 *  text      → { type: 'text' }
 *  checkbox  → one or more { type: 'checkbox' } schemas (options → group)
 *  image     → { type: 'image' }
 *  signature → { type: 'signature' }
 */
export type DetectedFieldType = 'text' | 'checkbox' | 'image' | 'signature';

/** Raw field as returned by POST /api/ai/detect-fields. */
export interface DetectedField {
  label: string;
  fieldType: DetectedFieldType;
  bbox: OcrBBox;
  pageIndex: number;
  /** Checkbox group options (e.g. ["Male", "Female"]) when detected. */
  options?: string[];
  /** Model-provided guidance about the field (displayed, not saved). */
  hint?: string;
}

/** Response of POST /api/ai/detect-fields. */
export interface DetectFieldsResult {
  fields: DetectedField[];
}

/**
 * App-side reviewed field: a detected entry plus a stable id so the page
 * overlay and the editable list can reference the same object.
 */
export interface ReviewField extends DetectedField {
  id: string;
}

/** Editable slice of a ReviewField (label / type / checkbox options). */
export type FieldPatch = Partial<Pick<ReviewField, 'label' | 'fieldType' | 'options'>>;

/** Payload serialized when the user exports the reviewed fields to JSON. */
export interface FieldsExportPayload {
  fileName: string;
  dpi: number;
  exportedAt: string;
  pageCount: number;
  fields: ReviewField[];
  templateSchemas: unknown;
  schemaFields: unknown;
}
