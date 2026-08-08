/**
 * AIScanPage.tsx — AI scan review flow (Phase 3, flow 1).
 *
 * 1. Upload a student's document (PDF, PNG, JPG).
 * 2. POST /api/ai/ocr → page markdown + detection boxes.
 * 3. POST /api/ai/extract → structured items (label/value/category/confidence).
 * 4. Review: rendered pages with clickable highlight boxes on the left,
 *    an editable items list on the right. Hover/click an item to jump to
 *    its source box; click a box to select its item.
 * 5. Edit mode: drag on the page to add a box for anything the AI missed;
 *    delete items in the list for anything it got wrong.
 * 6. Export the reviewed items as JSON (and, when wired later, hand them to
 *    the workspace template's extracted-data store via `onExtracted`).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  ScanText,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { api } from '../utils/apiClient';
import {
  bboxToOverlayStyle,
  disposePdf,
  loadPdfFromBytes,
  renderPageToCanvas,
} from '../utils/pdfViewer';
import { base64ToArrayBuffer } from '../utils/bufferUtils';
import { rasterizeFileToPages } from '../utils/pdfRaster';
import { runOcr } from '../utils/aiChunk';
import { DetectionOverlay } from '../components/scan/DetectionOverlay';
import { ExtractedItemList } from '../components/scan/ExtractedItemList';
import { PageHeader } from '../components/ui/PageHeader';
import type {
  Detection,
  ExtractResult,
  ExtractedItem,
  ItemPatch,
  OcrBBox,
  OcrResult,
  ScanExportPayload,
} from '../types/scan.types';

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
/** Tolerance when matching an extracted item's sourceBBox to an OCR box. */
const BBOX_EPSILON = 0.02;

type Phase = 'upload' | 'scanning' | 'review';

interface AIScanPageProps {
  /**
   * Called with the reviewed items whenever they change (after extraction,
   * edits, additions, deletions). Wired to the workspace template's
   * extracted-data store in a later milestone.
   */
  onExtracted?: (items: ExtractedItem[]) => void;
}

// ── Pure helpers ─────────────────────────────────────────────────────────────

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

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Flatten OCR detections across pages into stable, id-able entries. */
function flattenDetections(result: OcrResult): Detection[] {
  const list: Detection[] = [];
  for (const page of result.pages ?? []) {
    for (const detection of page.detections ?? []) {
      const { x, y, width, height } = detection.bbox;
      list.push({
        id: `det-${page.pageIndex}-${round3(x)}-${round3(y)}-${round3(width)}-${round3(height)}`,
        pageIndex: page.pageIndex,
        bbox: detection.bbox,
        label: detection.label || 'text',
        text: detection.text ?? '',
      });
    }
  }
  return list;
}

function bboxesMatch(a: OcrBBox, b: OcrBBox): boolean {
  return (
    Math.abs(a.x - b.x) < BBOX_EPSILON &&
    Math.abs(a.y - b.y) < BBOX_EPSILON &&
    Math.abs(a.width - b.width) < BBOX_EPSILON &&
    Math.abs(a.height - b.height) < BBOX_EPSILON
  );
}

/**
 * Enrich extracted items with the detection id / pageIndex of the OCR box
 * they came from (the API only returns sourceBBox), so the list can
 * highlight and scroll to the right box.
 */
function linkItems(rawItems: ExtractedItem[], detections: Detection[]): ExtractedItem[] {
  return rawItems.map((item, index) => {
    const base = item.id ? item : { ...item, id: `item-${index + 1}` };
    if (!base.sourceBBox) return base;
    const match = detections.find(
      (detection) =>
        (base.pageIndex == null || detection.pageIndex === base.pageIndex) &&
        bboxesMatch(detection.bbox, base.sourceBBox as OcrBBox)
    );
    if (!match) return base;
    return { ...base, pageIndex: match.pageIndex, detectionId: match.id };
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AIScanPage({ onExtracted }: AIScanPageProps) {
  // ── Props kept fresh for async callbacks ──
  const onExtractedRef = useRef(onExtracted);
  useEffect(() => {
    onExtractedRef.current = onExtracted;
  }, [onExtracted]);

  // ── Upload / scan state ──
  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [dpi, setDpi] = useState(300);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // ── Review state ──
  const [currentPage, setCurrentPage] = useState(0);
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const [imageRatio, setImageRatio] = useState<number | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drawRect, setDrawRect] = useState<OcrBBox | null>(null);
  const [drawPending, setDrawPending] = useState<OcrBBox | null>(null);
  const [drawLabel, setDrawLabel] = useState('');
  const [pageRendering, setPageRendering] = useState(false);
  const [pageRenderError, setPageRenderError] = useState<string | null>(null);

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);
  const didInitRef = useRef(false);

  const isImage = file ? file.type.startsWith('image/') : false;
  const imageSrc =
    fileBase64 && isImage && file ? `data:${file.type};base64,${fileBase64}` : null;
  const totalPages = isImage ? 1 : Math.max(pageRatios.length, ocrResult?.pageCount ?? 0);
  const pageRatio = isImage ? imageRatio : (pageRatios[currentPage] ?? null);

  // ── Scan pipeline ──────────────────────────────────────────────────────────

  const runScan = useCallback(async (target: File, targetDpi: number) => {
    cancelledRef.current = false;
    setScanError(null);
    setPhase('scanning');
    setScanProgress('Reading file…');

    try {
      const base64 = await readFileAsBase64(target);
      if (cancelledRef.current) return;
      setFileBase64(base64);

      setScanProgress(`Rasterizing pages (${targetDpi} DPI)…`);
      const pages = await rasterizeFileToPages(target, targetDpi, setScanProgress);
      if (cancelledRef.current) return;

      setScanProgress(`Scanning pages with OCR (${targetDpi} DPI)…`);
      const ocr = await runOcr(pages, {
        dpi: targetDpi,
        onChunkProgress: (label) => setScanProgress(label),
      });
      if (cancelledRef.current) return;
      setOcrResult(ocr);

      setScanProgress('Extracting structured information…');
      let extracted: ExtractedItem[] = [];
      try {
        const response = await api.post<ExtractResult>('/ai/extract', { ocrResult: ocr });
        extracted = Array.isArray(response.items) ? response.items : [];
      } catch (extractError) {
        // Extraction is a best-effort enrichment: fall back to raw OCR boxes.
        console.warn('[AIScanPage] extraction failed; continuing with detections only', extractError);
      }
      if (cancelledRef.current) return;

      const flat = flattenDetections(ocr);
      const linked = linkItems(extracted, flat);

      if (isPdfFile(target)) {
        const pdf = await loadPdfFromBytes(base64ToArrayBuffer(base64));
        if (cancelledRef.current) {
          disposePdf(pdf);
          return;
        }
        if (pdfRef.current) disposePdf(pdfRef.current);
        pdfRef.current = pdf;
        const ratios: number[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1 });
          ratios.push(viewport.width / viewport.height);
          page.cleanup();
        }
        setPageRatios(ratios);
      } else {
        setPageRatios([]);
        setImageRatio(null);
      }

      setDetections(flat);
      setItems(linked);
      setCurrentPage(0);
      setSelectedItemId(null);
      setHoveredItemId(null);
      setEditMode(false);
      setPhase('review');
    } catch (error) {
      if (cancelledRef.current) return;
      setScanError(error instanceof Error ? error.message : 'Scan failed. Please try again.');
      setPhase('upload');
    }
  }, []);

  const handleFile = useCallback(
    (next: File | null) => {
      if (!next) return;
      const typeOk =
        next.type === 'application/pdf' ||
        next.type === 'image/png' ||
        next.type === 'image/jpeg' ||
        /\.(pdf|png|jpe?g)$/i.test(next.name);
      if (!typeOk) {
        setScanError('Unsupported file type. Please upload a PDF, PNG or JPG.');
        return;
      }
      if (next.size > MAX_FILE_BYTES) {
        setScanError('File is larger than 50 MB. Please upload a smaller document.');
        return;
      }
      setScanError(null);
      setFile(next);
      void runScan(next, dpi);
    },
    [dpi, runScan]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      handleFile(event.dataTransfer.files[0] ?? null);
    },
    [handleFile]
  );

  const handleRetry = useCallback(() => {
    if (!file) {
      setPhase('upload');
      return;
    }
    void runScan(file, dpi);
  }, [dpi, file, runScan]);

  const handleNewScan = useCallback(() => {
    cancelledRef.current = true;
    if (pdfRef.current) {
      disposePdf(pdfRef.current);
      pdfRef.current = null;
    }
    setPhase('upload');
    setFile(null);
    setFileBase64(null);
    setOcrResult(null);
    setDetections([]);
    setItems([]);
    setCurrentPage(0);
    setPageRatios([]);
    setImageRatio(null);
    setSelectedItemId(null);
    setHoveredItemId(null);
    setEditMode(false);
    setDrawRect(null);
    setDrawPending(null);
    setScanError(null);
  }, []);

  // Dispose the pdf.js document on unmount.
  useEffect(
    () => () => {
      cancelledRef.current = true;
      if (pdfRef.current) disposePdf(pdfRef.current);
    },
    []
  );

  // ── Page rendering ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'review' || isImage || !pdfRef.current || !pageContainerRef.current) return;
    const container = pageContainerRef.current;
    let cancelled = false;
    let cleanup: (() => void) | null = null;
    setPageRendering(true);
    setPageRenderError(null);
    renderPageToCanvas(pdfRef.current, currentPage, container)
      .then((rendered) => {
        if (cancelled) {
          rendered.cleanup();
          return;
        }
        cleanup = rendered.cleanup;
        setPageRendering(false);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('[AIScanPage] page render failed', error);
        setPageRenderError('Could not render this page.');
        setPageRendering(false);
      });
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [currentPage, isImage, phase]);

  // ── Derived review data ────────────────────────────────────────────────────

  const detectionToItem = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of items) {
      if (item.detectionId) map[item.detectionId] = item.id;
    }
    return map;
  }, [items]);

  /** If nothing is linked to boxes (or extraction found nothing), show all. */
  const hasLinkedBoxes = useMemo(() => items.some((item) => item.detectionId), [items]);

  const visibleDetections = useMemo(() => {
    if (!hasLinkedBoxes) return detections;
    const linkedIds = new Set(
      items.map((item) => item.detectionId).filter((id): id is string => Boolean(id))
    );
    return detections.filter((detection) => linkedIds.has(detection.id));
  }, [detections, hasLinkedBoxes, items]);

  // ── Item callbacks ─────────────────────────────────────────────────────────

  const handleItemChange = useCallback(
    (id: string, patch: ItemPatch) => {
      const target = items.find((item) => item.id === id);
      if (!target) return;
      const next = { ...target, ...patch };
      setItems((prev) => prev.map((item) => (item.id === id ? next : item)));
      // Keep the on-page box label in sync so the annotation stays readable.
      if (patch.label && patch.label !== target.label && target.detectionId) {
        setDetections((prev) =>
          prev.map((detection) =>
            detection.id === target.detectionId ? { ...detection, label: next.label } : detection
          )
        );
      }
    },
    [items]
  );

  const handleDeleteItem = useCallback(
    (id: string) => {
      const target = items.find((item) => item.id === id);
      if (!target) return;
      setItems((prev) => prev.filter((item) => item.id !== id));
      // Remove the box only when no remaining item still points at it.
      if (target.detectionId) {
        const stillLinked = items.some(
          (item) => item.id !== id && item.detectionId === target.detectionId
        );
        if (!stillLinked) {
          setDetections((prev) => prev.filter((detection) => detection.id !== target.detectionId));
        }
      }
      if (selectedItemId === id) setSelectedItemId(null);
    },
    [items, selectedItemId]
  );

  const handleAddItem = useCallback(
    (draft: { label: string; value: string; category: string }) => {
      const item: ExtractedItem = {
        id: `item-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: draft.label,
        value: draft.value,
        category: draft.category || 'other',
        confidence: 1,
      };
      setItems((prev) => [...prev, item]);
      setSelectedItemId(item.id);
    },
    []
  );

  const handleSelectItem = useCallback(
    (id: string | null) => {
      setSelectedItemId(id);
      setHoveredItemId(null);
      if (!id) return;
      const item = items.find((entry) => entry.id === id);
      if (!item?.detectionId) return;
      const detection = detections.find((entry) => entry.id === item.detectionId);
      if (detection && detection.pageIndex !== currentPage) {
        setCurrentPage(detection.pageIndex);
      }
      // The page container keeps a fixed aspect ratio, so the box element is
      // laid out on the same commit as the page switch — scroll to it next frame.
      window.requestAnimationFrame(() => {
        document
          .getElementById(`scan-det-${item.detectionId}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [currentPage, detections, items]
  );

  const handleSelectDetection = useCallback(
    (detectionId: string) => {
      const item = items.find((entry) => entry.detectionId === detectionId);
      setSelectedItemId(item?.id ?? null);
      setHoveredItemId(null);
    },
    [items]
  );

  // ── Edit-mode drawing ──────────────────────────────────────────────────────

  const handleDrawStart = useCallback(() => {
    setDrawRect({ x: 0, y: 0, width: 0, height: 0 });
  }, []);

  const handleDrawMove = useCallback((bbox: OcrBBox) => {
    setDrawRect(bbox);
  }, []);

  const handleDrawEnd = useCallback((bbox: OcrBBox) => {
    setDrawRect(null);
    if (bbox.width < 0.01 || bbox.height < 0.01) return;
    setDrawPending(bbox);
    setDrawLabel('');
  }, []);

  const commitManualItem = useCallback(() => {
    if (!drawPending) return;
    const label = drawLabel.trim() || 'Untitled';
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const detectionId = `det-manual-${stamp}`;
    const itemId = `item-manual-${stamp}`;
    const detection: Detection = {
      id: detectionId,
      pageIndex: currentPage,
      bbox: drawPending,
      label,
      text: '',
    };
    const item: ExtractedItem = {
      id: itemId,
      label,
      value: '',
      category: 'other',
      confidence: 1,
      pageIndex: currentPage,
      sourceBBox: drawPending,
      detectionId,
    };
    setDetections((prev) => [...prev, detection]);
    setItems((prev) => [...prev, item]);
    setDrawPending(null);
    setDrawLabel('');
    setSelectedItemId(itemId);
  }, [currentPage, drawLabel, drawPending]);

  // ── Export & wiring ────────────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const payload: ScanExportPayload = {
      fileName: file?.name ?? 'scan',
      dpi,
      exportedAt: new Date().toISOString(),
      pageCount: totalPages,
      items,
      detections: visibleDetections,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(file?.name ?? 'scan').replace(/\.[^.]+$/, '')}-scan-review.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [dpi, file, items, totalPages, visibleDetections]);

  // Notify the workspace wiring hook after the first (empty) render.
  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      return;
    }
    onExtractedRef.current?.(items);
  }, [items]);

  const goPrev = useCallback(() => setCurrentPage((page) => Math.max(0, page - 1)), []);
  const goNext = useCallback(
    () => setCurrentPage((page) => Math.min(Math.max(totalPages - 1, 0), page + 1)),
    [totalPages]
  );

  const toggleEditMode = useCallback(() => {
    setEditMode((enabled) => !enabled);
    setDrawRect(null);
    setDrawPending(null);
  }, []);

  const drawPendingStyle = drawPending ? bboxToOverlayStyle(drawPending) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Header */}
        <PageHeader
          ai
          icon={<ScanText className="h-5 w-5" />}
          title="AI Document Scan"
          subtitle="Scan a student's document — review, label, and correct every extracted field."
          actions={
            phase === 'review' && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleRetry} className="btn-ghost btn-ghost--sm">
                  <RefreshCw className="h-4 w-4" />
                  Rescan
                </button>
                <button type="button" onClick={handleExport} className="btn-primary btn-primary--sm">
                  <Download className="h-4 w-4" />
                  Export JSON
                </button>
                <button type="button" onClick={handleNewScan} className="btn-ghost btn-ghost--sm">
                  <X className="h-4 w-4" />
                  New scan
                </button>
              </div>
            )
          }
        />

        {phase === 'upload' && (
          <div className="rounded-2xl border border-surface-200 bg-white p-6 dark:border-surface-800 dark:bg-surface-900 md:p-10">
            {scanError && (
              <div
                className="mb-5 flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 p-4 dark:border-error-500/30 dark:bg-error-500/10"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error-600 dark:text-error-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-error-700 dark:text-error-300">
                    Scan failed
                  </p>
                  <p className="mt-0.5 text-sm text-error-600 dark:text-error-400">{scanError}</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={handleRetry} className="btn-primary btn-primary--sm">
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </button>
                    <button type="button" onClick={handleNewScan} className="btn-ghost btn-ghost--sm">
                      Choose another file
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div
              className={`drop-zone ${dragOver ? 'drag-over' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
                style={{
                  background: 'linear-gradient(135deg, var(--color-primary-50), var(--color-primary-100))',
                  color: 'var(--color-primary-500)',
                }}
              >
                <Upload className="h-7 w-7" />
              </div>
              <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>
                Drop your document here, or click to browse
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                PDF, PNG or JPG — up to 50 MB
              </p>
              <button
                type="button"
                className="btn-primary mt-5"
                onClick={(event) => {
                  event.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                <FileText className="h-4 w-4" />
                Choose file
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_EXTENSIONS}
                className="hidden"
                onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
              />
            </div>

            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <label htmlFor="scan-dpi" className="text-sm font-medium text-ink-muted dark:text-surface-300">
                OCR detail
              </label>
              <select
                id="scan-dpi"
                value={dpi}
                onChange={(event) => setDpi(Number(event.target.value))}
                className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-ink focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
              >
                <option value={150}>150 DPI — Fast (CPU)</option>
                <option value={300}>300 DPI — Balanced (recommended)</option>
                <option value={600}>600 DPI — Highest quality</option>
              </select>
            </div>
            <p className="mt-3 text-center text-xs text-ink-faint">
              OCR runs on your server&apos;s CPU — higher DPI is slower but more accurate.
            </p>
          </div>
        )}

        {phase === 'scanning' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-200 bg-white p-10 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-500/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
            </div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>
              Scanning your document
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">
              {scanProgress}
            </p>
            <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-500" />
            </div>
            <p className="text-xs text-ink-faint">
              This can take a minute or two on CPU — keep this tab open.
            </p>
          </div>
        )}

        {phase === 'review' && (
          <div className="flex flex-col items-start gap-6 xl:flex-row">
            {/* Left: PDF page + overlay */}
            <div className="flex w-full min-w-0 flex-col gap-3 xl:flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  disabled={currentPage === 0}
                  className="btn-ghost btn-ghost--sm"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                <span className="text-sm font-medium text-ink-muted">
                  Page {currentPage + 1} / {Math.max(totalPages, 1)}
                </span>
                <button
                  type="button"
                  onClick={goNext}
                  disabled={currentPage >= Math.max(totalPages - 1, 0)}
                  className="btn-ghost btn-ghost--sm"
                >
                  <ChevronRight className="h-4 w-4" />
                  Next
                </button>
                <div className="flex-1" />
                <button
                  type="button"
                  onClick={toggleEditMode}
                  className={editMode ? 'btn-primary btn-primary--sm' : 'btn-ghost btn-ghost--sm'}
                  aria-pressed={editMode}
                >
                  <Pencil className="h-4 w-4" />
                  {editMode ? 'Edit mode: on' : 'Edit mode'}
                </button>
              </div>

              <div
                className="relative w-full overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm select-none dark:border-surface-800 dark:bg-surface-900"
                style={pageRatio ? { aspectRatio: String(pageRatio) } : undefined}
              >
                {isImage ? (
                  imageSrc && (
                    <img
                      src={imageSrc}
                      alt="Scanned page"
                      className="block h-auto w-full"
                      onLoad={(event) => {
                        const element = event.currentTarget;
                        if (element.naturalWidth > 0) {
                          setImageRatio(element.naturalWidth / element.naturalHeight);
                        }
                      }}
                    />
                  )
                ) : (
                  <div ref={pageContainerRef} className="w-full" />
                )}

                <DetectionOverlay
                  pageIndex={currentPage}
                  detections={visibleDetections}
                  detectionToItem={detectionToItem}
                  selectedItemId={selectedItemId}
                  hoveredItemId={hoveredItemId}
                  editMode={editMode}
                  drawRect={drawRect}
                  onSelect={handleSelectDetection}
                  onDrawStart={handleDrawStart}
                  onDrawMove={handleDrawMove}
                  onDrawEnd={handleDrawEnd}
                />

                {pageRendering && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-surface-50/60 dark:bg-surface-950/50">
                    <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
                  </div>
                )}
                {pageRenderError && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/80 p-6 text-center dark:bg-black/60">
                    <p className="text-sm font-medium text-error-600 dark:text-error-400">
                      {pageRenderError}
                    </p>
                  </div>
                )}

                {drawPending && drawPendingStyle && (
                  <div
                    className="absolute z-30"
                    style={{ left: drawPendingStyle.left, top: drawPendingStyle.top }}
                  >
                    <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary-300 bg-white p-2 shadow-lg dark:border-primary-700 dark:bg-surface-800">
                      <input
                        autoFocus
                        value={drawLabel}
                        onChange={(event) => setDrawLabel(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') commitManualItem();
                          if (event.key === 'Escape') setDrawPending(null);
                        }}
                        placeholder="Label (e.g. Student ID)"
                        aria-label="Label for the new box"
                        className="w-44 rounded-md border border-surface-200 bg-white px-2 py-1 text-sm text-ink placeholder:text-ink-faint focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
                      />
                      <button
                        type="button"
                        onClick={commitManualItem}
                        disabled={!drawLabel.trim()}
                        className="inline-flex shrink-0 items-center rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawPending(null)}
                        aria-label="Cancel new box"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-100 hover:text-ink-muted dark:hover:bg-surface-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-ink-faint">
                {editMode
                  ? 'Drag anywhere on the page to add a box for missed information.'
                  : 'Click a highlighted box to select its item. Hover an item to highlight its source.'}
              </p>
            </div>

            {/* Right: extracted items */}
            <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[400px]">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  Extracted information
                </h3>
                <span className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {items.length} item{items.length === 1 ? '' : 's'}
                </span>
              </div>
              <ExtractedItemList
                items={items}
                selectedItemId={selectedItemId}
                onSelect={handleSelectItem}
                onHover={setHoveredItemId}
                onChange={handleItemChange}
                onDelete={handleDeleteItem}
                onAdd={handleAddItem}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
