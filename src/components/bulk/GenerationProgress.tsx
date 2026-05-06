import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, XCircle, Pause, Play, FileDown, Download } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

type Props = {
  onCancel: () => void;
  onPause: () => void;
  onResume: () => void;
  onDownloadSingle: (filename: string) => void;
};

export function GenerationProgress({ onCancel, onPause, onResume, onDownloadSingle }: Props) {
  const generationJob = useAppStore((s) => s.generationJob);
  const [elapsed, setElapsed] = useState(0);

  // Timer for UI
  useEffect(() => {
    if (generationJob?.status === 'running' && generationJob.startedAt) {
      const interval = setInterval(() => {
        setElapsed(Date.now() - generationJob.startedAt!);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [generationJob?.status, generationJob?.startedAt]);

  if (!generationJob) return null;

  const { status, totalRows, completedRows, rows = [] } = generationJob;
  const progressPercent = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;
  
  const failedRows = rows.filter(r => r.status === 'failed');
  const runningRows = rows.filter(r => r.status === 'running');

  const etaLabel = generationJob.etaMs && generationJob.etaMs > 0
    ? `${Math.max(1, Math.round(generationJob.etaMs / 1000))}s remaining`
    : 'Calculating ETA...';

  const handleExportErrorsCsv = () => {
    if (failedRows.length === 0) return;
    const lines = ['row_index,filename,error'];
    for (const r of failedRows) {
      const safeError = String(r.error ?? '').replaceAll('"', '""');
      lines.push(`${r.rowIndex + 1},"${r.filename}","${safeError}"`);
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `generation_errors_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card p-6 animate-fade-in" style={{ border: '1px solid var(--color-surface-200)' }} aria-live="polite" aria-atomic="false">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: 'var(--color-surface-800)' }}>
            {status === 'running' && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-brand-500)' }} />}
            {status === 'done' && <CheckCircle2 className="w-5 h-5 text-green-500" />}
            {status === 'cancelled' && <XCircle className="w-5 h-5 text-red-500" />}
            {status === 'running' ? 'Generating PDFs...' : status === 'done' ? 'Generation Complete' : 'Generation Cancelled'}
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--color-surface-500)' }}>
            {completedRows} of {totalRows} processed ({(elapsed / 1000).toFixed(1)}s)
          </p>
          {(status === 'running' || status === 'paused') && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-surface-400)' }}>{etaLabel}</p>
          )}
        </div>
        
        {status === 'running' && (
          <div className="flex items-center gap-2">
            <button onClick={onPause} className="btn btn-secondary btn-sm" aria-label="Pause generation">
              <Pause className="w-4 h-4" /> Pause
            </button>
            <button onClick={onCancel} className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50" aria-label="Cancel generation">
              Cancel
            </button>
          </div>
        )}

        {status === 'paused' && (
          <div className="flex items-center gap-2">
            <button onClick={onResume} className="btn btn-primary btn-sm" aria-label="Resume generation">
              <Play className="w-4 h-4" /> Resume
            </button>
            <button onClick={onCancel} className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50" aria-label="Cancel generation">
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--color-surface-100)' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressPercent} aria-label="PDF generation progress">
        <div 
          className="h-full transition-all duration-300"
          style={{ 
            width: `${progressPercent}%`, 
            background: status === 'done' ? '#10b981' : status === 'cancelled' ? '#ef4444' : 'var(--color-brand-500)' 
          }}
        />
      </div>

      {/* Status Details */}
      <div className="flex gap-4 text-sm mb-4">
        <div className="flex items-center gap-1.5" style={{ color: 'var(--color-surface-600)' }}>
          <CheckCircle2 className="w-4 h-4 text-green-500" />
          {rows.filter(r => r.status === 'done').length} Succeeded
        </div>
        {failedRows.length > 0 && (
          <div className="flex items-center gap-1.5" style={{ color: '#ef4444' }}>
            <AlertCircle className="w-4 h-4" />
            {failedRows.length} Failed
          </div>
        )}
        {runningRows.length > 0 && (
          <div className="flex items-center gap-1.5" style={{ color: 'var(--color-brand-500)' }}>
            <Loader2 className="w-4 h-4 animate-spin" />
            {runningRows.length} Active Workers
          </div>
        )}
      </div>

      {/* Error Log */}
      {failedRows.length > 0 && (
        <div className="mt-4 p-3 rounded-lg text-sm max-h-40 overflow-y-auto" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-semibold" style={{ color: '#991b1b' }}>Errors:</h4>
            <button className="btn btn-secondary btn-sm" onClick={handleExportErrorsCsv} aria-label="Export errors as CSV">
              <FileDown className="w-4 h-4" /> Export CSV
            </button>
          </div>
          <ul className="list-disc pl-4 flex flex-col gap-1 text-xs" style={{ color: '#991b1b' }}>
            {failedRows.map(r => (
              <li key={r.rowIndex}>Row {r.rowIndex + 1}: {String(r.error)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Row-level downloads */}
      {rows.some((r) => r.status === 'done') && (
        <div className="mt-4 p-3 rounded-lg text-sm max-h-44 overflow-y-auto" style={{ background: 'var(--color-surface-50)', border: '1px solid var(--color-surface-200)' }}>
          <h4 className="font-semibold mb-2" style={{ color: 'var(--color-surface-700)' }}>Download Individual PDFs</h4>
          <div className="flex flex-col gap-2">
            {rows
              .filter((r) => r.status === 'done' && r.filename)
              .slice(0, 30)
              .map((r) => (
                <div key={`${r.rowIndex}-${r.filename}`} className="flex items-center justify-between text-xs">
                  <span style={{ color: 'var(--color-surface-600)' }}>Row {r.rowIndex + 1}: {r.filename}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => onDownloadSingle(r.filename)} aria-label={`Download ${r.filename}`}>
                    <Download className="w-4 h-4" /> Download
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
