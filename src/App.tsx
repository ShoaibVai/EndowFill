/**
 * App.tsx — Root application component.
 *
 * Handles tab navigation between Editor and Bulk Generate pages,
 * auto-save restoration, and toast notifications.
 */

import { lazy, Suspense, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { TabNav } from './components/layout/TabNav';
import { RestoreSessionModal } from './components/modals/RestoreSessionModal';
import ErrorBoundary from './components/errors/ErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { useAutoSave } from './hooks/useAutoSave';

const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const BulkGeneratePage = lazy(() => import('./pages/BulkGeneratePage').then((m) => ({ default: m.BulkGeneratePage })));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const notifications = useAppStore((s) => s.notifications);
  const removeNotification = useAppStore((s) => s.removeNotification);

  const { hasSavedSession, savedSessionInfo, restoreSession, dismissSession } = useAutoSave();

  // Auto-dismiss notifications after their duration
  useEffect(() => {
    if (notifications.length === 0) return;

    const timers = notifications.map((n) =>
      setTimeout(
        () => removeNotification(n.id),
        n.duration ?? 4000
      )
    );

    return () => timers.forEach(clearTimeout);
  }, [notifications, removeNotification]);

  // Hydrate theme preference once on app boot
  useEffect(() => {
    const saved = window.localStorage.getItem('app-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      setTheme(saved);
    }
  }, [setTheme]);

  // Apply and persist theme
  useEffect(() => {
    const root = document.documentElement;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const effective = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
    root.setAttribute('data-theme', effective);
    window.localStorage.setItem('app-theme', theme);
  }, [theme]);

  return (
    <ErrorBoundary>
      <div className="flex flex-col min-h-screen text-slate-900 dark:text-slate-50 bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
        <header className="flex flex-col z-40 sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
          <Navbar />
          <TabNav />
        </header>

        {/* Main content */}
        <main className="flex-1 flex flex-col min-h-0 relative">
          <Suspense fallback={
            <div className="flex items-center justify-center p-12 text-slate-500 animate-pulse">
              Loading workspace...
            </div>
          }>
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

        {/* Restore session modal */}
        {hasSavedSession && savedSessionInfo && (
          <RestoreSessionModal
            pdfFileName={savedSessionInfo.pdfFileName}
            timestamp={savedSessionInfo.timestamp}
            onRestore={restoreSession}
            onDismiss={dismissSession}
          />
        )}

        {/* Toast notifications */}
        {notifications.length > 0 && (
          <div className="toast-container" role="status" aria-live="polite" aria-atomic="true">
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
