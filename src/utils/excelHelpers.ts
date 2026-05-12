/**
 * excelHelpers.ts — Excel template generation and parsing utilities.
 *
 * Uses ExcelJS to:
 *  1. Generate a blank Excel template from pdfme schema fields
 *  2. Parse an uploaded Excel file to extract columns + sample rows
 */

import ExcelJS from 'exceljs';
import type { IExcelColumn, ISchemaField } from '../types/pdfme.types';

// ---------------------------------------------------------------------------
// Checkbox field detection helpers
// ---------------------------------------------------------------------------

/** pdfme type names that map to a checkbox widget */
const CHECKBOX_TYPES = new Set(['checkbox']);

export function isCheckboxField(field: ISchemaField): boolean {
  return CHECKBOX_TYPES.has((field.type ?? '').toLowerCase());
}

/**
 * Normalise any truthy/falsy user input to the lowercase string
 * "true" or "false" expected by @pdfme/schemas checkbox plugin.
 */
export function normalizeCheckboxValue(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (['true', 'yes', '1', 'checked', 'on', 'x'].includes(v)) return 'true';
  if (['false', 'no', '0', 'unchecked', 'off', ''].includes(v)) return 'false';
  // Anything else — treat as unchecked
  return 'false';
}

// ---------------------------------------------------------------------------
// Generate blank Excel template
// ---------------------------------------------------------------------------

/**
 * Create a downloadable .xlsx file with one column per pdfme schema field.
 *
 * - Row 1  = bold headers (field names). Checkbox columns get a teal header
 *            with a " ✓" suffix to signal they are boolean.
 * - Row 2  = a hint row showing the expected value format (grayed out italic).
 * - Row 3+ = empty data rows for the user to fill in.
 *
 * Checkbox columns also receive Excel Data Validation so users can pick
 * TRUE / FALSE from a dropdown instead of typing free text.
 */
export async function generateExcelTemplate(
  fields: ISchemaField[],
  filename = 'template_data.xlsx'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDF Template Master';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Data');

  // ── Row 1: headers ──────────────────────────────────────────────────────
  const headerValues = fields.map((f) =>
    isCheckboxField(f) ? `${f.name} (TRUE/FALSE)` : f.name
  );
  const headerRow = sheet.addRow(headerValues);
  headerRow.eachCell((cell, colIdx) => {
    const field = fields[colIdx - 1];
    const isCheckbox = field && isCheckboxField(field);

    cell.font = {
      bold: true,
      size: 11,
      color: { argb: isCheckbox ? 'FF065F46' : 'FF1E293B' },
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isCheckbox ? 'FFD1FAE5' : 'FFF1F5F9' }, // teal for checkbox, slate for text
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: isCheckbox ? 'FF6EE7B7' : 'FFCBD5E1' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  // ── Row 2: hint row (italic, grayed out) ────────────────────────────────
  const hintValues = fields.map((f) =>
    isCheckboxField(f)
      ? 'TRUE or FALSE'
      : '(enter your data here)'
  );
  const hintRow = sheet.addRow(hintValues);
  hintRow.eachCell((cell, colIdx) => {
    const field = fields[colIdx - 1];
    const isCheckbox = field && isCheckboxField(field);
    cell.font = {
      italic: true,
      size: 10,
      color: { argb: isCheckbox ? 'FF059669' : 'FF94A3B8' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  hintRow.height = 16;

  // ── Auto-width columns ───────────────────────────────────────────────────
  fields.forEach((field, i) => {
    const col = sheet.getColumn(i + 1);
    const headerLen = isCheckboxField(field)
      ? field.name.length + 14 // account for " (TRUE/FALSE)" suffix
      : field.name.length + 4;
    col.width = Math.max(headerLen, 16);
  });

  // ── Data rows (rows 3-12) with Data Validation on checkbox columns ───────
  const DATA_ROWS = 10;
  for (let r = 0; r < DATA_ROWS; r++) {
    const row = sheet.addRow(fields.map(() => ''));

    // Apply dropdown validation to each checkbox cell in this row
    fields.forEach((field, colIdx) => {
      if (!isCheckboxField(field)) return;
      const cell = row.getCell(colIdx + 1);
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"TRUE,FALSE"'],
        showErrorMessage: true,
        errorTitle: 'Invalid value',
        error: 'Please select TRUE or FALSE from the dropdown.',
      };
    });
  }

  // Freeze header rows so they stay visible while scrolling
  sheet.views = [{ state: 'frozen', ySplit: 2, xSplit: 0, activeCell: 'A3' }];

  // Trigger download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Parse uploaded Excel
// ---------------------------------------------------------------------------

/**
 * Read an uploaded Excel file and extract:
 *  - Column headers (first row) — strips our " (TRUE/FALSE)" suffix if present
 *  - Inferred data types
 *  - Sample values (first 5 data rows)
 *  - All row data as key-value records
 *
 * Skips the hint row (row 2) that our generated templates include,
 * so only actual data rows are returned.
 */
export async function parseExcelFile(file: File): Promise<{
  columns: IExcelColumn[];
  rows: Record<string, string>[];
  totalRows: number;
}> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheets found in the Excel file.');

  // ── Row 1: headers ───────────────────────────────────────────────
  const rawHeaders: string[] = [];
  const firstRow = sheet.getRow(1);
  firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    rawHeaders[colNumber - 1] = cell.text?.toString().trim() || `Column ${colNumber}`;
  });

  // Strip the " (TRUE/FALSE)" suffix we add to checkbox columns so the header
  // matches the original pdfme field name used in fieldBindings.
  const headers = rawHeaders.map((h) => h.replace(/\s*\(TRUE\/FALSE\)\s*$/i, '').trim());

  // ── Detect hint row ─────────────────────────────────────────────────
  // Our generated templates add a hint row in row 2.  Detect it by checking
  // whether all non-empty cells in row 2 contain well-known hint strings.
  const HINT_STRINGS = new Set([
    'true or false',
    '(enter your data here)',
  ]);
  const row2 = sheet.getRow(2);
  let isHintRow = false;
  const row2Cells: string[] = [];
  row2.eachCell({ includeEmpty: false }, (cell) => {
    row2Cells.push(cell.text?.toString().trim().toLowerCase() ?? '');
  });
  if (row2Cells.length > 0 && row2Cells.every((v) => HINT_STRINGS.has(v) || v === '')) {
    isHintRow = true;
  }
  const dataStartRow = isHintRow ? 3 : 2;

  // ── Collect data rows ────────────────────────────────────────────────
  const allRows: Record<string, string>[] = [];
  for (let rowNum = dataStartRow; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const record: Record<string, string> = {};
    let hasData = false;
    headers.forEach((header, idx) => {
      const cell = row.getCell(idx + 1);
      const val = cell.text?.toString().trim() ?? '';
      record[header] = val;
      if (val) hasData = true;
    });
    if (hasData) allRows.push(record);
  }

  // Build column metadata with type inference
  const columns: IExcelColumn[] = headers.map((header, index) => {
    const sampleValues = allRows.slice(0, 5).map((r) => r[header] || '');
    const inferredType = inferColumnType(sampleValues);
    return { index, header, inferredType, sampleValues };
  });

  return { columns, rows: allRows, totalRows: allRows.length };
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

function inferColumnType(
  samples: string[]
): 'text' | 'number' | 'date' | 'boolean' {
  const nonEmpty = samples.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return 'text';

  // Boolean check
  const boolVals = new Set(['true', 'false', 'yes', 'no', '0', '1']);
  if (nonEmpty.every((s) => boolVals.has(s.toLowerCase()))) return 'boolean';

  // Number check
  if (nonEmpty.every((s) => !isNaN(Number(s)) && s !== '')) return 'number';

  // Date check (simple heuristic)
  const datePattern = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/;
  if (nonEmpty.every((s) => datePattern.test(s))) return 'date';

  return 'text';
}
