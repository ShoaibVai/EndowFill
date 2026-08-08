/**
 * utils/aiChunk.test.ts — unit tests for request chunking.
 */

import { describe, expect, it } from 'vitest';
import { chunkPages } from './aiChunk';

function page(index: number, base64Bytes: number) {
  return {
    pageIndex: index,
    image_base64: 'A'.repeat(Math.ceil((base64Bytes * 4) / 3)),
    mimeType: 'image/jpeg' as const,
  };
}

describe('chunkPages', () => {
  it('keeps a small payload in one chunk', () => {
    const pages = [page(0, 1_000_000), page(1, 1_000_000)];
    const chunks = chunkPages(pages, 3.25 * 1024 * 1024);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(2);
  });

  it('splits pages that exceed the budget', () => {
    const pages = [page(0, 2_000_000), page(1, 2_000_000)];
    const chunks = chunkPages(pages, 3.25 * 1024 * 1024);
    expect(chunks).toHaveLength(2);
    expect(chunks[0].map((p) => p.pageIndex)).toEqual([0]);
    expect(chunks[1].map((p) => p.pageIndex)).toEqual([1]);
  });

  it('packs greedily while staying under the budget', () => {
    const pages = [page(0, 1_500_000), page(1, 1_500_000), page(2, 1_500_000)];
    const chunks = chunkPages(pages, 3.25 * 1024 * 1024);
    expect(chunks.map((c) => c.map((p) => p.pageIndex))).toEqual([[0, 1], [2]]);
  });

  it('keeps page order across chunks', () => {
    const pages = [page(0, 2_000_000), page(1, 2_000_000), page(2, 1_000_000)];
    const chunks = chunkPages(pages, 3.25 * 1024 * 1024);
    const order = chunks.flat().map((p) => p.pageIndex);
    expect(order).toEqual([0, 1, 2]);
  });

  it('returns an empty chunk list for no pages', () => {
    expect(chunkPages([])).toEqual([]);
  });
});
