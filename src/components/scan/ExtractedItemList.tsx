/**
 * ExtractedItemList.tsx — Editable list of extracted information items.
 *
 * Each row lets the user correct the label/value/category, shows a
 * confidence badge, and supports hover/click linkage back to the source
 * highlight on the PDF. A collapsible "Add item" form covers missed info
 * that was not drawn on the page (drawn boxes are added from the page).
 */

import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { ExtractedItem, ItemPatch } from '../../types/scan.types';

/** Suggested categories for the free-text category input. */
const CATEGORY_SUGGESTIONS = [
  'student',
  'contact',
  'education',
  'identification',
  'document',
  'other',
];

interface ExtractedItemListProps {
  items: ExtractedItem[];
  selectedItemId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onChange: (id: string, patch: ItemPatch) => void;
  onDelete: (id: string) => void;
  onAdd: (draft: { label: string; value: string; category: string }) => void;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percent = Math.round(confidence * 100);
  const tone =
    confidence >= 0.8
      ? 'bg-success-50 text-success-600 dark:bg-success-500/10 dark:text-success-400'
      : confidence >= 0.6
        ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
        : 'bg-error-50 text-error-600 dark:bg-error-500/10 dark:text-error-400';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone}`}
      title="Extraction confidence"
    >
      {percent}%
    </span>
  );
}

const inputClass =
  'w-full rounded-md border border-surface-200 bg-white px-2.5 py-1.5 text-sm text-ink ' +
  'placeholder:text-ink-faint focus:border-primary-400 focus:outline-none focus:ring-2 ' +
  'focus:ring-primary-500/20 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-100';

export function ExtractedItemList({
  items,
  selectedItemId,
  onSelect,
  onHover,
  onChange,
  onDelete,
  onAdd,
}: ExtractedItemListProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: '', value: '', category: 'student' });

  const resetDraft = () => {
    setDraft({ label: '', value: '', category: 'student' });
    setAdding(false);
  };

  const submitDraft = () => {
    if (!draft.label.trim()) return;
    onAdd({ label: draft.label.trim(), value: draft.value.trim(), category: draft.category.trim() || 'other' });
    resetDraft();
  };

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 && (
        <div className="rounded-xl border border-dashed border-surface-300 p-8 text-center text-sm text-ink-faint dark:border-surface-700">
          No items yet. Turn on <span className="font-semibold">Edit mode</span> and drag a box on
          the page, or add an item below.
        </div>
      )}

      {items.map((item) => {
        const isSelected = item.id === selectedItemId;
        return (
          <div
            key={item.id}
            role="option"
            aria-selected={isSelected}
            onMouseEnter={() => onHover(item.id)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onSelect(item.id)}
            className={[
              'cursor-pointer rounded-xl border p-3 transition-all duration-150',
              isSelected
                ? 'border-primary-300 bg-primary-50/60 ring-2 ring-primary-500/20 dark:border-primary-700 dark:bg-primary-500/10'
                : 'border-surface-200 bg-white hover:border-surface-300 dark:border-surface-700 dark:bg-surface-900 dark:hover:border-surface-600',
            ].join(' ')}
          >
            <div className="flex items-center gap-2">
              <input
                value={item.label}
                onChange={(event) => onChange(item.id, { label: event.target.value })}
                onClick={(event) => event.stopPropagation()}
                placeholder="Label"
                aria-label="Item label"
                className="min-w-0 flex-1 border-b border-transparent bg-transparent px-1 py-0.5 text-sm font-semibold text-ink focus:border-primary-400 focus:outline-none dark:text-surface-100"
              />
              <ConfidenceBadge confidence={item.confidence} />
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(item.id);
                }}
                aria-label={`Delete ${item.label || 'item'}`}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-error-50 hover:text-error-600 dark:hover:bg-error-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <input
              value={item.value}
              onChange={(event) => onChange(item.id, { value: event.target.value })}
              onClick={(event) => event.stopPropagation()}
              placeholder="Value"
              aria-label="Item value"
              className={`${inputClass} mt-2`}
            />

            <div className="mt-1.5 flex items-center gap-2">
              <input
                list="scan-category-suggestions"
                value={item.category}
                onChange={(event) => onChange(item.id, { category: event.target.value })}
                onClick={(event) => event.stopPropagation()}
                placeholder="Category"
                aria-label="Item category"
                className={`${inputClass} px-2 py-1 text-xs`}
              />
              <span className="text-[10px] font-medium uppercase tracking-wide text-ink-faint">
                Page {item.pageIndex != null ? item.pageIndex + 1 : '—'}
              </span>
            </div>
          </div>
        );
      })}

      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-surface-300 px-3 py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:border-primary-400 hover:text-primary-600 dark:border-surface-700 dark:hover:border-primary-600"
        >
          <Plus className="h-4 w-4" />
          Add item
        </button>
      ) : (
        <div className="rounded-xl border border-primary-200 bg-primary-50/50 p-3 dark:border-primary-800 dark:bg-primary-500/5">
          <p className="mb-2 text-xs font-semibold text-ink-muted dark:text-surface-300">
            Add a missing item
          </p>
          <input
            autoFocus
            value={draft.label}
            onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitDraft();
            }}
            placeholder="Label (e.g. Student ID)"
            aria-label="New item label"
            className={inputClass}
          />
          <input
            value={draft.value}
            onChange={(event) => setDraft((prev) => ({ ...prev, value: event.target.value }))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') submitDraft();
            }}
            placeholder="Value"
            aria-label="New item value"
            className={`${inputClass} mt-1.5`}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <input
              list="scan-category-suggestions"
              value={draft.category}
              onChange={(event) => setDraft((prev) => ({ ...prev, category: event.target.value }))}
              placeholder="Category"
              aria-label="New item category"
              className={`${inputClass} px-2 py-1 text-xs`}
            />
            <button
              type="button"
              onClick={submitDraft}
              disabled={!draft.label.trim()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add
            </button>
            <button
              type="button"
              onClick={resetDraft}
              aria-label="Cancel adding item"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-surface-100 hover:text-ink-muted dark:hover:bg-surface-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <datalist id="scan-category-suggestions">
        {CATEGORY_SUGGESTIONS.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}
