/**
 * pages/WorkspacePage.tsx — Workspace detail page at "/workspace/:id".
 *
 * Shows all templates in the workspace, member list, and action buttons.
 * Members can open templates directly into the PDF editor.
 * Owners/editors can invite members and manage settings.
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Users,
  FileText,
  Clock,
  Trash2,
  Copy,
  UserPlus,
  Settings,
  Building2,
  Download,
  Upload,
  UserCheck,
} from 'lucide-react';
import { JoinRequestsPanel } from '../components/workspace/JoinRequestsPanel';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { WorkspaceService } from '../services/workspace.service';
import type { WorkspaceWithMeta } from '../services/workspace.service';
import { TemplateService } from '../services/template.service';
import type { WorkspaceTemplate } from '../services/template.service';
import { useAppStore } from '../store/useAppStore';
import { MemberAvatars } from '../components/workspace/MemberAvatars';
import { InviteModal } from '../components/workspace/InviteModal';
import { WorkspaceSettingsModal } from '../components/workspace/WorkspaceSettingsModal';
import { arrayBufferToBase64, base64ToArrayBuffer } from '../utils/bufferUtils';
import { cache } from '../utils/cache';

interface WorkspacePageProps {
  user: SupabaseUser;
}

export function WorkspacePage({ user }: WorkspacePageProps) {
  const { id: workspaceId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [workspace, setWorkspace] = useState<WorkspaceWithMeta | null>(null);
  const [templates, setTemplates] = useState<WorkspaceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tplLoading, setTplLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const setCurrentProjectId  = useAppStore((s) => s.setCurrentProjectId);
  const setPdfFileName       = useAppStore((s) => s.setPdfFileName);
  const setPdfmeTemplate     = useAppStore((s) => s.setPdfmeTemplate);
  const setBasePdfBuffer     = useAppStore((s) => s.setBasePdfBuffer);
  const setSchemaFields      = useAppStore((s) => s.setSchemaFields);
  const setFieldBindings     = useAppStore((s) => s.setFieldBindings);
  const setValidationRules   = useAppStore((s) => s.setValidationRules);
  const setConditionalRules  = useAppStore((s) => s.setConditionalRules);
  const addNotification      = useAppStore((s) => s.addNotification);
  const setActiveTab         = useAppStore((s) => s.setActiveTab);

  // ── Load workspace + templates ─────────────────────────────────────────
  const loadWorkspace = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const ws = await WorkspaceService.getWorkspace(workspaceId);
      if (!ws) { navigate('/home', { replace: true }); return; }
      setWorkspace(ws);
    } catch {
      setError('Failed to load workspace');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, navigate]);

  const loadTemplates = useCallback(async () => {
    if (!workspaceId) return;
    setTplLoading(true);
    try {
      const data = await TemplateService.listTemplates(workspaceId);
      setTemplates(data);
    } catch {
      setError('Failed to load templates');
    } finally {
      setTplLoading(false);
    }
  }, [workspaceId]);

  const loadPendingRequests = useCallback(async () => {
    if (!workspaceId) return;
    try {
      const requests = await WorkspaceService.listJoinRequests(workspaceId);
      setPendingRequestCount(requests.length);
    } catch {
      // Silently fail - not critical
    }
  }, [workspaceId]);

  useEffect(() => {
    loadWorkspace();
    loadTemplates();
  }, [loadWorkspace, loadTemplates]);

  useEffect(() => {
    if (workspace?.role === 'owner') {
      loadPendingRequests();
    }
  }, [workspace?.role, loadPendingRequests]);

  // ── Open a template in the editor ─────────────────────────────────────
  const handleOpenTemplate = async (tpl: WorkspaceTemplate) => {
    try {
      const full = await TemplateService.getTemplate(tpl.id);
      if (!full) throw new Error('Template not found');

      const buf = full.base_pdf_b64 ? base64ToArrayBuffer(full.base_pdf_b64) : new ArrayBuffer(0);

      // Load into store
      setActiveWorkspaceId(workspaceId!);
      setCurrentProjectId(full.id);
      setPdfFileName(full.pdf_file_name);
      setBasePdfBuffer(buf);
      setPdfmeTemplate({ basePdf: buf, schemas: full.template_schemas as never[] });
      setSchemaFields(full.schema_fields as Parameters<typeof setSchemaFields>[0]);
      setFieldBindings(full.field_bindings as Parameters<typeof setFieldBindings>[0]);
      setValidationRules((full.validation_rules as Parameters<typeof setValidationRules>[0]) ?? []);
      setConditionalRules((full.conditional_rules as Parameters<typeof setConditionalRules>[0]) ?? []);

      addNotification({ message: `Opened: ${full.name}`, level: 'success' });
      setActiveTab('editor');
      navigate(`/app?workspaceId=${workspaceId}&templateId=${full.id}`);
    } catch (err) {
      addNotification({ message: 'Failed to open template', level: 'error' });
      console.error(err);
    }
  };

  // ── Create new template (blank) ────────────────────────────────────────
  const handleCreateTemplate = () => {
    setActiveWorkspaceId(workspaceId!);
    setCurrentProjectId(null);
    setPdfFileName('');
    setPdfmeTemplate(null);
    setBasePdfBuffer(null);
    setSchemaFields([]);
    setFieldBindings([]);
    setActiveTab('editor');
    navigate(`/app?workspaceId=${workspaceId}`);
  };

  // ── Delete template ────────────────────────────────────────────────────
  const handleDeleteTemplate = async (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${tpl.name}"?`)) return;
    try {
      await TemplateService.deleteTemplate(tpl.id);
      setTemplates(prev => prev.filter(t => t.id !== tpl.id));
      addNotification({ message: 'Template deleted', level: 'info' });
    } catch {
      addNotification({ message: 'Failed to delete template', level: 'error' });
    }
  };

  // ── Duplicate template ─────────────────────────────────────────────────
  const handleDuplicate = async (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await TemplateService.duplicateTemplate(tpl.id);
      addNotification({ message: 'Template duplicated', level: 'success' });
      loadTemplates();
    } catch {
      addNotification({ message: 'Failed to duplicate template', level: 'error' });
    }
  };

  // ── Export template ────────────────────────────────────────────────────
  const handleExport = async (tpl: WorkspaceTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const full = await TemplateService.getTemplate(tpl.id);
      if (!full) return;
      const blob = new Blob([JSON.stringify({ version: '1.0', project: {
        id: full.id, name: full.name,
        pdfFileName: full.pdf_file_name,
        basePdf: full.base_pdf_b64,
        templateSchemas: full.template_schemas,
        schemaFields: full.schema_fields,
        fieldBindings: full.field_bindings,
        validationRules: full.validation_rules,
        conditionalRules: full.conditional_rules,
        lastModified: Date.now(),
      }})], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${tpl.name}.pdftemplate`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      addNotification({ message: 'Template exported', level: 'success' });
    } catch {
      addNotification({ message: 'Export failed', level: 'error' });
    }
  };

  // ── Import template ────────────────────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !workspaceId) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.version !== '1.0' || !payload.project) throw new Error('Invalid format');
      const p = payload.project;
      await TemplateService.createTemplate(workspaceId, {
        name: p.name, description: p.description,
        pdfFileName: p.pdfFileName,
        basePdf: typeof p.basePdf === 'string' ? p.basePdf : arrayBufferToBase64(p.basePdf),
        templateSchemas: p.templateSchemas,
        schemaFields: p.schemaFields,
        fieldBindings: p.fieldBindings,
        validationRules: p.validationRules,
        conditionalRules: p.conditionalRules,
        lastModified: Date.now(),
        snapshots: [],
      });
      addNotification({ message: 'Template imported', level: 'success' });
      loadTemplates();
    } catch {
      addNotification({ message: 'Import failed — invalid file', level: 'error' });
    }
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="auth-splash">
        <div className="auth-splash__spinner" />
        <p className="auth-splash__text">Loading workspace…</p>
      </div>
    );
  }

  if (!workspace) return null;

  const canEdit = workspace.role === 'owner' || workspace.role === 'editor';

  return (
    <div className="ws-page">
      {/* ── Header ── */}
      <header className="ws-page__header">
        <div className="ws-page__header-left">
          <button className="btn-ghost btn-ghost--sm" onClick={() => navigate('/home')} id="ws-back-btn">
            <ArrowLeft size={15} /> Home
          </button>
          <div className="ws-page__title-block">
            <Building2 size={20} style={{ color: 'var(--color-primary-500)' }} />
            <h1 className="ws-page__title">{workspace.name}</h1>
            {workspace.description && (
              <span className="ws-page__desc">{workspace.description}</span>
            )}
          </div>
        </div>
        <div className="ws-page__header-right">
          <MemberAvatars members={workspace.members} maxVisible={5} size={30} />
          {workspace.role === 'owner' && pendingRequestCount > 0 && (
            <button
              id="ws-join-requests-btn"
              className="btn-ghost btn-ghost--sm join-requests-badge"
              onClick={() => setShowJoinRequests(true)}
            >
              <UserCheck size={15} /> Join Requests ({pendingRequestCount})
            </button>
          )}
          {canEdit && (
            <button id="ws-invite-btn" className="btn-ghost btn-ghost--sm" onClick={() => setShowInvite(true)}>
              <UserPlus size={15} /> Invite
            </button>
          )}
          <button id="ws-settings-btn" className="btn-ghost btn-ghost--sm" onClick={() => setShowSettings(true)}>
            <Settings size={15} />
          </button>
        </div>
      </header>

      {error && (
        <div className="modal-alert modal-alert--error" style={{ margin: '12px 32px' }}>{error}</div>
      )}

      {/* ── Templates ── */}
      <main className="ws-page__main">
        <div className="ws-page__tpl-header">
          <h2 className="ws-page__tpl-title">
            <FileText size={16} /> Templates{templates.length > 0 && ` (${templates.length})`}
          </h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && (
              <>
                <label className="btn-ghost btn-ghost--sm" style={{ cursor: 'pointer' }} title="Import template">
                  <Upload size={14} /> Import
                  <input type="file" accept=".pdftemplate" onChange={handleImport} style={{ display: 'none' }} />
                </label>
                <button id="ws-new-template-btn" className="btn-primary" onClick={handleCreateTemplate}>
                  <Plus size={15} /> New Template
                </button>
              </>
            )}
          </div>
        </div>

        {tplLoading ? (
          <div className="ws-tpl-grid">
            {[0,1,2].map(i => <div key={i} className="tpl-card tpl-card--skeleton" />)}
          </div>
        ) : templates.length === 0 ? (
          <div className="ws-empty">
            <FileText size={40} style={{ color: 'var(--color-surface-300)' }} />
            <p>No templates yet in this workspace.</p>
            {canEdit && (
              <button id="ws-empty-create-btn" className="btn-primary" onClick={handleCreateTemplate}>
                <Plus size={15} /> Create first template
              </button>
            )}
          </div>
        ) : (
          <div className="ws-tpl-grid">
            {templates.map((tpl) => (
              <div
                key={tpl.id}
                className="tpl-card"
                onClick={() => handleOpenTemplate(tpl)}
                role="button"
                tabIndex={0}
                id={`tpl-card-${tpl.id}`}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleOpenTemplate(tpl)}
                aria-label={`Open template ${tpl.name}`}
              >
                {/* Thumbnail */}
                <div className="tpl-card__thumb">
                  {tpl.thumbnail_b64 ? (
                    <img src={`data:image/png;base64,${tpl.thumbnail_b64}`} alt={tpl.name} />
                  ) : (
                    <FileText size={36} />
                  )}
                  <div className="tpl-card__thumb-overlay">
                    <span>Open</span>
                  </div>
                </div>

                {/* Body */}
                <div className="tpl-card__body">
                  <h3 className="tpl-card__name">{tpl.name}</h3>
                  <div className="tpl-card__meta">
                    <span><Clock size={11} /> {new Date(tpl.updated_at).toLocaleDateString()}</span>
                    {tpl.last_modified_by_profile && (
                      <span>by {tpl.last_modified_by_profile.full_name || tpl.last_modified_by_profile.email}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="tpl-card__actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="tpl-action-btn"
                    onClick={(e) => handleExport(tpl, e)}
                    title="Export"
                    aria-label="Export template"
                  >
                    <Download size={13} />
                  </button>
                  {canEdit && (
                    <>
                      <button
                        className="tpl-action-btn"
                        onClick={(e) => handleDuplicate(tpl, e)}
                        title="Duplicate"
                        aria-label="Duplicate template"
                      >
                        <Copy size={13} />
                      </button>
                      {workspace.role === 'owner' && (
                        <button
                          className="tpl-action-btn tpl-action-btn--danger"
                          onClick={(e) => handleDeleteTemplate(tpl, e)}
                          title="Delete"
                          aria-label="Delete template"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Members sidebar strip */}
        <div className="ws-members-strip">
          <h3 className="ws-members-strip__title"><Users size={14} /> Members</h3>
          {workspace.members.map((m) => (
            <div key={m.id} className="ws-member-row">
              <div className="ws-member-avatar">
                {m.profile?.avatar_url
                  ? <img src={m.profile.avatar_url} alt="" />
                  : <span>{(m.profile?.full_name || m.profile?.email || '?').slice(0, 2).toUpperCase()}</span>
                }
              </div>
              <div className="ws-member-info">
                <span className="ws-member-name">{m.profile?.full_name || m.profile?.email}</span>
                <span className={`ws-member-role ws-member-role--${m.role}`}>{m.role}</span>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ── Modals ── */}
      {showInvite && (
        <InviteModal
          workspaceId={workspace.id}
          workspaceName={workspace.name}
          onClose={() => setShowInvite(false)}
        />
      )}
      {showJoinRequests && (
        <JoinRequestsPanel
          workspaceId={workspace.id}
          onClose={() => setShowJoinRequests(false)}
          onUpdated={() => {
            loadWorkspace();
            loadPendingRequests();
            cache.flush();
          }}
        />
      )}
      {showSettings && (
        <WorkspaceSettingsModal
          workspace={workspace}
          currentUserId={user.id}
          onClose={() => setShowSettings(false)}
          onUpdated={() => { loadWorkspace(); cache.flush(); }}
          onDeleted={() => { cache.flush(); navigate('/home'); }}
        />
      )}
    </div>
  );
}
