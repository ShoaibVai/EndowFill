/**
 * services/template.service.ts
 *
 * CRUD for workspace_templates stored in Supabase.
 * Mirrors the PDFProject shape but maps to the Supabase table columns.
 * When a workspace is active, this replaces (not removes) IndexedDB.
 */

import { supabase } from '../utils/supabase';
import { toError } from '../utils/supabaseError';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/bufferUtils';
import type { PDFProject } from '../types/project.types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkspaceTemplate {
  id: string;
  workspace_id: string;
  name: string;
  description?: string;
  pdf_file_name: string;
  base_pdf_b64?: string;
  template_schemas: unknown;
  schema_fields: unknown;
  field_bindings: unknown;
  validation_rules: unknown;
  conditional_rules: unknown;
  snapshots: unknown;
  thumbnail_b64?: string;
  created_by?: string;
  last_modified_by?: string;
  created_at: string;
  updated_at: string;
  /** Joined from profiles */
  last_modified_by_profile?: {
    email?: string;
    full_name?: string;
    avatar_url?: string;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pdfToB64(buf: PDFProject['basePdf']): string {
  if (typeof buf === 'string') return buf;
  if (buf instanceof ArrayBuffer) return arrayBufferToBase64(buf);
  // Uint8Array
  return arrayBufferToBase64(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
  );
}

/** Convert a WorkspaceTemplate → PDFProject shape for the editor store */
export function templateToProject(t: WorkspaceTemplate): PDFProject {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    lastModified: new Date(t.updated_at).getTime(),
    pdfFileName: t.pdf_file_name,
    basePdf: t.base_pdf_b64 ? base64ToArrayBuffer(t.base_pdf_b64) : new ArrayBuffer(0),
    templateSchemas: t.template_schemas,
    schemaFields: t.schema_fields,
    fieldBindings: t.field_bindings,
    validationRules: t.validation_rules,
    conditionalRules: t.conditional_rules,
    snapshots: t.snapshots as PDFProject['snapshots'],
    thumbnailBase64: t.thumbnail_b64,
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export const TemplateService = {

  /** List all templates in a workspace (lightweight — no base_pdf_b64) */
  async listTemplates(workspaceId: string): Promise<WorkspaceTemplate[]> {
    const { data, error } = await supabase
      .from('workspace_templates')
      .select(
        'id, workspace_id, name, description, pdf_file_name, thumbnail_b64, created_by, last_modified_by, created_at, updated_at'
      )
      .eq('workspace_id', workspaceId)
      .order('updated_at', { ascending: false });

    if (error) throw toError(error);
    return (data ?? []) as unknown as WorkspaceTemplate[];
  },

  /** Fetch a single template including base_pdf_b64 */
  async getTemplate(id: string): Promise<WorkspaceTemplate | null> {
    const { data, error } = await supabase
      .from('workspace_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw toError(error);
    return data as WorkspaceTemplate | null;
  },

  /** Create a new template in a workspace */
  async createTemplate(
    workspaceId: string,
    project: Omit<PDFProject, 'id'>
  ): Promise<WorkspaceTemplate> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('workspace_templates')
      .insert({
        workspace_id: workspaceId,
        name: project.name,
        description: project.description,
        pdf_file_name: project.pdfFileName,
        base_pdf_b64: pdfToB64(project.basePdf),
        template_schemas: project.templateSchemas,
        schema_fields: project.schemaFields,
        field_bindings: project.fieldBindings,
        validation_rules: project.validationRules ?? [],
        conditional_rules: project.conditionalRules ?? [],
        snapshots: project.snapshots ?? [],
        thumbnail_b64: project.thumbnailBase64,
        created_by: user.id,
        last_modified_by: user.id,
      })
      .select()
      .single();

    if (error) throw toError(error);
    return data as WorkspaceTemplate;
  },

  /** Update / save an existing template */
  async updateTemplate(
    id: string,
    project: Partial<PDFProject>
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const patch: Record<string, unknown> = {
      last_modified_by: user.id,
    };

    if (project.name !== undefined) patch.name = project.name;
    if (project.description !== undefined) patch.description = project.description;
    if (project.pdfFileName !== undefined) patch.pdf_file_name = project.pdfFileName;
    if (project.basePdf !== undefined) patch.base_pdf_b64 = pdfToB64(project.basePdf);
    if (project.templateSchemas !== undefined) patch.template_schemas = project.templateSchemas;
    if (project.schemaFields !== undefined) patch.schema_fields = project.schemaFields;
    if (project.fieldBindings !== undefined) patch.field_bindings = project.fieldBindings;
    if (project.validationRules !== undefined) patch.validation_rules = project.validationRules;
    if (project.conditionalRules !== undefined) patch.conditional_rules = project.conditionalRules;
    if (project.snapshots !== undefined) patch.snapshots = project.snapshots;
    if (project.thumbnailBase64 !== undefined) patch.thumbnail_b64 = project.thumbnailBase64;

    const { error } = await supabase
      .from('workspace_templates')
      .update(patch)
      .eq('id', id);

    if (error) throw toError(error);
  },

  /** Delete a template (owner only — enforced by RLS) */
  async deleteTemplate(id: string): Promise<void> {
    const { error } = await supabase
      .from('workspace_templates')
      .delete()
      .eq('id', id);
    if (error) throw toError(error);
  },

  /** Duplicate a template within the same workspace */
  async duplicateTemplate(id: string): Promise<WorkspaceTemplate> {
    const src = await TemplateService.getTemplate(id);
    if (!src) throw new Error('Template not found');

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('workspace_templates')
      .insert({
        workspace_id: src.workspace_id,
        name: `${src.name} (Copy)`,
        description: src.description,
        pdf_file_name: src.pdf_file_name,
        base_pdf_b64: src.base_pdf_b64,
        template_schemas: src.template_schemas,
        schema_fields: src.schema_fields,
        field_bindings: src.field_bindings,
        validation_rules: src.validation_rules,
        conditional_rules: src.conditional_rules,
        snapshots: [],
        thumbnail_b64: src.thumbnail_b64,
        created_by: user.id,
        last_modified_by: user.id,
      })
      .select()
      .single();

    if (error) throw toError(error);
    return data as WorkspaceTemplate;
  },

  /** Get generation job history for a template */
  async getGenerationHistory(templateId: string, limit: number = 20) {
    const { data, error } = await supabase
      .from('generation_jobs')
      .select('*')
      .eq('template_id', templateId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw toError(error);
    return data ?? [];
  },
};

