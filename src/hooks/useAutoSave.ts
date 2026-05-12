/**
 * useAutoSave.ts — Debounced auto-save hook (Supabase only).
 *
 * Saves to Supabase workspace_templates whenever the template changes.
 * - If an activeWorkspaceId + currentProjectId exist → update existing template.
 * - If an activeWorkspaceId exists but no currentProjectId → create a new template.
 * - If no workspace is active → no-op (user must open a workspace first).
 *
 * The old localStorage / IndexedDB fallback has been removed.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { TemplateService } from '../services/template.service';

const DEBOUNCE_MS = 2000;

export function useAutoSave() {
  const pdfmeTemplate      = useAppStore((s) => s.pdfmeTemplate);
  const fieldBindings      = useAppStore((s) => s.fieldBindings);
  const schemaFields       = useAppStore((s) => s.schemaFields);
  const pdfFileName        = useAppStore((s) => s.pdfFileName);
  const basePdfBuffer      = useAppStore((s) => s.basePdfBuffer);
  const validationRules    = useAppStore((s) => s.validationRules);
  const conditionalRules   = useAppStore((s) => s.conditionalRules);
  const hasUnsavedChanges  = useAppStore((s) => s.hasUnsavedChanges);
  const setLastSavedAt     = useAppStore((s) => s.setLastSavedAt);
  const setHasUnsavedChanges = useAppStore((s) => s.setHasUnsavedChanges);
  const currentProjectId   = useAppStore((s) => s.currentProjectId);
  const activeWorkspaceId  = useAppStore((s) => s.activeWorkspaceId);
  const setCurrentProjectId = useAppStore((s) => s.setCurrentProjectId);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only save when there's something to save AND a workspace to save into
    if (!hasUnsavedChanges || !pdfmeTemplate || !activeWorkspaceId) return;

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const patch = {
          name: pdfFileName || 'Untitled Template',
          pdfFileName,
          basePdf: basePdfBuffer ?? new ArrayBuffer(0),
          templateSchemas: pdfmeTemplate.schemas,
          schemaFields,
          fieldBindings,
          validationRules,
          conditionalRules,
          lastModified: Date.now(),
        };

        if (currentProjectId) {
          // Update existing cloud template
          await TemplateService.updateTemplate(currentProjectId, patch);
        } else {
          // Create a new cloud template and remember its ID
          const created = await TemplateService.createTemplate(activeWorkspaceId, {
            ...patch,
            snapshots: [],
          });
          setCurrentProjectId(created.id);
        }

        setLastSavedAt(Date.now());
        setHasUnsavedChanges(false);
      } catch {
        console.warn('[AutoSave] Supabase save failed.');
      }
    }, DEBOUNCE_MS);

    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [
    hasUnsavedChanges, pdfmeTemplate, pdfFileName, fieldBindings,
    schemaFields, basePdfBuffer, validationRules, conditionalRules,
    activeWorkspaceId, currentProjectId,
    setLastSavedAt, setHasUnsavedChanges, setCurrentProjectId,
  ]);

  // No local session restore anymore — return stable no-op values so
  // any existing consumers of this hook don't need to change.
  return {
    hasSavedSession: false,
    savedSessionInfo: null,
    restoreSession: () => {},
    dismissSession: () => {},
  };
}
