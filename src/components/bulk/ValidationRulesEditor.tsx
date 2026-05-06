import React from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { IValidationRule, ISchemaField } from '../../types/pdfme.types';

export function ValidationRulesEditor() {
  const schemaFields = useAppStore((s) => s.schemaFields) as ISchemaField[];
  const validationRules = useAppStore((s) => s.validationRules) as IValidationRule[];
  const setValidationRules = useAppStore((s) => (s as any).setValidationRules) as (r: IValidationRule[]) => void;

  const getRuleFor = (fieldId: string): IValidationRule => {
    return validationRules.find((r) => r.fieldId === fieldId) || { fieldId, required: false } as IValidationRule;
  };

  const updateRule = (fieldId: string, patch: Partial<IValidationRule>) => {
    const existing = validationRules.find((r) => r.fieldId === fieldId);
    let next: IValidationRule[];
    if (existing) {
      next = validationRules.map((r) => (r.fieldId === fieldId ? { ...r, ...patch } : r));
    } else {
      next = [...validationRules, { fieldId, required: false, ...patch } as IValidationRule];
    }
    // Remove rule entries that are empty/default to keep storage small
    next = next.filter((r) => r.required || r.minLength || r.maxLength || r.pattern);
    setValidationRules(next);
  };

  if (!schemaFields || schemaFields.length === 0) {
    return <div className="text-sm text-gray-500">No fields available to configure validation.</div>;
  }

  return (
    <div className="space-y-3">
      {schemaFields.map((f) => {
        const rule = getRuleFor(f.name);
        return (
          <div key={f.name} className="p-3 border rounded-md bg-white">
            <div className="flex items-center justify-between">
              <div className="font-medium">{f.name}</div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!rule.required}
                  onChange={(e) => updateRule(f.name, { required: e.target.checked })}
                />
                Required
              </label>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div>
                <label className="block text-xs text-gray-500">Min length</label>
                <input
                  type="number"
                  value={rule.minLength ?? ''}
                  onChange={(e) => updateRule(f.name, { minLength: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full border p-1 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500">Max length</label>
                <input
                  type="number"
                  value={rule.maxLength ?? ''}
                  onChange={(e) => updateRule(f.name, { maxLength: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full border p-1 rounded text-sm"
                />
              </div>
            </div>

            <div className="mt-2">
              <label className="block text-xs text-gray-500">Pattern (regex)</label>
              <input
                type="text"
                value={rule.pattern ?? ''}
                onChange={(e) => updateRule(f.name, { pattern: e.target.value || undefined })}
                className="w-full border p-1 rounded text-sm"
                placeholder="e.g. ^[A-Za-z0-9 ]+$"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default ValidationRulesEditor;
