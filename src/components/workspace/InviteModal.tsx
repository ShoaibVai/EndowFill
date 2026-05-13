/**
 * components/workspace/InviteModal.tsx
 *
 * Modal for inviting users to a workspace by email.
 * Shows the shareable invite link after creation.
 */

import { useState } from 'react';
import { X, Mail, Link2, Copy, Check, Loader2, UserPlus } from 'lucide-react';
import { WorkspaceService } from '../../services/workspace.service';

interface InviteModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

export function InviteModal({ workspaceId, workspaceName, onClose }: InviteModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const invite = await WorkspaceService.createInvite(workspaceId, email, role);
      const link = `${window.location.origin}/invite/${invite.token}`;
      setInviteLink(link);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  };

  const copyLink = async () => {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="invite-modal-title">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header__icon" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-primary-500)' }}>
            <UserPlus size={20} />
          </div>
          <div>
            <h2 id="invite-modal-title" className="modal-title">Invite to workspace</h2>
            <p className="modal-subtitle">{workspaceName}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleInvite} className="modal-body">
          {error && (
            <div className="modal-alert modal-alert--error">{error}</div>
          )}

          <div className="form-field">
            <label htmlFor="invite-email" className="form-label">Email address</label>
            <div className="form-input-wrap">
              <Mail size={15} className="form-input-icon" />
              <input
                id="invite-email"
                type="email"
                className="form-input form-input--icon"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
          </div>

          <div className="form-field">
            <label className="form-label">Role</label>
            <div className="role-select">
              {(['editor', 'viewer'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  id={`invite-role-${r}`}
                  className={`role-option ${role === r ? 'role-option--active' : ''}`}
                  onClick={() => setRole(r)}
                >
                  <span className="role-option__name">{r === 'editor' ? 'Editor' : 'Viewer'}</span>
                  <span className="role-option__desc">
                    {r === 'editor' ? 'Can edit and create templates' : 'Can view templates only'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            id="invite-send-btn"
            type="submit"
            className="btn-primary btn-primary--full"
            disabled={loading || !email.trim()}
          >
            {loading ? <><Loader2 size={15} className="spin" /> Sending…</> : 'Send Invite'}
          </button>
        </form>

        {/* Generated link */}
        {inviteLink && (
          <div className="invite-link-box">
            <div className="invite-link-box__header">
              <Link2 size={15} />
              <span>Invite link generated — share this with your colleague</span>
            </div>
            <div className="invite-link-box__url-row">
              <code className="invite-link-box__url">{inviteLink}</code>
              <button
                id="invite-copy-btn"
                className={`btn-copy ${copied ? 'btn-copy--done' : ''}`}
                onClick={copyLink}
                title="Copy link"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="invite-link-box__note">Link expires in 7 days</p>
          </div>
        )}
      </div>
    </div>
  );
}
