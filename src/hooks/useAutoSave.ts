/**
 * useAutoSave.ts — Debounced localStorage auto-save hook.
 *
 * Persists pdfme template + field bindings every 1500ms after the last change.
 * On mount, checks for a saved session and exposes a restore callback.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../store/useAppStore';

const STORAGE_KEY = 'pdfmaster_autosave';
const DEBOUNCE_MS = 1500;

interface SavedSession {
  timestamp: number;
  pdfFileName: string;
  templateSchemas: unknown;
  fieldBindings: unknown;
  schemaFields: unknown;
}

export function useAutoSave() {
  const pdfmeTemplate = useAppStore((s) => s.pdfmeTemplate);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const schemaFields = useAppStore((s) => s.schemaFields);
  const pdfFileName = useAppStore((s) => s.pdfFileName);
  const hasUnsavedChanges = useAppStore((s) => s.hasUnsavedChanges);
  const setLastSavedAt = useAppStore((s) => s.setLastSavedAt);
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);

  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [savedSessionInfo, setSavedSessionInfo] = useState<SavedSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check for existing saved session on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SavedSession = JSON.parse(raw);
        setHasSavedSession(true);
        setSavedSessionInfo(parsed);
      }
    } catch {
      // Corrupted data — ignore
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Debounced save
  useEffect(() => {
    if (!hasUnsavedChanges || !pdfmeTemplate) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const payload: SavedSession = {
          timestamp: Date.now(),
          pdfFileName,
          templateSchemas: pdfmeTemplate.schemas,
          fieldBindings,
          schemaFields,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        setLastSavedAt(Date.now());
        setHasUnsavedChanges(false);
      } catch {
        // localStorage quota exceeded — fail silently
        console.warn('[AutoSave] Failed to save — storage may be full.');
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    hasUnsavedChanges,
    pdfmeTemplate,
    pdfFileName,
    fieldBindings,
    schemaFields,
    setLastSavedAt,
    setHasUnsavedChanges,
  ]);

  /** Restore the saved session into the store. */
  const restoreSession = useCallback(() => {
    if (!savedSessionInfo) return;

    const store = useAppStore.getState();
    store.setPdfFileName(savedSessionInfo.pdfFileName);
    if (savedSessionInfo.schemaFields) {
      store.setSchemaFields(
        savedSessionInfo.schemaFields as Parameters<typeof store.setSchemaFields>[0]
      );
    }
    if (savedSessionInfo.fieldBindings) {
      store.setFieldBindings(
        savedSessionInfo.fieldBindings as Parameters<typeof store.setFieldBindings>[0]
      );
    }
    setHasSavedSession(false);
  }, [savedSessionInfo]);

  /** Dismiss the restore prompt and clear stored session. */
  const dismissSession = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setHasSavedSession(false);
    setSavedSessionInfo(null);
  }, []);

  return {
    hasSavedSession,
    savedSessionInfo,
    restoreSession,
    dismissSession,
  };
}
