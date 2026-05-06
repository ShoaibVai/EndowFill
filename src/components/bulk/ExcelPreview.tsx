import { FileSpreadsheet, Trash2 } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function ExcelPreview() {
  const excelColumns = useAppStore((s) => s.excelColumns);
  const excelRows = useAppStore((s) => s.excelRows);
  const excelFileName = useAppStore((s) => s.excelFileName);
  
  const setExcelColumns = useAppStore((s) => s.setExcelColumns);
  const setExcelRows = useAppStore((s) => s.setExcelRows);
  const setExcelFileName = useAppStore((s) => s.setExcelFileName);
  const setFieldBindings = useAppStore((s) => s.setFieldBindings);

  if (excelColumns.length === 0) return null;

  const handleClear = () => {
    if (confirm('Are you sure you want to remove the uploaded Excel data? Field mappings will be reset.')) {
      setExcelColumns([]);
      setExcelRows([]);
      setExcelFileName('');
      setFieldBindings([]);
    }
  };

  // Only show first 5 rows for preview
  const previewRows = excelRows.slice(0, 5);

  return (
    <div className="card animate-fade-in flex flex-col" style={{ border: '1px solid var(--color-surface-200)', overflow: 'hidden' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-surface-200)', background: 'var(--color-surface-50)' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-brand-100)', color: 'var(--color-brand-600)' }}>
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold" style={{ color: 'var(--color-surface-800)' }}>{excelFileName}</h3>
            <p className="text-xs" style={{ color: 'var(--color-surface-500)' }}>
              {excelColumns.length} columns • {excelRows.length} rows detected
            </p>
          </div>
        </div>
        <button onClick={handleClear} className="btn btn-ghost btn-sm text-xs" style={{ color: 'var(--color-danger)' }}>
          <Trash2 className="w-3.5 h-3.5" />
          Clear Data
        </button>
      </div>

      {/* Table Preview */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr style={{ background: 'var(--color-surface-100)', borderBottom: '1px solid var(--color-surface-200)' }}>
              <th className="px-4 py-3 font-semibold text-xs" style={{ color: 'var(--color-surface-600)', width: '50px' }}>#</th>
              {excelColumns.map((col) => (
                <th key={col.index} className="px-4 py-3 font-semibold text-xs whitespace-nowrap" style={{ color: 'var(--color-surface-700)' }}>
                  <div className="flex flex-col">
                    <span>{col.header}</span>
                    <span className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-surface-400)' }}>{col.inferredType}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--color-surface-100)' }} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-2 text-xs font-medium" style={{ color: 'var(--color-surface-400)' }}>{idx + 1}</td>
                {excelColumns.map((col) => (
                  <td key={col.index} className="px-4 py-2 text-sm truncate max-w-[200px]" style={{ color: 'var(--color-surface-700)' }}>
                    {row[col.header] || <span className="opacity-40 italic">empty</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {excelRows.length > 5 && (
        <div className="px-4 py-2 text-center text-xs" style={{ background: 'var(--color-surface-50)', color: 'var(--color-surface-500)', borderTop: '1px solid var(--color-surface-200)' }}>
          Showing 5 of {excelRows.length} rows
        </div>
      )}
    </div>
  );
}
