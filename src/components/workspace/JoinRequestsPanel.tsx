/**
 * components/workspace/JoinRequestsPanel.tsx
 *
 * Panel for owners/editors to view and manage pending join requests.
 * Allows accepting (with role selection) or rejecting requests.
 */

import { useState, useEffect } from 'react';
import { X, UserCheck, UserX, Loader2, Clock, MessageSquare } from 'lucide-react';
import { WorkspaceService } from '../../services/workspace.service';
import type { JoinRequest, WorkspaceRole } from '../../services/workspace.service';

interface JoinRequestsPanelProps {
  workspaceId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export function JoinRequestsPanel({ workspaceId, onClose, onUpdated }: JoinRequestsPanelProps) {
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptingRequest, setAcceptingRequest] = useState<JoinRequest | null>(null);
  const [selectedRole, setSelectedRole] = useState<WorkspaceRole>('viewer');

  const loadRequests = async () => {
    setLoading(true);
    try {
      const data = await WorkspaceService.listJoinRequests(workspaceId);
      setRequests(data);
    } catch {
      setError('Failed to load join requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [workspaceId]);

  const handleAccept = async (request: JoinRequest) => {
    setProcessingId(request.id);
    setError(null);
    try {
      await WorkspaceService.acceptJoinRequest(request.id, selectedRole);
      setRequests(prev => prev.filter(r => r.id !== request.id));
      setAcceptingRequest(null);
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (request: JoinRequest) => {
    setProcessingId(request.id);
    setError(null);
    try {
      await WorkspaceService.rejectJoinRequest(request.id);
      setRequests(prev => prev.filter(r => r.id !== request.id));
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="join-requests-title">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header__icon" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>
            <UserCheck size={20} />
          </div>
          <div>
            <h2 id="join-requests-title" className="modal-title">Join Requests</h2>
            <p className="modal-subtitle">{requests.length} pending request{requests.length !== 1 ? 's' : ''}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="modal-alert modal-alert--error">{error}</div>
          )}

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Loader2 size={24} className="spin" style={{ color: 'var(--text-muted)' }} />
            </div>
          ) : requests.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
              <UserCheck size={40} style={{ marginBottom: 12, opacity: 0.5 }} />
              <p>No pending join requests</p>
            </div>
          ) : (
            <div className="join-requests-list">
              {requests.map((request) => (
                <div key={request.id} className="join-request-card">
                  <div className="join-request-card__header">
                    <div className="join-request-card__avatar">
                      {request.profile?.avatar_url ? (
                        <img src={request.profile.avatar_url} alt="" />
                      ) : (
                        <span>{(request.profile?.full_name || request.profile?.email || '?').slice(0, 2).toUpperCase()}</span>
                      )}
                    </div>
                    <div className="join-request-card__info">
                      <span className="join-request-card__name">
                        {request.profile?.full_name || request.profile?.email}
                      </span>
                      {request.profile?.full_name && (
                        <span className="join-request-card__email">{request.profile.email}</span>
                      )}
                    </div>
                    <div className="join-request-card__time">
                      <Clock size={12} />
                      {new Date(request.requested_at).toLocaleDateString()}
                    </div>
                  </div>

                  {request.message && (
                    <div className="join-request-card__message">
                      <MessageSquare size={12} />
                      <span>{request.message}</span>
                    </div>
                  )}

                  <div className="join-request-card__actions">
                    {acceptingRequest?.id === request.id ? (
                      <div className="join-request-card__role-select">
                        <span>Assign role:</span>
                        <select
                          value={selectedRole}
                          onChange={(e) => setSelectedRole(e.target.value as WorkspaceRole)}
                          className="role-select-inline"
                        >
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                        </select>
                        <button
                          className="btn-primary btn-ghost--sm"
                          onClick={() => handleAccept(request)}
                          disabled={processingId === request.id}
                        >
                          {processingId === request.id ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            'Confirm'
                          )}
                        </button>
                        <button
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => setAcceptingRequest(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          className="btn-primary btn-ghost--sm"
                          onClick={() => {
                            setAcceptingRequest(request);
                            setSelectedRole('viewer');
                          }}
                          disabled={processingId === request.id}
                        >
                          <UserCheck size={14} /> Accept
                        </button>
                        <button
                          className="btn-ghost btn-ghost--sm"
                          onClick={() => handleReject(request)}
                          disabled={processingId === request.id}
                          style={{ color: '#ef4444' }}
                        >
                          <UserX size={14} /> Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
