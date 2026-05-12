/**
 * services/generation.service.ts
 *
 * CRUD operations for generation_jobs and generation_outputs.
 * Tracks PDF generation history, status, and progress.
 */

import { supabase } from '../utils/supabase';
import { toError } from '../utils/supabaseError';

export interface GenerationJob {
  id: string;
  workspace_id: string;
  template_id: string;
  excel_upload_id?: string;
  user_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  total_count: number;
  completed_count: number;
  failed_count: number;
  filename_pattern: string;
  output_zip_url?: string;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

export interface GenerationOutput {
  id: string;
  job_id: string;
  output_name: string;
  row_index: number;
  status: 'generated' | 'failed' | 'skipped';
  error_message?: string;
  created_at: string;
}

export const GenerationService = {
  /**
   * Create a new generation job
   */
  async createJob(
    workspaceId: string,
    templateId: string,
    excelUploadId: string | null,
    totalCount: number,
    filenamePattern: string
  ): Promise<GenerationJob> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('generation_jobs')
      .insert({
        workspace_id: workspaceId,
        template_id: templateId,
        excel_upload_id: excelUploadId,
        user_id: user.id,
        status: 'pending',
        total_count: totalCount,
        completed_count: 0,
        failed_count: 0,
        filename_pattern: filenamePattern,
      })
      .select()
      .single();

    if (error) throw toError(error);
    return data as GenerationJob;
  },

  /**
   * Get a single job by ID
   */
  async getJob(jobId: string): Promise<GenerationJob | null> {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error) throw toError(error);
    return (data as GenerationJob) || null;
  },

  /**
   * List all jobs for a workspace
   */
  async listJobsForWorkspace(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ jobs: GenerationJob[]; total: number }> {
    const { data, error, count } = await supabase
      .from('generation_jobs')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw toError(error);
    return {
      jobs: (data as GenerationJob[]) || [],
      total: count || 0,
    };
  },

  /**
   * List jobs for a specific template
   */
  async listJobsForTemplate(
    templateId: string,
    limit: number = 20
  ): Promise<GenerationJob[]> {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw toError(error);
    return (data as GenerationJob[]) || [];
  },

  /**
   * Update job status and progress
   */
  async updateJobStatus(
    jobId: string,
    status: GenerationJob['status'],
    completedCount?: number,
    failedCount?: number,
    errorMessage?: string
  ): Promise<void> {
    const updates: Record<string, unknown> = { status };

    if (completedCount !== undefined) updates.completed_count = completedCount;
    if (failedCount !== undefined) updates.failed_count = failedCount;
    if (errorMessage !== undefined) updates.error_message = errorMessage;

    if (status === 'running' && !updates.started_at) {
      updates.started_at = new Date().toISOString();
    }

    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      updates.completed_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('generation_jobs')
      .update(updates)
      .eq('id', jobId);

    if (error) throw toError(error);
  },

  /**
   * Mark job as completed with output ZIP URL
   */
  async completeJob(jobId: string, outputZipUrl: string): Promise<void> {
    const { error } = await supabase
      .from('generation_jobs')
      .update({
        status: 'completed',
        output_zip_url: outputZipUrl,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) throw toError(error);
  },

  /**
   * Mark job as failed with error message
   */
  async failJob(jobId: string, errorMessage: string): Promise<void> {
    const { error } = await supabase
      .from('generation_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) throw toError(error);
  },

  /**
   * Cancel a pending or running job
   */
  async cancelJob(jobId: string): Promise<void> {
    const { error } = await supabase
      .from('generation_jobs')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (error) throw toError(error);
  },

  /**
   * Delete a job and its outputs
   */
  async deleteJob(jobId: string): Promise<void> {
    // Cascade delete via DB foreign key (on delete cascade)
    const { error } = await supabase
      .from('generation_jobs')
      .delete()
      .eq('id', jobId);

    if (error) throw toError(error);
  },

  /**
   * Record a generated output file
   */
  async recordOutput(
    jobId: string,
    outputName: string,
    rowIndex: number,
    status: GenerationOutput['status'] = 'generated',
    errorMessage?: string
  ): Promise<void> {
    // This would normally be called via a service function (not direct insert)
    // For now, we skip this since it's restricted by RLS
    // In a real app, create a stored procedure to handle this
    console.log('recordOutput called:', { jobId, outputName, rowIndex, status, errorMessage });
  },

  /**
   * Get outputs for a job
   */
  async getJobOutputs(jobId: string): Promise<GenerationOutput[]> {
    const { data, error } = await supabase
      .from('generation_outputs')
      .select('*')
      .eq('job_id', jobId)
      .order('row_index', { ascending: true });

    if (error) throw toError(error);
    return (data as GenerationOutput[]) || [];
  },
};
