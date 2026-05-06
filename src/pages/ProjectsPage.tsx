import { useEffect, useState, useRef } from 'react';
import { FolderKanban, Plus, Clock, FileText, Trash2, Download, Upload, Copy, Edit2, Check, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { StorageService } from '../services/storage.service';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/bufferUtils';

export function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
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

  const loadProjects = async () => {
    setIsLoading(true);
    const list = await StorageService.listProjects();
    setProjects(list);
    setIsLoading(false);
  };

  useEffect(() => {
    loadProjects();
  }, []);

  const handleCreateNew = () => {
    // Clear current store state
    setPdfFileName('');
    setPdfmeTemplate(null as any);
    setBasePdfBuffer(null as any);
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
      let basePdfBuf: ArrayBuffer | null = null;
      if (!proj.basePdf) {
        basePdfBuf = null;
      } else if (typeof proj.basePdf === 'string') {
        basePdfBuf = base64ToArrayBuffer(proj.basePdf as string);
      } else if (proj.basePdf instanceof ArrayBuffer) {
        basePdfBuf = proj.basePdf as ArrayBuffer;
      } else if (proj.basePdf instanceof Uint8Array) {
        basePdfBuf = (proj.basePdf as Uint8Array).buffer;
      }

      setPdfFileName(proj.pdfFileName);
      if (basePdfBuf) {
        setBasePdfBuffer(basePdfBuf);
      } else {
        setBasePdfBuffer(null as any);
      }

      setPdfmeTemplate({
        basePdf: basePdfBuf,
        schemas: proj.templateSchemas as any,
      });
      setSchemaFields(proj.schemaFields as any);
      setFieldBindings(proj.fieldBindings as any);
      setValidationRules((proj.validationRules as any) ?? []);
      setConditionalRules((proj.conditionalRules as any) ?? []);
      setCurrentProjectId(proj.id);
      
      addNotification({ message: `Loaded project: ${proj.name}`, level: 'success' });
      setActiveTab('editor');
    } catch (e) {
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
    } catch (err) {
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
      proj.id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      proj.lastModified = Date.now();
      
      if (typeof proj.basePdf === 'string') {
        proj.basePdf = base64ToArrayBuffer(proj.basePdf);
      }

      await StorageService.saveProject(proj);
      addNotification({ message: 'Project imported successfully', level: 'success' });
      loadProjects();
    } catch (err) {
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
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `${proj.name} (Copy)`,
        lastModified: Date.now(),
      };

      await StorageService.saveProject(duplicate);
      addNotification({ message: 'Project duplicated', level: 'success' });
      loadProjects();
    } catch (err) {
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

  const startEditing = (p: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveRename = async (p: any, e: React.MouseEvent | React.KeyboardEvent) => {
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
    } catch (err) {
      addNotification({ message: 'Failed to rename project', level: 'error' });
    }
    setEditingId(null);
  };

  return (
    <div className="flex-1 p-6 animate-fade-in overflow-y-auto">
      <div className="max-w-6xl mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-indigo-100">
              <FolderKanban className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-surface-900)' }}>
                Your Projects
              </h2>
              <p className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
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
            />
            <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary shadow-sm">
              <Upload className="w-4 h-4" />
              Import
            </button>
            <button onClick={handleCreateNew} className="btn btn-primary shadow-md">
              <Plus className="w-4 h-4" />
              New Project
            </button>
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-500">Loading projects...</div>
        ) : projects.length === 0 ? (
          <div className="card p-12 text-center flex flex-col items-center justify-center gap-4 border-dashed border-2">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
              <FolderKanban className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">No projects yet</h3>
              <p className="text-gray-500 max-w-sm mt-1">Create your first project to start visually designing and mapping your PDFs.</p>
            </div>
            <button onClick={handleCreateNew} className="btn btn-primary mt-2">
              Create New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {projects.map((p) => (
              <div 
                key={p.id} 
                className="card group cursor-pointer hover:border-indigo-300 hover:shadow-lg transition-all"
                onClick={() => handleOpenProject(p.id)}
              >
                {/* Thumbnail placeholder */}
                <div className="aspect-[4/3] bg-gray-50 flex flex-col items-center justify-center border-b border-gray-100 relative overflow-hidden">
                  <FileText className="w-12 h-12 text-gray-300 mb-2" />
                  <span className="text-xs font-mono text-gray-400">{p.pdfFileName}</span>
                  
                  {/* Hover overlay actions */}
                  <div className="absolute inset-0 bg-indigo-900/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                    <button className="btn btn-primary btn-sm shadow-xl">Open Project</button>
                  </div>
                </div>
                
                {/* Info */}
                <div className="p-4 relative">
                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => startEditing(p, e)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Rename Project"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => handleDuplicateProject(p.id, e)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Duplicate Project"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => handleExportProject(p.id, e)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                      title="Export Project"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => handleRestoreSnapshot(p.id, e)}
                      className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-md transition-colors"
                      title="Restore latest snapshot"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={(e) => handleDeleteProject(p.id, e)}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete Project"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {editingId === p.id ? (
                    <div className="pr-16 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input 
                        type="text" 
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveRename(p, e)}
                        autoFocus
                        className="w-full text-sm border-b-2 border-indigo-500 focus:outline-none bg-transparent"
                      />
                      <button onClick={(e) => saveRename(p, e)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3 h-3" /></button>
                      <button onClick={(e) => { e.stopPropagation(); setEditingId(null); }} className="p-1 text-red-600 hover:bg-red-50 rounded"><X className="w-3 h-3" /></button>
                    </div>
                  ) : (
                    <h3 className="font-bold text-gray-800 truncate pr-28">{p.name}</h3>
                  )}
                  
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(p.lastModified).toLocaleDateString()}</span>
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
