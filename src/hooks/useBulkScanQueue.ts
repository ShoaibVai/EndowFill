/**
 * hooks/useBulkScanQueue.ts — client-side bulk scan queue (flow 5).
 *
 * Many documents are OCR'd against the self-hosted backend one at a time:
 * the OCR model runs on the server CPU, so parallel requests would starve
 * each other. The queue therefore processes files STRICTLY SEQUENTIALLY:
 *
 *   queued → reading → scanning → extracting → done
 *                                        ↘ failed (retry → queued)
 *
 * The state machine is expressed purely in per-item statuses:
 *  - `start()` runs a loop that always picks the first `queued` item, so
 *    the loop itself is stateless and pause/resume/retry just re-enter it.
 *  - `pause()` stops the loop after the current file completes.
 *  - `retry(id)` re-queues a failed file and restarts the loop.
 *  - `remove(id)` / `clear()` drop items (the loop tolerates a missing
 *    current item — its completion patch simply matches nothing).
 *
 * The OCR endpoint returns one response per file, so per-file progress is
 * indeterminate (animated bar while reading/scanning/extracting) and the
 * queue exposes a global "Scanning file X of N (label)" label instead.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../utils/apiClient';
import { rasterizeFileToPages, type RasterPage } from '../utils/pdfRaster';
import { runOcr } from '../utils/aiChunk';
import type { ExtractResult, ExtractedItem, OcrResult } from '../types/scan.types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Per-file status in the bulk scan queue. */
export type BulkScanStatus = 'queued' | 'reading' | 'scanning' | 'extracting' | 'done' | 'failed';

/** One entry in the queue. */
export interface BulkQueueItem {
  id: string;
  file: File;
  status: BulkScanStatus;
  /** Human-readable failure reason (status === 'failed'). */
  error?: string;
  /** Extracted items (status === 'done'); may be empty when extraction found nothing. */
  items: ExtractedItem[];
  /** When the file finished scanning (ISO string). */
  scannedAt?: string;
}

/** Queue-level rollup for the header / badges. */
export interface BulkScanStats {
  total: number;
  done: number;
  failed: number;
  queued: number;
  active: number;
}

/** A file the user dropped/selected but that cannot be queued. */
export interface FileRejection {
  name: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Constants (mirror the backend /api/ai/ocr guards)
// ---------------------------------------------------------------------------

/** Matches the backend decode cap: 25 MiB per file (413 file_too_large). */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Hard cap so a runaway multi-select cannot build an unbounded queue. */
const MAX_QUEUE_FILES = 50;

/** Above this many queued files we warn about CPU-bound sequential OCR. */
export const LARGE_SET_WARNING_THRESHOLD = 8;

const ACCEPTED_MIME = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const ACCEPTED_NAME = /\.(pdf|png|jpe?g)$/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_MIME.has(file.type) || ACCEPTED_NAME.test(file.name);
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBulkScanQueue() {
  const [queue, setQueue] = useState<BulkQueueItem[]>([]);
  const [dpi, setDpi] = useState(300);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState('');

  // Refs keep the async runner loop free of stale closures.
  const queueRef = useRef<BulkQueueItem[]>([]);
  const runningRef = useRef(false);
  const pauseRef = useRef(false);
  const cancelRef = useRef(false);
  const dpiRef = useRef(300);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    dpiRef.current = dpi;
  }, [dpi]);

  const updateItem = useCallback((id: string, patch: Partial<BulkQueueItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  /** OCR + extract one file. Never throws: every failure lands on the item. */
  const processItem = useCallback(
    async (item: BulkQueueItem): Promise<void> => {
      setCurrentId(item.id);
      setProgressLabel(`Rasterizing ${item.file.name}…`);
      updateItem(item.id, { status: 'reading', error: undefined });

      let pages: RasterPage[];
      try {
        pages = await rasterizeFileToPages(item.file, dpiRef.current, setProgressLabel);
      } catch (error) {
        updateItem(item.id, { status: 'failed', error: describeError(error, 'Could not read the file.') });
        return;
      }
      if (cancelRef.current) {
        // Re-queue the interrupted file so Start can pick it up later.
        updateItem(item.id, { status: 'queued' });
        return;
      }

      setProgressLabel(`Running OCR on ${item.file.name} (${dpiRef.current} DPI)…`);
      updateItem(item.id, { status: 'scanning' });

      let ocr: OcrResult;
      try {
        ocr = await runOcr(pages, {
          dpi: dpiRef.current,
          filename: item.file.name,
          onChunkProgress: (label) => setProgressLabel(label),
        });
      } catch (error) {
        updateItem(item.id, { status: 'failed', error: describeError(error, 'OCR failed for this file.') });
        return;
      }
      if (cancelRef.current) {
        updateItem(item.id, { status: 'queued' });
        return;
      }

      setProgressLabel(`Extracting information from ${item.file.name}…`);
      updateItem(item.id, { status: 'extracting' });

      let items: ExtractedItem[] = [];
      try {
        const response = await api.post<ExtractResult>('/ai/extract', { ocrResult: ocr });
        items = Array.isArray(response.items) ? response.items : [];
      } catch (error) {
        // Extraction is a best-effort enrichment (same as AIScanPage): the
        // file stays "done" so the user can still send it or retry.
        console.warn('[useBulkScanQueue] extraction failed; continuing without items', error);
      }
      if (cancelRef.current) {
        updateItem(item.id, { status: 'queued' });
        return;
      }

      updateItem(item.id, { status: 'done', items, scannedAt: new Date().toISOString() });
    },
    [updateItem]
  );

  /** Run the loop while queued items exist, honoring pause/cancel refs. */
  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    cancelRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);

    try {
      while (!cancelRef.current && !pauseRef.current) {
        const next = queueRef.current.find((item) => item.status === 'queued');
        if (!next) break;
        const position = queueRef.current.findIndex((item) => item.id === next.id);
        setProgressLabel(
          `Scanning file ${Math.max(position, 0) + 1} of ${queueRef.current.length} (${next.file.name})…`
        );
        await processItem(next);
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
      setCurrentId(null);
      setProgressLabel('');
    }
  }, [processItem]);

  const addFiles = useCallback((files: File[]): { added: number; rejected: FileRejection[] } => {
    const existing = queueRef.current;
    const rejected: FileRejection[] = [];
    const additions: BulkQueueItem[] = [];

    for (const file of files) {
      if (!isAcceptedFile(file)) {
        rejected.push({ name: file.name, reason: 'Unsupported type — upload PDF, PNG or JPG.' });
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push({
          name: file.name,
          reason: `Larger than ${MAX_FILE_BYTES / (1024 * 1024)} MiB — the OCR server rejects it.`,
        });
        continue;
      }
      if (existing.length + additions.length >= MAX_QUEUE_FILES) {
        rejected.push({ name: file.name, reason: `Queue is full (${MAX_QUEUE_FILES} files max).` });
        continue;
      }
      additions.push({
        id: `bulk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        status: 'queued',
        items: [],
      });
    }

    if (additions.length > 0) {
      setQueue((prev) => [...prev, ...additions]);
    }
    return { added: additions.length, rejected };
  }, []);

  const start = useCallback(() => {
    void run();
  }, [run]);

  const pause = useCallback(() => {
    if (!runningRef.current) return;
    pauseRef.current = true;
    setIsPaused(true);
    setProgressLabel('Pausing after the current file…');
  }, []);

  const resume = useCallback(() => {
    pauseRef.current = false;
    setIsPaused(false);
    void run();
  }, [run]);

  /** Stop after the current file; queued files stay queued so Start re-runs them. */
  const cancel = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
  }, []);

  const retry = useCallback(
    (id: string) => {
      updateItem(id, { status: 'queued', error: undefined });
      if (!isPaused) void run();
    },
    [isPaused, run, updateItem]
  );

  const remove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);
    setQueue([]);
    setCurrentId(null);
    setProgressLabel('');
  }, []);

  const stats = useMemo<BulkScanStats>(() => {
    const rollup: BulkScanStats = { total: 0, done: 0, failed: 0, queued: 0, active: 0 };
    for (const item of queue) {
      rollup.total += 1;
      if (item.status === 'done') rollup.done += 1;
      else if (item.status === 'failed') rollup.failed += 1;
      else if (item.status === 'queued') rollup.queued += 1;
      else rollup.active += 1;
    }
    return rollup;
  }, [queue]);

  const currentIndex = queue.findIndex((item) => item.id === currentId);

  return {
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
  };
}
