/**
 * pages/InvitePage.tsx — Public invite acceptance page at "/invite/:token".
 *
 * Anyone with the link can view the invite. They must sign in/up to accept.
 * On acceptance they are added to the workspace and redirected to it.
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Building2, Loader2, CheckCircle, XCircle, LogIn } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { WorkspaceService } from '../services/workspace.service';
import type { WorkspaceInvite, Workspace } from '../services/workspace.service';

export function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invite, setInvite] = useState<(WorkspaceInvite & { workspace: Workspace }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [session, setSession] = useState<boolean | null>(null); // null = checking

  // Check auth status
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(!!data.session);
    });
  }, []);

  // Load invite details
  useEffect(() => {
    if (!token) { setError('Invalid invite link'); setLoading(false); return; }
    WorkspaceService.getInviteByToken(token)
      .then((inv) => {
        if (!inv) setError('This invite link is invalid or has expired.');
        else setInvite(inv);
      })
      .catch(() => setError('Failed to load invite'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      const wsId = await WorkspaceService.acceptInvite(token);
      setAccepted(true);
      setTimeout(() => navigate(`/workspace/${wsId}`, { replace: true }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  if (loading || session === null) {
    return (
      <div className="auth-splash">
        <div className="auth-splash__spinner" />
        <p className="auth-splash__text">Loading invite…</p>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-blob auth-blob--1" aria-hidden="true" />
      <div className="auth-blob auth-blob--2" aria-hidden="true" />

      <div className="auth-card" style={{ maxWidth: 480 }}>
        {/* Icon */}
        <div className="auth-card__logo">
          <Building2 size={26} />
        </div>

        {accepted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
            <h1 className="auth-card__title">You're in!</h1>
            <p className="auth-card__subtitle">Redirecting to workspace…</p>
          </div>
        ) : error && !invite ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <XCircle size={48} style={{ color: '#ef4444', marginBottom: 16 }} />
            <h1 className="auth-card__title">Invite not found</h1>
            <p className="auth-card__subtitle">{error}</p>
            <button className="btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/')}>
              Go to home
            </button>
          </div>
        ) : invite ? (
          <>
            <h1 className="auth-card__title">You've been invited!</h1>
            <p className="auth-card__subtitle">
              Join <strong>{invite.workspace?.name || 'the workspace'}</strong> as <strong>{invite.role}</strong>
            </p>

            {error && <div className="auth-alert auth-alert--error">{error}</div>}

            <div className="invite-workspace-card">
              <Building2 size={20} style={{ color: 'var(--color-primary-500)' }} />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>{invite.workspace?.name || 'Workspace'}</div>
                {invite.workspace?.description && (
                  <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{invite.workspace.description}</div>
                )}
              </div>
            </div>

            {session ? (
              <button
                id="invite-accept-btn"
                className="btn-primary btn-primary--full"
                onClick={handleAccept}
                disabled={accepting}
              >
                {accepting ? <><Loader2 size={15} className="spin" /> Joining…</> : 'Accept & Join Workspace'}
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
                  Sign in or create an account to accept this invite.
                </p>
                <button
                  id="invite-signin-btn"
                  className="btn-primary btn-primary--full"
                  onClick={() => navigate(`/auth?tab=login&next=/invite/${token}`)}
                >
                  <LogIn size={15} /> Sign in to accept
                </button>
                <button
                  className="btn-ghost"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navigate(`/auth?tab=signup&next=/invite/${token}`)}
                >
                  Create account
                </button>
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 12 }}>
              Invite expires {new Date(invite.expires_at).toLocaleDateString()}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
