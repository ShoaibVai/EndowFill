/**
 * pdfme.types.ts — TypeScript interfaces for the pdfme integration layer.
 *
 * These types model the schema objects that pdfme's Designer emits,
 * plus our own domain types for field bindings, Excel columns, and
 * generation jobs.
 */

// ---------------------------------------------------------------------------
// pdfme Schema Types
// ---------------------------------------------------------------------------

/** A single field placed on the PDF canvas by the pdfme Designer. */
export interface ISchemaField {
  /** Unique name of the field (user-editable in pdfme) */
  name: string;
  /** Field type — 'text', 'image', 'qrcode', etc. */
  type: string;
  /** X offset from left edge in mm */
  position: { x: number; y: number };
  /** Width and height in mm */
  width: number;
  height: number;
  /** Font size for text fields */
  fontSize?: number;
  /** Font family (only used in generation, not in Designer) */
  fontFamily?: string;
  /** Alignment */
  alignment?: 'left' | 'center' | 'right';
  /** Text color */
  fontColor?: string;
  /** Background color */
  backgroundColor?: string;
  /** Whether the field is required for generation */
  required?: boolean;
  /** Rotation in degrees */
  rotate?: number;
  /** Opacity (0–1) */
  opacity?: number;
}

/** One page of the pdfme schema (a flat array of fields). */
export type ISchemaPage = Record<string, ISchemaField>;

/** The full pdfme template object passed to/from the Designer. */
export interface IPdfmeTemplate {
  /** Base PDF as ArrayBuffer or base64 string */
  basePdf: ArrayBuffer | string | null;
  /** One entry per page → each entry is a record of field name → properties */
  schemas: ISchemaPage[];
  /** Columns metadata for pdfme Designer */
  columns?: string[];
  /** Sample data for preview */
  sampledata?: Record<string, string>[];
}

// ---------------------------------------------------------------------------
// Excel / Mapping Types
// ---------------------------------------------------------------------------

/** Represents a detected column from the uploaded Excel file. */
export interface IExcelColumn {
  /** Zero-based column index */
  index: number;
  /** Header text from the first row */
  header: string;
  /** Auto-inferred data type */
  inferredType: 'text' | 'number' | 'date' | 'boolean';
  /** First few sample values for preview */
  sampleValues: string[];
}

/** Binding between a pdfme schema field and an Excel column. */
export interface IFieldBinding {
  /** pdfme field name */
  schemaFieldId: string;
  /** Excel column index to pull data from */
  excelColumnIndex: number;
  /** Optional data transform to apply */
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'dateFormat';
  /** Extra arguments for the transform (e.g., date format pattern) */
  transformArgs?: Record<string, string>;
}

/** Per-field validation rules. */
export interface IValidationRule {
  fieldId: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  /** Regex pattern to validate against */
  pattern?: string;
  /** Custom error message */
  customError?: string;
}

/** Conditional visibility rule for fields */
export interface IConditionalRule {
  id: string;
  targetFieldId: string; // field to show/hide
  sourceColumnHeader: string; // Excel column header to read
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
  value: string; // value to compare against
}

// ---------------------------------------------------------------------------
// Generation Job Types
// ---------------------------------------------------------------------------

/** Status of a single row's PDF generation. */
export type GenerationRowStatus = 'queued' | 'running' | 'done' | 'failed';

/** A single row in the generation queue. */
export interface IGenerationRow {
  /** Row index from Excel (1-based) */
  rowIndex: number;
  /** Status of this row */
  status: GenerationRowStatus;
  /** Output filename (without path) */
  filename: string;
  /** Error message if failed */
  error?: string;
  /** Generation time in ms */
  durationMs?: number;
}

/** Overall job state for the bulk generation process. */
export interface IGenerationJob {
  /** Unique job ID */
  id: string;
  /** Human-readable job name */
  name: string;
  /** Overall status */
  status: 'idle' | 'running' | 'paused' | 'done' | 'cancelled';
  /** Individual row statuses */
  rows: IGenerationRow[];
  /** Total rows to process */
  totalRows: number;
  /** Rows completed (done + failed) */
  completedRows: number;
  /** Start timestamp */
  startedAt?: number;
  /** End timestamp */
  completedAt?: number;
  /** Estimated remaining time in ms */
  etaMs?: number;
}

// ---------------------------------------------------------------------------
// UI / App-level Types
// ---------------------------------------------------------------------------

/** Which tab is active in the main navigation. */
export type ActiveTab = 'projects' | 'editor' | 'generate';

/** Notification levels for toast messages. */
export type NotificationLevel = 'info' | 'success' | 'warning' | 'error';

/** A toast notification. */
export interface INotification {
  id: string;
  message: string;
  level: NotificationLevel;
  duration?: number;
}
