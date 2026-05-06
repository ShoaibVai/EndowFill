# PDF-Template-to-Excel Master — Comprehensive Development Plan

> **Vision**: A professional SaaS tool that lets non-technical users visually design PDF templates with draggable fields, map them to Excel columns, and bulk-generate thousands of filled PDFs in seconds.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│                        Frontend (React 18 + Vite)              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Designer   │  │ Field Mapper │  │   Bulk Generator     │  │
│  │  (pdfme)     │  │  (ExcelJS)   │  │  (Web Worker + ZIP)  │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────┐│
│  │              Global State (Zustand)                        ││
│  │  pdfmeSchema · excelColumns · jobQueue · uiPreferences     ││
│  └────────────────────────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────┘
```

---

## Phase 1 — Foundation & Editor Setup ✅ (Code Delivered)

**Goal**: Rock-solid project scaffolding with a working pdfme Designer integration.

### Deliverables
- [x] Vite + React 18 + TypeScript project scaffold
- [x] Tailwind CSS with custom design tokens (slate/zinc SaaS aesthetic)
- [x] Folder structure (components, utils, stores, hooks, types)
- [x] Dashboard layout (Navbar + dual-tab navigation)
- [x] Template Editor tab with two-panel layout (sidebar + canvas)
- [x] pdfme `<Designer>` integration with PDF ArrayBuffer upload
- [x] Schema-reactive sidebar (live field list from pdfme schema)
- [x] `generateExcelTemplate` utility (ExcelJS, bold headers, download)
- [x] `useAutoSave` hook (debounced localStorage + restore modal)
- [x] TypeScript interfaces: `IPdfmeSchema`, `ISchemaField`, etc.

### Key Technical Decisions
- **pdfme Designer**: Schema state is synced via `onChangeTemplate` callback — fires on every designer mutation
- **ArrayBuffer PDF**: Required by pdfme's `basePdf`; we use `FileReader.readAsArrayBuffer` not `readAsDataURL`
- **Zustand over Context**: Simpler selector API, less re-render risk with large schema objects
- **Debounced AutoSave**: 1500ms debounce prevents excessive localStorage writes during drag operations
- **Tailwind CSS v4**: Using `@theme` directive for custom design tokens (brand colors, surfaces, shadows)

### Files Delivered
```
src/
├── main.tsx
├── App.tsx
├── index.css
├── types/
│   └── pdfme.types.ts
├── store/
│   └── useAppStore.ts
├── hooks/
│   └── useAutoSave.ts
├── utils/
│   └── excelHelpers.ts
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── TabNav.tsx
│   ├── editor/
│   │   ├── TemplateEditor.tsx
│   │   ├── EditorSidebar.tsx
│   │   ├── EditorCanvas.tsx
│   │   └── EditorToolbar.tsx
│   ├── modals/
│   │   └── RestoreSessionModal.tsx
│   └── ui/
│       ├── EmptyState.tsx
│       └── FieldListItem.tsx
└── pages/
    ├── EditorPage.tsx
    └── BulkGeneratePage.tsx
```

---

## Phase 2 — Excel Column Mapper & Field Binding UI ✅ (Code Delivered)

**Goal**: Let users map pdfme schema fields to Excel column headers with a visual drag-and-drop or dropdown interface.

### Deliverables

#### 2.1 Excel Upload & Column Detection
- Excel file uploader (`.xlsx`, `.csv`) using ExcelJS
- Parse first row as headers → infer data types (text, number, date, boolean)
- Preview first 5 rows in a clean data-table component
- Store `IExcelColumn[]` in Zustand

#### 2.2 Field → Column Binding UI
- Side-by-side binding panel: PDF Fields (left) ↔ Excel Columns (right)
- Drag-to-connect lines (SVG connector) or dropdown selectors
- Auto-match by name similarity (Levenshtein distance util)
- Visual indicator: bound (green dot) / unbound (yellow warning)
- Many-to-one support: multiple PDF fields can read same Excel column

#### 2.3 Data Type Validation Rules
- Per-field validation config: min/max length, regex pattern, required toggle
- Date format selector for date fields (e.g., `MM/DD/YYYY`)
- Conditional field visibility rules (show field X only if column Y = "Yes")

#### 2.4 Mapping Persistence
- Save mapping config as JSON alongside pdfme schema in localStorage
- Export/import mapping config as `.pdfmap` file (JSON with `.pdfmap` extension)

### New Types
```typescript
interface IExcelColumn {
  index: number;
  header: string;
  inferredType: 'text' | 'number' | 'date' | 'boolean';
  sampleValues: string[];
}

interface IFieldBinding {
  schemaFieldId: string;
  excelColumnIndex: number;
  transform?: 'uppercase' | 'lowercase' | 'trim' | 'dateFormat';
  transformArgs?: Record<string, string>;
}

interface IValidationRule {
  fieldId: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  customError?: string;
}
```

### UX Improvements
- Sticky "unsaved changes" banner
- Keyboard shortcut: `Cmd+S` saves mapping
- Undo/Redo for binding changes (using a simple action stack)

---

## Phase 3 — Bulk Generation Engine ✅ (Code Delivered)

**Goal**: Generate N filled PDFs from Excel rows using Web Workers, with real-time progress UI.

### Deliverables

#### 3.1 Web Worker Architecture
```
Main Thread                    Worker Thread
─────────────                  ─────────────
dispatchJob(rows, schema)  →   processRow(row, schema, basePdf)
                           ←   { progress, pdfBuffer, error }
collectBuffers             ←   { done, allBuffers }
```
- Worker file: `src/workers/pdfGenerator.worker.ts`
- Uses `@pdfme/generator` (not `@pdfme/designer`) for headless generation
- Transfers ArrayBuffer via `postMessage` with `Transferable` for zero-copy

#### 3.2 Job Queue & Progress UI
- `IGenerationJob` state: queued / running / done / failed
- Real-time progress bar per row (using SharedArrayBuffer if available, fallback to message polling)
- ETA estimate: rolling average of ms-per-row × remaining rows
- Failed rows shown in red with error detail (e.g., "Row 14: field 'name' exceeded max length")
- Pause / Resume / Cancel buttons

#### 3.3 Output Options
- **ZIP Download**: All PDFs zipped with `fflate` (faster than JSZip), named by configurable pattern (e.g., `invoice_{row.id}_{date}.pdf`)
- **Individual Download**: Click any row to download that single PDF
- **Preview Mode**: Render generated PDF inline using `@pdfme/ui` `Viewer` component
- **Filename Pattern Editor**: Token-based UI — drag tokens like `{column_name}`, `{row_number}`, `{date}` into pattern string

#### 3.4 Performance Targets
| Rows | Expected Time | Notes |
|------|-------------|-------|
| 100  | < 8s  | Single worker |
| 500  | < 20s | 2 workers |
| 2000 | < 60s | 4 workers, chunked |

#### 3.5 Error Handling
- Validation pre-flight check before generation starts
- Per-row error log downloadable as `.csv`
- Partial ZIP: include successfully generated PDFs even if some rows fail

---

## Phase 4 — Template Library & Project Management ✅ (Code Delivered)

**Goal**: Let users save, organize, and re-use templates across sessions.

### Deliverables

#### 4.1 Template Gallery
- Grid view of saved templates (thumbnail preview generated from first page)
- Metadata: name, description, field count, last modified, row count used
- Duplicate, rename, delete, export as `.pdftemplate` bundle (JSON + base64 PDF + mapping)

#### 4.2 Project System
- A "Project" bundles: PDF template + pdfme schema + field bindings + validation rules
- Import `.pdftemplate` bundle (share between team members)
- Recent projects list on dashboard home screen
- Project-level notes/description field

#### 4.3 Template Versioning (Lightweight)
- Auto-snapshot on each major save (keep last 10 snapshots)
- Version diff view: highlight added/removed/moved fields between snapshots
- Restore to any snapshot with one click

#### 4.4 IndexedDB Migration
- Migrate from localStorage to IndexedDB for large template storage (PDFs can be MBs)
- Abstraction layer: `src/services/storage.service.ts` with `get/set/delete/list` API
- Graceful fallback to localStorage if IndexedDB unavailable

---

## Phase 5 — Advanced Field Types & pdfme Extensions

**Goal**: Extend beyond basic Text/Checkbox to support rich field types.

### Deliverables

#### 5.1 Custom pdfme Plugins ✅ (Code Delivered)
- [x] **Signature Field**: Placeholder box rendered as "SIGN HERE" region; in bulk-gen, renders an image from a base64 Excel cell value
- [x] **QR Code Field**: Encodes a specified Excel column value as QR code using `qrcode` library
- [x] **Barcode Field**: Supports Code128, Code39, EAN-13 via `jsbarcode`
- [x] **Image Field**: Renders base64 or URL image from Excel column into a PDF image region

#### 5.2 Multi-Page Support
- Add/remove pages in template editor
- Per-page field management (fields scoped to their page)
- Global fields (appear on all pages) vs page-scoped fields

#### 5.3 Conditional Fields
- Field visibility rule engine: `IF {excel_col} === "value" THEN show field`
- Boolean expression builder UI (AND / OR conditions)
- Preview conditional logic against sample row data

#### 5.4 Field Groups & Sections
- Logical grouping of fields (collapsed/expanded in sidebar)
- Tab-order management for form fields
- Required field indicators with asterisk decorator

---

## Phase 6 — UI Polish, Accessibility & Developer Experience

**Goal**: Production-ready quality bar.

### Deliverables

#### 6.1 Accessibility (WCAG 2.1 AA)
- Full keyboard navigation in all modals and panels
- ARIA labels on all interactive elements
- Focus trap in modals
- Screen reader announcements for async operations (progress updates)
- High contrast mode toggle

#### 6.2 Theming System
- CSS custom property theme tokens
- Light / Dark / System theme
- Theme persisted to localStorage
- Smooth theme transition (150ms cross-fade)

#### 6.3 Onboarding & Help
- First-run guided tour (using `driver.js` or custom step overlay)
- Contextual help tooltips on complex UI (pdfme field properties, binding rules)
- Sample template library (3 built-in templates: Invoice, Certificate, ID Card)
- Video placeholder area in help panel for future screencasts

#### 6.4 Performance Optimization
- Route-based code splitting (`React.lazy` + `Suspense`)
- pdfme Designer lazy-loaded only when PDF is uploaded
- ExcelJS loaded only in bulk generate page
- Memoization audit: `React.memo`, `useMemo`, `useCallback` where measured beneficial

#### 6.5 Error Boundaries
- Top-level error boundary with friendly "Something went wrong" UI
- Per-panel error boundaries (Designer crash doesn't crash sidebar)
- Sentry-ready error context object (userId, templateId, action)

---

## Phase 7 — Optional Backend & Collaboration (Future)

**Goal**: Enable team features and server-side generation for enterprise users.

### Architecture Option A: Serverless (Recommended for indie/small team)
```
Cloudflare Workers / Vercel Edge
├── /api/generate   → PDF generation (pdfme Node.js)
├── /api/templates  → CRUD (D1 SQLite or KV)
└── /api/export     → ZIP streaming response
```

### Architecture Option B: Full Backend
```
Node.js + Express / Fastify
├── PostgreSQL (projects, templates, users)
├── S3-compatible storage (PDF files, generated outputs)
├── BullMQ (Redis) job queue for large batches
└── WebSocket progress events → frontend
```

### Collaboration Features
- Share template link (read-only or edit access)
- Comments on fields ("This field maps to billing address")
- Change log / audit trail
- Role-based access: Admin / Editor / Viewer

---

## Tech Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|---------:|
| Build | Vite 5 | Fast HMR, ESBuild, native ESM |
| Framework | React 18 | Concurrent features, Suspense |
| Language | TypeScript 5 | Safety, IDE support |
| Styling | Tailwind CSS 4 | v4 @theme tokens, utility-first |
| State | Zustand 4 | Minimal boilerplate, selector perf |
| PDF Engine | @pdfme/designer + generator | Best OSS PDF template engine |
| Excel | ExcelJS | Full XLSX read/write, good types |
| ZIP | fflate | 3x faster than JSZip, streaming |
| Icons | lucide-react | Consistent, tree-shakable |
| Storage | IndexedDB (idb) | Large binary storage |
| Workers | Native Web Workers | Parallel PDF generation |
| Testing | Vitest + RTL | Co-located with Vite |

---

## File Size Budget (Initial Load)

| Bundle | Target | Strategy |
|--------|--------|----------|
| Initial JS | < 150kb gzipped | Lazy-load pdfme, ExcelJS |
| pdfme chunk | < 300kb gzipped | Load on PDF upload |
| ExcelJS chunk | < 200kb gzipped | Load on bulk generate page |
| Worker bundle | < 100kb | Separate Rollup entry |

---

## Development Milestones

| Phase | Timeline | Complexity |
|-------|----------|------------|
| Phase 1 | Week 1–2 ✅ | Medium |
| Phase 2 | Week 3–4 | Medium-High |
| Phase 3 | Week 5–7 | High |
| Phase 4 | Week 8–9 | Medium |
| Phase 5 | Week 10–12 | High |
| Phase 6 | Week 13–14 | Medium |
| Phase 7 | TBD | Very High |

---

## Quality Gates (Before Each Phase Completion)

- [x] TypeScript: `tsc --noEmit` passes with zero errors ✅ Phase 1
- [ ] No `any` types (ESLint `@typescript-eslint/no-explicit-any: error`)
- [x] All async operations have loading / error states in UI ✅ Phase 1
- [ ] Lighthouse Performance ≥ 85 on initial load
- [x] All modals have keyboard trap + Escape closes ✅ Phase 1
- [x] LocalStorage / IndexedDB reads are wrapped in try/catch ✅ Phase 1

---

*Last updated: Phase 1 code delivered & verified — all source files created, TypeScript passes, Vite builds successfully*
