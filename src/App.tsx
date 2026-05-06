/**
 * App.tsx — Root application component.
 *
 * Handles tab navigation between Editor and Bulk Generate pages,
 * auto-save restoration, and toast notifications.
 */

import { useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { TabNav } from './components/layout/TabNav';
import { EditorPage } from './pages/EditorPage';
import { BulkGeneratePage } from './pages/BulkGeneratePage';
import { ProjectsPage } from './pages/ProjectsPage';
import { RestoreSessionModal } from './components/modals/RestoreSessionModal';
import { useAppStore } from './store/useAppStore';
import { useAutoSave } from './hooks/useAutoSave';

export default function App() {
  const activeTab = useAppStore((s) => s.activeTab);
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

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <TabNav />

      {/* Main content */}
      <main className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
        {activeTab === 'projects' ? (
          <ProjectsPage />
        ) : activeTab === 'editor' ? (
          <EditorPage />
        ) : (
          <BulkGeneratePage />
        )}
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
        <div className="toast-container">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`toast toast-${n.level}`}
              onClick={() => removeNotification(n.id)}
            >
              {n.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
