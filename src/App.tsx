/**
 * App.tsx — Root application component.
 *
 * Routes:
 *  /              → WelcomePage        (public)
 *  /auth          → AuthPage           (public)
 *  /home          → HomePage           (protected — workspace picker)
 *  /workspace/:id → WorkspacePage      (protected — templates in workspace)
 *  /app           → WorkspaceShell     (protected — PDF editor)
 *  /invite/:token → InvitePage         (public — invite acceptance)
 *  *              → redirect to /
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import {
  BrowserRouter, Routes, Route, Navigate,
} from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './utils/supabase';
import { cache, SESSION_TTL } from './utils/cache';
import { useAppStore } from './store/useAppStore';
import { usePreferences } from './hooks/usePreferences';

import { WelcomePage }   from './pages/WelcomePage';
import { AuthPage }      from './pages/AuthPage';
import { HomePage }      from './pages/HomePage';
import { WorkspacePage } from './pages/WorkspacePage';
import { InvitePage }    from './pages/InvitePage';

const WorkspaceShell = lazy(() => import('./WorkspaceShell.tsx'));

const SESSION_CACHE_KEY = 'auth:session';

const LoadingSplash = ({ text = 'Loading…' }: { text?: string }) => (
  <div className="auth-splash" role="status">
    <div className="auth-splash__spinner" aria-hidden="true" />
    <p className="auth-splash__text">{text}</p>
  </div>
);

function AuthRouter() {
  const [session, setSession]       = useState<Session | null>(null);
  const [sessionLoading, setSLoading] = useState(true);

  // ── Session bootstrap ─────────────────────────────────────────────────
  useEffect(() => {
    const cached = cache.get<Session>(SESSION_CACHE_KEY);
    if (cached) { setSession(cached); setSLoading(false); }

    supabase.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      if (s) cache.set(SESSION_CACHE_KEY, s, SESSION_TTL);
      else cache.invalidate(SESSION_CACHE_KEY);
      setSession(s);
      setSLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) cache.set(SESSION_CACHE_KEY, s, SESSION_TTL);
      else cache.flush();
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);



  if (sessionLoading) return <LoadingSplash text="Loading your workspace…" />;

  const authed = session !== null;

  return (
    <Routes>
      {/* ── Public ── */}
      <Route path="/"             element={authed ? <Navigate to="/home" replace /> : <WelcomePage />} />
      <Route path="/auth"         element={authed ? <Navigate to="/home" replace /> : <AuthPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />

      {/* ── Protected: home (workspace picker) ── */}
      <Route
        path="/home"
        element={authed
          ? <HomePage user={session.user} />
          : <Navigate to="/" replace />}
      />

      {/* ── Protected: individual workspace ── */}
      <Route
        path="/workspace/:id"
        element={authed
          ? <WorkspacePage user={session.user} />
          : <Navigate to="/" replace />}
      />

      {/* ── Protected: PDF editor ── */}
      <Route
        path="/app"
        element={authed
          ? (
            <Suspense fallback={<LoadingSplash text="Opening workspace…" />}>
              <WorkspaceShell />
            </Suspense>
          )
          : <Navigate to="/" replace />}
      />

      {/* ── Catch-all ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.theme);

  // Sync theme preferences for all routes
  usePreferences();

  // Apply theme globally across public and protected pages
  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const effective = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      root.setAttribute('data-theme', effective);
    };

    applyTheme();

    if (theme === 'system') {
      media.addEventListener('change', applyTheme);
      return () => media.removeEventListener('change', applyTheme);
    }

    return;
  }, [theme]);

  return (
    <BrowserRouter>
      <AuthRouter />
    </BrowserRouter>
  );
}
