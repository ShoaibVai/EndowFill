/**
 * pages/HomePage.tsx — Protected dashboard at "/home".
 *
 * Shows all workspaces the user belongs to, plus quick-create.
 * Clicking a workspace navigates to /workspace/:id.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { cache, QUERY_TTL } from '../utils/cache';
import {
  FileText,
  LogOut,
  User,
  Loader2,
  Plus,
  Users,
  Building2,
  ChevronRight,
  Crown,
  Edit2,
  Eye,
  Search,
} from 'lucide-react';
import { JoinRequestModal } from '../components/workspace/JoinRequestModal';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { WorkspaceService } from '../services/workspace.service';
import type { WorkspaceWithMeta } from '../services/workspace.service';
import { MemberAvatars } from '../components/workspace/MemberAvatars';
import { useAppStore } from '../store/useAppStore';

interface UserProfile {
  id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
}

const PROFILE_CACHE_KEY = (uid: string) => `profile:${uid}`;
const WORKSPACES_CACHE_KEY = (uid: string) => `workspaces:${uid}`;

const ROLE_META = {
  owner:  { label: 'Owner',  icon: Crown,  color: 'var(--color-primary-500)' },
  editor: { label: 'Editor', icon: Edit2,  color: '#10b981' },
  viewer: { label: 'Viewer', icon: Eye,    color: '#94a3b8' },
};

interface HomePageProps {
  user: SupabaseUser;
}

export function HomePage({ user }: HomePageProps) {
  const navigate = useNavigate();
  const addNotification = useAppStore((s) => s.addNotification);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMeta[]>([]);
  const [wsLoading, setWsLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newWsName, setNewWsName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);

  // ── Load profile ────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const key = PROFILE_CACHE_KEY(user.id);
    const cached = cache.get<UserProfile>(key);
    if (cached) { setProfile(cached); setProfileLoading(false); return; }

    setProfileLoading(true);
    void (async () => {
      try {
        const { data } = await supabase.from('profiles').select('id, email, full_name, avatar_url').eq('id', user.id).maybeSingle();
        const resolved: UserProfile = data ?? {
          id: user.id, email: user.email ?? '',
          full_name: user.user_metadata?.full_name as string | undefined,
          avatar_url: user.user_metadata?.avatar_url as string | undefined,
        };
        if (!cancelled) { cache.set(key, resolved, QUERY_TTL); setProfile(resolved); }
      } catch {
        if (!cancelled) setProfile({ id: user.id, email: user.email ?? '' });
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  // ── Load workspaces ─────────────────────────────────────────────────────
  const loadWorkspaces = useCallback(async () => {
    const key = WORKSPACES_CACHE_KEY(user.id);
    const cached = cache.get<WorkspaceWithMeta[]>(key);
    if (cached) { setWorkspaces(cached); setWsLoading(false); return; }

    setWsLoading(true);
    try {
      const data = await WorkspaceService.listMyWorkspaces();
      cache.set(key, data, QUERY_TTL);
      setWorkspaces(data);
    } catch { /* silently */ }
    finally { setWsLoading(false); }
  }, [user.id]);

  useEffect(() => { loadWorkspaces(); }, [loadWorkspaces]);

  // ── Create workspace ────────────────────────────────────────────────────
  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWsName.trim()) {
      return;
    }
    setCreating(true);
    try {
      const ws = await WorkspaceService.createWorkspace(newWsName.trim());
      cache.invalidate(WORKSPACES_CACHE_KEY(user.id));
      setShowCreateForm(false);
      setNewWsName('');
      addNotification({ message: `Workspace "${ws.name}" created successfully`, level: 'success' });
      navigate(`/workspace/${ws.id}`);
    } catch (error) {
      console.error('Failed to create workspace:', error);
      let errorMessage = 'Failed to create workspace';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        // Handle Supabase error objects
        const err = error as any;
        errorMessage = err.message || err.details || JSON.stringify(error);
      }
      addNotification({ message: errorMessage, level: 'error' });
    }
    finally { setCreating(false); }
  };

  // ── Sign out ─────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    cache.flush();
    await supabase.auth.signOut();
    navigate('/', { replace: true });
  };

  const displayName = profile?.full_name || user.email?.split('@')[0] || 'there';

  return (
    <div className="home-page">
      {/* ── Top bar ── */}
      <header className="home-topbar">
        <div className="home-topbar__brand">
          <FileText size={20} />
          <span>EndowFill</span>
        </div>
        <div className="home-topbar__user">
          {profileLoading ? (
            <Loader2 size={16} className="spin text-muted" />
          ) : profile?.avatar_url ? (
            <img src={profile.avatar_url} alt="Avatar" className="home-avatar" />
          ) : (
            <div className="home-avatar home-avatar--placeholder"><User size={16} /></div>
          )}
          <span className="home-topbar__email">{user.email}</span>
          <button id="home-signout-btn" className="btn-ghost btn-ghost--sm" onClick={handleSignOut}>
            <LogOut size={16} /><span>Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="home-main">
        {/* Greeting */}
        <section className="home-greeting">
          <h1 className="home-greeting__title">
            Welcome back, <span className="home-greeting__name">{displayName}</span> 👋
          </h1>
          <p className="home-greeting__sub">
            Choose a workspace to start editing and generating PDFs collaboratively.
          </p>
        </section>

        {/* Workspaces section */}
        <section className="ws-section">
          <div className="ws-section__head">
            <div className="ws-section__title-row">
              <Building2 size={18} style={{ color: 'var(--color-primary-500)' }} />
              <h2 className="ws-section__title">Your Workspaces</h2>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                id="home-join-workspace-btn"
                className="btn-ghost"
                onClick={() => setShowJoinModal(true)}
              >
                <Search size={15} /> Join Workspace
              </button>
              <button
                id="home-new-workspace-btn"
                className="btn-primary"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus size={15} /> New Workspace
              </button>
            </div>
          </div>

          {/* Create form */}
          {showCreateForm && (
            <form onSubmit={handleCreateWorkspace} className="ws-create-form">
              <input
                autoFocus
                className="form-input"
                placeholder="Workspace name…"
                value={newWsName}
                onChange={(e) => setNewWsName(e.target.value)}
                required
                id="home-workspace-name-input"
              />
              <button type="submit" className="btn-primary" disabled={creating} id="home-create-ws-btn">
                {creating ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                Create
              </button>
              <button type="button" className="btn-ghost" onClick={() => { setShowCreateForm(false); setNewWsName(''); }}>
                Cancel
              </button>
            </form>
          )}

          {/* Grid */}
          {wsLoading ? (
            <div className="ws-loading">
              {[0, 1, 2].map(i => <div key={i} className="ws-card ws-card--skeleton" />)}
            </div>
          ) : workspaces.length === 0 ? (
            <div className="ws-empty">
              <Building2 size={40} style={{ color: 'var(--color-surface-300)' }} />
              <p>You don't have any workspaces yet.</p>
              <button id="home-empty-create-btn" className="btn-primary" onClick={() => setShowCreateForm(true)}>
                <Plus size={15} /> Create your first workspace
              </button>
            </div>
          ) : (
            <div className="ws-grid">
              {workspaces.map((ws) => {
                const roleMeta = ROLE_META[ws.role];
                const RoleIcon = roleMeta.icon;
                return (
                  <button
                    key={ws.id}
                    id={`ws-card-${ws.id}`}
                    className="ws-card"
                    onClick={() => navigate(`/workspace/${ws.id}`)}
                  >
                    <div className="ws-card__header">
                      <div className="ws-card__icon">
                        <Building2 size={20} />
                      </div>
                      <span className="ws-card__role" style={{ color: roleMeta.color }}>
                        <RoleIcon size={12} /> {roleMeta.label}
                      </span>
                    </div>
                    <h3 className="ws-card__name">{ws.name}</h3>
                    {ws.description && <p className="ws-card__desc">{ws.description}</p>}
                    <div className="ws-card__footer">
                      <div className="ws-card__stats">
                        <span className="ws-card__stat">
                          <FileText size={12} /> {ws.template_count} template{ws.template_count !== 1 ? 's' : ''}
                        </span>
                        <span className="ws-card__stat">
                          <Users size={12} /> {ws.member_count} member{ws.member_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <MemberAvatars members={ws.members} maxVisible={4} size={26} />
                    </div>
                    <ChevronRight size={16} className="ws-card__chevron" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

      </main>

      {/* Join Workspace Modal */}
      {showJoinModal && (
        <JoinRequestModal onClose={() => setShowJoinModal(false)} />
      )}
    </div>
  );
}
