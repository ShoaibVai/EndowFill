/**
 * ExtractedDataMapper.tsx — AI-source mapping panel (flow 3).
 *
 * Lets the user map each pdfme template field to ONE AI-extracted item
 * (from an AIScanPage run). Rendered by BulkGeneratePage when the "AI Scans"
 * source mode is active, next to the existing Excel-column mapping.
 *
 * The bindings written here reuse the store's `field_bindings` flow:
 * each binding carries `sourceItemId` (the ExtractedItem.id) instead of
 * `excelColumnIndex`, so Excel-mode and AI-mode mappings coexist without
 * clobbering each other.
 */

import {
  ArrowRight,
  Calendar,
  CircleDot,
  Fingerprint,
  FileText,
  GraduationCap,
  Image as ImageIcon,
  Mail,
  MapPin,
  PenLine,
  Phone,
  RefreshCw,
  User,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { findBestColumnMatch } from '../../utils/stringUtils';
import { isImageField } from '../../utils/excelHelpers';
import type { ExtractedItem } from '../../types/scan.types';

/** Which data source the field mapping currently reads from. */
export type FieldSourceMode = 'excel' | 'ai';

interface ExtractedDataMapperProps {
  /** Reviewed items from an AIScanPage run (the AI column source). */
  extractedItems: ExtractedItem[];
  /** Optional shortcut for the same auto-match action FieldMapper exposes. */
  onAutoMatch?: () => void;
}

/** Pick an icon for a free-text category (keyword-based, defensive fallback). */
function categoryIcon(category: string, className: string) {
  const c = (category ?? '').toLowerCase();
  if (/(phone|mobile|tel)/.test(c)) return <Phone className={className} />;
  if (/(mail|email)/.test(c)) return <Mail className={className} />;
  if (/(address|location|city|street)/.test(c)) return <MapPin className={className} />;
  if (/(date|birth|dob|birthday)/.test(c)) return <Calendar className={className} />;
  if (/(id|number|passport|ssn|studentid|registration)/.test(c)) return <Fingerprint className={className} />;
  if (/(school|education|university|degree|course)/.test(c)) return <GraduationCap className={className} />;
  if (/(image|photo|picture|avatar)/.test(c)) return <ImageIcon className={className} />;
  if (/(signature|sign)/.test(c)) return <PenLine className={className} />;
  if (/(document|file|certificate|record)/.test(c)) return <FileText className={className} />;
  if (/(name|student|person|user)/.test(c)) return <User className={className} />;
  return <CircleDot className={className} />;
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

export function ExtractedDataMapper({ extractedItems, onAutoMatch }: ExtractedDataMapperProps) {
  const schemaFields = useAppStore((s) => s.schemaFields);
  const fieldBindings = useAppStore((s) => s.fieldBindings);
  const addFieldBinding = useAppStore((s) => s.addFieldBinding);
  const removeFieldBinding = useAppStore((s) => s.removeFieldBinding);

  // AI-source bindings only — Excel bindings live in the other mode.
  const aiBindings = fieldBindings.filter((b) => Boolean(b.sourceItemId));

  const bindingFor = (schemaFieldId: string) =>
    aiBindings.find((b) => b.schemaFieldId === schemaFieldId);

  const itemLabels = extractedItems.map((item) => item.label);

  const handleAutoMatch = () => {
    schemaFields.forEach((field) => {
      const bestIndex = findBestColumnMatch(field.name, itemLabels);
      if (bestIndex !== -1) {
        addFieldBinding({
          schemaFieldId: field.name,
          sourceItemId: extractedItems[bestIndex].id,
        });
      } else {
        removeFieldBinding(field.name, bindingFor(field.name)?.sourceItemId);
      }
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Extracted items — the AI "column source" list */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text-main)' }}>
            Extracted items ({extractedItems.length})
          </h4>
          <button
            type="button"
            onClick={onAutoMatch ?? handleAutoMatch}
            className="btn btn-secondary btn-sm"
            aria-label="Auto match fields to extracted items"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Auto Match
          </button>
        </div>
        <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto pr-1">
          {extractedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
              style={{ background: 'var(--bg-inset)', border: '1px solid var(--border-subtle)' }}
            >
              <span className="shrink-0" style={{ color: 'var(--color-primary-500)' }}>
                {categoryIcon(item.category, 'w-4 h-4')}
              </span>
              <span className="min-w-0 flex-1 truncate font-medium" style={{ color: 'var(--text-main)' }}>
                {item.label || 'Untitled'}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-xs" style={{ color: 'var(--text-muted)' }}>
                {item.value || '—'}
              </span>
              <ConfidenceBadge confidence={item.confidence} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
          Each template field maps to one extracted item. Values land in the generated PDF as a
          single record.
        </p>
      </div>

      {/* Mapping rows — same grid pattern as FieldMapper's Excel rows */}
      <div className="flex flex-col gap-3">
        <div
          className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-2 font-semibold text-xs uppercase tracking-wider"
          style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>PDF Template Field</div>
          <div className="w-8"></div>
          <div>Extracted Item</div>
        </div>

        {schemaFields.map((field) => {
          const binding = bindingFor(field.name);
          const isMapped = Boolean(binding);

          return (
            <div
              key={field.name}
              className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-3 rounded-xl transition-colors"
              style={{ background: isMapped ? 'var(--color-surface-50)' : 'rgba(254, 243, 199, 0.4)' }}
            >
              {/* PDF Field Left */}
              <div className="flex flex-col">
                <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{field.name}</span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{field.type}{field.required ? ' • Required' : ''}</span>
                {isImageField(field) && (
                  <span className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--color-primary-500)' }}>
                    <ImageIcon className="w-3 h-3" /> Accepts Google Drive URLs
                  </span>
                )}
              </div>

              {/* Connector Center */}
              <div className="flex justify-center">
                <ArrowRight className="w-5 h-5" style={{ color: isMapped ? 'var(--color-primary-400)' : 'var(--color-surface-300)' }} />
              </div>

              {/* Extracted Item Right (Select) */}
              <div>
                <select
                  value={binding ? binding.sourceItemId : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '') {
                      removeFieldBinding(field.name, binding?.sourceItemId);
                    } else {
                      addFieldBinding({
                        schemaFieldId: field.name,
                        sourceItemId: val,
                      });
                    }
                  }}
                  className="w-full bg-white border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                  style={{
                    borderColor: isMapped ? 'var(--color-surface-300)' : 'var(--color-warning)',
                    color: 'var(--text-main)',
                  }}
                  aria-label={`Extracted item for ${field.name}`}
                >
                  <option value="">-- Unmapped --</option>
                  {extractedItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label || 'Untitled'} ({item.category})
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
