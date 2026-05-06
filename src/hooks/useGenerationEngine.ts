import { useCallback, useRef } from 'react';
import { zipSync } from 'fflate';
import { useAppStore } from '../store/useAppStore';
import type { GenerateJobData, GenerateJobResult } from '../workers/pdfGenerator.worker';

// Define the worker script import for Vite
import PdfWorker from '../workers/pdfGenerator.worker?worker';

export function useGenerationEngine() {
  const pdfmeTemplate = useAppStore((s) => s.pdfmeTemplate);
  const excelRows = useAppStore((s) => s.excelRows);
  const excelColumns = useAppStore((s) => s.excelColumns);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  
  const generationJob = useAppStore((s) => s.generationJob);
  const setGenerationJob = useAppStore((s) => s.setGenerationJob);
  const addNotification = useAppStore((s) => s.addNotification);

  // Keep track of active workers and accumulated PDF buffers
  const workersRef = useRef<Worker[]>([]);
  const buffersRef = useRef<Record<string, Uint8Array>>({});

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
        template: pdfmeTemplate,
        input,
        filename,
      };
    });

    // Determine concurrency (max 4 workers)
    const concurrency = Math.min(4, navigator.hardwareConcurrency || 2);
    let currentJobIndex = 0;
    let completedCount = 0;

    // Spawn workers
    for (let i = 0; i < concurrency; i++) {
      const worker = new PdfWorker();
      workersRef.current.push(worker);

      worker.onerror = (err) => {
        console.error('Worker error:', err);
        completedCount++;
        // If it crashes immediately, we might not know which row it was processing.
        // But we can just fail the current job index if it exists.
        addNotification({ message: 'A worker process crashed.', level: 'error' });
      };

      worker.onmessage = (e: MessageEvent<GenerateJobResult>) => {
        const result = e.data;
        completedCount++;

        if (result.error) {
          console.error(`Row ${result.rowIndex} failed:`, result.error);
        } else if (result.pdfBuffer) {
          buffersRef.current[result.filename] = result.pdfBuffer;
        }

        // Update state
        const prev = useAppStore.getState().generationJob;
        if (prev && prev.id === jobId) {
          const newRows = [...prev.rows];
          newRows[result.rowIndex] = {
            ...newRows[result.rowIndex],
            status: result.error ? 'failed' : 'done',
            filename: result.filename,
            error: result.error,
          };
          
          setGenerationJob({
            ...prev,
            rows: newRows,
            completedRows: prev.completedRows + 1,
          });
        }

        // Dispatch next job if any
        if (currentJobIndex < totalRows) {
          const prev2 = useAppStore.getState().generationJob;
          if (prev2 && prev2.id === jobId) {
             const newRows = [...prev2.rows];
             newRows[currentJobIndex] = { ...newRows[currentJobIndex], status: 'running' };
             setGenerationJob({ ...prev2, rows: newRows });
          }
          worker.postMessage(jobs[currentJobIndex]);
          currentJobIndex++;
        } else if (completedCount === totalRows) {
          // All done!
          finishGeneration(jobId);
        }
      };

      // Start initial jobs
      if (currentJobIndex < totalRows) {
        const prev = useAppStore.getState().generationJob;
        if (prev && prev.id === jobId) {
           const newRows = [...prev.rows];
           newRows[currentJobIndex] = { ...newRows[currentJobIndex], status: 'running' };
           setGenerationJob({ ...prev, rows: newRows });
        }
        worker.postMessage(jobs[currentJobIndex]);
        currentJobIndex++;
      }
    }
  }, [pdfmeTemplate, excelRows, excelColumns, fieldBindings, setGenerationJob, addNotification]);

  const finishGeneration = useCallback((jobId: string) => {
    // Terminate workers
    workersRef.current.forEach((w) => w.terminate());
    workersRef.current = [];

    const prev = useAppStore.getState().generationJob;
    if (prev && prev.id === jobId) {
      setGenerationJob({ ...prev, status: 'done', completedAt: Date.now() });
    }

    // Create ZIP
    try {
      const zipBuffer = zipSync(buffersRef.current as any);
      const blob = new Blob([zipBuffer as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Generated_PDFs_${new Date().getTime()}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addNotification({ message: 'ZIP download started successfully!', level: 'success' });
    } catch (e: any) {
      addNotification({ message: `Failed to create ZIP: ${e.message}`, level: 'error' });
    }
  }, [setGenerationJob, addNotification]);

  const cancelGeneration = useCallback(() => {
    workersRef.current.forEach((w) => w.terminate());
    workersRef.current = [];
    const prev = useAppStore.getState().generationJob;
    if (prev) {
      setGenerationJob({ ...prev, status: 'cancelled' });
    }
    addNotification({ message: 'Generation cancelled', level: 'info' });
  }, [setGenerationJob, addNotification]);

  return {
    startGeneration,
    cancelGeneration,
    generationJob,
  };
}
