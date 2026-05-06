import { useState } from 'react';
import { Type, Info } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

export function FilenameEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  const excelColumns = useAppStore((s) => s.excelColumns);
  const [showTokens, setShowTokens] = useState(false);

  const insertToken = (token: string) => {
    onChange(`${value}${token}`);
    setShowTokens(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-surface-800)' }}>
        <Type className="w-4 h-4" />
        Output Filename Pattern
      </label>
      
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          style={{ borderColor: 'var(--color-surface-300)', color: 'var(--color-surface-700)' }}
          placeholder="e.g., document_{row_number}.pdf"
        />
        
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setShowTokens(!showTokens)}
            className="btn btn-ghost btn-sm text-xs"
            style={{ color: 'var(--color-brand-600)' }}
          >
            Insert Token...
          </button>
          
          {showTokens && (
            <div className="absolute top-full mt-1 left-0 z-10 p-3 rounded-lg shadow-lg flex flex-wrap gap-2 max-w-sm" style={{ background: 'white', border: '1px solid var(--color-surface-200)' }}>
              <button
                onClick={() => insertToken('{row_number}')}
                className="badge badge-primary cursor-pointer hover:opacity-80"
              >
                {'{row_number}'}
              </button>
              {excelColumns.map((col) => (
                <button
                  key={col.index}
                  onClick={() => insertToken(`{${col.header}}`)}
                  className="badge badge-primary cursor-pointer hover:opacity-80"
                >
                  {`{${col.header}}`}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      <p className="text-xs flex items-start gap-1" style={{ color: 'var(--color-surface-500)' }}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Use tokens to dynamically name your PDFs based on row data. The extension .pdf will be added automatically.
      </p>
    </div>
  );
}
