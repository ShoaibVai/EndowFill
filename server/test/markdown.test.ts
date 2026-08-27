/**
 * markdown.test.ts — Reading-order and structure reconstruction tests.
 */
import { describe, expect, it } from 'vitest';
import { groupIntoLines, reconstructMarkdown } from '../src/ocr/markdown.js';
import type { OcrItem } from '../src/ocr/engine.js';

function item(text: string, x: number, y: number, width = 100, height = 30): OcrItem {
  return { text, box: { x, y, width, height }, confidence: 0.9 };
}

describe('groupIntoLines', () => {
  it('groups horizontally adjacent boxes into one line, sorted by x', () => {
    const lines = groupIntoLines([
      item('Name:', 10, 100),
      item('John', 120, 102),
      item('Smith', 250, 101),
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toContain('Name:');
    expect(lines[0].text).toContain('Smith');
  });

  it('keeps vertically separated boxes in separate lines', () => {
    const lines = groupIntoLines([item('First', 10, 100), item('Second', 10, 300)]);
    expect(lines).toHaveLength(2);
  });

  it('sorts lines in reading order (top-to-bottom)', () => {
    const lines = groupIntoLines([item('Bottom', 10, 500), item('Top', 10, 100)]);
    expect(lines[0].text).toBe('Top');
    expect(lines[1].text).toBe('Bottom');
  });
});

describe('reconstructMarkdown', () => {
  it('joins lines with newlines and keeps order', () => {
    const markdown = reconstructMarkdown([
      item('Applicant Name', 10, 100),
      item('Date of Birth', 10, 145),
    ]);
    expect(markdown).toBe('Applicant Name\nDate of Birth');
  });

  it('marks lines much taller than the median as headings', () => {
    const markdown = reconstructMarkdown([
      item('APPLICATION FORM', 10, 50, 500, 60),
      item('Applicant Name', 10, 200, 120, 20),
      item('Date of Birth', 10, 260, 120, 20),
    ]);
    expect(markdown.split('\n')[0]).toBe('# APPLICATION FORM');
  });

  it('inserts paragraph breaks at large vertical gaps', () => {
    const markdown = reconstructMarkdown([
      item('Section one line', 10, 100),
      item('Section one line two', 10, 140),
      item('Section two line', 10, 400),
    ]);
    expect(markdown).toBe('Section one line\nSection one line two\n\nSection two line');
  });

  it('returns empty string for no items', () => {
    expect(reconstructMarkdown([])).toBe('');
  });
});
