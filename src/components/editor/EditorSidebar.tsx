/**
 * EditorSidebar.tsx — Left sidebar showing the schema field list,
 * derived reactively from the pdfme Designer's schema.
 */

import { useState } from 'react';
import { Search, ListFilter, FileSpreadsheet } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { FieldListItem } from '../ui/FieldListItem';
import { EmptyState } from '../ui/EmptyState';

export function EditorSidebar() {
  const schemaFields = useAppStore((s) => s.schemaFields);
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const filtered = schemaFields.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside
      className="flex flex-col h-full rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-surface-0)',
        border: '1px solid var(--color-surface-200)',
        boxShadow: 'var(--shadow-glass)',
        width: '300px',
        minWidth: '300px',
      }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--color-surface-100)' }}
      >
        <div className="flex items-center gap-2">
          <ListFilter className="w-4 h-4" style={{ color: 'var(--color-brand-500)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-surface-800)' }}>
            Template Fields
          </h2>
        </div>
        {schemaFields.length > 0 && (
          <span className="badge badge-brand">{schemaFields.length}</span>
        )}
      </div>

      {/* Search */}
      {schemaFields.length > 0 && (
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--color-surface-100)' }}>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
              style={{ color: 'var(--color-surface-400)' }}
            />
            <input
              type="text"
              placeholder="Search fields..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              id="field-search-input"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none transition-all duration-150"
              style={{
                background: 'var(--color-surface-50)',
                border: '1px solid var(--color-surface-200)',
                color: 'var(--color-surface-700)',
              }}
            />
          </div>
        </div>
      )}

      {/* Field list */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {schemaFields.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="w-7 h-7" />}
            title="No Fields Yet"
            description="Upload a PDF and add text fields in the Designer to see them here."
          />
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--color-surface-400)' }}>
              No fields match "{search}"
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filtered.map((field, i) => (
              <FieldListItem
                key={field.name}
                field={field}
                index={i}
                isSelected={selectedIndex === i}
                onClick={() => setSelectedIndex(i === selectedIndex ? null : i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      {schemaFields.length > 0 && (
        <div
          className="px-4 py-2.5 flex items-center justify-between text-xs"
          style={{
            borderTop: '1px solid var(--color-surface-100)',
            color: 'var(--color-surface-400)',
          }}
        >
          <span>
            {filtered.length} of {schemaFields.length} shown
          </span>
          <span className="badge badge-success" style={{ fontSize: '11px' }}>
            Synced
          </span>
        </div>
      )}
    </aside>
  );
}
