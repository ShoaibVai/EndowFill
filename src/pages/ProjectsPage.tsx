/**
 * ProjectsPage.tsx — Templates tab inside the WorkspaceShell.
 *
 * Fetches templates from Supabase (TemplateService) scoped to the
 * currently active workspace (activeWorkspaceId from the store).
 * All IndexedDB / local-storage project logic has been removed.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  FolderKanban,
  Plus,
  Clock,
  FileText,
  Trash2,
  Download,
  Upload,
  Copy,
  Edit2,
  Check,
  X,
  Building2,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { TemplateService } from '../services/template.service';
import type { WorkspaceTemplate } from '../services/template.service';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/bufferUtils';
import type { ISchemaPage } from '../types/pdfme.types';
import { PageHeader } from '../components/ui/PageHeader';

export function ProjectsPage() {
  const navigate = useNavigate();

  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveTab      = useAppStore((s) => s.setActiveTab);
  const setPdfFileName    = useAppStore((s) => s.setPdfFileName);
  const setPdfmeTemplate  = useAppStore((s) => s.setPdfmeTemplate);
  const setBasePdfBuffer  = useAppStore((s) => s.setBasePdfBuffer);
  const setSchemaFields   = useAppStore((s) => s.setSchemaFields);
  const setFieldBindings  = useAppStore((s) => s.setFieldBindings);
  const addNotification   = useAppStore((s) => s.addNotification);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const setValidationRules  = useAppStore((s) => s.setValidationRules);
  const setConditionalRules = useAppStore((s) => s.setConditionalRules);

  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName]   = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Load templates ─────────────────────────────────────────────────────
  const loadTemplates = useCallback(async (showLoading = true) => {
    if (!activeWorkspaceId) { setIsLoading(false); return; }
    if (showLoading) setIsLoading(true);
    try {
      const list = await TemplateService.listTemplates(activeWorkspaceId);
      setTemplates(list);
    } catch {
      addNotification({ message: 'Failed to load templates', level: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [activeWorkspaceId, addNotification]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // ── Open template ──────────────────────────────────────────────────────
  const handleOpenTemplate = async (tpl: WorkspaceTemplate) => {
    try {
      const full = await TemplateService.getTemplate(tpl.id);
      if (!full) throw new Error('Template not found');

      const buf = full.base_pdf_b64 ? base64ToArrayBuffer(full.base_pdf_b64) : new ArrayBuffer(0);

      setPdfFileName(full.pdf_file_name);
      setBasePdfBuffer(buf);
      setPdfmeTemplate({ basePdf: buf, schemas: full.template_schemas as ISchemaPage[] });
      setSchemaFields(full.schema_fields as Parameters<typeof setSchemaFields>[0]);
      setFieldBindings(full.field_bindings as Parameters<typeof setFieldBindings>[0]);
      setValidationRules((full.validation_rules as Parameters<typeof setValidationRules>[0]) ?? []);
      setConditionalRules((full.conditional_rules as Parameters<typeof setConditionalRules>[0]) ?? []);
      setCurrentProjectId(full.id);

      addNotification({ message: `Loaded: ${full.name}`, level: 'success' });
      setActiveTab('editor');
    } catch {
      addNotification({ message: 'Failed to open template', level: 'error' });
    }
  };

  // ── Create new blank template ──────────────────────────────────────────
  const handleCreateNew = () => {
    setPdfFileName('');
    setPdfmeTemplate(null);
    setBasePdfBuffer(null);
    setSchemaFields([]);
    setFieldBindings([]);
    setCurrentProjectId(null);
    setActiveTab('editor');
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const handleDelete = async (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${tpl.name}"?`)) return;
    try {
      await TemplateService.deleteTemplate(tpl.id);
      addNotification({ message: 'Template deleted', level: 'info' });
      loadTemplates(false);
    } catch {
      addNotification({ message: 'Failed to delete template', level: 'error' });
    }
  };

  // ── Duplicate ──────────────────────────────────────────────────────────
  const handleDuplicate = async (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await TemplateService.duplicateTemplate(tpl.id);
      addNotification({ message: 'Template duplicated', level: 'success' });
      loadTemplates(false);
    } catch {
      addNotification({ message: 'Failed to duplicate template', level: 'error' });
    }
  };

  // ── Export (.pdftemplate JSON) ─────────────────────────────────────────
  const handleExport = async (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const full = await TemplateService.getTemplate(tpl.id);
      if (!full) throw new Error('Template not found');

      const payload = {
        version: '1.0',
        project: {
          id: full.id,
          name: full.name,
          pdfFileName: full.pdf_file_name,
          basePdf: full.base_pdf_b64,
          templateSchemas: full.template_schemas,
          schemaFields: full.schema_fields,
          fieldBindings: full.field_bindings,
          validationRules: full.validation_rules,
          conditionalRules: full.conditional_rules,
          lastModified: Date.now(),
        },
      };

      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `${tpl.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdftemplate`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);

      addNotification({ message: 'Template exported', level: 'success' });
    } catch {
      addNotification({ message: 'Failed to export template', level: 'error' });
    }
  };

  // ── Import (.pdftemplate JSON) ─────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeWorkspaceId) return;
    try {
      const text    = await file.text();
      const payload = JSON.parse(text);
      if (payload.version !== '1.0' || !payload.project) throw new Error('Invalid format');

      const p = payload.project;
      let basePdf = p.basePdf;
      if (basePdf instanceof ArrayBuffer) basePdf = arrayBufferToBase64(basePdf);

      await TemplateService.createTemplate(activeWorkspaceId, {
        name: p.name,
        description: p.description,
        pdfFileName: p.pdfFileName,
        basePdf: basePdf ?? '',
        templateSchemas: p.templateSchemas,
        schemaFields: p.schemaFields,
        fieldBindings: p.fieldBindings,
        validationRules: p.validationRules,
        conditionalRules: p.conditionalRules,
        lastModified: Date.now(),
        snapshots: [],
      });

      addNotification({ message: 'Template imported successfully', level: 'success' });
      loadTemplates(false);
    } catch {
      addNotification({ message: 'Failed to import. Ensure it is a valid .pdftemplate file.', level: 'error' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── Rename ─────────────────────────────────────────────────────────────
  const startEditing = (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(tpl.id);
    setEditName(tpl.name);
  };

  const saveRename = async (tpl: WorkspaceTemplate, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await TemplateService.updateTemplate(tpl.id, { name: editName.trim() });
      addNotification({ message: 'Template renamed', level: 'success' });
      loadTemplates(false);
    } catch {
      addNotification({ message: 'Failed to rename template', level: 'error' });
    }
    setEditingId(null);
  };

  // ── No workspace selected ──────────────────────────────────────────────
  if (!activeWorkspaceId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 animate-fade-in">
        <div className="empty-state__icon">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-ink mb-1">No Workspace Selected</h3>
          <p className="text-sm text-ink-muted max-w-sm">
            Select a workspace from the home page to manage its templates here.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => navigate('/home')}
          id="go-to-home-btn"
        >
          <Building2 className="w-4 h-4" />
          Go to Workspaces
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 animate-fade-in bg-transparent">
      <div className="mx-auto flex max-w-7xl flex-col gap-8">

        {/* Header */}
        <PageHeader
          icon={<FolderKanban className="w-6 h-6" />}
          title="Templates"
          subtitle="Manage your saved PDF templates and field mappings"
          actions={
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".pdftemplate"
                className="hidden"
                ref={fileInputRef}
                onChange={handleImport}
                tabIndex={-1}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="btn btn-ghost btn-sm"
                id="import-template-btn"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <button
                onClick={handleCreateNew}
                className="btn btn-primary btn-sm"
                id="new-template-btn"
              >
                <Plus className="w-4 h-4" />
                New Template
              </button>
            </div>
          }
        />

        {/* Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-ink-muted animate-pulse">
            <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mb-4" />
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-4 p-12 text-center" style={{ border: '2px dashed var(--border-strong)' }}>
            <div className="empty-state__icon">
              <FolderKanban className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">No templates yet</h3>
              <p className="text-ink-muted max-w-sm mt-1">
                Create your first template to start designing and mapping your PDFs.
              </p>
            </div>
            <button
              onClick={handleCreateNew}
              className="btn btn-primary mt-2"
            >
              <Plus className="w-4 h-4" />
              Create New Template
            </button>
            <p className="text-xs text-ink-faint flex items-center gap-1">
              <Sparkles className="w-3 h-3" />
              Tip: use Form Fields to turn an existing PDF into a fillable template automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="group relative flex flex-col card rounded-xl overflow-hidden transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                onClick={() => handleOpenTemplate(tpl)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenTemplate(tpl);
                  }
                }}
                role="button"
                aria-label={`Open template ${tpl.name}`}
                id={`tpl-card-${tpl.id}`}
              >
                {/* Thumbnail */}
                <div className="aspect-[4/3] bg-inset flex flex-col items-center justify-center border-b border-subtle relative overflow-hidden">
                  {tpl.thumbnail_b64 ? (
                    <img src={`data:image/png;base64,${tpl.thumbnail_b64}`} alt={tpl.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-12 h-12 text-ink-faint mb-2 transition-transform group-hover:scale-110 duration-300" />
                  )}
                  <div className="absolute inset-0 bg-primary-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold bg-surface text-primary-600 shadow-md">
                      Open Template
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col">
                  {/* Hover action buttons */}
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-surface/90 backdrop-blur-sm p-1 rounded-lg border border-subtle shadow-sm">
                    <button
                      onClick={(e) => startEditing(tpl, e)}
                      className="p-1.5 text-ink-faint hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-md transition-colors"
                      title="Rename"
                      aria-label="Rename template"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(tpl, e)}
                      className="p-1.5 text-ink-faint hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-md transition-colors"
                      title="Duplicate"
                      aria-label="Duplicate template"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleExport(tpl, e)}
                      className="p-1.5 text-ink-faint hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-md transition-colors"
                      title="Export"
                      aria-label="Export template"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(tpl, e)}
                      className="p-1.5 text-ink-faint hover:text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10 rounded-md transition-colors"
                      title="Delete"
                      aria-label="Delete template"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Name (editable) */}
                  {editingId === tpl.id ? (
                    <div className="flex items-center gap-1.5 relative z-10" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveRename(tpl, e)}
                        autoFocus
                        className="flex-1 w-full text-sm font-semibold bg-transparent border-b-2 border-primary-500 focus:outline-none text-ink px-1 py-0.5"
                      />
                      <button onClick={(e) => saveRename(tpl, e)} className="p-1 text-success-600 hover:bg-success-50 dark:hover:bg-success-500/10 rounded" aria-label="Save rename">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 text-error-600 hover:bg-error-50 dark:hover:bg-error-500/10 rounded" aria-label="Cancel rename">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-ink truncate pr-6">{tpl.name}</h3>
                  )}

                  <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-ink-muted">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(tpl.updated_at).toLocaleDateString()}
                    </span>
                    {tpl.last_modified_by_profile && (
                      <span className="truncate">
                        by {tpl.last_modified_by_profile.full_name || tpl.last_modified_by_profile.email}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
