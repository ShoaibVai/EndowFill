/**
 * EditorToolbar.tsx — Toolbar above the pdfme Designer canvas.
 *
 * Provides PDF upload, Excel template download, and zoom controls.
 */

import { useCallback, useRef } from 'react';
import { Upload, Download, ZoomIn, ZoomOut, RotateCcw, Layers } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { generateExcelTemplate } from '../../utils/excelHelpers';

export function EditorToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const setBasePdfBuffer = useAppStore((s) => s.setBasePdfBuffer);
  const setPdfFileName = useAppStore((s) => s.setPdfFileName);
  const schemaFields = useAppStore((s) => s.schemaFields);
  const pdfFileName = useAppStore((s) => s.pdfFileName);

  const handlePdfUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        alert('Please upload a PDF file.');
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        setBasePdfBuffer(buffer);
        setPdfFileName(file.name);
      };
      reader.readAsArrayBuffer(file);
    },
    [setBasePdfBuffer, setPdfFileName]
  );

  const handleDownloadTemplate = useCallback(async () => {
    if (schemaFields.length === 0) {
      alert('Add fields to your PDF template first.');
      return;
    }
    await generateExcelTemplate(schemaFields);
  }, [schemaFields]);

  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 rounded-xl mb-3"
      style={{
        background: 'var(--color-surface-0)',
        border: '1px solid var(--color-surface-200)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Left actions */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handlePdfUpload}
          className="hidden"
          id="pdf-upload-input"
        />
        <button
          className="btn btn-primary btn-sm"
          onClick={() => fileInputRef.current?.click()}
          id="upload-pdf-btn"
        >
          <Upload className="w-4 h-4" />
          {pdfFileName ? 'Replace PDF' : 'Upload PDF'}
        </button>

        {schemaFields.length > 0 && (
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleDownloadTemplate}
            id="download-excel-btn"
          >
            <Download className="w-4 h-4" />
            Excel Template
          </button>
        )}
      </div>

      {/* Center — Info */}
      {schemaFields.length > 0 && (
        <div className="hidden md:flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" style={{ color: 'var(--color-brand-500)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--color-surface-500)' }}>
            {schemaFields.length} field{schemaFields.length !== 1 ? 's' : ''} defined
          </span>
        </div>
      )}

      {/* Right — View controls */}
      <div className="flex items-center gap-1">
        <button className="btn btn-ghost btn-icon btn-sm" title="Zoom In" id="zoom-in-btn">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Zoom Out" id="zoom-out-btn">
          <ZoomOut className="w-4 h-4" />
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" title="Reset View" id="reset-view-btn">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
