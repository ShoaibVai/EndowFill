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
// Generate blank Excel template
// ---------------------------------------------------------------------------

/**
 * Create a downloadable .xlsx file with one column per pdfme schema field.
 * Row 1 = bold headers (field names), ready for the user to fill in data.
 */
export async function generateExcelTemplate(
  fields: ISchemaField[],
  filename = 'template_data.xlsx'
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PDF Template Master';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Data');

  // Headers
  const headerRow = sheet.addRow(fields.map((f) => f.name));
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 12, color: { argb: 'FF1E293B' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });

  // Auto-width columns
  fields.forEach((field, i) => {
    const col = sheet.getColumn(i + 1);
    col.width = Math.max(field.name.length + 4, 14);
  });

  // Add 5 empty rows for user convenience
  for (let r = 0; r < 5; r++) {
    sheet.addRow(fields.map(() => ''));
  }

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
 *  - Column headers (first row)
 *  - Inferred data types
 *  - Sample values (first 5 rows)
 *  - All row data as key-value records
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

  const headers: string[] = [];
  const firstRow = sheet.getRow(1);
  firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.text?.toString().trim() || `Column ${colNumber}`;
  });

  // Collect all data rows
  const allRows: Record<string, string>[] = [];
  for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
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
