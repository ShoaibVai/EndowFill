/**
 * WorkspaceShell.tsx — Wrapper that renders the existing PDF workspace.
 *
 * This component is lazy-loaded from App.tsx so the auth/landing
 * experience is fully separate from the heavy PDF editor bundle.
 *
 * It keeps the original tab-nav, auto-save, notifications, and theme
 * logic untouched, but accepts an optional `initialTab` prop that
 * lets the HomePage's quick-action cards deep-link into a specific tab.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { TabNav } from './components/layout/TabNav';
import ErrorBoundary from './components/errors/ErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { useAutoSave } from './hooks/useAutoSave';
import { WorkspaceService } from './services/workspace.service';
import { TemplateService } from './services/template.service';
import { base64ToArrayBuffer } from './utils/bufferUtils';

const EditorPage = lazy(() =>
  import('./pages/EditorPage').then((m) => ({ default: m.EditorPage }))
);
const BulkGeneratePage = lazy(() =>
  import('./pages/BulkGeneratePage').then((m) => ({ default: m.BulkGeneratePage }))
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);

interface WorkspaceShellProps {}

export default function WorkspaceShell({}: WorkspaceShellProps) {
  const location = useLocation();
  const activeTab = useAppStore((s) => s.activeTab);
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const currentProjectId = useAppStore((s) => s.currentProjectId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const setPdfFileName = useAppStore((s) => s.setPdfFileName);
  const setPdfmeTemplate = useAppStore((s) => s.setPdfmeTemplate);
  const setBasePdfBuffer = useAppStore((s) => s.setBasePdfBuffer);
  const setSchemaFields = useAppStore((s) => s.setSchemaFields);
  const setFieldBindings = useAppStore((s) => s.setFieldBindings);
  const setValidationRules = useAppStore((s) => s.setValidationRules);
  const setConditionalRules = useAppStore((s) => s.setConditionalRules);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  // Auto-save template to Supabase
  useAutoSave();

  // Auto-dismiss notifications after their duration
  useEffect(() => {
    if (notifications.length === 0) return;
    const timers = notifications.map((n) =>
      setTimeout(() => removeNotification(n.id), n.duration ?? 4000)
    );
    return () => timers.forEach(clearTimeout);
  }, [notifications, removeNotification]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const workspaceId = params.get('workspaceId');
    const templateId = params.get('templateId');

    if (!workspaceId && !templateId) return;

    let cancelled = false;

    const bootstrap = async () => {
      setIsBootstrapping(true);

      try {
        if (workspaceId && workspaceId !== activeWorkspaceId) {
          const workspace = await WorkspaceService.getWorkspace(workspaceId);
          if (workspace && !cancelled) {
            setActiveWorkspaceId(workspace.id);
          }
        }

        if (templateId && templateId !== currentProjectId) {
          const template = await TemplateService.getTemplate(templateId);
          if (template && !cancelled) {
            const basePdf = template.base_pdf_b64
              ? base64ToArrayBuffer(template.base_pdf_b64)
              : new ArrayBuffer(0);

            setActiveWorkspaceId(template.workspace_id);
            setCurrentProjectId(template.id);
            setPdfFileName(template.pdf_file_name);
            setBasePdfBuffer(basePdf);
            setPdfmeTemplate({ basePdf, schemas: template.template_schemas as never[] });
            setSchemaFields(template.schema_fields as Parameters<typeof setSchemaFields>[0]);
            setFieldBindings(template.field_bindings as Parameters<typeof setFieldBindings>[0]);
            setValidationRules((template.validation_rules as Parameters<typeof setValidationRules>[0]) ?? []);
            setConditionalRules((template.conditional_rules as Parameters<typeof setConditionalRules>[0]) ?? []);
            setActiveTab('editor');
          }
        } else if (workspaceId && !templateId) {
          setActiveWorkspaceId(workspaceId);
          setActiveTab('editor');
        }
      } finally {
        if (!cancelled) setIsBootstrapping(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    activeWorkspaceId,
    currentProjectId,
    location.search,
    setActiveTab,
    setActiveWorkspaceId,
    setBasePdfBuffer,
    setConditionalRules,
    setCurrentProjectId,
    setFieldBindings,
    setPdfFileName,
    setPdfmeTemplate,
    setSchemaFields,
    setValidationRules,
  ]);

  if (isBootstrapping) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-500 animate-pulse">
        Loading workspace…
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        <header className="app-header">
          <Navbar />
          <TabNav />
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-h-0 relative">
          <Suspense
            fallback={
              <div className="flex items-center justify-center p-12 text-slate-500 animate-pulse">
                Loading workspace…
              </div>
            }
          >
            {activeTab === 'projects' ? (
              <ErrorBoundary>
                <ProjectsPage />
              </ErrorBoundary>
            ) : activeTab === 'editor' ? (
              <ErrorBoundary>
                <EditorPage />
              </ErrorBoundary>
            ) : (
              <ErrorBoundary>
                <BulkGeneratePage />
              </ErrorBoundary>
            )}
          </Suspense>
        </main>

        {/* Toast notifications */}
        {notifications.length > 0 && (
          <div
            className="toast-container"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`toast toast-${n.level}`}
                onClick={() => removeNotification(n.id)}
                aria-label={`${n.level} notification`}
              >
                {n.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
