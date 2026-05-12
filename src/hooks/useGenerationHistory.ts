/**
 * hooks/useGenerationHistory.ts
 *
 * Manages PDF generation job history for a workspace or template.
 * Provides loading, refresh, and status update capabilities.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GenerationService } from '../services/generation.service';
import type { GenerationJob } from '../services/generation.service';

export interface UseGenerationHistoryOptions {
  templateId?: string; // If provided, load history for specific template
  autoRefresh?: boolean; // Auto-refresh every N seconds
  autoRefreshInterval?: number; // milliseconds (default 5000)
}

export function useGenerationHistory(options: UseGenerationHistoryOptions = {}) {
  const { templateId, autoRefresh = false, autoRefreshInterval = 5000 } = options;

  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);

  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  // Load history from Supabase
  const loadHistory = useCallback(async (showLoading = true) => {
    if (!activeWorkspaceId) {
      setIsLoading(false);
      setJobs([]);
      return;
    }

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      if (templateId) {
        // Load for specific template
        const templateJobs = await GenerationService.listJobsForTemplate(templateId, 100);
        setJobs(templateJobs);
        setTotal(templateJobs.length);
      } else {
        // Load for workspace
        const result = await GenerationService.listJobsForWorkspace(activeWorkspaceId, 50, 0);
        setJobs(result.jobs);
        setTotal(result.total);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load history';
      setError(message);
      console.warn('[useGenerationHistory] Load failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, templateId]);

  // Initial load
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-refresh subscription
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      loadHistory(false); // Refresh without showing loading state
    }, autoRefreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, autoRefreshInterval, loadHistory]);

  // Cancel a running job
  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await GenerationService.cancelJob(jobId);
      // Refresh to show updated status
      await loadHistory(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel job';
      setError(message);
      console.warn('[useGenerationHistory] Cancel failed:', err);
    }
  }, [loadHistory]);

  // Delete a completed job
  const deleteJob = useCallback(async (jobId: string) => {
    try {
      await GenerationService.deleteJob(jobId);
      // Refresh to remove from list
      await loadHistory(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete job';
      setError(message);
      console.warn('[useGenerationHistory] Delete failed:', err);
    }
  }, [loadHistory]);

  // Get a specific job's details
  const getJob = useCallback(async (jobId: string): Promise<GenerationJob | null> => {
    try {
      return await GenerationService.getJob(jobId);
    } catch (err) {
      console.warn('[useGenerationHistory] Get job failed:', err);
      return null;
    }
  }, []);

  // Get outputs for a job
  const getJobOutputs = useCallback(async (jobId: string) => {
    try {
      return await GenerationService.getJobOutputs(jobId);
    } catch (err) {
      console.warn('[useGenerationHistory] Get outputs failed:', err);
      return [];
    }
  }, []);

  return {
    jobs,
    total,
    isLoading,
    error,
    refresh: loadHistory,
    cancelJob,
    deleteJob,
    getJob,
    getJobOutputs,
  };
}
