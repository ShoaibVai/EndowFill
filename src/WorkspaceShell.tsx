/**
 * WorkspaceShell.tsx — Wrapper that renders the existing PDF workspace.
 *
 * This component is lazy-loaded from App.tsx so the auth/landing
 * experience is fully separate from the heavy PDF editor bundle.
 *
 * Layout (EndowFill Design System v2):
 *   ┌────────────────────────────────────────────────┐
 *   │ header: Navbar (brand/file/save/help/theme)    │
 *   ├──────────────┬─────────────────────────────────┤
 *   │ sidebar (lg) │ main — active page              │
 *   │ durable nav  │                                 │
 *   ├──────────────┴─────────────────────────────────┤
 *   │ bottom tab bar (mobile) + More drawer          │
 *   └────────────────────────────────────────────────┘
 *
 * The navigation is ALWAYS visible (never renders null), so every tab —
 * including the AI Scan / Form Fields / Bulk Scan / Bulk Generate pages —
 * is reachable from any view.
 */

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { TabNav } from './components/layout/TabNav';
import ErrorBoundary from './components/errors/ErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { useAutoSave } from './hooks/useAutoSave';
import { WorkspaceService } from './services/workspace.service';
import { TemplateService } from './services/template.service';
import { base64ToArrayBuffer } from './utils/bufferUtils';
import type { ExtractedItem } from './types/scan.types';

const EditorPage = lazy(() =>
  import('./pages/EditorPage').then((m) => ({ default: m.EditorPage }))
);
const BulkGeneratePage = lazy(() =>
  import('./pages/BulkGeneratePage').then((m) => ({ default: m.BulkGeneratePage }))
);
const ProjectsPage = lazy(() =>
  import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage }))
);
const AIScanPage = lazy(() =>
  import('./pages/AIScanPage').then((m) => ({ default: m.AIScanPage }))
);
const AIFieldsPage = lazy(() =>
  import('./pages/AIFieldsPage').then((m) => ({ default: m.AIFieldsPage }))
);
const BulkScanPage = lazy(() =>
  import('./pages/BulkScanPage').then((m) => ({ default: m.BulkScanPage }))
);

export default function WorkspaceShell() {
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
  const setExtractedItems = useAppStore((s) => s.setExtractedItems);
  const [isBootstrapping, setIsBootstrapping] = useState(false);

  // Auto-save template to Supabase
  useAutoSave();

  /**
   * AI Scan handoff: keep the reviewed items in the store so the Bulk
   * Generate tab's "AI Scans" source mode can map them onto template fields.
   */
  const handleScanExtracted = useCallback(
    (items: ExtractedItem[]) => {
      setExtractedItems(items);
    },
    [setExtractedItems]
  );

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
      <div className="auth-splash" role="status">
        <div className="auth-splash__spinner" aria-hidden="true" />
        <p className="auth-splash__text">Opening workspace…</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="app-shell">
        {/* Top bar: brand (mobile), file pill, save status, help, theme */}
        <header className="app-header">
          <Navbar />
        </header>

        {/* Sidebar + content */}
        <div className="app-body">
          {/* Durable navigation — desktop sidebar, mobile bottom bar + drawer */}
          <TabNav />

          {/* Main content */}
          <main className="app-main" id="app-main">
            <Suspense
              fallback={
                <div className="flex items-center justify-center p-12 text-ink-muted animate-pulse">
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
              ) : activeTab === 'scan' ? (
                <ErrorBoundary>
                  <AIScanPage onExtracted={handleScanExtracted} />
                </ErrorBoundary>
              ) : activeTab === 'form-fields' ? (
                <ErrorBoundary>
                  <AIFieldsPage />
                </ErrorBoundary>
              ) : activeTab === 'bulk-scan' ? (
                <ErrorBoundary>
                  <BulkScanPage />
                </ErrorBoundary>
              ) : (
                <ErrorBoundary>
                  <BulkGeneratePage />
                </ErrorBoundary>
              )}
            </Suspense>
          </main>
        </div>

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
