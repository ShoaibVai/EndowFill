/**
 * detectFieldsRules.test.ts — Geometry heuristic tests on synthetic rasters.
 */
import { describe, expect, it } from 'vitest';
import {
  detectFields,
  findSquareOutlines,
  findUnderlines,
} from '../src/ocr/detectFieldsRules.js';
import type { GrayImage } from '../src/ocr/image.js';
import type { DecodedImage } from '../src/ocr/image.js';
import type { OcrItem } from '../src/ocr/engine.js';

/** Build a synthetic gray image; draw with 1 = dark (low luminance). */
function makeGray(width: number, height: number, draw: (set: (x: number, y: number) => void) => void): GrayImage {
  const data = new Uint8Array(width * height).fill(255);
  const set = (x: number, y: number): void => {
    if (x >= 0 && x < width && y >= 0 && y < height) data[y * width + x] = 0;
  };
  draw(set);
  return { width, height, data };
}

/** Draw a rectangle outline (1px) into the image. */
function rect(gray: GrayImage, x0: number, y0: number, x1: number, y1: number): void {
  for (let x = x0; x <= x1; x += 1) {
    gray.data[y0 * gray.width + x] = 0;
    gray.data[y1 * gray.width + x] = 0;
  }
  for (let y = y0; y <= y1; y += 1) {
    gray.data[y * gray.width + x0] = 0;
    gray.data[y * gray.width + x1] = 0;
  }
}

/** Draw a thick horizontal line into the image. */
function hline(gray: GrayImage, x0: number, y: number, x1: number): void {
  for (let dy = 0; dy < 2; dy += 1) {
    for (let x = x0; x <= x1; x += 1) {
      gray.data[(y + dy) * gray.width + x] = 0;
    }
  }
}

describe('findUnderlines', () => {
  it('finds a long horizontal line', () => {
    const gray = makeGray(600, 400, (set) => {
      for (let x = 100; x <= 500; x += 1) set(x, 200);
    });
    const lines = findUnderlines(gray);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const line = lines.find((candidate) => candidate.y <= 200 && candidate.y + candidate.height >= 200);
    expect(line).toBeDefined();
    expect(line!.width).toBeGreaterThan(300);
  });

  it('ignores a solid filled band (too much darkness per row)', () => {
    const gray = makeGray(600, 400, (set) => {
      for (let x = 100; x <= 500; x += 1) {
        set(x, 200);
        set(x, 201);
        set(x, 202);
        set(x, 203);
        set(x, 204);
        set(x, 205);
      }
    });
    const lines = findUnderlines(gray);
    expect(lines).toHaveLength(0);
  });
});

describe('findSquareOutlines', () => {
  it('finds an isolated printed checkbox square', () => {
    const gray = makeGray(400, 300, () => {});
    rect(gray, 150, 100, 176, 126); // 27px square outline
    const squares = findSquareOutlines(gray);
    expect(squares.length).toBeGreaterThanOrEqual(1);
    const square = squares.find(
      (candidate) =>
        candidate.x <= 154 && candidate.x + candidate.width >= 172 &&
        candidate.y <= 104 && candidate.y + candidate.height >= 122
    );
    expect(square).toBeDefined();
  });

  it('does not match a filled square (checked box)', () => {
    const gray = makeGray(400, 300, (set) => {
      for (let y = 100; y <= 126; y += 1) {
        for (let x = 150; x <= 176; x += 1) set(x, y);
      }
    });
    const squares = findSquareOutlines(gray);
    expect(squares).toHaveLength(0);
  });
});

describe('detectFields', () => {
  const baseItems: OcrItem[] = [
    { text: 'Name:', box: { x: 10, y: 50, width: 80, height: 30 }, confidence: 0.9 },
    { text: 'Signature:', box: { x: 10, y: 150, width: 130, height: 30 }, confidence: 0.9 },
  ];

  function makeImage(gray: GrayImage): DecodedImage {
    // detectFields runs toGray() on the decoded image — fabricate an RGBA
    // buffer whose luminance matches the gray data (all white / all black).
    const rgba = new Uint8Array(gray.width * gray.height * 4);
    for (let i = 0; i < gray.data.length; i += 1) {
      const value = gray.data[i];
      rgba[i * 4] = value;
      rgba[i * 4 + 1] = value;
      rgba[i * 4 + 2] = value;
      rgba[i * 4 + 3] = 255;
    }
    return { width: gray.width, height: gray.height, rgba };
  }

  it('maps an underline to a text field labeled by adjacent OCR text', () => {
    const gray = makeGray(600, 300, () => {});
    hline(gray, 150, 60, 550); // underline right of "Name:" (ends x=90)
    const fields = detectFields(makeImage(gray), baseItems, 0);
    const textFields = fields.filter((field) => field.fieldType === 'text');
    expect(textFields.length).toBeGreaterThanOrEqual(1);
    expect(textFields.some((field) => field.label === 'Name')).toBe(true);
  });

  it('classifies a signature underline by its label', () => {
    const gray = makeGray(600, 300, () => {});
    hline(gray, 200, 160, 550); // underline right of "Signature:"
    const fields = detectFields(makeImage(gray), baseItems, 0);
    const signature = fields.find((field) => field.fieldType === 'signature');
    expect(signature).toBeDefined();
    expect(signature!.label).toContain('Signature');
  });

  it('turns an isolated square near text into a checkbox field', () => {
    const gray = makeGray(600, 300, () => {});
    rect(gray, 100, 240, 126, 266);
    const items: OcrItem[] = [
      { text: 'Single', box: { x: 140, y: 240, width: 60, height: 26 }, confidence: 0.9 },
    ];
    const fields = detectFields(makeImage(gray), items, 0);
    expect(fields.some((field) => field.fieldType === 'checkbox')).toBe(true);
  });

  it('normalizes boxes to 0..1 page coordinates', () => {
    const gray = makeGray(600, 300, () => {});
    hline(gray, 150, 60, 550);
    const fields = detectFields(makeImage(gray), baseItems, 0);
    for (const field of fields) {
      expect(field.bbox.x).toBeGreaterThanOrEqual(0);
      expect(field.bbox.x).toBeLessThanOrEqual(1);
      expect(field.bbox.y).toBeGreaterThanOrEqual(0);
      expect(field.bbox.y).toBeLessThanOrEqual(1);
    }
  });
});
