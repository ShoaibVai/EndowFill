/**
 * components/bulk/BulkScanPanel.tsx — bulk scan queue UI (flow 5).
 *
 * Multi-file upload (drag-drop + browse) → sequential OCR/extract queue:
 *   - per-file status (queued → reading/scanning/extracting → done/failed),
 *   - per-file indeterminate progress (the OCR API returns one response per
 *     file, so there is nothing to measure against until it resolves),
 *   - global "Scanning file X of N (label)" header while the queue runs,
 *   - pause (stop after the current file) / resume / retry failed / remove,
 *   - collapsible per-file results (label/value/category/confidence),
 *   - export ALL results as one JSON array of {filename, items},
 *   - "Send to Bulk Generate": writes every file's items into the store and
 *     navigates to the Bulk Generate tab.
 *
 * Sequential processing is deliberate: the OCR model runs on the server CPU,
 * so the queue never issues parallel OCR requests.
 */

import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Files,
  Layers,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import {
  LARGE_SET_WARNING_THRESHOLD,
  MAX_FILE_BYTES,
  useBulkScanQueue,
} from '../../hooks/useBulkScanQueue';
import type { FileRejection } from '../../hooks/useBulkScanQueue';
import type { BulkScanResult, ExtractedItem } from '../../types/scan.types';

const ACCEPTED_EXTENSIONS = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const tone =
    confidence >= 0.8
      ? 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400'
      : confidence >= 0.6
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
        : 'bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
      title="Extraction confidence"
    >
      {percent}%
    </span>
  );
}

/** One collapsible file result: filename header + item list. */
function FileResult({
  filename,
  items,
  defaultOpen,
}: {
  filename: string;
  items: ExtractedItem[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className="rounded-xl border transition-colors"
      style={{ border: '1px solid var(--border-subtle)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
        )}
        <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--color-primary-500)' }} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: 'var(--text-main)' }}>
          {filename}
        </span>
        <span
          className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-bold"
          style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}
        >
          {items.length} item{items.length === 1 ? '' : 's'}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-3">
          {items.length === 0 ? (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--bg-inset)', color: 'var(--text-muted)' }}>
              No items extracted for this file.
            </p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
              >
                <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--text-main)' }}>
                  {item.label || 'Untitled'}
                </span>
                <span className="min-w-0 flex-1 truncate text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                  {item.value || '—'}
                </span>
                <span className="hidden shrink-0 text-[10px] uppercase tracking-wide sm:inline" style={{ color: 'var(--text-muted)' }}>
                  {item.category}
                </span>
                <ConfidenceBadge confidence={item.confidence} />
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function BulkScanPanel() {
  const setBulkExtractedResults = useAppStore((s) => s.setBulkExtractedResults);
  const setExtractedItems = useAppStore((s) => s.setExtractedItems);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const addNotification = useAppStore((s) => s.addNotification);

  const {
    queue,
    dpi,
    setDpi,
    isRunning,
    isPaused,
    currentId,
    currentIndex,
    progressLabel,
    stats,
    addFiles,
    start,
    pause,
    resume,
    cancel,
    retry,
    remove,
    clear,
  } = useBulkScanQueue();

  const [dragOver, setDragOver] = useState(false);
  const [rejections, setRejections] = useState<FileRejection[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      const result = addFiles(files);
      setRejections(result.rejected);
      if (result.added > 0 && result.rejected.length > 0) {
        addNotification({
          message: `${result.added} file(s) queued; ${result.rejected.length} rejected.`,
          level: 'warning',
        });
      }
    },
    [addFiles, addNotification]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      handleFiles(Array.from(event.dataTransfer.files));
    },
    [handleFiles]
  );

  const handleInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(Array.from(event.target.files ?? []));
      event.target.value = '';
    },
    [handleFiles]
  );

  const handleSendToBulkGenerate = useCallback(() => {
    const done = queue.filter((item) => item.status === 'done');
    if (done.length === 0) {
      addNotification({ message: 'No scanned files to send yet.', level: 'warning' });
      return;
    }
    const results: BulkScanResult[] = done.map((item) => ({
      filename: item.file.name,
      items: item.items,
      scannedAt: item.scannedAt,
    }));
    setBulkExtractedResults(results);
    // Mirror the first file into the legacy single-record source so the
    // Bulk Generate tab has data the moment it mounts.
    setExtractedItems(results[0]?.items ?? []);
    setActiveTab('generate');
    addNotification({ message: `${results.length} scanned file(s) sent to Bulk Generate.`, level: 'success' });
  }, [queue, setBulkExtractedResults, setExtractedItems, setActiveTab, addNotification]);

  const handleExportAll = useCallback(() => {
    const done = queue.filter((item) => item.status === 'done');
    if (done.length === 0) return;
    const payload: BulkScanResult[] = done.map((item) => ({
      filename: item.file.name,
      items: item.items,
      scannedAt: item.scannedAt,
    }));
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `bulk-scan-results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [queue]);

  const showLargeSetWarning = stats.total > LARGE_SET_WARNING_THRESHOLD;
  const showQueueControls = stats.total > 0;
  const showResults = stats.done > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Upload / queue controls ─────────────────────────────────── */}
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
          Drop documents here, or click to browse
        </h3>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
          PDF, PNG or JPG — up to {MAX_FILE_BYTES / (1024 * 1024)} MiB per file. Files are scanned
          one at a time on your server&apos;s CPU.
        </p>
      </div>

      {/* Controls row — outside the drop zone */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <label htmlFor="bulk-scan-dpi" className="text-sm font-medium text-ink-muted dark:text-surface-300">
          OCR detail
        </label>
        <select
          id="bulk-scan-dpi"
          value={dpi}
          onChange={(event) => setDpi(Number(event.target.value))}
          disabled={isRunning}
          className="rounded-lg border border-surface-300 bg-white px-3 py-1.5 text-sm font-medium text-ink focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
        >
          <option value={150}>150 DPI — Fast (CPU)</option>
          <option value={300}>300 DPI — Balanced (recommended)</option>
          <option value={600}>600 DPI — Highest quality</option>
        </select>
        <button
          type="button"
          className="btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isRunning}
        >
          <Files className="h-4 w-4" />
          Choose files
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        multiple
        className="hidden"
        onChange={handleInputChange}
      />

      {/* Rejections (files that could not be queued) */}
      {rejections.length > 0 && (
        <div
          className="flex flex-col gap-2 rounded-xl border border-error-200 bg-error-50 p-4 dark:border-error-500/30 dark:bg-error-500/10"
          role="alert"
        >
          {rejections.map((rejection) => (
            <div key={`${rejection.name}-${rejection.reason}`} className="flex items-start gap-2 text-sm">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error-600 dark:text-error-400" />
              <p className="min-w-0 flex-1 text-error-700 dark:text-error-300">
                <span className="font-semibold">{rejection.name}</span> — {rejection.reason}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Large-set warning: OCR is CPU-bound and sequential. */}
      {showLargeSetWarning && (
        <div
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10"
          role="note"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 text-sm text-amber-800 dark:text-amber-200">
            <p className="font-semibold">Large batch detected ({stats.total} files).</p>
            <p className="mt-0.5 text-amber-700 dark:text-amber-300">
              OCR runs sequentially on your server&apos;s CPU, so this will take a while. Consider
              scanning in batches of {LARGE_SET_WARNING_THRESHOLD} files — you can send each batch
              to Bulk Generate as you go.
            </p>
          </div>
        </div>
      )}

      {/* ── Queue ───────────────────────────────────────────────────── */}
      {showQueueControls && (
        <div className="card flex flex-col gap-4 p-6" style={{ border: '1px solid var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
                Scan queue
              </h3>
              <p className="mt-0.5 text-sm" style={{ color: 'var(--text-muted)' }} role="status">
                {isRunning && currentIndex >= 0 ? progressLabel : isPaused ? 'Paused — resume to continue.' : `${stats.total} file(s) queued`}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isRunning && !isPaused && stats.queued > 0 && (
                <button type="button" className="btn-primary btn-primary--sm" onClick={start}>
                  <Play className="h-4 w-4" />
                  Start scan
                </button>
              )}
              {isRunning && (
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={pause}>
                  <Pause className="h-4 w-4" />
                  Pause
                </button>
              )}
              {isPaused && (
                <button type="button" className="btn-primary btn-primary--sm" onClick={resume}>
                  <Play className="h-4 w-4" />
                  Resume
                </button>
              )}
              {(isRunning || isPaused) && (
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={cancel}>
                  <X className="h-4 w-4" />
                  Stop
                </button>
              )}
              {!isRunning && !isPaused && stats.total > 0 && (
                <button type="button" className="btn-ghost btn-ghost--sm" onClick={clear}>
                  <Trash2 className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Global indeterminate progress while running */}
          {isRunning && (
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800"
              role="progressbar"
              aria-label="Bulk scan progress"
            >
              <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-500" />
            </div>
          )}

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold"
              style={{ background: 'var(--bg-inset)', color: 'var(--text-muted)' }}
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
              {stats.done} done
            </span>
            {stats.failed > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold"
                style={{ background: 'var(--color-error-50)', color: 'var(--color-error-600)' }}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {stats.failed} failed
              </span>
            )}
            {stats.queued > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold"
                style={{ background: 'var(--bg-inset)', color: 'var(--text-muted)' }}
              >
                <Layers className="h-3.5 w-3.5" />
                {stats.queued} queued
              </span>
            )}
            {stats.active > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold"
                style={{ background: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {stats.active} active
              </span>
            )}
          </div>

          {/* Per-file rows */}
          <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
            {queue.map((item) => {
              const isActive = item.id === currentId;
              const inProgress = item.status === 'reading' || item.status === 'scanning' || item.status === 'extracting';
              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: 'var(--text-main)' }}>
                        {item.file.name}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {formatBytes(item.file.size)}
                        {item.items.length > 0 && item.status === 'done'
                          ? ` • ${item.items.length} items`
                          : ''}
                      </p>
                    </div>

                    {/* Status badge / actions */}
                    {item.status === 'done' && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success-50 px-2 py-0.5 text-xs font-bold text-success-600 dark:bg-success-500/10 dark:text-success-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Done
                      </span>
                    )}
                    {item.status === 'failed' && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-error-50 px-2 py-0.5 text-xs font-bold text-error-600 dark:bg-error-500/10 dark:text-error-400">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Failed
                      </span>
                    )}
                    {inProgress && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-600 dark:bg-primary-500/10 dark:text-primary-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {item.status === 'reading' ? 'Reading' : item.status === 'scanning' ? 'OCR…' : 'Extracting…'}
                      </span>
                    )}
                    {item.status === 'queued' && (
                      <span
                        className="inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-xs font-bold"
                        style={{ background: 'var(--bg-inset)', color: 'var(--text-muted)' }}
                      >
                        Queued
                      </span>
                    )}

                    <div className="flex shrink-0 items-center gap-1">
                      {item.status === 'failed' && (
                        <button
                          type="button"
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => retry(item.id)}
                          disabled={isRunning}
                          aria-label={`Retry ${item.file.name}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => remove(item.id)}
                        disabled={isRunning}
                        aria-label={`Remove ${item.file.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Per-file indeterminate progress while active */}
                  {inProgress && (
                    <div
                      className="h-1 w-full overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800"
                      role="progressbar"
                      aria-label={`Scanning ${item.file.name}`}
                    >
                      <div className="h-full w-1/2 animate-pulse rounded-full bg-primary-500" />
                    </div>
                  )}
                  {isActive && !inProgress && (
                    <div className="h-1 w-full overflow-hidden rounded-full bg-surface-100 dark:bg-surface-800" />
                  )}

                  {item.status === 'failed' && item.error && (
                    <p className="text-xs" style={{ color: 'var(--color-error-600)' }} role="alert">
                      {item.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Results ─────────────────────────────────────────────────── */}
      {showResults && (
        <div className="card flex flex-col gap-4 p-6" style={{ border: '1px solid var(--border-subtle)' }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold" style={{ color: 'var(--text-main)' }}>
                Scan results
              </h3>
              <span
                className="inline-flex items-center rounded-md bg-primary-50 px-2 py-0.5 text-xs font-bold text-primary-600 dark:bg-primary-500/10 dark:text-primary-400"
              >
                {stats.done} file{stats.done === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-ghost btn-ghost--sm" onClick={handleExportAll}>
                <Download className="h-4 w-4" />
                Export all JSON
              </button>
              <button type="button" className="btn-primary btn-primary--sm" onClick={handleSendToBulkGenerate}>
                <Send className="h-4 w-4" />
                Send to Bulk Generate
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {queue
              .filter((item) => item.status === 'done')
              .map((item, index) => (
                <FileResult
                  key={item.id}
                  filename={item.file.name}
                  items={item.items}
                  defaultOpen={index === 0}
                />
              ))}
          </div>

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <Zap className="mr-1 inline h-3.5 w-3.5" />
            Send to Bulk Generate maps every scanned file to your template — one PDF per file, zipped
            together.
          </p>
        </div>
      )}
    </div>
  );
}
