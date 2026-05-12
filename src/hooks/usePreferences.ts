/**
 * hooks/usePreferences.ts
 *
 * Debounced sync of user preferences to Supabase.
 * Auto-loads on user login and auto-saves changes to cloud.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { PreferenceService } from '../services/preference.service';
import { supabase } from '../utils/supabase';

const DEBOUNCE_MS = 1000; // 1 second

export function usePreferences() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUserRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  // Load preferences on mount and when user changes
  useEffect(() => {
    const loadPreferences = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        currentUserRef.current = null;
        hasLoadedRef.current = false;
        return;
      }

      if (currentUserRef.current === user.id && hasLoadedRef.current) {
        return; // Already loaded for this user
      }

      currentUserRef.current = user.id;

      try {
        const prefs = await PreferenceService.getPreferences(user.id);
        // Sync loaded preferences to store
        if (prefs.theme && (prefs.theme === 'light' || prefs.theme === 'dark' || prefs.theme === 'system')) {
          setTheme(prefs.theme);
        }
        hasLoadedRef.current = true;
      } catch (err) {
        console.warn('[usePreferences] Failed to load:', err);
        // Fallback to defaults already in store
        hasLoadedRef.current = true;
      }
    };

    loadPreferences();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        currentUserRef.current = null;
        hasLoadedRef.current = false;
      } else {
        loadPreferences();
      }
    });

    return () => subscription?.unsubscribe();
  }, [setTheme]);

  // Debounced sync of theme to Supabase when it changes
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      try {
        await PreferenceService.updatePreference(user.id, 'theme', theme);
      } catch (err) {
        console.warn('[usePreferences] Failed to sync theme:', err);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [theme]);

  // On unmount, ensure final sync happens
  useEffect(() => {
    return () => {
      const syncFinal = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        try {
          await PreferenceService.updatePreference(user.id, 'theme', theme);
        } catch (err) {
          console.warn('[usePreferences] Final sync failed:', err);
        }
      };
      syncFinal();
    };
  }, [theme]);

  return {
    theme,
    setTheme,
  };
}
