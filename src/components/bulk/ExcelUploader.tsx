import { useState, useCallback, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { parseExcelFile } from '../../utils/excelHelpers';

export function ExcelUploader() {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setExcelColumns = useAppStore((s) => s.setExcelColumns);
  const setExcelRows = useAppStore((s) => s.setExcelRows);
  const setExcelFileName = useAppStore((s) => s.setExcelFileName);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|csv)$/i)) {
      setError('Please upload a valid .xlsx or .csv file');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { columns, rows } = await parseExcelFile(file);
      if (columns.length === 0) {
        throw new Error('No columns found in the file.');
      }
      if (rows.length === 0) {
        throw new Error('No data rows found in the file.');
      }
      
      setExcelColumns(columns);
      setExcelRows(rows);
      setExcelFileName(file.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse Excel file';
      setError(message);
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [setExcelColumns, setExcelRows, setExcelFileName]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  return (
    <div className="animate-fade-in">
      <div
        className={`drop-zone flex flex-col items-center justify-center p-8 transition-all ${
          isDragging ? 'drag-over' : ''
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
          style={{
            background: 'linear-gradient(135deg, var(--color-brand-50), var(--color-brand-100))',
          }}
        >
          {isLoading ? (
            <div className="spinner" style={{ borderColor: 'var(--color-brand-200)', borderTopColor: 'var(--color-brand-500)' }} />
          ) : (
            <Upload className="w-7 h-7" style={{ color: 'var(--color-brand-500)' }} />
          )}
        </div>
        
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--color-surface-800)' }}>
          {isDragging ? 'Drop file to upload' : 'Upload Excel Data'}
        </h3>
        <p className="text-sm max-w-md mb-6 text-center" style={{ color: 'var(--color-surface-400)' }}>
          Upload a .xlsx or .csv file containing the data you want to populate into the PDF template. The first row must contain column headers.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
          onChange={handleChange}
          className="hidden"
          id="excel-upload-input"
        />

        <button
          className="btn btn-primary"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
        >
          <FileSpreadsheet className="w-4 h-4" />
          {isLoading ? 'Processing...' : 'Browse Files'}
        </button>
      </div>

      {error && (
        <div className="mt-4 p-4 rounded-lg flex items-start gap-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
          <AlertCircle className="w-5 h-5 shrink-0" style={{ color: '#ef4444' }} />
          <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
        </div>
      )}
    </div>
  );
}
