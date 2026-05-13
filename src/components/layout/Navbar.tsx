/**
 * Navbar.tsx — Top navigation bar with branding and status indicators.
 */

import { FileText, Save, Clock, Cloud, HelpCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { TemplateService } from '../../services/template.service';
import { ThemeToggle } from '../settings/ThemeToggle';
import { useHelpTour } from '../../hooks/useHelpTour';

export function Navbar() {
  const lastSavedAt = useAppStore((s) => s.lastSavedAt);
  const hasUnsavedChanges = useAppStore((s) => s.hasUnsavedChanges);
  const pdfFileName = useAppStore((s) => s.pdfFileName);
  const { startTour } = useHelpTour();
  
  const addNotification = useAppStore((s) => s.addNotification);
  const pdfmeTemplate = useAppStore((s) => s.pdfmeTemplate);
  const basePdfBuffer = useAppStore((s) => s.basePdfBuffer);
  const schemaFields = useAppStore((s) => s.schemaFields);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const validationRules = useAppStore((s) => s.validationRules);
  const conditionalRules = useAppStore((s) => s.conditionalRules);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);
  const setLastSavedAt = useAppStore((s) => s.setLastSavedAt);

  const saveToCloud = async () => {
    if (!pdfmeTemplate || !basePdfBuffer || !activeWorkspaceId) {
      addNotification({ message: 'No active template or workspace to save', level: 'warning' });
      return;
    }
    
    try {
      const patch = {
        name: pdfFileName || 'Untitled Template',
        pdfFileName,
        basePdf: basePdfBuffer,
        templateSchemas: pdfmeTemplate.schemas,
        schemaFields,
        fieldBindings,
        validationRules,
        conditionalRules,
        lastModified: Date.now(),
      };

      if (currentProjectId) {
        await TemplateService.updateTemplate(currentProjectId, patch);
      } else {
        const created = await TemplateService.createTemplate(activeWorkspaceId, {
          ...patch,
          snapshots: [],
        });
        setCurrentProjectId(created.id);
      }
      
      setLastSavedAt(Date.now());
      setHasUnsavedChanges(false);
      addNotification({ message: 'Project saved successfully to Cloud!', level: 'success' });
    } catch {
      addNotification({ message: 'Failed to save project', level: 'error' });
    }
  };


  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="px-6 py-3 flex items-center justify-between">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="navbar-brand-icon">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
            PDF Template Master
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Design · Map · Generate
          </p>
        </div>
      </div>

      {/* Center — Active file */}
      {pdfFileName && (
        <div className="navbar-file-pill">
          <FileText className="w-4 h-4 navbar-file-icon" />
          <span className="navbar-file-text">
            {pdfFileName}
          </span>
        </div>
      )}

      {/* Right — Save status */}
      <div className="flex items-center gap-3">
        {hasUnsavedChanges && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 animate-fade-in">
            <Save className="w-3 h-3" />
            Unsaved
          </span>
        )}
        {lastSavedAt && !hasUnsavedChanges && (
          <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
            <Clock className="w-3.5 h-3.5" />
            Saved {formatTime(lastSavedAt)}
          </span>
        )}
        <button 
          onClick={saveToCloud} 
          disabled={!basePdfBuffer || !activeWorkspaceId}
          aria-label="Save project to cloud"
          className="navbar-btn navbar-btn--primary"
        >
          <Cloud className="w-4 h-4" /> Save
        </button>
        <button 
          onClick={startTour} 
          aria-label="Start guided tour"
          title="Start Guided Tour"
          className="inline-flex items-center justify-center p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        <div className="ml-1 pl-3 border-l border-slate-200 dark:border-slate-700">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
