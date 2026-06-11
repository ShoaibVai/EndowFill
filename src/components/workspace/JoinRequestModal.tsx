/**
 * components/workspace/JoinRequestModal.tsx
 *
 * Modal for requesting to join a workspace by entering the workspace ID.
 * Users can optionally add a message explaining why they want to join.
 */

import { useState } from 'react';
import { X, Search, Loader2, CheckCircle, MessageSquare } from 'lucide-react';
import { WorkspaceService } from '../../services/workspace.service';

interface JoinRequestModalProps {
  onClose: () => void;
}

export function JoinRequestModal({ onClose }: JoinRequestModalProps) {
  const [workspaceId, setWorkspaceId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await WorkspaceService.createJoinRequest(workspaceId.trim(), message);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="join-request-modal-title">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header__icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
            <Search size={20} />
          </div>
          <div>
            <h2 id="join-request-modal-title" className="modal-title">Join a Workspace</h2>
            <p className="modal-subtitle">Request access to an existing workspace</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '32px 24px' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Request Sent!</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
              Your request has been sent to the workspace owner. You'll be added as a member once they accept.
            </p>
            <button className="btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="modal-body">
            {error && (
              <div className="modal-alert modal-alert--error">{error}</div>
            )}

            <div className="form-field">
              <label htmlFor="join-workspace-id" className="form-label">Workspace ID</label>
              <div className="form-input-wrap">
                <Search size={15} className="form-input-icon" />
                <input
                  id="join-workspace-id"
                  type="text"
                  className="form-input form-input--icon"
                  placeholder="Enter workspace ID (e.g., abc123-def456...)"
                  value={workspaceId}
                  onChange={(e) => setWorkspaceId(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <p className="form-hint">
                Ask the workspace owner for the workspace ID, or find it in the workspace URL.
              </p>
            </div>

            <div className="form-field">
              <label htmlFor="join-message" className="form-label">
                Message (optional)
              </label>
              <div className="form-input-wrap">
                <MessageSquare size={15} className="form-input-icon" />
                <textarea
                  id="join-message"
                  className="form-input form-input--icon"
                  placeholder="Tell the owner why you'd like to join..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  style={{ resize: 'vertical', minHeight: 80 }}
                />
              </div>
            </div>

            <button
              id="join-request-submit-btn"
              type="submit"
              className="btn-primary btn-primary--full"
              disabled={loading || !workspaceId.trim()}
            >
              {loading ? (
                <><Loader2 size={15} className="spin" /> Sending Request...</>
              ) : (
                'Send Request'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
