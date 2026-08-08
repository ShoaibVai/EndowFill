import { useState } from 'react';
import { Type, Info } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';

interface FilenameEditorProps {
  value: string;
  onChange: (val: string) => void;
  /** Extra tokens (e.g. AI-mode `source_file` + extracted item labels). */
  extraTokens?: string[];
}

export function FilenameEditor({ value, onChange, extraTokens = [] }: FilenameEditorProps) {
  const excelColumns = useAppStore((s) => s.excelColumns);
  const [showTokens, setShowTokens] = useState(false);

  const insertToken = (token: string) => {
    onChange(`${value}${token}`);
    setShowTokens(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-main)' }}>
        <Type className="w-4 h-4" />
        Output Filename Pattern
      </label>

      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="form-input"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--text-main)' }}
          placeholder="e.g., document_{row_number}.pdf"
        />

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            onClick={() => setShowTokens(!showTokens)}
            className="btn btn-ghost btn-sm text-xs"
            style={{ color: 'var(--color-primary-600)' }}
          >
            Insert Token...
          </button>

          {showTokens && (
            <div
              className="absolute top-full mt-1 left-0 z-10 p-3 rounded-lg shadow-lg flex flex-wrap gap-2 max-w-sm"
              style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}
            >
              <button
                onClick={() => insertToken('{row_number}')}
                className="badge badge-primary cursor-pointer hover:opacity-80"
              >
                {'{row_number}'}
              </button>
              {extraTokens.map((token) => (
                <button
                  key={token}
                  onClick={() => insertToken(`{${token}}`)}
                  className="badge badge-primary cursor-pointer hover:opacity-80"
                >
                  {`{${token}}`}
                </button>
              ))}
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

      <p className="text-xs flex items-start gap-1" style={{ color: 'var(--text-muted)' }}>
        <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        Use tokens to dynamically name your PDFs based on row data. The extension .pdf will be added automatically.
      </p>
    </div>
  );
}
