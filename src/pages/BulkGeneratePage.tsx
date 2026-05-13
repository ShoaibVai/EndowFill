import { useState } from 'react';
import {
  Zap,
  ArrowRight,
  Download,
  Sparkles,
} from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { useAppStore } from '../store/useAppStore';
import { ExcelUploader } from '../components/bulk/ExcelUploader';
import { ExcelPreview } from '../components/bulk/ExcelPreview';
import { FieldMapper } from '../components/bulk/FieldMapper';
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

  const { startGeneration, cancelGeneration, pauseGeneration, resumeGeneration, downloadSinglePdf, generationJob } = useGenerationEngine();
  const [filenamePattern, setFilenamePattern] = useState('document_{row_number}.pdf');

  // If no template is designed yet, show empty state
  if (!pdfmeTemplate || schemaFields.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center animate-fade-in">
        <EmptyState
          icon={<Zap className="w-7 h-7" />}
          title="Template Required"
          description="Switch to the Template Editor tab to upload a PDF and design your fields first. Then come back here to generate PDFs in bulk."
          action={
            <button
              className="btn btn-primary"
              onClick={() => useAppStore.getState().setActiveTab('editor')}
              id="go-to-editor-btn"
            >
              Go to Editor
              <ArrowRight className="w-4 h-4" />
            </button>
          }
        />
      </div>
    );
  }

  const hasExcel = excelColumns.length > 0;
  const isFullyMapped = schemaFields.every(f => fieldBindings.some(b => b.schemaFieldId === f.name));

  return (
    <div className="flex-1 p-6 animate-fade-in overflow-y-auto">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        
        {/* Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600))',
                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
              }}
            >
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: 'var(--color-surface-900)' }}>
                Bulk PDF Generation
              </h2>
              <p className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
                Generate filled PDFs from your Excel data
              </p>
            </div>
          </div>
        </div>

        {/* Step 1: Excel Upload */}
        {!hasExcel && (
          <div className="card p-8 text-center animate-slide-in-up" style={{ border: '2px dashed var(--color-surface-200)' }}>
             <ExcelUploader />
          </div>
        )}

        {/* Excel Data & Field Mapping (Shown when Excel is uploaded) */}
        {hasExcel && (
          <div className="flex flex-col lg:flex-row gap-6 items-start animate-fade-in">
            <div className="flex-1 w-full flex flex-col gap-6">
               <FieldMapper />
               
               <ValidationRulesEditor />
               <div className="mt-4">
                 <h4 className="font-semibold">Conditional Field Rules</h4>
                 <ConditionalRulesBuilder />
               </div>

               {isFullyMapped && !generationJob && (
                 <div className="card p-6 flex flex-col gap-6" style={{ background: 'linear-gradient(135deg, var(--color-primary-50), white)', border: '1px solid var(--color-primary-200)' }}>
                   <FilenameEditor value={filenamePattern} onChange={setFilenamePattern} />
                   
                   <div className="flex items-center justify-between mt-2 pt-4" style={{ borderTop: '1px solid var(--color-primary-100)' }}>
                     <div>
                       <h3 className="text-lg font-bold" style={{ color: 'var(--color-primary-800)' }}>Ready to Generate</h3>
                       <p className="text-sm mt-1" style={{ color: 'var(--color-surface-500)' }}>
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

      </div>
    </div>
  );
}
