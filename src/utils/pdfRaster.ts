/**
 * pdfRaster.ts — Client-side rasterization for the AI endpoints.
 *
 * The Fastify AI server stays thin (images → OpenCode Go → JSON), so PDFs
 * are rasterized HERE in the browser with the same pdf.js instance the
 * review UI already uses, then uploaded as JPEG pages:
 *
 *   PDF  → one JPEG per page at the requested DPI (white background)
 *   PNG/JPG → passed through unchanged as a single page (no re-encode)
 *
 * Payload contract (POST /api/ai/ocr and /api/ai/detect-fields):
 *   { pages: [{ pageIndex, image_base64, mimeType }], dpi }
 */

import type { PDFDocumentProxy } from 'pdfjs-dist';
import { disposePdf, loadPdfFromBytes } from './pdfViewer';

/** One rasterized page, ready to POST to the AI server. */
export interface RasterPage {
  pageIndex: number;
  image_base64: string;
  mimeType: string;
}

/** Longest canvas edge allowed — keeps 600-DPI scans inside the 25 MiB cap. */
const MAX_DIMENSION_PX = 5000;
/** JPEG quality for rasterized pages (text stays crisp well below 0.9). */
const JPEG_QUALITY = 0.82;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string' && result.includes(',')) {
        resolve(result.split(',')[1] ?? '');
      } else {
        reject(new Error('Could not read the file.'));
      }
    };
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsArrayBuffer(file);
  });
}

function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(',');
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** Render one PDF page to a JPEG base64 string at the requested DPI. */
async function renderPageToJpeg(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  dpi: number
): Promise<string> {
  const page = await pdf.getPage(pageIndex + 1);
  try {
    const baseViewport = page.getViewport({ scale: 1 });
    const dpiScale = dpi / 72; // pdf.js scale-1 viewport is 72 DPI
    const dimensionCap = Math.min(
      MAX_DIMENSION_PX / Math.max(baseViewport.width, 1),
      MAX_DIMENSION_PX / Math.max(baseViewport.height, 1)
    );
    const scale = Math.min(dpiScale, dimensionCap);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is unavailable.');
    // JPEG has no alpha — pre-fill white so transparent PDF regions stay white.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({ canvas, viewport, background: '#ffffff' }).promise;
    return dataUrlToBase64(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
  } finally {
    page.cleanup();
  }
}

/**
 * Convert an uploaded file into raster pages for the AI server.
 * `onProgress` receives a human-readable label per page (scan UIs show it).
 */
export async function rasterizeFileToPages(
  file: File,
  dpi: number,
  onProgress?: (label: string) => void
): Promise<RasterPage[]> {
  // Images pass through untouched — re-encoding would only lose quality.
  if (file.type.startsWith('image/')) {
    onProgress?.(`Reading ${file.name}…`);
    const base64 = await readFileAsBase64(file);
    return [{ pageIndex: 0, image_base64: base64, mimeType: file.type }];
  }

  onProgress?.(`Rasterizing ${file.name} (${dpi} DPI)…`);
  const bytes = await readFileAsArrayBuffer(file);
  const pdf = await loadPdfFromBytes(bytes);
  try {
    const pages: RasterPage[] = [];
    for (let pageIndex = 0; pageIndex < pdf.numPages; pageIndex += 1) {
      onProgress?.(`Rasterizing page ${pageIndex + 1} of ${pdf.numPages}…`);
      pages.push({
        pageIndex,
        image_base64: await renderPageToJpeg(pdf, pageIndex, dpi),
        mimeType: 'image/jpeg',
      });
    }
    return pages;
  } finally {
    disposePdf(pdf);
  }
}
