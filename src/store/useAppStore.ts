/**
 * useAppStore.ts — Zustand global state for the entire application.
 *
 * Holds the pdfme template/schema, Excel columns, field bindings,
 * generation jobs, and UI preferences.
 */

import { create } from 'zustand';
import type {
  ActiveTab,
  IExcelColumn,
  IFieldBinding,
  IGenerationJob,
  INotification,
  IPdfmeTemplate,
  ISchemaField,
} from '../types/pdfme.types';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

interface AppState {
  // -- UI --
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;

  // -- PDF Template --
  /** The raw PDF ArrayBuffer uploaded by the user */
  basePdfBuffer: ArrayBuffer | null;
  setBasePdfBuffer: (buf: ArrayBuffer) => void;

  /** Full pdfme template (set by Designer on every change) */
  pdfmeTemplate: IPdfmeTemplate | null;
  setPdfmeTemplate: (tpl: IPdfmeTemplate) => void;

  /** Flat list of schema fields derived from the pdfme schema pages */
  schemaFields: ISchemaField[];
  setSchemaFields: (fields: ISchemaField[]) => void;

  /** The uploaded PDF file name for display */
  pdfFileName: string;
  setPdfFileName: (name: string) => void;

  // -- Excel Data --
  excelColumns: IExcelColumn[];
  setExcelColumns: (cols: IExcelColumn[]) => void;

  excelRows: Record<string, string>[];
  setExcelRows: (rows: Record<string, string>[]) => void;

  excelFileName: string;
  setExcelFileName: (name: string) => void;

  // -- Bindings --
  fieldBindings: IFieldBinding[];
  setFieldBindings: (bindings: IFieldBinding[]) => void;
  addFieldBinding: (binding: IFieldBinding) => void;
  removeFieldBinding: (schemaFieldId: string) => void;

  // -- Generation --
  generationJob: IGenerationJob | null;
  setGenerationJob: (job: IGenerationJob | null) => void;

  // -- Notifications --
  notifications: INotification[];
  addNotification: (n: Omit<INotification, 'id'>) => void;
  removeNotification: (id: string) => void;

  // -- Autosave --
  lastSavedAt: number | null;
  setLastSavedAt: (ts: number) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAppStore = create<AppState>((set) => ({
  // -- UI --
  activeTab: 'projects',
  setActiveTab: (tab) => set({ activeTab: tab }),

  currentProjectId: null,
  setCurrentProjectId: (id) => set({ currentProjectId: id }),

  // -- PDF Template --
  basePdfBuffer: null,
  setBasePdfBuffer: (buf) => set({ basePdfBuffer: buf, hasUnsavedChanges: true }),

  pdfmeTemplate: null,
  setPdfmeTemplate: (tpl) => set({ pdfmeTemplate: tpl, hasUnsavedChanges: true }),

  schemaFields: [],
  setSchemaFields: (fields) => set({ schemaFields: fields }),

  pdfFileName: '',
  setPdfFileName: (name) => set({ pdfFileName: name }),

  // -- Excel Data --
  excelColumns: [],
  setExcelColumns: (cols) => set({ excelColumns: cols }),

  excelRows: [],
  setExcelRows: (rows) => set({ excelRows: rows }),

  excelFileName: '',
  setExcelFileName: (name) => set({ excelFileName: name }),

  // -- Bindings --
  fieldBindings: [],
  setFieldBindings: (bindings) => set({ fieldBindings: bindings }),
  addFieldBinding: (binding) =>
    set((s) => ({
      fieldBindings: [
        ...s.fieldBindings.filter((b) => b.schemaFieldId !== binding.schemaFieldId),
        binding,
      ],
    })),
  removeFieldBinding: (schemaFieldId) =>
    set((s) => ({
      fieldBindings: s.fieldBindings.filter((b) => b.schemaFieldId !== schemaFieldId),
    })),

  // -- Generation --
  generationJob: null,
  setGenerationJob: (job) => set({ generationJob: job }),

  // -- Notifications --
  notifications: [],
  addNotification: (n) =>
    set((s) => ({
      notifications: [
        ...s.notifications,
        { ...n, id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
      ],
    })),
  removeNotification: (id) =>
    set((s) => ({
      notifications: s.notifications.filter((n) => n.id !== id),
    })),

  // -- Autosave --
  lastSavedAt: null,
  setLastSavedAt: (ts) => set({ lastSavedAt: ts }),
  hasUnsavedChanges: false,
  setHasUnsavedChanges: (v) => set({ hasUnsavedChanges: v }),
}));
