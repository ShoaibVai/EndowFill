import { useEffect } from 'react';
import { ArrowRight, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { findBestColumnMatch } from '../../utils/stringUtils';

export function FieldMapper() {
  const schemaFields = useAppStore((s) => s.schemaFields);
  const excelColumns = useAppStore((s) => s.excelColumns);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const addFieldBinding = useAppStore((s) => s.addFieldBinding);
  const removeFieldBinding = useAppStore((s) => s.removeFieldBinding);

  // Auto-match fields on mount if not already mapped
  useEffect(() => {
    if (schemaFields.length === 0 || excelColumns.length === 0) return;

    const columnHeaders = excelColumns.map(c => c.header);

    schemaFields.forEach((field) => {
      const existingBinding = fieldBindings.find(b => b.schemaFieldId === field.name);
      if (!existingBinding) {
        const bestMatchIndex = findBestColumnMatch(field.name, columnHeaders);
        if (bestMatchIndex !== -1) {
          addFieldBinding({
            schemaFieldId: field.name,
            excelColumnIndex: bestMatchIndex,
          });
        }
      }
    });
  }, [schemaFields, excelColumns, fieldBindings, addFieldBinding]);

  const handleAutoMatch = () => {
    const columnHeaders = excelColumns.map(c => c.header);
    schemaFields.forEach((field) => {
      const bestMatchIndex = findBestColumnMatch(field.name, columnHeaders);
      if (bestMatchIndex !== -1) {
        addFieldBinding({
          schemaFieldId: field.name,
          excelColumnIndex: bestMatchIndex,
        });
      } else {
        removeFieldBinding(field.name);
      }
    });
  };

  const isFullyMapped = schemaFields.every(f => fieldBindings.some(b => b.schemaFieldId === f.name));

  return (
    <div className="card flex flex-col p-6 animate-fade-in" style={{ border: '1px solid var(--color-surface-200)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-surface-800)' }}>Map Fields to Columns</h3>
          <p className="text-sm mt-1" style={{ color: 'var(--color-surface-500)' }}>
            Connect each PDF field to the corresponding Excel column.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isFullyMapped ? (
            <span className="badge badge-success">
              <CheckCircle2 className="w-3.5 h-3.5" /> All Mapped
            </span>
          ) : (
            <span className="badge badge-warning">
              <AlertCircle className="w-3.5 h-3.5" /> Missing Maps
            </span>
          )}
          <button onClick={handleAutoMatch} className="btn btn-secondary btn-sm">
            <RefreshCw className="w-3.5 h-3.5" /> Auto Match
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Header Row */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-2 font-semibold text-xs uppercase tracking-wider" style={{ color: 'var(--color-surface-400)', borderBottom: '1px solid var(--color-surface-200)' }}>
          <div>PDF Template Field</div>
          <div className="w-8"></div>
          <div>Excel Data Column</div>
        </div>

        {/* Rows */}
        {schemaFields.map((field) => {
          const binding = fieldBindings.find(b => b.schemaFieldId === field.name);
          const isMapped = !!binding;
          
          return (
            <div key={field.name} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-3 rounded-xl transition-colors" style={{ background: isMapped ? 'var(--color-surface-50)' : 'rgba(254, 243, 199, 0.4)' }}>
              {/* PDF Field Left */}
              <div className="flex flex-col">
                <span className="text-sm font-medium" style={{ color: 'var(--color-surface-800)' }}>{field.name}</span>
                <span className="text-xs" style={{ color: 'var(--color-surface-400)' }}>{field.type}{field.required ? ' • Required' : ''}</span>
              </div>

              {/* Connector Center */}
              <div className="flex justify-center text-slate-300">
                <ArrowRight className="w-5 h-5" style={{ color: isMapped ? 'var(--color-brand-400)' : 'var(--color-surface-300)' }} />
              </div>

              {/* Excel Column Right (Select) */}
              <div>
                <select
                  value={binding ? binding.excelColumnIndex : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      removeFieldBinding(field.name);
                    } else {
                      addFieldBinding({
                        schemaFieldId: field.name,
                        excelColumnIndex: Number(val),
                      });
                    }
                  }}
                  className="w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  style={{
                    borderColor: isMapped ? 'var(--color-surface-300)' : 'var(--color-warning)',
                    color: 'var(--color-surface-700)'
                  }}
                >
                  <option value="">-- Unmapped --</option>
                  {excelColumns.map((col) => (
                    <option key={col.index} value={col.index}>
                      {col.header} ({col.inferredType})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
