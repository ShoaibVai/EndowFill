/**
 * services/excel.service.ts
 *
 * CRUD operations for excel_uploads.
 * Manages Excel file metadata and upload history for reuse and versioning.
 */

import { supabase } from '../utils/supabase';
import { toError } from '../utils/supabaseError';

export interface ExcelUpload {
  id: string;
  workspace_id: string;
  user_id: string;
  filename: string;
  file_url?: string;
  column_headers: string[];
  row_count: number;
  file_size_kb?: number;
  created_at: string;
  updated_at: string;
}

export const ExcelService = {
  /**
   * Create a new Excel upload metadata record
   */
  async createUpload(
    workspaceId: string,
    filename: string,
    columnHeaders: string[],
    rowCount: number,
    fileUrl?: string,
    fileSizeKb?: number
  ): Promise<ExcelUpload> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('excel_uploads')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        filename,
        column_headers: columnHeaders,
        row_count: rowCount,
        file_url: fileUrl,
        file_size_kb: fileSizeKb,
      })
      .select()
      .single();

    if (error) throw toError(error);
    return data as ExcelUpload;
  },

  /**
   * Get a single upload by ID
   */
  async getUpload(uploadId: string): Promise<ExcelUpload | null> {
    const { data, error } = await supabase
      .from('excel_uploads')
      .select('*')
      .eq('id', uploadId)
      .maybeSingle();

    if (error) throw toError(error);
    return (data as ExcelUpload) || null;
  },

  /**
   * List all Excel uploads in a workspace
   */
  async listUploads(
    workspaceId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ uploads: ExcelUpload[]; total: number }> {
    const { data, error, count } = await supabase
      .from('excel_uploads')
      .select('*', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw toError(error);
    return {
      uploads: (data as ExcelUpload[]) || [],
      total: count || 0,
    };
  },

  /**
   * Update upload metadata (e.g., file_url after successful upload to storage)
   */
  async updateUpload(uploadId: string, updates: Partial<ExcelUpload>): Promise<void> {
    const { error } = await supabase
      .from('excel_uploads')
      .update(updates)
      .eq('id', uploadId);

    if (error) throw toError(error);
  },

  /**
   * Delete an Excel upload
   */
  async deleteUpload(uploadId: string): Promise<void> {
    const { error } = await supabase
      .from('excel_uploads')
      .delete()
      .eq('id', uploadId);

    if (error) throw toError(error);
  },

  /**
   * Get uploads by filename (to check for duplicates)
   */
  async findByFilename(workspaceId: string, filename: string): Promise<ExcelUpload[]> {
    const { data, error } = await supabase
      .from('excel_uploads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('filename', filename)
      .order('created_at', { ascending: false });

    if (error) throw toError(error);
    return (data as ExcelUpload[]) || [];
  },
};
