/**
 * pages.ts — Shared page decoding for the OCR and detect-fields routes.
 */

import { HttpError, type PagePayload } from '../validate.js';
import { decodeImage, type DecodedImage } from './image.js';

export interface DecodedPage {
  pageIndex: number;
  bytes: ArrayBuffer;
  image: DecodedImage;
}

/** Decode one validated page payload's base64 image into raw bytes + RGBA. */
export function decodePage(page: PagePayload): DecodedPage {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(page.imageBase64, 'base64');
  } catch {
    throw new HttpError(
      `pages[${page.pageIndex}].image_base64 is not valid base64.`,
      400,
      'bad_image'
    );
  }

  const image = decodeImage(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    page.mimeType
  );
  return { pageIndex: page.pageIndex, bytes: bytes.buffer as ArrayBuffer, image };
}
