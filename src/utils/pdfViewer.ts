/**
 * pdfViewer.ts — Shared, framework-agnostic PDF rendering + overlay primitives
 * for the AI scan review UI.
 *
 * - Wraps pdfjs-dist (same major version that @pdfme/converter already pulls
 *   in — declared directly in package.json so the import is stable).
 * - Renders a page into a canvas that fills its container's width; the
 *   container should keep a fixed aspect-ratio so overlays (positioned in
 *   normalized %) stay aligned while the next page renders.
 * - Bounding boxes are normalized 0..1, page-relative, TOP-LEFT origin.
 *
 * Vite worker wiring: pdf.js 5 workers are ES modules; we hand Vite the
 * worker bundle URL and let pdf.js instantiate it.
 */

import * as pdfjsLib from 'pdfjs-dist';
import type {
  PDFDocumentLoadingTask,
  PDFDocumentProxy,
} from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { OcrBBox } from '../types/scan.types';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ── Types ────────────────────────────────────────────────────────────────────

/** Normalized point inside an element (0..1, top-left origin). */
export interface NormalizedPoint {
  x: number;
  y: number;
}

/** CSS size/position values for an absolutely-positioned overlay div. */
export interface OverlayStyle {
  left: string;
  top: string;
  width: string;
  height: string;
}

/** A rendered page: the canvas plus a function that tears it down. */
export interface RenderedPage {
  canvas: HTMLCanvasElement;
  cleanup: () => void;
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/**
 * Keep the loading task alongside each document so disposePdf() can use
 * `loadingTask.destroy()` (the supported release path in pdf.js 5) instead
 * of the deprecated `pdf.destroy()`.
 */
const loadingTasks = new WeakMap<PDFDocumentProxy, PDFDocumentLoadingTask>();

/**
 * Load a PDF from raw bytes. `baseUrl` is forwarded to pdf.js for resolving
 * any relative document references. Throws on invalid/corrupt documents.
 */
export async function loadPdfFromBytes(
  bytes: ArrayBuffer | Uint8Array,
  baseUrl?: string
): Promise<PDFDocumentProxy> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const task = pdfjsLib.getDocument({ data, url: baseUrl ?? undefined });
  const pdf = await task.promise;
  loadingTasks.set(pdf, task);
  return pdf;
}

/** Number of pages in the document. */
export function pageCount(pdf: PDFDocumentProxy): number {
  return pdf.numPages;
}

/** Release all resources held by a document (safe to call once per pdf). */
export function disposePdf(pdf: PDFDocumentProxy): void {
  const task = loadingTasks.get(pdf);
  if (task) {
    loadingTasks.delete(pdf);
    void task.destroy();
  } else {
    void pdf.destroy();
  }
}

// ── Rendering ────────────────────────────────────────────────────────────────

/**
 * Render `pageIndex` (0-based) into `container` at the container's width,
 * capped at `maxScale` device pixels per CSS pixel to avoid huge canvases on
 * wide screens. Clears the container first. The returned `cleanup()` cancels
 * the render task, frees the page's resources, and removes the canvas.
 */
export async function renderPageToCanvas(
  pdf: PDFDocumentProxy,
  pageIndex: number,
  container: HTMLElement,
  maxScale = 2
): Promise<RenderedPage> {
  const page = await pdf.getPage(pageIndex + 1);
  const baseViewport = page.getViewport({ scale: 1 });
  const containerWidth = Math.max(container.clientWidth, 1);
  const scale = Math.min(containerWidth / Math.max(baseViewport.width, 1), maxScale);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = 'auto';

  // pdf.js 5 resolves the 2D context itself via the `canvas` param and throws
  // if it cannot; passing the canvas keeps the canvasContext shim unused.
  const renderTask = page.render({ canvas, viewport });
  await renderTask.promise;

  container.replaceChildren(canvas);

  let disposed = false;
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    renderTask.cancel();
    page.cleanup();
    canvas.remove();
  };

  return { canvas, cleanup };
}

// ── Normalization helpers (page-relative bbox ↔ screen) ─────────────────────

/** Clamp a value to the 0..1 range. */
export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Convert a normalized page-relative bbox into CSS percentages for an
 * absolutely-positioned overlay div. Percentages are clamped so a slightly
 * out-of-range detection never overflows the page.
 */
export function bboxToOverlayStyle(bbox: OcrBBox): OverlayStyle {
  const x = clamp01(bbox.x) * 100;
  const y = clamp01(bbox.y) * 100;
  const width = Math.max(0, Math.min(clamp01(bbox.width) * 100, 100 - x));
  const height = Math.max(0, Math.min(clamp01(bbox.height) * 100, 100 - y));
  return { left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` };
}

/** Convert a pointer event into a normalized point inside an element. */
export function normalizePointerPoint(
  event: PointerEvent,
  element: HTMLElement
): NormalizedPoint {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.width > 0 ? clamp01((event.clientX - rect.left) / rect.width) : 0,
    y: rect.height > 0 ? clamp01((event.clientY - rect.top) / rect.height) : 0,
  };
}

/** Build a normalized bbox from two arbitrary corners of a drag rectangle. */
export function normalizeBBoxFromPoints(
  start: NormalizedPoint,
  end: NormalizedPoint
): OcrBBox {
  const x = clamp01(Math.min(start.x, end.x));
  const y = clamp01(Math.min(start.y, end.y));
  const right = clamp01(Math.max(start.x, end.x));
  const bottom = clamp01(Math.max(start.y, end.y));
  return { x, y, width: right - x, height: bottom - y };
}
