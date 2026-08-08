/**
 * DetectedFieldList.tsx — Editable list of AI-detected form fields (flow 2).
 *
 * Each row lets the user correct the label, change the field type (text /
 * checkbox / image / signature), edit checkbox group options (comma-separated)
 * and delete the field. Hover/click links back to the box on the PDF page.
 * The "Add field" button toggles the page's draw mode for missed fields.
 */

import { ListPlus, Trash2 } from 'lucide-react';
import type { DetectedFieldType, FieldPatch, ReviewField } from '../../types/scan.types';
import { FIELD_TYPE_STYLES } from './fieldTypeStyles';

const FIELD_TYPE_OPTIONS: { value: DetectedFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'image', label: 'Image' },
  { value: 'signature', label: 'Signature' },
];

const inputClass =
  'w-full rounded-md border border-surface-200 bg-white px-2.5 py-1.5 text-sm text-ink ' +
  'placeholder:text-ink-faint focus:border-primary-400 focus:outline-none focus:ring-2 ' +
  'focus:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100';

interface DetectedFieldListProps {
  fields: ReviewField[];
  selectedFieldId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onChange: (id: string, patch: FieldPatch) => void;
  onDelete: (id: string) => void;
  /** Toggle draw mode on the page to add a missed field. */
  onAddField: () => void;
  /** Whether the page is currently in draw mode (button state). */
  editMode: boolean;
}

export function DetectedFieldList({
  fields,
  selectedFieldId,
  onSelect,
  onHover,
  onChange,
  onDelete,
  onAddField,
  editMode,
}: DetectedFieldListProps) {
  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && (
        <div className="rounded-xl border border-dashed border-surface-300 p-8 text-center text-sm text-ink-faint dark:border-surface-700">
          No fields detected. Turn on <span className="font-semibold">Add field</span> and drag a
          box on the page to add one manually.
        </div>
      )}

      {fields.map((field) => {
        const isSelected = field.id === selectedFieldId;
        const typeStyle = FIELD_TYPE_STYLES[field.fieldType] ?? FIELD_TYPE_STYLES.text;
        const optionsText = (field.options ?? []).join(', ');
        return (
          <div
            key={field.id}
            role="option"
            aria-selected={isSelected}
            onMouseEnter={() => onHover(field.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(field.id)}
            className={[
              'cursor-pointer rounded-xl border p-3 transition-all duration-150',
              isSelected
                ? 'border-primary-300 bg-primary-50/60 ring-2 ring-primary-500/20 dark:border-primary-700 dark:bg-primary-500/10'
                : 'border-surface-200 bg-white hover:border-surface-300 dark:border-surface-700 dark:bg-surface-900 dark:hover:border-surface-600',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: typeStyle.chip }}
                aria-hidden="true"
              />
              <input
                value={field.label}
                onChange={(event) => onChange(field.id, { label: event.target.value })}
                onClick={(event) => event.stopPropagation()}
                placeholder="Field label"
                aria-label="Field label"
                className="min-w-0 flex-1 border-b border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink focus:border-primary-400 focus:outline-none dark:text-surface-100"
              />
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                Page {field.pageIndex != null ? field.pageIndex + 1 : '—'}
              </span>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(field.id);
                }}
                aria-label={`Delete ${field.label || 'field'}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <select
                value={field.fieldType}
                onChange={(event) =>
                  onChange(field.id, { fieldType: event.target.value as DetectedFieldType })
                }
                onClick={(event) => event.stopPropagation()}
                aria-label="Field type"
                className="shrink-0 rounded-lg border border-surface-300 bg-white px-2 py-1.5 text-xs font-medium text-ink focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-200"
              >
                {FIELD_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-ink-faint">
                {typeStyle.label} · {Math.round(field.bbox.width * 100)}% ×{' '}
                {Math.round(field.bbox.height * 100)}%
              </span>
            </div>

            {field.fieldType === 'checkbox' && (
              <input
                value={optionsText}
                onChange={(event) =>
                  onChange(field.id, {
                    options: event.target.value
                      .split(',')
                      .map((option) => option.trim())
                      .filter((option) => option.length > 0),
                  })
                }
                onClick={(event) => event.stopPropagation()}
                placeholder="Options, comma-separated (e.g. Male, Female)"
                aria-label="Checkbox options"
                className={`${inputClass} mt-2`}
              />
            )}

            {field.hint && (
              <p className="mt-1.5 text-xs italic text-ink-faint" title="AI hint">
                {field.hint}
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={onAddField}
        aria-pressed={editMode}
        className={[
          'inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors',
          editMode
            ? 'border-primary-400 bg-primary-50 text-primary-700 dark:border-primary-600 dark:bg-primary-500/10 dark:text-primary-300'
            : 'border-dashed border-surface-300 text-ink-muted hover:border-primary-400 hover:text-primary-600 dark:border-surface-700 dark:hover:border-primary-600',
        ].join(' ')}
      >
        <ListPlus className="h-4 w-4" />
        {editMode ? 'Add field: on — draw on the page' : 'Add field'}
      </button>
    </div>
  );
}
