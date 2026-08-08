/**
 * prompts.ts — Prompt builders for the three AI endpoints.
 *
 * All prompts demand JSON-only output; jsonExtract.ts tolerantly repairs
 * whatever the model actually returns. Coordinates are always normalized
 * 0..1, page-relative, TOP-LEFT origin (matches the frontend overlay).
 */

export const OCR_SYSTEM = [
  'You are a precise OCR and document-layout engine.',
  'You analyze a scanned document page image and return ONLY valid JSON.',
  'Never wrap JSON in markdown fences. Never add commentary.',
  'Your entire response must be exactly one JSON object and nothing else.',
  'Do not narrate your analysis, do not explain, do not say "Here is".',
].join(' ');

export function ocrUserPrompt(pageIndex: number): string {
  return [
    `This is page ${pageIndex + 1} of a scanned document (a student record, certificate, ID, or similar).`,
    '',
    'Return a JSON object with exactly this shape:',
    '{',
    '  "markdown": string,',
    '  "detections": [',
    '    { "label": string, "text": string,',
    '      "bbox": { "x": number, "y": number, "width": number, "height": number } }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- "markdown": the complete text of the page as markdown, preserving reading order,',
    '  headings, and table structure. Include EVERY piece of text you can read.',
    '- "detections": one entry per LOGICAL region (a labeled field value, a paragraph,',
    '  a table row, a photo area) — NOT per word or per line of the same block.',
    '  Aim for 5-40 entries on a typical page.',
    '- "label": a short snake_case semantic label when the region looks like a labeled',
    '  field (e.g. "student_name", "date_of_birth", "student_id", "address"), otherwise',
    '  use "text".',
    '- "text": the exact text inside that region (empty string for photo/signature areas).',
    '- "bbox": the region bounding box, normalized 0..1 relative to page width/height,',
    '  TOP-LEFT origin. Estimate carefully from the image.',
    '- Read handwriting as best you can; do not invent text that is not visible.',
  ].join('\n');
}

export const EXTRACT_SYSTEM = [
  'You are a structured-data extraction engine for student documents.',
  'You receive an OCR transcript plus layout regions and return ONLY valid JSON.',
  'Never wrap JSON in markdown fences. Never add commentary.',
  'Your entire response must be exactly one JSON object and nothing else.',
  'Do not narrate your analysis, do not explain, do not say "Here is".',
].join(' ');

export interface ExtractDetectionInput {
  index: number;
  pageIndex: number;
  label: string;
  text: string;
}

export function extractUserPrompt(
  pageTranscripts: { pageIndex: number; markdown: string }[],
  detections: ExtractDetectionInput[]
): string {
  const transcriptBlock = pageTranscripts
    .map((page) => `--- Page ${page.pageIndex + 1} transcript ---\n${page.markdown}`)
    .join('\n\n');
  const detectionBlock = detections
    .map((d) => `[${d.index}] (page ${d.pageIndex + 1}, label: ${d.label}) ${d.text}`)
    .join('\n');

  return [
    'Below is the OCR output of a student document: full transcripts per page, then the',
    'detected text regions with their indexes.',
    '',
    transcriptBlock,
    '',
    '--- Detected regions ---',
    detectionBlock || '(none)',
    '',
    'Extract every meaningful piece of information as JSON with exactly this shape:',
    '{',
    '  "items": [',
    '    { "label": string, "value": string, "category": string,',
    '      "confidence": number, "detectionIndex": number | null }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- "label": human-readable field name (e.g. "Full Name", "Date of Birth", "Student ID").',
    '- "value": the extracted value exactly as written (preserve formatting).',
    '- "category": one of identity, contact, address, education, date, id_number,',
    '  image, signature, document, other.',
    '- "confidence": 0..1 — how certain you are the value is correct.',
    '- "detectionIndex": the index [n] of the region this item came from, or null if it',
    '  was inferred from the transcript rather than a single region.',
    '- Prefer information useful for filling application forms: names, dates, IDs,',
    '  contact details, addresses, education history, grades, parents/guardians.',
    '- Do not duplicate the same fact twice; merge regions when they form one value.',
  ].join('\n');
}

export const DETECT_FIELDS_SYSTEM = [
  'You are a form-analysis engine.',
  'You analyze an image of a blank application form page and return ONLY valid JSON.',
  'Never wrap JSON in markdown fences. Never add commentary.',
  'Your entire response must be exactly one JSON object and nothing else.',
  'Do not narrate your analysis, do not explain, do not say "Here is".',
].join(' ');

export function detectFieldsUserPrompt(pageIndex: number): string {
  return [
    `This is page ${pageIndex + 1} of a blank application form.`,
    '',
    'Identify every region a person would fill in, and return JSON with exactly this shape:',
    '{',
    '  "fields": [',
    '    { "label": string, "fieldType": "text" | "checkbox" | "image" | "signature",',
    '      "bbox": { "x": number, "y": number, "width": number, "height": number },',
    '      "options": string[] | null, "hint": string | null }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- "text": blank lines, boxes, or empty areas after a label where free text is written.',
    '- "checkbox": a checkbox or tick-box group. Put ALL options of one group in a single',
    '  entry: "bbox" covers the whole group and "options" lists each option label',
    '  (e.g. ["Male", "Female"]). Use one entry per group, not per box.',
    '- "image": a photo/portrait placeholder box.',
    '- "signature": a signature or thumb-impression area.',
    '- "label": the printed label next to the field (e.g. "Full Name", "Date of Birth").',
    '  If there is no visible label, infer a short sensible one.',
    '- "bbox": the fillable REGION (not the label), normalized 0..1 relative to page',
    '  width/height, TOP-LEFT origin. For text, cover the writing area after the label.',
    '- "hint": one short sentence of guidance when the field has special instructions',
    '  (e.g. "Use BLOCK letters", "DD/MM/YYYY"), otherwise null.',
    '- Do not include printed instructions, headings, or already-filled text as fields.',
  ].join('\n');
}
