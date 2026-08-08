/**
 * GenerateWizard.tsx — First-run guided experience for Bulk Generate.
 *
 * Shown when no template is loaded and no extracted items exist. Walks the
 * user through the core EndowFill workflow — Scan → Map → Generate — so the
 * AI capabilities are impossible to miss on a fresh session:
 *
 *   1. Pick a template   (upload in the editor, or open from Projects)
 *   2. Bring your data   (AI Scan, Bulk Scan, or upload Excel/CSV right here)
 *   3. Generate PDFs     (map fields + generate — unlocked after steps 1–2)
 */

import {
  FileSpreadsheet,
  FolderKanban,
  PenTool,
  ScanText,
  Sparkles,
  Files,
  Zap,
  ArrowRight,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { ExcelUploader } from './ExcelUploader';

export function GenerateWizard() {
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const excelColumns = useAppStore((s) => s.excelColumns);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Intro */}
      <div className="text-center animate-fade-in">
        <span className="hero__badge" style={{ marginBottom: 12 }}>
          <Sparkles className="w-3.5 h-3.5" />
          Start here — three steps to filled PDFs
        </span>
        <h2 className="text-xl font-extrabold text-ink" style={{ letterSpacing: '-0.02em' }}>
          Let&apos;s build your first batch
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted" style={{ lineHeight: 1.6 }}>
          EndowFill fills PDFs at scale: <strong>Scan</strong> a document or open a template,{' '}
          <strong>Map</strong> your data to its fields, then <strong>Generate</strong> one PDF per
          record. Follow the steps below — each one jumps straight to the right tool.
        </p>
      </div>

      {/* Step 1 — Template */}
      <div className="wizard">
        <div className="wizard-step">
          <div className="wizard-step__num">1</div>
          <div className="min-w-0 flex-1">
            <h3 className="wizard-step__title">Pick a template</h3>
            <p className="wizard-step__desc">
              A template is a PDF with fields placed on it — it defines where your data lands.
              Upload a blank PDF, or open a saved template from a workspace.
            </p>
            <div className="wizard-step__actions">
              <button
                id="wizard-go-editor"
                className="btn btn-primary btn-sm"
                onClick={() => setActiveTab('editor')}
              >
                <PenTool className="w-4 h-4" />
                Open Template Editor
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                id="wizard-go-projects"
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveTab('projects')}
              >
                <FolderKanban className="w-4 h-4" />
                Browse saved templates
              </button>
            </div>
          </div>
        </div>

        {/* Step 2 — Data */}
        <div className="wizard-step">
          <div className="wizard-step__num">2</div>
          <div className="min-w-0 flex-1">
            <h3 className="wizard-step__title">Bring your data</h3>
            <p className="wizard-step__desc">
              Two ways in: let AI read a document (single or bulk), or upload the spreadsheet you
              already have.
            </p>
            <div className="wizard-step__actions">
              <button
                id="wizard-go-scan"
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveTab('scan')}
              >
                <ScanText className="w-4 h-4" />
                AI Scan a document
              </button>
              <button
                id="wizard-go-bulk-scan"
                className="btn btn-ghost btn-sm"
                onClick={() => setActiveTab('bulk-scan')}
              >
                <Files className="w-4 h-4" />
                Bulk Scan many files
              </button>
            </div>
            {excelColumns.length === 0 ? (
              <div className="mt-4 max-w-md">
                <ExcelUploader />
              </div>
            ) : (
              <p className="mt-4 text-xs text-ink-muted">
                <FileSpreadsheet className="mr-1 inline h-3.5 w-3.5" />
                Spreadsheet loaded ({excelColumns.length} columns) — create a template in step 1 and
                it will be ready to map here.
              </p>
            )}
          </div>
        </div>

        {/* Step 3 — Generate */}
        <div className="wizard-step">
          <div className="wizard-step__num">3</div>
          <div className="min-w-0 flex-1">
            <h3 className="wizard-step__title">Generate PDFs</h3>
            <p className="wizard-step__desc">
              Map template fields to your data, set file names, and generate one filled PDF per
              record — downloaded individually or as a zip.
            </p>
            <div className="wizard-step__actions">
              <button
                id="wizard-generate-locked"
                className="btn btn-secondary btn-sm"
                disabled
                title="Upload a template in step 1 to unlock generation"
              >
                <Zap className="w-4 h-4" />
                Generate PDFs
                <span className="badge badge-brand">needs a template</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
