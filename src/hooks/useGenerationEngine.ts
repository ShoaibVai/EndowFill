import { useCallback, useRef } from 'react';
import { zipSync } from 'fflate';
import { useAppStore } from '../store/useAppStore';
import type { GenerateJobData, GenerateJobResult, IFieldValidationError } from '../workers/pdfGenerator.worker';
import { StorageService, type PDFProject } from '../services/storage.service';
import { arrayBufferToBase64 } from '../utils/bufferUtils';

// Define the worker script import for Vite
import PdfWorker from '../workers/pdfGenerator.worker?worker';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function useGenerationEngine() {
  const pdfmeTemplate = useAppStore((s) => s.pdfmeTemplate);
  const excelRows = useAppStore((s) => s.excelRows);
  const excelColumns = useAppStore((s) => s.excelColumns);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const validationRules = useAppStore((s) => s.validationRules || []);
  const conditionalRules = useAppStore((s) => s.conditionalRules || []);
  
  const generationJob = useAppStore((s) => s.generationJob);
  const setGenerationJob = useAppStore((s) => s.setGenerationJob);
  const addNotification = useAppStore((s) => s.addNotification);

  // Keep track of active workers and accumulated PDF buffers
  const workersRef = useRef<Worker[]>([]);
  const buffersRef = useRef<Record<string, Uint8Array>>({});
  const jobsRef = useRef<GenerateJobData[]>([]);
  const cursorRef = useRef(0);
  const completedCountRef = useRef(0);
  const totalRowsRef = useRef(0);
  const activeJobIdRef = useRef<string | null>(null);
  const pausedRef = useRef(false);

  const dispatchNext = useCallback((worker: Worker, jobId: string) => {
    if (pausedRef.current) return;
    if (cursorRef.current >= totalRowsRef.current) return;

    const idx = cursorRef.current;
    const job = jobsRef.current[idx];

    const prev = useAppStore.getState().generationJob;
    if (prev && prev.id === jobId) {
      const rows = [...prev.rows];
      rows[idx] = { ...rows[idx], status: 'running' };
      setGenerationJob({ ...prev, rows });
    }

    worker.postMessage(job);
    cursorRef.current += 1;
  }, [setGenerationJob]);

  const finishGeneration = useCallback(async (jobId: string) => {
    // Terminate workers
    workersRef.current.forEach((w) => w.terminate());
    workersRef.current = [];

    const prev = useAppStore.getState().generationJob;
    if (prev && prev.id === jobId) {
      setGenerationJob({ ...prev, status: 'done', completedAt: Date.now(), etaMs: 0 });
    }

    // Create ZIP
    try {
      const zipBuffer = zipSync(buffersRef.current);
      const zipArrayBuffer = toArrayBuffer(zipBuffer);
      const blob = new Blob([zipArrayBuffer], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Generated_PDFs_${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addNotification({ message: 'ZIP download started successfully!', level: 'success' });

      // Also save generation metadata to current project if available
      const currentProjectId = useAppStore.getState().currentProjectId;
      if (currentProjectId) {
        try {
          const project = await StorageService.getProject(currentProjectId);
          const entry = {
            id: `gen-${Date.now()}`,
            name: `Generated_PDFs_${Date.now()}.zip`,
            createdAt: Date.now(),
            zipBase64: arrayBufferToBase64(zipArrayBuffer),
            count: Object.keys(buffersRef.current).length,
          };
          if (project) {
            project.generationOutputs = project.generationOutputs || [];
            project.generationOutputs.push(entry);
            await StorageService.saveProject(project as PDFProject);
          }
        } catch (e) {
          console.warn('Failed to save generation metadata to project', e);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown ZIP creation error';
      addNotification({ message: `Failed to create ZIP: ${message}`, level: 'error' });
    }
  }, [setGenerationJob, addNotification]);

  const startGeneration = useCallback((filenamePattern: string) => {
    if (!pdfmeTemplate || excelRows.length === 0 || fieldBindings.length === 0) {
      addNotification({ message: 'Missing required data for generation', level: 'error' });
      return;
    }

    const jobId = `job-${Date.now()}`;
    const totalRows = excelRows.length;

    // Initialize job state
    setGenerationJob({
      id: jobId,
      name: 'Bulk PDF Generation',
      status: 'running',
      totalRows,
      completedRows: 0,
      startedAt: Date.now(),
      rows: excelRows.map((_, i) => ({
        rowIndex: i,
        status: 'queued',
        filename: '', // Will be set during generation
      })),
    });

    buffersRef.current = {};

    // Prepare generation data
    const jobs: GenerateJobData[] = excelRows.map((row, index) => {
      // Create the input object based on field bindings
      const input: Record<string, string> = {};
      fieldBindings.forEach((binding) => {
        const column = excelColumns.find((c) => c.index === binding.excelColumnIndex);
        if (column) {
          input[binding.schemaFieldId] = String(row[column.header] || '');
        }
      });

      // Simple filename pattern replacement (e.g., invoice_{Name}.pdf)
      let filename = filenamePattern || `document_${index + 1}.pdf`;
      excelColumns.forEach((col) => {
        const placeholder = `{${col.header}}`;
        if (filename.includes(placeholder)) {
          filename = filename.replaceAll(placeholder, String(row[col.header] || ''));
        }
      });
      // Replace {row_number}
      filename = filename.replaceAll('{row_number}', String(index + 1));
      
      // Ensure ends with .pdf
      if (!filename.toLowerCase().endsWith('.pdf')) {
        filename += '.pdf';
      }
      
      // Sanitize
      filename = filename.replace(/[/\\?%*:|"<>]/g, '-');

      return {
        jobId,
        rowIndex: index,
        // Include validation rules with the template so the worker can pre-flight validate
        template: { ...pdfmeTemplate, validationRules, conditionalRules },
        input,
        filename,
      };
    });

    // Determine concurrency (max 4 workers)
    const concurrency = Math.min(4, navigator.hardwareConcurrency || 2);
    jobsRef.current = jobs;
    cursorRef.current = 0;
    completedCountRef.current = 0;
    totalRowsRef.current = totalRows;
    activeJobIdRef.current = jobId;
    pausedRef.current = false;

    // Spawn workers
    for (let i = 0; i < concurrency; i++) {
      const worker = new PdfWorker();
      workersRef.current.push(worker);

      worker.onerror = (err) => {
        console.error('Worker error:', err);
        completedCountRef.current++;
        // If it crashes immediately, we might not know which row it was processing.
        // But we can just fail the current job index if it exists.
        addNotification({ message: 'A worker process crashed.', level: 'error' });
      };

      worker.onmessage = (e: MessageEvent<GenerateJobResult>) => {
        const result = e.data;
        completedCountRef.current += 1;

        const rowError = result.error
          ? (typeof result.error === 'string'
            ? result.error
            : (result.error as IFieldValidationError).message)
          : undefined;

        if (rowError) {
          console.error(`Row ${result.rowIndex} failed:`, rowError);
        } else if (result.pdfBuffer) {
          buffersRef.current[result.filename] = result.pdfBuffer;
        }

        // Update state
        const prev = useAppStore.getState().generationJob;
        if (prev && prev.id === jobId) {
          const newRows = [...prev.rows];
          newRows[result.rowIndex] = {
            ...newRows[result.rowIndex],
            status: rowError ? 'failed' : 'done',
            filename: result.filename,
            error: rowError,
          };
          
          const elapsedMs = prev.startedAt ? Date.now() - prev.startedAt : 0;
          const avgMsPerRow = completedCountRef.current > 0 ? elapsedMs / completedCountRef.current : 0;
          const remaining = Math.max(0, totalRowsRef.current - completedCountRef.current);
          const etaMs = Math.round(avgMsPerRow * remaining);

          setGenerationJob({
            ...prev,
            rows: newRows,
            completedRows: prev.completedRows + 1,
            etaMs,
          });
        }

        // Dispatch next job if any
        if (cursorRef.current < totalRowsRef.current) {
          dispatchNext(worker, jobId);
        } else if (completedCountRef.current === totalRowsRef.current) {
          // All done!
          finishGeneration(jobId);
        }
      };

      // Start initial jobs
      if (cursorRef.current < totalRowsRef.current) {
        dispatchNext(worker, jobId);
      }
    }
  }, [
    pdfmeTemplate,
    excelRows,
    excelColumns,
    fieldBindings,
    validationRules,
    conditionalRules,
    setGenerationJob,
    addNotification,
    dispatchNext,
    finishGeneration,
  ]);

  const cancelGeneration = useCallback(() => {
    pausedRef.current = false;
    workersRef.current.forEach((w) => w.terminate());
    workersRef.current = [];
    const prev = useAppStore.getState().generationJob;
    if (prev) {
      setGenerationJob({ ...prev, status: 'cancelled' });
    }
    addNotification({ message: 'Generation cancelled', level: 'info' });
  }, [setGenerationJob, addNotification]);

  const pauseGeneration = useCallback(() => {
    const prev = useAppStore.getState().generationJob;
    if (!prev || prev.status !== 'running') return;
    pausedRef.current = true;
    setGenerationJob({ ...prev, status: 'paused' });
    addNotification({ message: 'Generation paused', level: 'info' });
  }, [setGenerationJob, addNotification]);

  const resumeGeneration = useCallback(() => {
    const prev = useAppStore.getState().generationJob;
    if (!prev || prev.status !== 'paused') return;
    pausedRef.current = false;
    setGenerationJob({ ...prev, status: 'running' });
    workersRef.current.forEach((w) => {
      if (activeJobIdRef.current) {
        dispatchNext(w, activeJobIdRef.current);
      }
    });
    addNotification({ message: 'Generation resumed', level: 'success' });
  }, [setGenerationJob, addNotification, dispatchNext]);

  const downloadSinglePdf = useCallback((filename: string) => {
    const buf = buffersRef.current[filename];
    if (!buf) {
      addNotification({ message: 'PDF buffer not available for this row yet', level: 'warning' });
      return;
    }
    const blob = new Blob([toArrayBuffer(buf)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [addNotification]);

  return {
    startGeneration,
    cancelGeneration,
    pauseGeneration,
    resumeGeneration,
    downloadSinglePdf,
    generationJob,
  };
}
