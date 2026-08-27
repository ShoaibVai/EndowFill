/**
 * extractRules.ts — Deterministic structured extraction from OCR detections.
 *
 * Replaces the LLM chat pass that used to structure OCR transcripts. Forms
 * are highly regular, so a few layout patterns cover most real documents:
 *
 *   A. Label and value on the same line   ("Name: John Doe")
 *   B. Short label line directly above a value line (stacked form rows)
 *
 * Values are classified into the frontend's known categories with keyword
 * and shape rules. Every item carries the source bbox (normalized 0..1,
 * page-relative) so the review UI can still draw highlight boxes.
 */

import type { NormalizedBBox } from '../validate.js';

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

export interface DetInput {
  pageIndex: number;
  bbox: NormalizedBBox;
  label: string;
  text: string;
}

export interface ItemDraft {
  label: string;
  value: string;
  category: string;
  confidence: number;
  sourceBBox: NormalizedBBox;
  pageIndex: number;
}

// ── Keyword dictionaries ────────────────────────────────────────────────────

const LABEL_WORDS = new Set(
  (
    'name first last middle maiden full given surname dob date birth born age gender sex marital status ' +
    'address street city state province zip postal code country nation citizenship nationality residency resident ' +
    'phone mobile telephone tel cell fax email e-mail website url contact ' +
    'occupation employer profession job title income amount balance value premium coverage term effective ' +
    'issue issued expiry expiration renewal maturity ssn social security tax tin ein id identification license ' +
    'passport account policy plan number certificate document beneficiary insured applicant owner grantor grantee ' +
    'trustor trustee annuitant payee signature sign signed witness notary photo photograph picture image ' +
    'education school college university degree graduation course major height weight hair eyes race religion ' +
    'spouse dependents relationship relation'
  ).split(/\s+/)
);

const CATEGORY_RULES: { category: string; words: RegExp }[] = [
  { category: 'contact', words: /email|e-mail|phone|mobile|telephone|tel\b|fax|website|url|contact/i },
  { category: 'address', words: /address|street|city|state|province|zip|postal|country|nation|po box|residence|residency/i },
  { category: 'date', words: /\bdate|dob|\bborn|birth|effective|issue|expiry|expiration|renewal|maturity\b/i },
  { category: 'id_number', words: /ssn|social security|tax|tin|ein|license|passport|account|id\b|identification|number/i },
  { category: 'identity', words: /\bname|applicant|insured|policyholder|beneficiary|owner|grantor|grantee|trustor|trustee|annuitant|payee|spouse|dependents|relationship\b/i },
  { category: 'signature', words: /signature|signed|\bsign\b|witness|notary/i },
  { category: 'image', words: /photo|photograph|picture|image/i },
  { category: 'education', words: /school|college|university|degree|education|graduation|course|major/i },
  { category: 'document', words: /policy|plan|certificate|document|coverage|premium|term/i },
];

// ── Value / label shape helpers ─────────────────────────────────────────────

const DATE_PATTERN = /^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_PATTERN = /^[+(\d][\d\s()\-+./]{6,}$/;

function looksLikeValue(text: string): boolean {
  if (DATE_PATTERN.test(text) || EMAIL_PATTERN.test(text)) return true;
  if (PHONE_PATTERN.test(text)) return true;
  // Numbers, currency, percentages are almost always values.
  if (/^\$?\d[\d,.]*(%|\s?(lb|kg|ft|in|cm|years?|months?))?$/i.test(text)) return true;
  return false;
}

const LABEL_STOPWORDS = new Set(['of', 'the', 'for', 'in', 'at', 'a', 'an', 'and', 'or']);

function looksLikeLabel(text: string): boolean {
  const cleaned = text.replace(/[:\s]+$/, '').toLowerCase();
  if (!cleaned || cleaned.length > 40) return false;
  // Multi-word labels ("Date of Birth") — stopwords are ignored.
  const words = cleaned.split(/\s+/).filter((word) => !LABEL_STOPWORDS.has(word));
  if (words.length > 0 && words.every((word) => LABEL_WORDS.has(word))) return true;
  // Short text ending with ':' is a label by convention.
  return /[:：]$/.test(text) && text.length <= 40;
}

/** True when a value is just the blank-form line itself (no real data). */
function isBlankValue(value: string): boolean {
  return /^[\s_./:\-|·]+$/.test(value);
}

function classify(label: string, value: string): string {
  // Strong label identity first — "Policy Number: 887-342-111" is an id, not
  // a phone call, even though the value looks like a phone number.
  if (/ssn|social security|tax|tin|ein|license|passport|policy|account|id\b|identification|number/i.test(label)) {
    return 'id_number';
  }
  // Value shape beats label keywords for weak labels ("Office number" → contact).
  if (EMAIL_PATTERN.test(value)) return 'contact';
  if (DATE_PATTERN.test(value)) return 'date';
  if (PHONE_PATTERN.test(value)) return 'contact';
  const haystack = `${label} ${value}`;
  for (const rule of CATEGORY_RULES) {
    if (rule.words.test(haystack)) return rule.category;
  }
  return 'other';
}

function normalizeLabel(raw: string): string {
  return raw
    .replace(/[:：]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Line reconstruction (normalized coordinates) ────────────────────────────

interface Line {
  text: string;
  parts: { text: string; bbox: NormalizedBBox }[];
  y: number;
  height: number;
}

function buildLines(detections: DetInput[]): Line[] {
  const sorted = [...detections].sort(
    (a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x
  );
  const lines: Line[] = [];

  for (const det of sorted) {
    const centerY = det.bbox.y + det.bbox.height / 2;
    let target = lines.find((line) => {
      const lineCenter = line.y + line.height / 2;
      const span = Math.max(line.height, det.bbox.height);
      return Math.abs(centerY - lineCenter) <= span * 0.6;
    });

    if (!target) {
      target = { text: det.text, parts: [], y: det.bbox.y, height: det.bbox.height };
      lines.push(target);
    }
    target.parts.push({ text: det.text, bbox: det.bbox });
    target.parts.sort((a, b) => a.bbox.x - b.bbox.x);
    target.text = target.parts.map((part) => part.text).join(' ');
    target.y = Math.min(target.y, det.bbox.y);
    const bottom = Math.max(
      target.y + target.height,
      det.bbox.y + det.bbox.height
    );
    target.height = bottom - target.y;
  }

  return lines;
}

// ── Extraction patterns ─────────────────────────────────────────────────────

const MIN_VALUE_LENGTH = 1;
const MAX_LABEL_LENGTH = 60;
const MAX_ITEMS = 100;

/** Pattern A: "Label: value" inside a single line's parts. */
function extractSameLine(line: Line, pageIndex: number): ItemDraft[] {
  const parts = line.parts.filter((part) => part.text.trim().length > 0);
  if (parts.length === 0) return [];

  // Single box containing "Label: value" → split on the colon.
  if (parts.length === 1) {
    const colonIndex = parts[0].text.search(/[:：]/);
    if (colonIndex === -1 || colonIndex === 0 || colonIndex >= parts[0].text.length - 1) {
      return [];
    }
    const label = normalizeLabel(parts[0].text.slice(0, colonIndex));
    const value = parts[0].text.slice(colonIndex + 1).trim();
    if (!label || !value || label.length > MAX_LABEL_LENGTH || !looksLikeLabel(label)) {
      return [];
    }
    if (isBlankValue(value)) return [];
    return [
      {
        label,
        value,
        category: classify(label, value),
        confidence: 0.75,
        sourceBBox: parts[0].bbox,
        pageIndex,
      },
    ];
  }

  // Multiple boxes: the trailing box is the value when the leading boxes read
  // as a label and the trailing box reads as a value.
  const last = parts[parts.length - 1];
  const leadingText = parts
    .slice(0, -1)
    .map((part) => part.text)
    .join(' ')
    .trim();
  if (!leadingText || !last.text.trim()) return [];

  const labelLooksLabel = looksLikeLabel(leadingText);
  const valueLooksValue = looksLikeValue(last.text) || last.text.length <= 80;
  if (!labelLooksLabel || !valueLooksValue) return [];

  // Require the value to sit to the right (or below-right) of the label.
  if (last.bbox.x < parts[0].bbox.x + parts[0].bbox.width * 0.6) return [];

  const label = normalizeLabel(leadingText);
  const value = last.text.trim();
  if (!label || label.length > MAX_LABEL_LENGTH || value.length < MIN_VALUE_LENGTH) {
    return [];
  }
  if (isBlankValue(value)) return [];

  return [
    {
      label,
      value,
      category: classify(label, value),
      confidence: 0.7,
      sourceBBox: last.bbox,
      pageIndex,
    },
  ];
}

/** Pattern B: a short label line directly above a single-box value line. */
function extractStacked(lines: Line[], pageIndex: number): ItemDraft[] {
  const items: ItemDraft[] = [];
  for (let i = 0; i < lines.length - 1; i += 1) {
    const labelLine = lines[i];
    const valueLine = lines[i + 1];

    // The label line must look like a label and be short.
    const label = normalizeLabel(labelLine.text);
    if (!label || label.length > MAX_LABEL_LENGTH || !looksLikeLabel(label)) continue;

    // The value must be a single box (multi-box rows are usually checkbox
    // groups or table cells, not stacked form values).
    if (valueLine.parts.length !== 1) continue;

    // The value line must sit close below (stacked rows, not a new section).
    const gap = valueLine.y - (labelLine.y + labelLine.height);
    if (gap < 0 || gap > Math.max(labelLine.height * 0.9, 0.01)) continue;

    // The value line must not itself be another label (e.g. two labels stacked).
    if (looksLikeLabel(valueLine.text) && !looksLikeValue(valueLine.text)) continue;

    const value = valueLine.text.trim();
    if (value.length < MIN_VALUE_LENGTH || isBlankValue(value)) continue;

    // Horizontal alignment keeps label/value visually paired.
    const labelEnd = labelLine.parts.reduce((max, part) => Math.max(max, part.bbox.x + part.bbox.width), 0);
    const valueStart = valueLine.parts[0].bbox.x;
    if (valueStart > labelEnd + 0.2) continue;

    const valueBox = valueLine.parts[0]?.bbox;
    if (!valueBox) continue;

    items.push({
      label,
      value,
      category: classify(label, value),
      confidence: 0.6,
      sourceBBox: valueBox,
      pageIndex,
    });
  }
  return items;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Turn OCR detections into structured items.
 * `pages` mirrors the frontend's ocrResult.pages payload.
 */
export function extractItems(
  pages: { pageIndex: number; detections: DetInput[] }[]
): ItemDraft[] {
  const items: ItemDraft[] = [];
  const seen = new Set<string>();

  for (const page of pages) {
    const valid = page.detections.filter(
      (det) =>
        det.text &&
        det.text.trim().length > 0 &&
        det.bbox &&
        det.bbox.width > 0.001 &&
        det.bbox.height > 0.001
    );
    if (valid.length === 0) continue;

    const lines = buildLines(valid);
    const candidates: ItemDraft[] = [];
    for (const line of lines) {
      candidates.push(...extractSameLine(line, page.pageIndex));
    }
    candidates.push(...extractStacked(lines, page.pageIndex));

    for (const candidate of candidates) {
      if (items.length >= MAX_ITEMS) break;
      const key = `${candidate.pageIndex}|${candidate.label}|${candidate.value}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(candidate);
    }
    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}

/** Categories accepted by the frontend — exported for route validation. */
export function isKnownCategory(category: string): boolean {
  return KNOWN_CATEGORIES.has(category);
}
