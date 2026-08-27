/**
 * extractRules.test.ts — Deterministic extraction pattern tests.
 */
import { describe, expect, it } from 'vitest';
import { extractItems } from '../src/ocr/extractRules.js';
import type { NormalizedBBox } from '../src/validate.js';

function det(x: number, y: number, width: number, height: number, text: string) {
  return { pageIndex: 0, bbox: { x, y, width, height } as NormalizedBBox, label: 'text', text };
}

describe('extractItems — same-line pattern', () => {
  it('extracts "Label: value" from a single box', () => {
    const items = extractItems([
      { pageIndex: 0, detections: [det(0.1, 0.1, 0.5, 0.05, 'Email: john@example.com')] },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Email');
    expect(items[0].value).toBe('john@example.com');
    expect(items[0].category).toBe('contact');
  });

  it('extracts label + value from separate boxes on one line', () => {
    const items = extractItems([
      {
        pageIndex: 0,
        detections: [
          det(0.05, 0.1, 0.2, 0.04, 'Phone:'),
          det(0.3, 0.1, 0.3, 0.04, '(555) 123-4567'),
        ],
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Phone');
    expect(items[0].value).toBe('(555) 123-4567');
    expect(items[0].category).toBe('contact');
  });

  it('skips blank-form underscores as values', () => {
    const items = extractItems([
      {
        pageIndex: 0,
        detections: [det(0.05, 0.1, 0.4, 0.04, 'Applicant Name: ____')],
      },
    ]);
    expect(items).toHaveLength(0);
  });

  it('classifies dates, id numbers and names', () => {
    const items = extractItems([
      {
        pageIndex: 0,
        detections: [
          det(0.05, 0.1, 0.5, 0.04, 'Date of Birth: 03/12/1985'),
          det(0.05, 0.2, 0.5, 0.04, 'Policy Number: 887-342-111'),
          det(0.05, 0.3, 0.5, 0.04, 'Applicant Name: Jane Doe'),
        ],
      },
    ]);
    const categories = items.map((item) => item.category).sort();
    expect(categories).toEqual(['date', 'id_number', 'identity']);
  });
});

describe('extractItems — stacked pattern', () => {
  it('extracts a label line directly above a value line', () => {
    const items = extractItems([
      {
        pageIndex: 0,
        detections: [
          det(0.05, 0.1, 0.2, 0.04, 'Beneficiary Name:'),
          det(0.05, 0.16, 0.3, 0.05, 'Robert Chen'),
        ],
      },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Beneficiary Name');
    expect(items[0].value).toBe('Robert Chen');
    expect(items[0].category).toBe('identity');
  });

  it('does not treat a distant row as a stacked value', () => {
    const items = extractItems([
      {
        pageIndex: 0,
        detections: [
          det(0.05, 0.1, 0.2, 0.04, 'Policy Number:'),
          det(0.05, 0.4, 0.3, 0.05, 'some unrelated text'),
        ],
      },
    ]);
    expect(items).toHaveLength(0);
  });

  it('deduplicates identical label/value pairs', () => {
    const items = extractItems([
      {
        pageIndex: 0,
        detections: [
          det(0.05, 0.1, 0.5, 0.04, 'City: Springfield'),
          det(0.05, 0.3, 0.5, 0.04, 'City: Springfield'),
        ],
      },
    ]);
    expect(items).toHaveLength(1);
  });
});
