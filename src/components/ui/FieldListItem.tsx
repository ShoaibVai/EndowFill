/**
 * FieldListItem.tsx — A single field row in the sidebar field list.
 */

import { GripVertical, Type, Image, Hash, CheckSquare } from 'lucide-react';
import type { ISchemaField } from '../../types/pdfme.types';

interface FieldListItemProps {
  field: ISchemaField;
  index: number;
  isSelected?: boolean;
  onClick?: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  text: <Type className="w-3.5 h-3.5" />,
  image: <Image className="w-3.5 h-3.5" />,
  qrcode: <Hash className="w-3.5 h-3.5" />,
  boolean: <CheckSquare className="w-3.5 h-3.5" />,
};

export function FieldListItem({ field, index, isSelected, onClick }: FieldListItemProps) {
  return (
    <button
      id={`field-item-${index}`}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group"
      style={{
        background: isSelected
          ? 'linear-gradient(135deg, var(--color-brand-50), var(--color-brand-100))'
          : 'transparent',
        border: isSelected
          ? '1px solid var(--color-brand-200)'
          : '1px solid transparent',
      }}
    >
      {/* Drag handle */}
      <GripVertical
        className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity"
        style={{ color: 'var(--color-surface-400)' }}
      />

      {/* Type icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
        style={{
          background: isSelected ? 'var(--color-brand-500)' : 'var(--color-surface-100)',
          color: isSelected ? 'white' : 'var(--color-surface-500)',
        }}
      >
        {typeIcons[field.type] || <Type className="w-3.5 h-3.5" />}
      </div>

      {/* Field info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-sm font-medium truncate"
          style={{ color: isSelected ? 'var(--color-brand-700)' : 'var(--color-surface-700)' }}
        >
          {field.name}
        </p>
        <p className="text-xs" style={{ color: 'var(--color-surface-400)' }}>
          {field.type} · {Math.round(field.width)}×{Math.round(field.height)}mm
        </p>
      </div>

      {/* Required indicator */}
      {field.required && (
        <span className="text-xs font-bold" style={{ color: 'var(--color-danger)' }}>
          *
        </span>
      )}
    </button>
  );
}
