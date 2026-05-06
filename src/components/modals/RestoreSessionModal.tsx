/**
 * RestoreSessionModal.tsx — Modal prompt to restore a previously auto-saved session.
 */

import { RotateCcw, X, Clock } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface RestoreSessionModalProps {
  pdfFileName: string;
  timestamp: number;
  onRestore: () => void;
  onDismiss: () => void;
}

export function RestoreSessionModal({
  pdfFileName,
  timestamp,
  onRestore,
  onDismiss,
}: RestoreSessionModalProps) {
  const timeAgo = getTimeAgo(timestamp);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const firstBtn = modalRef.current?.querySelector<HTMLButtonElement>('button');
    firstBtn?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      prev?.focus();
    };
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)' }}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="card p-6 max-w-md w-full mx-4 animate-slide-in-up"
        style={{ boxShadow: 'var(--shadow-elevated)' }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-session-title"
        aria-describedby="restore-session-description"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--color-brand-50), var(--color-brand-100))',
              }}
            >
              <RotateCcw className="w-5 h-5" style={{ color: 'var(--color-brand-500)' }} />
            </div>
            <div>
              <h3 id="restore-session-title" className="text-base font-semibold" style={{ color: 'var(--color-surface-900)' }}>
                Restore Previous Session?
              </h3>
              <p id="restore-session-description" className="text-xs" style={{ color: 'var(--color-surface-400)' }}>
                An unsaved session was found
              </p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="btn btn-ghost btn-icon btn-sm"
            id="dismiss-restore-btn"
            aria-label="Dismiss restore session prompt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Details */}
        <div
          className="rounded-lg p-4 mb-5"
          style={{ background: 'var(--color-surface-50)', border: '1px solid var(--color-surface-100)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-surface-400)' }} />
            <span className="text-xs" style={{ color: 'var(--color-surface-400)' }}>
              {timeAgo}
            </span>
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--color-surface-700)' }}>
            {pdfFileName || 'Untitled template'}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onRestore}
            className="btn btn-primary flex-1"
            id="restore-session-btn"
          >
            <RotateCcw className="w-4 h-4" />
            Restore Session
          </button>
          <button
            onClick={onDismiss}
            className="btn btn-secondary flex-1"
            id="start-fresh-btn"
          >
            Start Fresh
          </button>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}
