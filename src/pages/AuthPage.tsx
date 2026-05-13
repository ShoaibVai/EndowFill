/**
 * pages/AuthPage.tsx — Login / Sign-up page at "/auth".
 *
 * - Tab-based toggle between Login and Sign-up
 * - Supabase email/password auth
 * - Google OAuth (can be extended to GitHub, etc.)
 * - Redirects to /home on success
 * - User-facing error messages
 */

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { FileText, Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

type Tab = 'login' | 'signup';

export function AuthPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab');
    return t === 'signup' ? 'signup' : 'login';
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Keep URL tab param in sync
  useEffect(() => {
    const t = searchParams.get('tab');
    setTab(t === 'signup' ? 'signup' : 'login');
  }, [searchParams]);

  const switchTab = (next: Tab) => {
    setError(null);
    setSuccessMsg(null);
    setTab(next);
    navigate(`/auth?tab=${next}`, { replace: true });
  };

  // ── Email / Password Auth ─────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (tab === 'signup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      if (tab === 'login') {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        navigate('/home', { replace: true });
      } else {
        const { error: authError } = await supabase.auth.signUp({ email, password });
        if (authError) throw authError;
        setSuccessMsg(
          'Account created! Check your email to confirm your address, then sign in.'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(friendlyAuthError(msg));
    } finally {
      setLoading(false);
    }
  };

  // ── OAuth ─────────────────────────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setError(null);
    setOauthLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/home` },
      });
      if (authError) throw authError;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'OAuth sign-in failed.';
      setError(msg);
      setOauthLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Decorative blobs */}
      <div className="auth-blob auth-blob--1" aria-hidden="true" />
      <div className="auth-blob auth-blob--2" aria-hidden="true" />

      <div className="auth-card" role="main">
        {/* Logo */}
        <div className="auth-card__logo">
          <FileText size={28} />
        </div>
        <h1 className="auth-card__title">
          {tab === 'login' ? 'Welcome back' : 'Create your account'}
        </h1>
        <p className="auth-card__subtitle">
          {tab === 'login'
            ? 'Sign in to access your PDF workspace.'
            : 'Start filling PDFs with ease.'}
        </p>

        {/* Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            id="auth-tab-login"
            role="tab"
            aria-selected={tab === 'login'}
            className={`auth-tab ${tab === 'login' ? 'auth-tab--active' : ''}`}
            onClick={() => switchTab('login')}
          >
            Sign in
          </button>
          <button
            id="auth-tab-signup"
            role="tab"
            aria-selected={tab === 'signup'}
            className={`auth-tab ${tab === 'signup' ? 'auth-tab--active' : ''}`}
            onClick={() => switchTab('signup')}
          >
            Sign up
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="auth-alert auth-alert--error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
        {successMsg && (
          <div className="auth-alert auth-alert--success" role="status">
            <span>✓</span>
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form id="auth-form" className="auth-form" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div className="form-field">
            <label htmlFor="auth-email" className="form-label">
              Email address
            </label>
            <div className="form-input-wrap">
              <Mail size={16} className="form-input-icon" />
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className="form-input form-input--icon"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Password */}
          <div className="form-field">
            <label htmlFor="auth-password" className="form-label">
              Password
            </label>
            <div className="form-input-wrap">
              <Lock size={16} className="form-input-icon" />
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                placeholder="Min. 8 characters"
                className="form-input form-input--icon form-input--suffix"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
              />
              <button
                type="button"
                id="auth-toggle-password"
                className="form-input-suffix-btn"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword((v) => !v)}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm Password (signup only) */}
          {tab === 'signup' && (
            <div className="form-field">
              <label htmlFor="auth-confirm-password" className="form-label">
                Confirm password
              </label>
              <div className="form-input-wrap">
                <Lock size={16} className="form-input-icon" />
                <input
                  id="auth-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
                  className="form-input form-input--icon"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>
          )}

          <button
            id="auth-submit-btn"
            type="submit"
            className="btn-primary btn-primary--full"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                {tab === 'login' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : tab === 'login' ? (
              'Sign in'
            ) : (
              'Create account'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider" aria-hidden="true">
          <span>or continue with</span>
        </div>

        {/* OAuth */}
        <button
          id="auth-google-btn"
          type="button"
          className="btn-oauth"
          onClick={handleGoogleLogin}
          disabled={oauthLoading}
        >
          {oauthLoading ? (
            <Loader2 size={16} className="spin" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Continue with Google
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function friendlyAuthError(raw: string): string {
  if (/invalid login credentials/i.test(raw)) return 'Invalid email or password. Please try again.';
  if (/email not confirmed/i.test(raw)) return 'Please confirm your email before signing in.';
  if (/user already registered/i.test(raw)) return 'An account with this email already exists.';
  if (/rate limit/i.test(raw)) return 'Too many attempts. Please wait a moment and try again.';
  return raw;
}
