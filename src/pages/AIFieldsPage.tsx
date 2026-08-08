/**
 * AIFieldsPage.tsx — DetectedFieldsReview: form scan → fillable PDF (flow 2).
 *
 * 1. Upload a form PDF (.pdf).
 * 2. POST /api/ai/detect-fields → labeled text/checkbox/image/signature fields
 *    with page-relative bboxes.
 * 3. Review: rendered pages with color-coded clickable field boxes on the
 *    left, an editable fields list on the right (label, type, checkbox
 *    options, delete). Draw mode adds missed fields on the page.
 * 4. "Generate fillable PDF": converts the reviewed fields into a pdfme
 *    Designer template (components/scan/FieldToSchema.ts), saves it as a
 *    workspace template via TemplateService.createTemplate when a workspace
 *    is active, then opens the Designer with the fields placed. Without a
 *    workspace the Designer opens locally (not saved) and the schema can be
 *    exported as JSON.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  ListChecks,
  Loader2,
  Pencil,
  RefreshCw,
  Upload,
  WandSparkles,
  X,
} from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { runDetectFields } from '../utils/aiChunk';
import {
  bboxToOverlayStyle,
  clamp01,
  disposePdf,
  loadPdfFromBytes,
  renderPageToCanvas,
} from '../utils/pdfViewer';
import { base64ToArrayBuffer } from '../utils/bufferUtils';
import { rasterizeFileToPages } from '../utils/pdfRaster';
import { FieldOverlay } from '../components/scan/FieldOverlay';
import { FIELD_TYPE_STYLES } from '../components/scan/fieldTypeStyles';
import { DetectedFieldList } from '../components/scan/DetectedFieldList';
import { PageHeader } from '../components/ui/PageHeader';
import {
  buildTemplateFromFields,
  type PageSizePt,
} from '../components/scan/FieldToSchema';
import { TemplateService } from '../services/template.service';
import { useAppStore } from '../store/useAppStore';
import type {
  DetectedField,
  DetectedFieldType,
  FieldPatch,
  FieldsExportPayload,
  OcrBBox,
  ReviewField,
} from '../types/scan.types';

const ACCEPTED_EXTENSIONS = '.pdf,application/pdf';
const MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

type Phase = 'upload' | 'detecting' | 'review';

const FIELD_TYPE_OPTIONS: { value: DetectedFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'image', label: 'Image' },
  { value: 'signature', label: 'Signature' },
];

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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isKnownFieldType(value: unknown): value is DetectedFieldType {
  return (
    typeof value === 'string' &&
    (value === 'text' || value === 'checkbox' || value === 'image' || value === 'signature')
  );
}

/** Sanitize API fields into stable, clamped, id-able review entries. */
function normalizeFields(raw: DetectedField[], pageCount: number): ReviewField[] {
  return (Array.isArray(raw) ? raw : []).map((field, index) => {
    const pageIndex = Math.max(0, Math.min(field.pageIndex ?? 0, Math.max(pageCount - 1, 0)));
    const bbox: OcrBBox = {
      x: clamp01(field.bbox?.x ?? 0),
      y: clamp01(field.bbox?.y ?? 0),
      width: clamp01(field.bbox?.width ?? 0),
      height: clamp01(field.bbox?.height ?? 0),
    };
    return {
      id: `field-${pageIndex}-${index}-${round3(bbox.x)}-${round3(bbox.y)}`,
      label: (field.label ?? '').trim() || 'Untitled field',
      fieldType: isKnownFieldType(field.fieldType) ? field.fieldType : 'text',
      pageIndex,
      bbox,
      options: Array.isArray(field.options) ? field.options.map((option) => String(option)) : undefined,
      hint: field.hint,
    };
  });
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function AIFieldsPage() {
  // ── Store ──
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const setBasePdfBuffer = useAppStore((s) => s.setBasePdfBuffer);
  const setPdfFileName = useAppStore((s) => s.setPdfFileName);
  const setPdfmeTemplate = useAppStore((s) => s.setPdfmeTemplate);
  const setSchemaFields = useAppStore((s) => s.setSchemaFields);
  const setFieldBindings = useAppStore((s) => s.setFieldBindings);
  const setValidationRules = useAppStore((s) => s.setValidationRules);
  const setConditionalRules = useAppStore((s) => s.setConditionalRules);
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);
  const addNotification = useAppStore((s) => s.addNotification);

  // ── Upload / detect state ──
  const [phase, setPhase] = useState<Phase>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [dpi, setDpi] = useState(300);
  const [fields, setFields] = useState<ReviewField[]>([]);
  const [detectError, setDetectError] = useState<string | null>(null);
  const [detectProgress, setDetectProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── Review state ──
  const [currentPage, setCurrentPage] = useState(0);
  const [pageRatios, setPageRatios] = useState<number[]>([]);
  const [pageSizesPt, setPageSizesPt] = useState<PageSizePt[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [hoveredFieldId, setHoveredFieldId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [drawRect, setDrawRect] = useState<OcrBBox | null>(null);
  const [drawPending, setDrawPending] = useState<OcrBBox | null>(null);
  const [drawLabel, setDrawLabel] = useState('');
  const [drawType, setDrawType] = useState<DetectedFieldType>('text');
  const [pageRendering, setPageRendering] = useState(false);
  const [pageRenderError, setPageRenderError] = useState<string | null>(null);

  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelledRef = useRef(false);

  const totalPages = Math.max(pageRatios.length, pageSizesPt.length);
  const pageRatio = pageRatios[currentPage] ?? null;

  // ── Detect pipeline ────────────────────────────────────────────────────────

  const runDetect = useCallback(async (target: File, targetDpi: number) => {
    cancelledRef.current = false;
    setDetectError(null);
    setPhase('detecting');
    setDetectProgress('Reading file…');

    try {
      const base64 = await readFileAsBase64(target);
      if (cancelledRef.current) return;
      setFileBase64(base64);

      setDetectProgress(`Rasterizing pages (${targetDpi} DPI)…`);
      const pages = await rasterizeFileToPages(target, targetDpi, setDetectProgress);
      if (cancelledRef.current) return;

      setDetectProgress(`Detecting form fields (${targetDpi} DPI)…`);
      const result = await runDetectFields(
        pages,
        targetDpi,
        (label) => setDetectProgress(label)
      );
      if (cancelledRef.current) return;

      const pdf = await loadPdfFromBytes(base64ToArrayBuffer(base64));
      if (cancelledRef.current) {
        disposePdf(pdf);
        return;
      }
      if (pdfRef.current) disposePdf(pdfRef.current);
      pdfRef.current = pdf;

      const ratios: number[] = [];
      const sizes: PageSizePt[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        ratios.push(viewport.width / viewport.height);
        sizes.push({ width: viewport.width, height: viewport.height });
        page.cleanup();
      }
      setPageRatios(ratios);
      setPageSizesPt(sizes);
      setFields(normalizeFields(result.fields ?? [], sizes.length));
      setCurrentPage(0);
      setSelectedFieldId(null);
      setHoveredFieldId(null);
      setEditMode(false);
      setPhase('review');
    } catch (error) {
      if (cancelledRef.current) return;
      setDetectError(error instanceof Error ? error.message : 'Detection failed. Please try again.');
      setPhase('upload');
    }
  }, []);

  const handleFile = useCallback(
    (next: File | null) => {
      if (!next) return;
      const typeOk = next.type === 'application/pdf' || /\.pdf$/i.test(next.name);
      if (!typeOk) {
        setDetectError('Unsupported file type. Please upload a PDF form.');
        return;
      }
      if (next.size > MAX_FILE_BYTES) {
        setDetectError('File is larger than 50 MB. Please upload a smaller form.');
        return;
      }
      setDetectError(null);
      setFile(next);
      void runDetect(next, dpi);
    },
    [dpi, runDetect]
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
    void runDetect(file, dpi);
  }, [dpi, file, runDetect]);

  const handleNewScan = useCallback(() => {
    cancelledRef.current = true;
    if (pdfRef.current) {
      disposePdf(pdfRef.current);
      pdfRef.current = null;
    }
    setPhase('upload');
    setFile(null);
    setFileBase64(null);
    setFields([]);
    setCurrentPage(0);
    setPageRatios([]);
    setPageSizesPt([]);
    setSelectedFieldId(null);
    setHoveredFieldId(null);
    setEditMode(false);
    setDrawRect(null);
    setDrawPending(null);
    setDetectError(null);
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
    if (phase !== 'review' || !pdfRef.current || !pageContainerRef.current) return;
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
        console.error('[AIFieldsPage] page render failed', error);
        setPageRenderError('Could not render this page.');
        setPageRendering(false);
      });
    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [currentPage, phase]);

  // ── Field callbacks ────────────────────────────────────────────────────────

  const handleFieldChange = useCallback((id: string, patch: FieldPatch) => {
    setFields((prev) => prev.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }, []);

  const handleDeleteField = useCallback(
    (id: string) => {
      setFields((prev) => prev.filter((field) => field.id !== id));
      if (selectedFieldId === id) setSelectedFieldId(null);
    },
    [selectedFieldId]
  );

  const handleSelectField = useCallback(
    (id: string | null) => {
      setSelectedFieldId(id);
      setHoveredFieldId(null);
      if (!id) return;
      const field = fields.find((entry) => entry.id === id);
      if (!field) return;
      if (field.pageIndex !== currentPage) setCurrentPage(field.pageIndex);
      // The page container keeps a fixed aspect ratio, so the box element is
      // laid out on the same commit as the page switch — scroll to it next frame.
      window.requestAnimationFrame(() => {
        document.getElementById(`field-box-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [currentPage, fields]
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
    setDrawType('text');
  }, []);

  const commitManualField = useCallback(() => {
    if (!drawPending) return;
    const label = drawLabel.trim() || 'Untitled field';
    const field: ReviewField = {
      id: `field-manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      fieldType: drawType,
      pageIndex: currentPage,
      bbox: drawPending,
      options: drawType === 'checkbox' ? [] : undefined,
    };
    setFields((prev) => [...prev, field]);
    setDrawPending(null);
    setDrawLabel('');
    setSelectedFieldId(field.id);
  }, [currentPage, drawLabel, drawPending, drawType]);

  const toggleEditMode = useCallback(() => {
    setEditMode((enabled) => !enabled);
    setDrawRect(null);
    setDrawPending(null);
  }, []);

  const goPrev = useCallback(() => setCurrentPage((page) => Math.max(0, page - 1)), []);
  const goNext = useCallback(
    () => setCurrentPage((page) => Math.min(Math.max(totalPages - 1, 0), page + 1)),
    [totalPages]
  );

  // ── Export / handoff to the pdfme Designer ─────────────────────────────────

  const buildTemplate = useCallback(() => {
    if (!fileBase64) return null;
    return buildTemplateFromFields(fields, pageSizesPt);
  }, [fields, fileBase64, pageSizesPt]);

  /** Populate the editor store with the built template (shared by save paths). */
  const openInEditor = useCallback(
    (build: ReturnType<typeof buildTemplateFromFields>, basePdf: ArrayBuffer) => {
      setBasePdfBuffer(basePdf);
      setPdfFileName(file?.name ?? 'form.pdf');
      setPdfmeTemplate({ basePdf, schemas: build.schemas });
      setSchemaFields(build.schemaFields);
      setFieldBindings([]);
      setValidationRules([]);
      setConditionalRules([]);
      setActiveTab('editor');
    },
    [
      file,
      setActiveTab,
      setBasePdfBuffer,
      setConditionalRules,
      setFieldBindings,
      setPdfFileName,
      setPdfmeTemplate,
      setSchemaFields,
      setValidationRules,
    ]
  );

  const handleGenerate = useCallback(async () => {
    if (!file || !fileBase64) return;
    const build = buildTemplate();
    if (!build) return;
    const basePdf = base64ToArrayBuffer(fileBase64);
    const name = file.name.replace(/\.pdf$/i, '') || 'Form Template';

    if (activeWorkspaceId) {
      setSaving(true);
      try {
        const created = await TemplateService.createTemplate(activeWorkspaceId, {
          name,
          description: `AI-detected fillable form from ${file.name}`,
          lastModified: Date.now(),
          pdfFileName: file.name,
          basePdf,
          templateSchemas: build.schemas,
          schemaFields: build.schemaFields,
          fieldBindings: [],
          validationRules: [],
          conditionalRules: [],
          snapshots: [],
        });
        // Mark the template as the current project BEFORE touching the store,
        // so the auto-save hook updates it instead of creating a duplicate.
        setCurrentProjectId(created.id);
        openInEditor(build, basePdf);
        setHasUnsavedChanges(false);
        addNotification({ message: `Fillable PDF saved: ${created.name}`, level: 'success' });
      } catch (error) {
        console.error('[AIFieldsPage] failed to save template', error);
        addNotification({
          message: error instanceof Error ? error.message : 'Failed to save the template.',
          level: 'error',
        });
      } finally {
        setSaving(false);
      }
    } else {
      // No workspace active: open the Designer locally (not persisted).
      openInEditor(build, basePdf);
      setHasUnsavedChanges(false);
      addNotification({
        message: 'Opened in the editor — no workspace selected, so it was not saved. Export the schema JSON to keep it.',
        level: 'warning',
      });
    }
  }, [
    activeWorkspaceId,
    addNotification,
    buildTemplate,
    file,
    fileBase64,
    openInEditor,
    setCurrentProjectId,
    setHasUnsavedChanges,
  ]);

  const handleExportJson = useCallback(() => {
    const build = buildTemplate();
    const payload: FieldsExportPayload = {
      fileName: file?.name ?? 'form',
      dpi,
      exportedAt: new Date().toISOString(),
      pageCount: totalPages,
      fields,
      templateSchemas: build?.schemas ?? [],
      schemaFields: build?.schemaFields ?? [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(file?.name ?? 'form').replace(/\.[^.]+$/, '')}-fields-review.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [buildTemplate, dpi, fields, file, totalPages]);

  const drawPendingStyle = drawPending ? bboxToOverlayStyle(drawPending) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 animate-fade-in">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* Header */}
        <PageHeader
          ai
          icon={<WandSparkles className="h-5 w-5" />}
          title="AI Form Fields"
          subtitle="Scan a form PDF — review, fix, and add fields to make it fillable."
          actions={
            phase === 'review' && (
              <div className="flex items-center gap-2">
                <button type="button" onClick={handleRetry} className="btn-ghost btn-ghost--sm">
                  <RefreshCw className="h-4 w-4" />
                  Rescan
                </button>
                <button type="button" onClick={handleExportJson} className="btn-ghost btn-ghost--sm">
                  <Download className="h-4 w-4" />
                  Export JSON
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={saving || fields.length === 0}
                  className="btn-primary btn-primary--sm"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <WandSparkles className="h-4 w-4" />
                  )}
                  Generate fillable PDF
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
            {detectError && (
              <div
                className="mb-5 flex items-start gap-3 rounded-xl border border-error-200 bg-error-50 p-4 dark:border-error-500/30 dark:bg-error-500/10"
                role="alert"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error-600 dark:text-error-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-error-700 dark:text-error-300">
                    Detection failed
                  </p>
                  <p className="mt-0.5 text-sm text-error-600 dark:text-error-400">{detectError}</p>
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
                Drop your form PDF here, or click to browse
              </h3>
              <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
                PDF only — up to 50 MB
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
              <label htmlFor="fields-dpi" className="text-sm font-medium text-ink-muted dark:text-surface-300">
                Detection detail
              </label>
              <select
                id="fields-dpi"
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
              Detection runs on your server&apos;s CPU — higher DPI is slower but more accurate.
            </p>
          </div>
        )}

        {phase === 'detecting' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-surface-200 bg-white p-10 dark:border-surface-800 dark:bg-surface-900">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-500/10">
              <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
            </div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-main)' }}>
              Detecting form fields
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }} role="status">
              {detectProgress}
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
                  {editMode ? 'Draw mode: on' : 'Draw mode'}
                </button>
              </div>

              {/* Type legend */}
              <div className="flex flex-wrap items-center gap-3">
                {Object.entries(FIELD_TYPE_STYLES).map(([type, style]) => (
                  <span key={type} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: style.chip }} />
                    {style.label}
                  </span>
                ))}
              </div>

              <div
                className="relative w-full overflow-hidden rounded-xl border border-surface-200 bg-white shadow-sm select-none dark:border-surface-800 dark:bg-surface-900"
                style={pageRatio ? { aspectRatio: String(pageRatio) } : undefined}
              >
                <div ref={pageContainerRef} className="w-full" />

                <FieldOverlay
                  pageIndex={currentPage}
                  fields={fields}
                  selectedFieldId={selectedFieldId}
                  hoveredFieldId={hoveredFieldId}
                  editMode={editMode}
                  drawRect={drawRect}
                  onSelect={handleSelectField}
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
                          if (event.key === 'Enter') commitManualField();
                          if (event.key === 'Escape') setDrawPending(null);
                        }}
                        placeholder="Label (e.g. Full name)"
                        aria-label="Label for the new field"
                        className="w-40 rounded-md border border-surface-200 bg-white px-2 py-1 text-sm text-ink placeholder:text-ink-faint focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
                      />
                      <select
                        value={drawType}
                        onChange={(event) => setDrawType(event.target.value as DetectedFieldType)}
                        aria-label="Type for the new field"
                        className="rounded-md border border-surface-200 bg-white px-1.5 py-1 text-sm text-ink focus:border-primary-400 focus:outline-none dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100"
                      >
                        {FIELD_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={commitManualField}
                        disabled={!drawLabel.trim()}
                        className="inline-flex shrink-0 items-center rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrawPending(null)}
                        aria-label="Cancel new field"
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
                  ? 'Drag anywhere on the page to add a missed field.'
                  : 'Click a highlighted box to select its field. Hover a field to highlight its box.'}
              </p>
            </div>

            {/* Right: detected fields */}
            <div className="flex w-full shrink-0 flex-col gap-3 xl:w-[400px]">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold" style={{ color: 'var(--text-main)' }}>
                  Form fields
                </h3>
                <span className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                  <ListChecks className="mr-1 h-3 w-3" />
                  {fields.length} field{fields.length === 1 ? '' : 's'}
                </span>
              </div>
              <DetectedFieldList
                fields={fields}
                selectedFieldId={selectedFieldId}
                onSelect={handleSelectField}
                onHover={setHoveredFieldId}
                onChange={handleFieldChange}
                onDelete={handleDeleteField}
                onAddField={toggleEditMode}
                editMode={editMode}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
