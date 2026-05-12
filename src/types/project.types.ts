export interface PDFProject {
  id: string;
  name: string;
  description?: string;
  lastModified: number;
  pdfFileName: string;
  basePdf: ArrayBuffer | Uint8Array | string; // Large payload
  templateSchemas: unknown;
  schemaFields: unknown;
  fieldBindings: unknown;
  validationRules?: unknown;
  conditionalRules?: unknown;
  snapshots?: Array<{
    id: string;
    createdAt: number;
    templateSchemas: unknown;
    schemaFields: unknown;
    fieldBindings: unknown;
  }>;
  /** Optional list of previous generation outputs metadata */
  generationOutputs?: Array<{
    id: string;
    name: string;
    createdAt: number;
    zipBase64?: string;
    count?: number;
  }>;
  thumbnailBase64?: string; // For gallery view
}

// ── Cloud Storage Models ─────────────────────────────────────────

export interface IGenerationJob {
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

export interface IExcelUpload {
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

export interface IUserPreferences {
  id: string;
  user_id: string;
  theme: 'light' | 'dark' | 'system';
  last_active_tab: 'projects' | 'editor' | 'bulk';
  sidebar_collapsed: boolean;
  notifications_enabled: boolean;
  ui_state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

