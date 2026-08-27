/**
 * markdown.ts — Deterministic markdown reconstruction from OCR boxes.
 *
 * The VLM used to write markdown directly; the local OCR engine returns text
 * boxes, so reading order and structure are rebuilt here:
 *
 *   1. Boxes are grouped into visual lines (vertical overlap).
 *   2. Lines are sorted top-to-bottom, left-to-right (reading order).
 *   3. Words on a line are joined with spaces, wider gaps get extra spaces.
 *   4. Paragraph breaks go where the vertical gap is large.
 *   5. Lines notably taller than the page median become headings.
 */

import type { OcrItem } from './engine.js';

export interface MarkdownLine {
  /** Reconstructed line text. */
  text: string;
  /** Union box of the line in page pixels. */
  box: { x: number; y: number; width: number; height: number };
  /** Median box height on the line (px) — a font-size proxy. */
  height: number;
}

function overlap(a: OcrItem, b: OcrItem): number {
  const top = Math.max(a.box.y, b.box.y);
  const bottom = Math.min(a.box.y + a.box.height, b.box.y + b.box.height);
  return Math.max(0, bottom - top);
}

/** Group OCR items into visual lines using vertical box overlap. */
export function groupIntoLines(items: OcrItem[]): MarkdownLine[] {
  const sorted = [...items].sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const lines: MarkdownLine[] = [];

  for (const item of sorted) {
    const itemBox = item.box;
    const itemCenter = itemBox.y + itemBox.height / 2;

    let bestIndex = -1;
    let bestOverlap = 0;
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      const lineCenter = line.box.y + line.box.height / 2;
      const verticalSpan = Math.max(line.box.height, itemBox.height);
      // Same visual line when centers are close relative to box heights.
      if (Math.abs(itemCenter - lineCenter) > verticalSpan * 0.7) continue;
      const overlapPx = overlap(item, { box: line.box } as OcrItem);
      if (overlapPx > bestOverlap) {
        bestOverlap = overlapPx;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) {
      lines.push({
        text: item.text,
        box: { ...itemBox },
        height: itemBox.height,
      });
    } else {
      const line = lines[bestIndex];
      const minX = Math.min(line.box.x, itemBox.x);
      const maxX = Math.max(line.box.x + line.box.width, itemBox.x + itemBox.width);
      const minY = Math.min(line.box.y, itemBox.y);
      const maxY = Math.max(line.box.y + line.box.height, itemBox.y + itemBox.height);
      line.text = `${line.text} ${item.text}`;
      line.box = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
      line.height = Math.max(line.height, itemBox.height);
    }
  }

  return lines
    .map((line) => ({
      ...line,
      text: line.text.replace(/\s+/g, ' ').trim(),
    }))
    .filter((line) => line.text.length > 0)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

/** Median of a sorted number list (0 for empty input). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Reconstruct markdown from recognized items.
 * Returns the markdown transcript for a single page.
 */
export function reconstructMarkdown(items: OcrItem[]): string {
  const lines = groupIntoLines(items);
  if (lines.length === 0) return '';

  const heights = lines.map((line) => line.height).sort((a, b) => a - b);
  const medianHeight = median(heights);
  const headingThreshold = Math.max(medianHeight * 1.6, 1);
  const paragraphGap = Math.max(medianHeight * 1.8, 1);

  const output: string[] = [];
  let previousBottom: number | null = null;

  for (const line of lines) {
    const isHeading = line.height >= headingThreshold && medianHeight > 0;
    const verticalGap = previousBottom === null ? 0 : line.box.y - previousBottom;

    if (previousBottom !== null && verticalGap > paragraphGap) {
      output.push(''); // paragraph break
    }

    output.push(isHeading ? `# ${line.text}` : line.text);
    previousBottom = line.box.y + line.box.height;
  }

  return output.join('\n');
}
