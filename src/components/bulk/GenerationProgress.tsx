import { useEffect, useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function GenerationProgress({ onCancel }: { onCancel: () => void }) {
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

  return (
    <div className="card p-6 animate-fade-in" style={{ border: '1px solid var(--color-surface-200)' }}>
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
        </div>
        
        {status === 'running' && (
          <button onClick={onCancel} className="btn btn-ghost btn-sm text-red-500 hover:bg-red-50">
            Cancel
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="w-full h-3 rounded-full mb-4 overflow-hidden" style={{ background: 'var(--color-surface-100)' }}>
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
          <h4 className="font-semibold mb-2" style={{ color: '#991b1b' }}>Errors:</h4>
          <ul className="list-disc pl-4 flex flex-col gap-1 text-xs" style={{ color: '#991b1b' }}>
            {failedRows.map(r => (
              <li key={r.rowIndex}>Row {r.rowIndex + 1}: {String(r.error)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
