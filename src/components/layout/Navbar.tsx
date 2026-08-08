/**
 * Navbar.tsx — Top action bar: brand (mobile), active file pill, save
 * status, Save button, guided tour, and theme toggle.
 *
 * The primary navigation lives in TabNav (sidebar / bottom bar); this bar
 * stays focused on the current template + save flow.
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
    <div className="navbar-row">
      {/* Brand — mobile only (desktop brand lives in the sidebar) */}
      <div className="navbar-brand lg:hidden">
        <div className="navbar-brand-icon">
          <FileText className="w-5 h-5" />
        </div>
        <div>
          <div className="navbar-brand-text">EndowFill</div>
          <div className="navbar-brand-tag">Fill · Generate · Deliver</div>
        </div>
      </div>

      {/* Active file pill */}
      {pdfFileName && (
        <div className="hidden md:flex">
          <div className="navbar-file-pill">
            <FileText className="w-4 h-4 navbar-file-icon" />
            <span className="navbar-file-text">{pdfFileName}</span>
          </div>
        </div>
      )}

      {/* Right — save status + actions */}
      <div className="navbar-actions">
        {hasUnsavedChanges && (
          <span className="badge badge-warning animate-fade-in">
            <Save className="w-3 h-3" />
            Unsaved
          </span>
        )}
        {lastSavedAt && !hasUnsavedChanges && (
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-ink-muted font-medium">
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
          id="help-tour-btn"
          onClick={startTour}
          aria-label="Start guided tour"
          title="Start Guided Tour"
          className="navbar-icon-btn"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
        <div className="ml-1 pl-3 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
