import { useEffect, useState, useRef, useCallback } from 'react';
import { FolderKanban, Plus, Clock, FileText, Trash2, Download, Upload, Copy, Edit2, Check, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StorageService, type PDFProject } from '../services/storage.service';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/bufferUtils';
import type { ISchemaPage } from '../types/pdfme.types';

type ProjectListItem = Omit<PDFProject, 'basePdf'>;

const createProjectId = () => `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function toArrayBuffer(value: PDFProject['basePdf']): ArrayBuffer {
  if (value instanceof ArrayBuffer) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return base64ToArrayBuffer(value);
}

export function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setPdfFileName = useAppStore((s) => s.setPdfFileName);
  const setPdfmeTemplate = useAppStore((s) => s.setPdfmeTemplate);
  const setBasePdfBuffer = useAppStore((s) => s.setBasePdfBuffer);
  const setSchemaFields = useAppStore((s) => s.setSchemaFields);
  const setFieldBindings = useAppStore((s) => s.setFieldBindings);
  const addNotification = useAppStore((s) => s.addNotification);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const setValidationRules = useAppStore((s) => s.setValidationRules);
  const setConditionalRules = useAppStore((s) => s.setConditionalRules);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadProjects = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const list = await StorageService.listProjects();
      setProjects(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    void StorageService.listProjects().then((list) => {
      if (!isMounted) {
        return;
      }
      setProjects(list);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleCreateNew = () => {
    // Clear current store state
    setPdfFileName('');
    setPdfmeTemplate(null);
    setBasePdfBuffer(null);
    setSchemaFields([]);
    setFieldBindings([]);
    setCurrentProjectId(null);
    setActiveTab('editor');
  };

  const handleOpenProject = async (id: string) => {
    try {
      const proj = await StorageService.getProject(id);
      if (!proj) throw new Error('Project not found in DB');
      // Normalize basePdf: support stored ArrayBuffer or base64 string
      const basePdfBuf = toArrayBuffer(proj.basePdf);

      setPdfFileName(proj.pdfFileName);
      setBasePdfBuffer(basePdfBuf);

      setPdfmeTemplate({
        basePdf: basePdfBuf,
        schemas: proj.templateSchemas as ISchemaPage[],
      });
      setSchemaFields(proj.schemaFields as Parameters<typeof setSchemaFields>[0]);
      setFieldBindings(proj.fieldBindings as Parameters<typeof setFieldBindings>[0]);
      setValidationRules((proj.validationRules as Parameters<typeof setValidationRules>[0]) ?? []);
      setConditionalRules((proj.conditionalRules as Parameters<typeof setConditionalRules>[0]) ?? []);
      setCurrentProjectId(proj.id);
      
      addNotification({ message: `Loaded project: ${proj.name}`, level: 'success' });
      setActiveTab('editor');
    } catch {
      addNotification({ message: 'Failed to open project', level: 'error' });
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;
    
    await StorageService.deleteProject(id);
    addNotification({ message: 'Project deleted', level: 'info' });
    loadProjects();
  };

  const handleExportProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const proj = await StorageService.getProject(id);
      if (!proj) throw new Error('Project not found');

      // Convert ArrayBuffer to base64
      let base64Pdf = proj.basePdf;
      if (proj.basePdf instanceof ArrayBuffer) {
        base64Pdf = arrayBufferToBase64(proj.basePdf);
      } else if (proj.basePdf instanceof Uint8Array) {
        base64Pdf = arrayBufferToBase64(
          proj.basePdf.buffer.slice(
            proj.basePdf.byteOffset,
            proj.basePdf.byteOffset + proj.basePdf.byteLength
          ) as ArrayBuffer
        );
      }

      const exportPayload = {
        version: '1.0',
        project: {
          ...proj,
          basePdf: base64Pdf,
        }
      };

      const blob = new Blob([JSON.stringify(exportPayload)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${proj.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdftemplate`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addNotification({ message: 'Project exported successfully', level: 'success' });
    } catch {
      addNotification({ message: 'Failed to export project', level: 'error' });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (payload.version !== '1.0' || !payload.project) {
        throw new Error('Invalid project file format');
      }

      const proj = payload.project;
      
      // Ensure it gets a new ID so we don't accidentally overwrite if they import the same project twice
      proj.id = createProjectId();
      proj.lastModified = Date.now();
      
      if (typeof proj.basePdf === 'string') {
        proj.basePdf = base64ToArrayBuffer(proj.basePdf);
      }

      await StorageService.saveProject(proj);
      addNotification({ message: 'Project imported successfully', level: 'success' });
      loadProjects();
    } catch {
      addNotification({ message: 'Failed to import project. Ensure it is a valid .pdftemplate file.', level: 'error' });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDuplicateProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const proj = await StorageService.getProject(id);
      if (!proj) throw new Error('Project not found');

      const duplicate = {
        ...proj,
        id: createProjectId(),
        name: `${proj.name} (Copy)`,
        lastModified: Date.now(),
      };

      await StorageService.saveProject(duplicate);
      addNotification({ message: 'Project duplicated', level: 'success' });
      loadProjects();
    } catch {
      addNotification({ message: 'Failed to duplicate project', level: 'error' });
    }
  };

  const handleRestoreSnapshot = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const proj = await StorageService.getProject(id);
      if (!proj || !proj.snapshots || proj.snapshots.length === 0) {
        addNotification({ message: 'No snapshots available for this project', level: 'warning' });
        return;
      }

      const latest = proj.snapshots[proj.snapshots.length - 1];
      proj.templateSchemas = latest.templateSchemas;
      proj.schemaFields = latest.schemaFields;
      proj.fieldBindings = latest.fieldBindings;
      proj.lastModified = Date.now();
      await StorageService.saveProject(proj);
      addNotification({ message: 'Restored latest snapshot', level: 'success' });
      loadProjects();
    } catch {
      addNotification({ message: 'Failed to restore snapshot', level: 'error' });
    }
  };

  const startEditing = (p: ProjectListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveRename = async (p: ProjectListItem, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    
    try {
      const proj = await StorageService.getProject(p.id);
      if (proj) {
        proj.name = editName.trim();
        proj.lastModified = Date.now();
        await StorageService.saveProject(proj);
        addNotification({ message: 'Project renamed', level: 'success' });
        loadProjects();
      }
    } catch {
      addNotification({ message: 'Failed to rename project', level: 'error' });
    }
    setEditingId(null);
  };

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 animate-fade-in overflow-y-auto bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <FolderKanban className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Your Projects
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Manage your saved PDF templates and mappings
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              accept=".pdftemplate" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleImportFile}
              tabIndex={-1}
            />
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors"
            >
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button 
              onClick={handleCreateNew} 
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500 dark:text-slate-400 animate-pulse">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
            Loading projects...
          </div>
        ) : projects.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center gap-4">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center">
              <FolderKanban className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">No projects yet</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mt-1">Create your first project to start visually designing and mapping your PDFs.</p>
            </div>
            <button 
              onClick={handleCreateNew} 
              className="inline-flex items-center justify-center gap-2 px-4 py-2 mt-2 rounded-lg text-sm font-medium bg-indigo-600 text-white shadow-sm hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors"
            >
              Create New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((p) => (
              <div 
                key={p.id} 
                className="group relative flex flex-col bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 overflow-hidden"
                onClick={() => handleOpenProject(p.id)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleOpenProject(p.id);
                  }
                }}
                role="button"
                aria-label={`Open project ${p.name}`}
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-[4/3] bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center border-b border-slate-100 dark:border-slate-800 relative overflow-hidden">
                  <FileText className="w-12 h-12 text-slate-300 dark:text-slate-600 mb-2 transition-transform group-hover:scale-110 duration-300" />
                  <span className="text-xs font-mono text-slate-400 dark:text-slate-500 px-4 truncate w-full text-center">{p.pdfFileName}</span>
                  
                  {/* Hover overlay actions */}
                  <div className="absolute inset-0 bg-indigo-900/5 dark:bg-indigo-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <span className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-semibold bg-white text-indigo-600 shadow-sm">
                      Open Project
                    </span>
                  </div>
                </div>
                
                {/* Info */}
                <div className="p-4 flex-1 flex flex-col">
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                    <button 
                      onClick={(e) => startEditing(p, e)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title="Rename Project"
                      aria-label="Rename Project"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => handleDuplicateProject(p.id, e)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title="Duplicate Project"
                      aria-label="Duplicate Project"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => handleExportProject(p.id, e)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      title="Export Project"
                      aria-label="Export Project"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => handleRestoreSnapshot(p.id, e)}
                      className="p-1.5 text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      title="Restore latest snapshot"
                      aria-label="Restore latest snapshot"
                    >
                      <Clock className="w-3.5 h-3.5" />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteProject(p.id, e)}
                      className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      title="Delete Project"
                      aria-label="Delete Project"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  
                  {editingId === p.id ? (
                    <div className="flex items-center gap-1.5 relative z-10" onClick={e => e.stopPropagation()}>
                      <input 
                        type="text" 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveRename(p, e)}
                        autoFocus
                        className="flex-1 w-full text-sm font-semibold bg-transparent border-b-2 border-indigo-500 focus:outline-none text-slate-900 dark:text-white px-1 py-0.5"
                      />
                      <button onClick={(e) => saveRename(p, e)} className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded" aria-label="Save rename"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded" aria-label="Cancel rename"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <h3 className="font-semibold text-slate-900 dark:text-white truncate pr-6">{p.name}</h3>
                  )}
                  
                  <div className="mt-auto pt-3 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5" /> {new Date(p.lastModified).toLocaleDateString()}</span>
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
