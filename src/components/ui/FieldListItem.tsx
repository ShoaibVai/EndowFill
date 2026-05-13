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
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 cursor-pointer group
        outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-slate-900
        ${isSelected 
          ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' 
          : 'bg-transparent border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
        }
      `}
      aria-selected={isSelected}
      role="option"
    >
      {/* Drag handle */}
      <GripVertical
        className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
      />

      {/* Type icon */}
      <div
        className={`
          w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors
          ${isSelected 
            ? 'bg-primary-600 text-white shadow-sm' 
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 group-hover:bg-slate-200 dark:group-hover:bg-slate-700'
          }
        `}
      >
        {typeIcons[field.type] || <Type className="w-3.5 h-3.5" />}
      </div>

      {/* Field info */}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold truncate transition-colors ${
            isSelected ? 'text-primary-700 dark:text-primary-400' : 'text-slate-700 dark:text-slate-200'
          }`}
        >
          {field.name}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium truncate">
          {field.type} · {Math.round(field.width)}×{Math.round(field.height)}mm
        </p>
      </div>

      {/* Required indicator */}
      {field.required && (
        <span className="text-xs font-bold text-red-500 dark:text-red-400 ml-1">
          *
        </span>
      )}
    </button>
  );
}
