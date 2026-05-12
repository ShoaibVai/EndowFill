/**
 * components/bulk/GenerationHistoryPanel.tsx
 *
 * Displays PDF generation job history for a workspace or template.
 * Shows job status, progress, timestamps, and action buttons (download, rerun, delete).
 */

import { useState } from 'react';
import { Download, Trash2, RotateCcw, Clock, AlertCircle, CheckCircle, Loader, Pause } from 'lucide-react';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import type { IGenerationJob } from '../../types/project.types';

interface GenerationHistoryPanelProps {
  templateId?: string;
  workspaceId?: string;
  compact?: boolean; // Show minimal version (e.g., in sidebar)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusColor(status: IGenerationJob['status']): string {
  switch (status) {
    case 'completed':
      return 'text-green-600 dark:text-green-400';
    case 'failed':
      return 'text-red-600 dark:text-red-400';
    case 'running':
      return 'text-blue-600 dark:text-blue-400';
    case 'pending':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'paused':
      return 'text-orange-600 dark:text-orange-400';
    case 'cancelled':
      return 'text-slate-600 dark:text-slate-400';
    default:
      return 'text-slate-600 dark:text-slate-400';
  }
}

function getStatusIcon(status: IGenerationJob['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4" />;
    case 'failed':
      return <AlertCircle className="w-4 h-4" />;
    case 'running':
      return <Loader className="w-4 h-4 animate-spin" />;
    case 'pending':
      return <Clock className="w-4 h-4" />;
    case 'paused':
      return <Pause className="w-4 h-4" />;
    default:
      return <Clock className="w-4 h-4" />;
  }
}

export function GenerationHistoryPanel({
  templateId,
  compact = false,
}: GenerationHistoryPanelProps) {
  const { jobs, isLoading, error, cancelJob, deleteJob } = useGenerationHistory({
    templateId,
    autoRefresh: true,
    autoRefreshInterval: 5000,
  });

  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  if (isLoading && jobs.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500">
        <Loader className="w-5 h-5 animate-spin mr-2" />
        Loading history...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </div>
    );
  }

  if (jobs.length === 0) {
    return (
      <div className="flex items-center justify-center p-6 text-slate-500 text-sm">
        No generation history yet
      </div>
    );
  }

  const displayJobs = compact ? jobs.slice(0, 5) : jobs;

  return (
    <div className="space-y-2">
      {displayJobs.map((job) => {
        const isExpanded = expandedJobId === job.id;
        const progress =
          job.total_count > 0 ? ((job.completed_count / job.total_count) * 100).toFixed(1) : '0';
        const isRunning = job.status === 'running' || job.status === 'pending';

        return (
          <div key={job.id} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            {/* Header / Summary */}
            <div
              className="p-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setExpandedJobId(isExpanded ? null : job.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className={`${getStatusColor(job.status)}`}>
                    {getStatusIcon(job.status)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-slate-900 dark:text-slate-100">
                      {job.total_count} PDF{job.total_count !== 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      {formatDate(job.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                    {job.status}
                  </div>
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 14l-7 7m0 0l-7-7m7 7V3"
                    />
                  </svg>
                </div>
              </div>

              {/* Progress bar */}
              {isRunning && (
                <div className="mt-2 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="px-3 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 space-y-3">
                {/* Progress info */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Completed:</span>
                    <span className="ml-2 font-medium">{job.completed_count}</span>
                  </div>
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Failed:</span>
                    <span className="ml-2 font-medium text-red-600 dark:text-red-400">
                      {job.failed_count}
                    </span>
                  </div>
                </div>

                {/* Timing info */}
                {job.started_at && (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span>Started: </span>
                    <span className="font-mono">{formatDate(job.started_at)}</span>
                  </div>
                )}

                {job.completed_at && (
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    <span>Completed: </span>
                    <span className="font-mono">{formatDate(job.completed_at)}</span>
                  </div>
                )}

                {/* Error message */}
                {job.error_message && (
                  <div className="text-xs p-2 bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 rounded">
                    {job.error_message}
                  </div>
                )}

                {/* Filename pattern */}
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  <span>Pattern: </span>
                  <span className="font-mono">{job.filename_pattern}</span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2">
                  {job.status === 'completed' && job.output_zip_url && (
                    <a
                      href={job.output_zip_url}
                      download
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    >
                      <Download className="w-3 h-3" />
                      Download
                    </a>
                  )}

                  {(job.status === 'running' || job.status === 'pending') && (
                    <button
                      onClick={() => cancelJob(job.id)}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 transition-colors"
                    >
                      <Pause className="w-3 h-3" />
                      Cancel
                    </button>
                  )}

                  {job.status === 'completed' && (
                    <button
                      onClick={() => {
                        // In a real app, this would re-use the same Excel and template
                        console.log('Rerun generation:', job.id);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Rerun
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (confirm('Delete this generation job?')) {
                        deleteJob(job.id);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
