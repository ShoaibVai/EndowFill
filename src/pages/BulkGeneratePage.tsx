import { useState } from 'react';
import {
  Zap,
  Download,
  Sparkles,
  FileSpreadsheet,
  ScanText,
  Files,
  FileText,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { GenerateWizard } from '../components/bulk/GenerateWizard';
import { useAppStore } from '../store/useAppStore';
import { ExcelUploader } from '../components/bulk/ExcelUploader';
import { ExcelPreview } from '../components/bulk/ExcelPreview';
import { FieldMapper } from '../components/bulk/FieldMapper';
import { ExtractedDataMapper } from '../components/bulk/ExtractedDataMapper';
import { FilenameEditor } from '../components/bulk/FilenameEditor';
import { GenerationProgress } from '../components/bulk/GenerationProgress';
import { ValidationRulesEditor } from '../components/bulk/ValidationRulesEditor';
import ConditionalRulesBuilder from '../components/bulk/ConditionalRulesBuilder';
import { useGenerationEngine } from '../hooks/useGenerationEngine';

export function BulkGeneratePage() {
  const schemaFields = useAppStore((s) => s.schemaFields);
  const pdfmeTemplate = useAppStore((s) => s.pdfmeTemplate);
  const excelColumns = useAppStore((s) => s.excelColumns);
  const excelRows = useAppStore((s) => s.excelRows);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const dataSourceMode = useAppStore((s) => s.dataSourceMode);
  const setDataSourceMode = useAppStore((s) => s.setDataSourceMode);
  const extractedItems = useAppStore((s) => s.extractedItems);
  const bulkExtractedResults = useAppStore((s) => s.bulkExtractedResults);

  const { startGeneration, cancelGeneration, pauseGeneration, resumeGeneration, downloadSinglePdf, generationJob } = useGenerationEngine();
  const [filenamePattern, setFilenamePattern] = useState('document_{row_number}.pdf');
  const [aiFilenamePattern, setAiFilenamePattern] = useState('{source_file}.pdf');

  // ── First-run experience: no template designed yet ─────────────────────
  if (!pdfmeTemplate || schemaFields.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <PageHeader
            icon={<Zap className="w-5 h-5" />}
            title="Bulk PDF Generation"
            subtitle="Generate filled PDFs from your data source"
          />
          <GenerateWizard />
        </div>
      </div>
    );
  }

  const hasExcel = excelColumns.length > 0;

  // ── AI source mode derived data ──
  const hasBulkScans = bulkExtractedResults.length > 0;
  const hasAiData = hasBulkScans || extractedItems.length > 0;
  const aiRecordCount = hasBulkScans ? bulkExtractedResults.length : extractedItems.length > 0 ? 1 : 0;
  // Representative items shown in the mapping UI (bulk: first file — bindings
  // are applied to every file by label at generation time).
  const repItems = hasBulkScans ? bulkExtractedResults[0]?.items ?? [] : extractedItems;
  const aiTokens = ['source_file', ...repItems.map((item) => item.label).filter(Boolean)];

  const isFullyMapped = schemaFields.every((f) =>
    fieldBindings.some(
      (b) =>
        b.schemaFieldId === f.name &&
        (dataSourceMode === 'ai' ? Boolean(b.sourceItemId) : b.excelColumnIndex !== undefined)
    )
  );

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 animate-fade-in">
      <div className="mx-auto flex max-w-5xl flex-col gap-8">
        {/* Header */}
        <PageHeader
          icon={<Zap className="w-5 h-5" />}
          title="Bulk PDF Generation"
          subtitle="Generate filled PDFs from your data source"
          actions={
            <span className="badge badge-brand">
              <Sparkles className="w-3 h-3" />
              {schemaFields.length} field{schemaFields.length === 1 ? '' : 's'} mapped
            </span>
          }
        />

        {/* Data source toggle */}
        <div className="segmented" role="tablist" aria-label="Data source">
          <button
            type="button"
            role="tab"
            aria-selected={dataSourceMode === 'excel'}
            onClick={() => setDataSourceMode('excel')}
            className={`segmented__btn ${dataSourceMode === 'excel' ? 'segmented__btn--active' : ''}`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            Excel / CSV
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dataSourceMode === 'ai'}
            onClick={() => setDataSourceMode('ai')}
            className={`segmented__btn ${dataSourceMode === 'ai' ? 'segmented__btn--active' : ''}`}
          >
            <ScanText className="w-4 h-4" />
            AI Scans
            {hasAiData && <span className="badge badge-brand">{aiRecordCount}</span>}
          </button>
        </div>

        {/* ── Excel source mode ─────────────────────────────────────────── */}
        {dataSourceMode === 'excel' && (
          <>
            {!hasExcel && (
              <div className="card p-8 text-center animate-slide-in-up" style={{ border: '2px dashed var(--border-subtle)' }}>
                <ExcelUploader />
              </div>
            )}

            {hasExcel && (
              <div className="flex flex-col lg:flex-row gap-6 items-start animate-fade-in">
                <div className="flex-1 w-full flex flex-col gap-6">
                  <FieldMapper />

                  <ValidationRulesEditor />
                  <div className="mt-4">
                    <h4 className="font-semibold text-ink">Conditional Field Rules</h4>
                    <ConditionalRulesBuilder />
                  </div>

                  {isFullyMapped && !generationJob && (
                    <div
                      className="card p-6 flex flex-col gap-6"
                      style={{
                        background: 'linear-gradient(135deg, var(--color-primary-50), var(--bg-surface))',
                        border: '1px solid var(--color-primary-200)',
                      }}
                    >
                      <FilenameEditor value={filenamePattern} onChange={setFilenamePattern} />

                      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <div>
                          <h3 className="text-lg font-bold text-primary-800 dark:text-primary-300">Ready to Generate</h3>
                          <p className="text-sm mt-1 text-ink-muted">
                            All fields are mapped successfully.
                          </p>
                        </div>
                        <button className="btn btn-primary btn-lg shadow-lg" onClick={() => startGeneration(filenamePattern)}>
                          <Download className="w-5 h-5" />
                          Generate {excelRows.length} PDFs
                        </button>
                      </div>
                    </div>
                  )}

                  {generationJob && (
                    <GenerationProgress
                      onCancel={cancelGeneration}
                      onPause={pauseGeneration}
                      onResume={resumeGeneration}
                      onDownloadSingle={downloadSinglePdf}
                    />
                  )}
                </div>

                <div className="w-full lg:w-[400px] shrink-0">
                  <ExcelPreview />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── AI scan source mode ───────────────────────────────────────── */}
        {dataSourceMode === 'ai' && (
          <>
            {!hasAiData && (
              <div className="card p-8 animate-slide-in-up" style={{ border: '2px dashed var(--border-subtle)' }}>
                <EmptyState
                  icon={<ScanText className="w-7 h-7" />}
                  title="No scanned documents yet"
                  description="Scan a student's document with AI Scan (or many with Bulk Scan) — the extracted information will appear here, ready to map onto your template fields."
                  action={
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        className="btn btn-primary"
                        onClick={() => useAppStore.getState().setActiveTab('scan')}
                        id="go-to-scan-btn"
                      >
                        <ScanText className="w-4 h-4" />
                        AI Scan
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => useAppStore.getState().setActiveTab('bulk-scan')}
                        id="go-to-bulk-scan-btn"
                      >
                        <Files className="w-4 h-4" />
                        Bulk Scan
                      </button>
                    </div>
                  }
                />
              </div>
            )}

            {hasAiData && (
              <div className="flex flex-col lg:flex-row gap-6 items-start animate-fade-in">
                <div className="flex-1 w-full flex flex-col gap-6">
                  <div className="card p-6">
                    <ExtractedDataMapper extractedItems={repItems} />
                    {hasBulkScans && (
                      <p className="mt-4 text-xs text-ink-muted">
                        Mapping once applies to every scanned file — each file's values are matched
                        to your selected items by label at generation time.
                      </p>
                    )}
                  </div>

                  {isFullyMapped && !generationJob && (
                    <div
                      className="card p-6 flex flex-col gap-6"
                      style={{
                        background: 'linear-gradient(135deg, var(--color-primary-50), var(--bg-surface))',
                        border: '1px solid var(--color-primary-200)',
                      }}
                    >
                      <FilenameEditor
                        value={aiFilenamePattern}
                        onChange={setAiFilenamePattern}
                        extraTokens={aiTokens}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                        <div>
                          <h3 className="text-lg font-bold text-primary-800 dark:text-primary-300">Ready to Generate</h3>
                          <p className="text-sm mt-1 text-ink-muted">
                            All fields are mapped successfully.
                          </p>
                        </div>
                        <button className="btn btn-primary btn-lg shadow-lg" onClick={() => startGeneration(aiFilenamePattern)}>
                          <Download className="w-5 h-5" />
                          Generate {aiRecordCount} PDF{aiRecordCount === 1 ? '' : 's'}
                        </button>
                      </div>
                    </div>
                  )}

                  {generationJob && (
                    <GenerationProgress
                      onCancel={cancelGeneration}
                      onPause={pauseGeneration}
                      onResume={resumeGeneration}
                      onDownloadSingle={downloadSinglePdf}
                    />
                  )}
                </div>

                {/* Source files summary */}
                <div className="w-full lg:w-[400px] shrink-0">
                  <div className="card p-6 flex flex-col gap-3">
                    <h4 className="text-sm font-semibold text-ink">
                      Source {hasBulkScans ? 'files' : 'scan'} ({aiRecordCount})
                    </h4>
                    <div className="flex flex-col gap-1.5 max-h-96 overflow-y-auto pr-1">
                      {hasBulkScans ? (
                        bulkExtractedResults.map((result) => (
                          <div
                            key={result.filename}
                            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                            style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
                          >
                            <FileText className="w-4 h-4 shrink-0" style={{ color: 'var(--color-primary-500)' }} />
                            <span className="min-w-0 flex-1 truncate font-medium text-ink">
                              {result.filename}
                            </span>
                            <span className="shrink-0 text-xs text-ink-faint">
                              {result.items.length} item{result.items.length === 1 ? '' : 's'}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
                          style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
                        >
                          <ScanText className="w-4 h-4 shrink-0" style={{ color: 'var(--color-primary-500)' }} />
                          <span className="min-w-0 flex-1 truncate font-medium text-ink">
                            Single AI scan
                          </span>
                          <span className="shrink-0 text-xs text-ink-faint">
                            {extractedItems.length} item{extractedItems.length === 1 ? '' : 's'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}
