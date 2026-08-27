/**
 * image.ts — Lightweight pixel decoding + analysis helpers.
 *
 * The client uploads JPEG (rasterized PDF pages) or PNG (image files passed
 * through unchanged). jpeg-js and pngjs decode both into RGBA buffers with
 * tiny dependencies — no native modules, which keeps the Docker image and
 * the free-tier RAM footprint small.
 *
 * Everything here stays bounded: analysis images are downscaled to at most
 * MAX_ANALYSIS_SIDE_PX on the longest side before any pixel work.
 */

import { decode as decodeJpeg } from 'jpeg-js';
import { PNG } from 'pngjs';
import { MAX_ANALYSIS_SIDE_PX } from '../config.js';

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA8888, length = width * height * 4. */
  rgba: Uint8Array;
}

export interface GrayImage {
  width: number;
  height: number;
  /** Single-channel 0..255 (dark = low value), length = width * height. */
  data: Uint8Array;
}

export class ImageDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

/** Decode JPEG or PNG bytes into RGBA. */
export function decodeImage(bytes: ArrayBuffer, mimeType: string): DecodedImage {
  const buffer = Buffer.from(bytes);
  try {
    if (mimeType === 'image/png' || buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
      const png = PNG.sync.read(buffer);
      return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
    }
    const jpeg = decodeJpeg(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
    return { width: jpeg.width, height: jpeg.height, rgba: jpeg.data };
  } catch (error) {
    throw new ImageDecodeError(
      `Could not decode page image: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Convert RGBA to luminance gray, optionally downscaling so the longest side
 * is at most `maxSide` (analysis only — never upscales small images).
 */
export function toGray(
  image: DecodedImage,
  maxSide: number = MAX_ANALYSIS_SIDE_PX
): GrayImage {
  const longest = Math.max(image.width, image.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const srcY = Math.min(image.height - 1, Math.round(y / scale));
    const rowOffset = srcY * image.width;
    for (let x = 0; x < width; x += 1) {
      const srcX = Math.min(image.width - 1, Math.round(x / scale));
      const offset = (rowOffset + srcX) * 4;
      const r = image.rgba[offset];
      const g = image.rgba[offset + 1];
      const b = image.rgba[offset + 2];
      data[y * width + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }
  }
  return { width, height, data };
}

/**
 * Count dark pixels (luminance below `threshold`, default 128) per row.
 * Returns one value per row — the basis for underline / separator detection.
 */
export function rowDarkness(gray: GrayImage, threshold = 128): Uint32Array {
  const counts = new Uint32Array(gray.height);
  for (let y = 0; y < gray.height; y += 1) {
    let count = 0;
    const rowOffset = y * gray.width;
    for (let x = 0; x < gray.width; x += 1) {
      if (gray.data[rowOffset + x] < threshold) count += 1;
    }
    counts[y] = count;
  }
  return counts;
}

/**
 * Find long horizontal runs of dark pixels within a single row.
 * A "run" is a maximal x-range where luminance stays below `threshold`.
 * Returns runs of at least `minRunPixels` (in analysis-image coordinates).
 */
export function horizontalRuns(
  gray: GrayImage,
  y: number,
  threshold = 128,
  minRunPixels = 10
): { startX: number; endX: number }[] {
  const runs: { startX: number; endX: number }[] = [];
  const rowOffset = y * gray.width;
  let start = -1;
  for (let x = 0; x <= gray.width; x += 1) {
    const dark = x < gray.width && gray.data[rowOffset + x] < threshold;
    if (dark && start === -1) start = x;
    if (!dark && start !== -1) {
      if (x - start >= minRunPixels) runs.push({ startX: start, endX: x - 1 });
      start = -1;
    }
  }
  return runs;
}
