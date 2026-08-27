/**
 * detectFieldsRules.ts — Heuristic fillable-field detection for blank forms.
 *
 * Replaces the vision-model pass that used to spot form fields. Standard
 * forms encode field types in their geometry, so a few pixel + layout
 * rules recover them deterministically:
 *
 *   • underlines         → text fields (or signature/photo when the label says so)
 *   • square outlines     → checkboxes (grouped squares → option lists)
 *   • "Label:" with no value → a text field to the right (borderless forms)
 *
 * Everything runs on the downscaled gray image; detected boxes are mapped
 * back to original pixels and normalized to 0..1 page coordinates.
 */

import { horizontalRuns, toGray, type DecodedImage, type GrayImage } from './image.js';
import type { OcrItem } from './engine.js';
import type { NormalizedBBox } from '../validate.js';

export type FieldType = 'text' | 'checkbox' | 'image' | 'signature';

export interface FieldDraft {
  label: string;
  fieldType: FieldType;
  bbox: NormalizedBBox;
  pageIndex: number;
  options?: string[];
  hint?: string;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const HINT = 'Auto-detected by layout heuristics — review before saving.';

/** Longest side (px) used for the analysis raster. */
const ANALYSIS_MAX_SIDE = 1600;
/** A row counts as part of a line when ≥ this fraction of the width is dark. */
const LINE_MIN_WIDTH_RATIO = 0.06;
/** Underline candidates merge when their rows are within this many px. */
const LINE_MERGE_GAP = 4;
/** Underline thickness cap — anything thicker is a filled bar, not a line. */
const LINE_MAX_THICKNESS = 5;

// ── Underline detection ─────────────────────────────────────────────────────

/**
 * Find horizontal rule segments (form underlines) in the gray image.
 * A segment is one or more merged rows whose dark runs cover ≥ 6% of the
 * width, with light rows above and below (so large filled shapes don't count).
 */
export function findUnderlines(gray: GrayImage, minWidthRatio: number = LINE_MIN_WIDTH_RATIO): Box[] {
  const minRun = Math.max(8, Math.round(gray.width * minWidthRatio));
  const rows: { y: number; x: number; width: number }[] = [];

  for (let y = 1; y < gray.height - 1; y += 1) {
    // Cheap row signature: count of dark pixels.
    let darkCount = 0;
    const rowOffset = y * gray.width;
    for (let x = 0; x < gray.width; x += 1) {
      if (gray.data[rowOffset + x] < 160) darkCount += 1;
    }
    if (darkCount < minRun) continue;

    const runs = horizontalRuns(gray, y, 160, minRun);
    for (const run of runs) {
      rows.push({ y, x: run.startX, width: run.endX - run.startX + 1 });
    }
  }

  // Merge vertically adjacent rows into segments.
  const segments: Box[] = [];
  for (const row of rows) {
    const match = segments.find(
      (segment) =>
        Math.abs(segment.y + segment.height - row.y) <= LINE_MERGE_GAP &&
        Math.abs(segment.x - row.x) < Math.max(4, minRun * 0.25)
    );
    if (match) {
      const bottom = Math.max(match.y + match.height, row.y + 1);
      const right = Math.max(match.x + match.width, row.x + row.width);
      match.x = Math.min(match.x, row.x);
      match.y = Math.min(match.y, row.y);
      match.width = right - match.x;
      match.height = bottom - match.y;
    } else {
      segments.push({ x: row.x, y: row.y, width: row.width, height: 1 });
    }
  }

  // Drop segments that are too thick (filled bars) or suspiciously huge.
  return segments.filter(
    (segment) =>
      segment.height <= LINE_MAX_THICKNESS &&
      segment.width >= minRun * 0.8 &&
      segment.width < gray.width * 0.95
  );
}

// ── Checkbox square detection ───────────────────────────────────────────────

/**
 * Find small square outlines (checkbox glyphs) via a coarse grid scan with
 * alignment-tolerant checks (each side is evaluated over a 3px band, so the
 * sampling grid never has to land exactly on the printed line).
 *
 * Strict signature, tuned to reject text glyphs:
 *   • each side of the border is mostly dark
 *   • all four corners are dark (rules out circles and rounded letters)
 *   • the interior is light
 *   • the surrounding 2px ring is light (an isolated glyph, not part of a
 *     word or table grid)
 */
export function findSquareOutlines(
  gray: GrayImage,
  minSize = 8,
  maxSize = 28,
  step = 3
): Box[] {
  const found: Box[] = [];
  const maxSide = Math.min(gray.width, gray.height);

  for (const size of range(minSize, Math.min(maxSize, Math.floor(maxSide / 2)), 2)) {
    const half = Math.floor(size / 2);
    for (let cy = half + 3; cy < gray.height - half - 3; cy += step) {
      for (let cx = half + 3; cx < gray.width - half - 3; cx += step) {
        // Cheap pre-test: the top edge must contain at least one dark band.
        if (sideDarknessBand(gray, 'top', cy - half, cx - half, cx + half) < 0.5) continue;
        if (!isSquareOutline(gray, cx, cy, size)) continue;
        // Suppress duplicates: adjacent windows and neighboring sizes both
        // match the same printed square (compare top-left corners).
        const cornerX = cx - half;
        const cornerY = cy - half;
        if (
          found.some(
            (box) => Math.abs(box.x - cornerX) < step * 2 && Math.abs(box.y - cornerY) < step * 2
          )
        ) {
          continue;
        }
        found.push({ x: cx - half, y: cy - half, width: size, height: size });
        cx += size; // skip the rest of this square
      }
    }
  }
  return found;
}

function range(start: number, end: number, step: number): number[] {
  const values: number[] = [];
  for (let value = start; value <= end; value += step) values.push(value);
  return values;
}

type Side = 'top' | 'bottom' | 'left' | 'right';

/** Fraction of dark samples on one side, maximized over a 5px band. */
function sideDarknessBand(
  gray: GrayImage,
  side: Side,
  center: number,
  a: number,
  b: number,
  threshold = 150
): number {
  let best = 0;
  for (const offset of [-2, -1, 0, 1, 2]) {
    const dark = sideDarkness(gray, side, center + offset, a, b, threshold);
    if (dark > best) best = dark;
  }
  return best;
}

/** Fraction of samples darker than `threshold` on one side (1px). */
function sideDarkness(
  gray: GrayImage,
  side: Side,
  fixed: number,
  a: number,
  b: number,
  threshold = 150
): number {
  let dark = 0;
  let total = 0;
  if (side === 'top' || side === 'bottom') {
    if (fixed < 0 || fixed >= gray.height) return 0;
    const rowOffset = fixed * gray.width;
    for (let x = a; x <= b; x += 1) {
      if (gray.data[rowOffset + x] < threshold) dark += 1;
      total += 1;
    }
  } else {
    if (fixed < 0 || fixed >= gray.width) return 0;
    for (let y = a; y <= b; y += 1) {
      if (gray.data[y * gray.width + fixed] < threshold) dark += 1;
      total += 1;
    }
  }
  return total === 0 ? 0 : dark / total;
}

/** Fraction of samples in a ring (x0..x1 × y0..y1, 1px thick) that are light. */
function ringLightness(gray: GrayImage, x0: number, y0: number, x1: number, y1: number): number {
  let light = 0;
  let total = 0;
  for (let x = x0; x <= x1; x += 1) {
    light += gray.data[y0 * gray.width + x] > 190 ? 1 : 0;
    light += gray.data[y1 * gray.width + x] > 190 ? 1 : 0;
    total += 2;
  }
  for (let y = y0 + 1; y < y1; y += 1) {
    light += gray.data[y * gray.width + x0] > 190 ? 1 : 0;
    light += gray.data[y * gray.width + x1] > 190 ? 1 : 0;
    total += 2;
  }
  return total === 0 ? 0 : light / total;
}

/** Border ring dark + uniform sides, interior light, isolated, square corners. */
function isSquareOutline(gray: GrayImage, cx: number, cy: number, size: number): boolean {
  const half = Math.floor(size / 2);
  const x0 = cx - half;
  const y0 = cy - half;
  const x1 = cx + half;
  const y1 = cy + half;
  if (x0 < 1 || y0 < 1 || x1 >= gray.width - 1 || y1 >= gray.height - 1) return false;

  // 1. Each side of the border mostly dark (3px-band tolerant).
  const top = sideDarknessBand(gray, 'top', y0, x0, x1);
  const bottom = sideDarknessBand(gray, 'bottom', y1, x0, x1);
  const left = sideDarknessBand(gray, 'left', x0, y0, y1);
  const right = sideDarknessBand(gray, 'right', x1, y0, y1);
  if (Math.min(top, bottom, left, right) < 0.6) return false;

  // 2. Corners dark (axis-aligned square, not a circle/letter curve).
  //    A 5×5 block centered on the window corner counts as dark when ≥ 4 of
  //    its pixels are dark — tolerant of the ±2px grid offset while letters'
  //    curved strokes only graze a corner block with 1-3 pixels.
  const cornerBlockDark = (x: number, y: number): boolean => {
    let dark = 0;
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (gray.data[(y + dy) * gray.width + (x + dx)] < 160) dark += 1;
      }
    }
    return dark >= 4;
  };
  if (
    !cornerBlockDark(x0, y0) ||
    !cornerBlockDark(x1, y0) ||
    !cornerBlockDark(x0, y1) ||
    !cornerBlockDark(x1, y1)
  ) {
    return false;
  }

  // 3. Interior light (unchecked box — checked/filled boxes are skipped).
  let interiorLight = 0;
  let interiorTotal = 0;
  for (let y = y0 + 2; y < y1 - 1; y += 2) {
    for (let x = x0 + 2; x < x1 - 1; x += 2) {
      interiorLight += gray.data[y * gray.width + x] > 180 ? 1 : 0;
      interiorTotal += 1;
    }
  }
  if (interiorTotal === 0 || interiorLight / interiorTotal < 0.8) return false;

  // 4. Isolated enough: the surrounding 1px ring must be mostly light so
  //    letters inside words, table grids and stamps never match. Checkbox
  //    glyphs often sit a few pixels from their option text, so the ring
  //    test is deliberately less strict than the side/corner geometry.
  if (ringLightness(gray, x0 - 1, y0 - 1, x1 + 1, y1 + 1) < 0.75) return false;

  return true;
}

// ── Field pairing ───────────────────────────────────────────────────────────

interface ScaledItem {
  text: string;
  box: Box;
}

function scaleItems(items: OcrItem[], scale: number): ScaledItem[] {
  return items.map((item) => ({
    text: item.text,
    box: {
      x: item.box.x * scale,
      y: item.box.y * scale,
      width: item.box.width * scale,
      height: item.box.height * scale,
    },
  }));
}

/** OCR text near a box on the same row (to the left or right). */
function sameRowText(items: ScaledItem[], box: Box, maxGap: number): string {
  const centerY = box.y + box.height / 2;
  let best: ScaledItem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const itemCenterY = item.box.y + item.box.height / 2;
    if (Math.abs(itemCenterY - centerY) > Math.max(box.height, item.box.height)) continue;
    const gap = Math.min(
      Math.abs(item.box.x + item.box.width - box.x),
      Math.abs(box.x + box.width - item.box.x)
    );
    if (gap <= maxGap && gap < bestDistance) {
      bestDistance = gap;
      best = item;
    }
  }
  return best?.text ?? '';
}

/** OCR text directly above a box, horizontally overlapping. */
function textAbove(items: ScaledItem[], box: Box, maxGap: number): string {
  let best: ScaledItem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const overlapX =
      Math.min(box.x + box.width, item.box.x + item.box.width) -
      Math.max(box.x, item.box.x);
    if (overlapX <= 0) continue;
    const gap = box.y - (item.box.y + item.box.height);
    if (gap >= 0 && gap <= maxGap && gap < bestDistance) {
      bestDistance = gap;
      best = item;
    }
  }
  return best?.text ?? '';
}

/** OCR text immediately to the RIGHT of a box on the same row (option labels). */
function textRightOf(items: ScaledItem[], box: Box, maxGap: number): string {
  const centerY = box.y + box.height / 2;
  let best: ScaledItem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const itemCenterY = item.box.y + item.box.height / 2;
    if (Math.abs(itemCenterY - centerY) > Math.max(box.height, item.box.height) * 0.8) {
      continue;
    }
    const gap = item.box.x - (box.x + box.width);
    if (gap >= 0 && gap <= maxGap && gap < bestDistance) {
      bestDistance = gap;
      best = item;
    }
  }
  return best?.text ?? '';
}

/** OCR text immediately to the LEFT of a box on the same row (group labels). */
function textLeftOf(items: ScaledItem[], box: Box, maxGap: number): string {
  const centerY = box.y + box.height / 2;
  let best: ScaledItem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const itemCenterY = item.box.y + item.box.height / 2;
    if (Math.abs(itemCenterY - centerY) > Math.max(box.height, item.box.height) * 0.8) {
      continue;
    }
    const gap = box.x - (item.box.x + item.box.width);
    if (gap >= 0 && gap <= maxGap && gap < bestDistance) {
      bestDistance = gap;
      best = item;
    }
  }
  return best?.text ?? '';
}

/**
 * Same-row text that overlaps the box horizontally — OCR often merges a
 * group label with its options into one big box ("Terms: Yes No"), so the
 * label box extends across the squares instead of ending left of them.
 */
function sameRowOverlapText(items: ScaledItem[], box: Box): string {
  const centerY = box.y + box.height / 2;
  let best: ScaledItem | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const item of items) {
    const itemCenterY = item.box.y + item.box.height / 2;
    if (Math.abs(itemCenterY - centerY) > Math.max(box.height, item.box.height)) {
      continue;
    }
    const startsLeft = item.box.x < box.x - 2;
    const reachesSquare = item.box.x + item.box.width >= box.x - 2;
    if (!startsLeft || !reachesSquare) continue;
    const distance = box.x - item.box.x;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best?.text ?? '';
}

function cleanLabel(text: string): string {
  return text.replace(/[:：\s]+$/, '').trim();
}

const SIGNATURE_WORDS = /\bsign|signature|signed|witness|notary/i;
const IMAGE_WORDS = /photo|photograph|picture|image|logo/i;

function fieldTypeForLabel(label: string): FieldType {
  if (SIGNATURE_WORDS.test(label)) return 'signature';
  if (IMAGE_WORDS.test(label)) return 'image';
  return 'text';
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Detect fillable fields on one rendered page image.
 * `items` are OCR results in original pixel coordinates.
 */
export function detectFields(
  image: DecodedImage,
  items: OcrItem[],
  pageIndex: number
): FieldDraft[] {
  const gray = toGray(image, ANALYSIS_MAX_SIDE);
  const scale = gray.width / image.width;
  const scaledItems = scaleItems(items, scale);
  const underlines = findUnderlines(gray);
  const squares = findSquareOutlines(gray);

  const fields: FieldDraft[] = [];

  // ── Underline-backed fields ──────────────────────────────────────────────
  for (const underline of underlines) {
    // Labels sit to the left with a gap (dotted leader or plain space) or
    // directly above — allow a generous left gap so real forms match.
    const leftGap = Math.max(underline.width * 0.35, gray.width * 0.35);
    const labelFromLeft = cleanLabel(sameRowText(scaledItems, underline, leftGap));
    const labelFromAbove = cleanLabel(textAbove(scaledItems, underline, underline.height * 6));
    const label = labelFromLeft || labelFromAbove;
    const fieldType = fieldTypeForLabel(label || labelFromLeft || labelFromAbove);

    const paddingY = underline.height * 1.5;
    const bbox = normalizeBox(
      {
        x: underline.x,
        y: underline.y - paddingY,
        width: underline.width,
        height: underline.height + paddingY * 2,
      },
      scale,
      image
    );

    fields.push({
      label: label || 'Fillable field',
      fieldType,
      bbox,
      pageIndex,
      hint: HINT,
    });
  }

  // ── Checkbox groups ──────────────────────────────────────────────────────
  // Sort in reading order first so same-row squares always merge regardless
  // of the order the sliding window discovered them in.
  const orderedSquares = [...squares].sort((a, b) => a.y - b.y || a.x - b.x);
  const used = new Set<number>();
  for (let i = 0; i < orderedSquares.length; i += 1) {
    if (used.has(i)) continue;
    const rowBand = orderedSquares[i].height;
    const group: { square: Box; index: number }[] = [{ square: orderedSquares[i], index: i }];

    // Same-row squares within reading proximity form one checkbox group.
    for (let j = i + 1; j < orderedSquares.length; j += 1) {
      const a = orderedSquares[i];
      const b = orderedSquares[j];
      if (Math.abs(a.y - b.y) > rowBand) continue;
      const gap = b.x - (a.x + a.width);
      if (gap < 0 || gap > a.width * 5) continue;
      group.push({ square: b, index: j });
    }
    group.sort((p, q) => p.square.x - q.square.x);

    const groupMinX = group[0].square.x;
    const groupMaxX = group[group.length - 1].square.x + group[group.length - 1].square.width;
    const groupMinY = Math.min(...group.map((entry) => entry.square.y));
    const groupMaxY = Math.max(...group.map((entry) => entry.square.y + entry.square.height));

    const groupLabel = cleanLabel(
      textLeftOf(scaledItems, group[0].square, Math.max(groupMinX * 0.5, 120)) ||
        sameRowOverlapText(scaledItems, group[0].square) ||
        textAbove(
          scaledItems,
          { x: groupMinX, y: groupMinY, width: groupMaxX - groupMinX, height: 1 },
          rowBand + 24
        )
    );

    const options: string[] = [];
    for (const entry of group) {
      const option = cleanLabel(
        textRightOf(scaledItems, entry.square, Math.max(entry.square.width * 2, 24))
      );
      if (option) options.push(option);
      used.add(entry.index);
    }

    const unionBox = {
      x: groupMinX - 2,
      y: groupMinY - 2,
      width: Math.max(groupMaxX - groupMinX + 4, group[0].square.width),
      height: groupMaxY - groupMinY + 4,
    };

    fields.push({
      label: groupLabel || (options.length > 0 ? options.join(' / ') : 'Checkbox'),
      fieldType: 'checkbox',
      bbox: normalizeBox(unionBox, scale, image),
      pageIndex,
      options: options.length > 1 ? options : undefined,
      hint: HINT,
    });
  }

  // ── Borderless-form fallback: "Label:" with nothing after it ────────────
  if (underlines.length === 0 && fields.length === 0) {
    for (const item of scaledItems) {
      if (!/[:：]\s*$/.test(item.text)) continue;
      const label = cleanLabel(item.text);
      if (label.length > 40) continue;
      const box: Box = {
        x: item.box.x + item.box.width + item.box.height * 0.5,
        y: item.box.y,
        width: Math.max(gray.width * 0.12, item.box.height * 3),
        height: item.box.height * 1.2,
      };
      if (box.x + box.width > gray.width) continue;
      fields.push({
        label,
        fieldType: fieldTypeForLabel(label),
        bbox: normalizeBox(box, scale, image),
        pageIndex,
        hint: HINT,
      });
    }
  }

  // Cap to keep overlays sane on dense forms.
  return fields.slice(0, 60);
}

/** Map an analysis-space box back to original pixels and normalize 0..1. */
function normalizeBox(box: Box, scale: number, image: DecodedImage): NormalizedBBox {
  const x = Math.max(0, box.x / scale);
  const y = Math.max(0, box.y / scale);
  const width = Math.min(box.width / scale, image.width - x);
  const height = Math.min(box.height / scale, image.height - y);
  return {
    x: x / image.width,
    y: y / image.height,
    width: Math.max(0.001, width / image.width),
    height: Math.max(0.001, height / image.height),
  };
}
