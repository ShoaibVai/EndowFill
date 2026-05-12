/**
 * components/workspace/WorkspaceSettingsModal.tsx
 *
 * Modal for managing workspace settings:
 * - Rename workspace
 * - View/manage members with role changes
 * - Revoke pending invites
 * - Delete workspace (owner only)
 */

import { useState, useEffect } from 'react';
import { X, Settings, Trash2, UserMinus, Crown, Edit2, Check, Loader2, AlertTriangle } from 'lucide-react';
import { WorkspaceService } from '../../services/workspace.service';
import type { WorkspaceWithMeta, WorkspaceMember, WorkspaceRole, WorkspaceInvite } from '../../services/workspace.service';

interface WorkspaceSettingsModalProps {
  workspace: WorkspaceWithMeta;
  currentUserId: string;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted: () => void;
}

export function WorkspaceSettingsModal({
  workspace,
  currentUserId,
  onClose,
  onUpdated,
  onDeleted,
}: WorkspaceSettingsModalProps) {
  const [name, setName] = useState(workspace.name);
  const [renaming, setRenaming] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [members, setMembers] = useState<WorkspaceMember[]>(workspace.members);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwner = workspace.role === 'owner';

  useEffect(() => {
    WorkspaceService.listInvites(workspace.id)
      .then(setInvites)
      .catch(() => {})
      .finally(() => setLoadingInvites(false));
  }, [workspace.id]);

  const handleSaveName = async () => {
    if (!name.trim() || name === workspace.name) { setRenaming(false); return; }
    setSavingName(true);
    try {
      await WorkspaceService.updateWorkspace(workspace.id, { name: name.trim() });
      onUpdated();
      setRenaming(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename');
    } finally {
      setSavingName(false);
    }
  };

  const handleRemoveMember = async (m: WorkspaceMember) => {
    if (!confirm(`Remove ${m.profile?.email || 'this member'}?`)) return;
    try {
      await WorkspaceService.removeMember(workspace.id, m.user_id);
      setMembers(prev => prev.filter(x => x.id !== m.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleRoleChange = async (m: WorkspaceMember, newRole: WorkspaceRole) => {
    try {
      await WorkspaceService.updateMemberRole(workspace.id, m.id, newRole);
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, role: newRole } : x));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    }
  };

  const handleRevokeInvite = async (invite: WorkspaceInvite) => {
    try {
      await WorkspaceService.revokeInvite(invite.id);
      setInvites(prev => prev.filter(i => i.id !== invite.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke invite');
    }
  };

  const handleDeleteWorkspace = async () => {
    setDeleting(true);
    try {
      await WorkspaceService.deleteWorkspace(workspace.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
      setDeleting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="settings-modal-title">
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header__icon" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--color-primary-500)' }}>
            <Settings size={20} />
          </div>
          <div>
            <h2 id="settings-modal-title" className="modal-title">Workspace Settings</h2>
            <p className="modal-subtitle">{workspace.name}</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="modal-body">
          {error && <div className="modal-alert modal-alert--error">{error}</div>}

          {/* Name */}
          <section className="settings-section">
            <h3 className="settings-section__title">General</h3>
            {renaming ? (
              <div className="form-input-wrap" style={{ gap: 8 }}>
                <input
                  className="form-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={handleSaveName} disabled={savingName}>
                  {savingName ? <Loader2 size={14} className="spin" /> : <Check size={14} />}
                  Save
                </button>
                <button className="btn-ghost" onClick={() => { setRenaming(false); setName(workspace.name); }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text-main)' }}>{name}</span>
                {isOwner && (
                  <button className="btn-ghost btn-ghost--sm" onClick={() => setRenaming(true)} id="settings-rename-btn">
                    <Edit2 size={13} /> Rename
                  </button>
                )}
              </div>
            )}
          </section>

          {/* Members */}
          <section className="settings-section">
            <h3 className="settings-section__title">Members ({members.length})</h3>
            <div className="member-list">
              {members.map((m) => (
                <div key={m.id} className="member-row">
                  <div className="member-row__avatar">
                    {m.profile?.avatar_url
                      ? <img src={m.profile.avatar_url} alt="" />
                      : <span>{(m.profile?.full_name || m.profile?.email || '?').slice(0, 2).toUpperCase()}</span>
                    }
                  </div>
                  <div className="member-row__info">
                    <span className="member-row__name">{m.profile?.full_name || m.profile?.email}</span>
                    {m.profile?.full_name && <span className="member-row__email">{m.profile.email}</span>}
                  </div>
                  <div className="member-row__actions">
                    {m.role === 'owner' ? (
                      <span className="role-badge role-badge--owner"><Crown size={11} /> Owner</span>
                    ) : isOwner && m.user_id !== currentUserId ? (
                      <select
                        className="role-select-inline"
                        value={m.role}
                        onChange={(e) => handleRoleChange(m, e.target.value as WorkspaceRole)}
                        aria-label="Change role"
                      >
                        <option value="editor">Editor</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    ) : (
                      <span className={`role-badge role-badge--${m.role}`}>{m.role}</span>
                    )}
                    {isOwner && m.user_id !== currentUserId && (
                      <button
                        className="btn-icon btn-icon--danger"
                        onClick={() => handleRemoveMember(m)}
                        title="Remove member"
                        aria-label="Remove member"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                    {m.user_id === currentUserId && !isOwner && (
                      <button
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => handleRemoveMember(m)}
                      >
                        Leave
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Pending invites */}
          {isOwner && (
            <section className="settings-section">
              <h3 className="settings-section__title">Pending Invites</h3>
              {loadingInvites ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
              ) : invites.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No pending invites</div>
              ) : (
                <div className="member-list">
                  {invites.map((inv) => (
                    <div key={inv.id} className="member-row">
                      <div className="member-row__info">
                        <span className="member-row__name">{inv.invited_email}</span>
                        <span className="member-row__email">
                          Expires {new Date(inv.expires_at).toLocaleDateString()} · {inv.role}
                        </span>
                      </div>
                      <button
                        className="btn-ghost btn-ghost--sm"
                        onClick={() => handleRevokeInvite(inv)}
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Danger zone */}
          {isOwner && (
            <section className="settings-section settings-section--danger">
              <h3 className="settings-section__title settings-section__title--danger">Danger Zone</h3>
              {confirmDelete ? (
                <div className="danger-confirm">
                  <AlertTriangle size={16} />
                  <span>This will permanently delete the workspace and all its templates. Are you sure?</span>
                  <button
                    className="btn-danger"
                    onClick={handleDeleteWorkspace}
                    disabled={deleting}
                    id="settings-confirm-delete-btn"
                  >
                    {deleting ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
                    Delete permanently
                  </button>
                  <button className="btn-ghost btn-ghost--sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                </div>
              ) : (
                <button
                  className="btn-ghost"
                  style={{ color: '#ef4444', borderColor: '#fca5a5' }}
                  onClick={() => setConfirmDelete(true)}
                  id="settings-delete-btn"
                >
                  <Trash2 size={15} /> Delete Workspace
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
