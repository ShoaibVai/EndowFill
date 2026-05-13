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
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { TemplateService } from '../services/template.service';
import type { WorkspaceTemplate } from '../services/template.service';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/bufferUtils';
import type { ISchemaPage } from '../types/pdfme.types';

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
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-amber-50 text-amber-500">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">No Workspace Selected</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
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
    <div className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Templates
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Manage your saved PDF templates and field mappings
              </p>
            </div>
          </div>

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
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              id="import-template-btn"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary-600 text-white shadow-sm hover:bg-primary-700 transition-colors"
              id="new-template-btn"
            >
              <Plus className="w-4 h-4" />
              New Template
            </button>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 animate-pulse">
            <div className="w-8 h-8 border-4 border-red-200 border-t-red-600 rounded-full animate-spin mb-4" />
            Loading templates…
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <FolderKanban className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">No templates yet</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mt-1">
                Create your first template to start designing and mapping your PDFs.
              </p>
            </div>
            <button
              onClick={handleCreateNew}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 mt-2 rounded-lg text-sm font-medium bg-primary-600 text-white shadow-sm hover:bg-primary-700 transition-colors"
            >
              Create New Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="group relative flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-red-300 dark:hover:border-red-700 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 overflow-hidden"
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
                <div className="aspect-[4/3] bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center border-b border-slate-100 dark:border-slate-800 relative overflow-hidden">
                  {tpl.thumbnail_b64 ? (
                    <img src={`data:image/png;base64,${tpl.thumbnail_b64}`} alt={tpl.name} className="w-full h-full object-cover" />
                  ) : (
                    <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2 transition-transform group-hover:scale-110 duration-300" />
                  )}
                  <div className="absolute inset-0 bg-red-900/5 dark:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-red-600 shadow-sm">
                      Open Template
                    </span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4 flex-1 flex flex-col">
                  {/* Hover action buttons */}
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button
                      onClick={(e) => startEditing(tpl, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Rename"
                      aria-label="Rename template"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(tpl, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Duplicate"
                      aria-label="Duplicate template"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleExport(tpl, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                      title="Export"
                      aria-label="Export template"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(tpl, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
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
                        className="flex-1 w-full text-sm font-semibold bg-transparent border-b-2 border-red-500 focus:outline-none text-slate-900 dark:text-white px-1 py-0.5"
                      />
                      <button onClick={(e) => saveRename(tpl, e)} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded" aria-label="Save rename">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" aria-label="Cancel rename">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate pr-6">{tpl.name}</h3>
                  )}

                  <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
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
