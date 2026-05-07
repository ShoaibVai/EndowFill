import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { IConditionalRule, ISchemaField } from '../../types/pdfme.types';

export function ConditionalRulesBuilder() {
  const schemaFields = useAppStore((s) => s.schemaFields) as ISchemaField[];
  const excelColumns = useAppStore((s) => s.excelColumns);
  const conditionalRules = useAppStore((s) => s.conditionalRules) as IConditionalRule[];
  const setConditionalRules = useAppStore((s) => s.setConditionalRules);

  const [targetField, setTargetField] = useState('');
  const [sourceColumn, setSourceColumn] = useState('');
  const [operator, setOperator] = useState<'equals' | 'not_equals' | 'contains' | 'not_contains'>('equals');
  const [value, setValue] = useState('');

  const addRule = () => {
    if (!targetField || !sourceColumn) return;
    const newRule: IConditionalRule = {
      id: `cond-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      targetFieldId: targetField,
      sourceColumnHeader: sourceColumn,
      operator,
      value,
    };
    setConditionalRules([...(conditionalRules || []), newRule]);
    setTargetField('');
    setSourceColumn('');
    setValue('');
  };

  const removeRule = (id: string) => {
    setConditionalRules((conditionalRules || []).filter((r) => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="p-3 border rounded-md bg-white">
        <div className="text-sm font-medium mb-2">Add Conditional Rule</div>
        <div className="grid grid-cols-1 gap-2">
          <select value={targetField} onChange={(e) => setTargetField(e.target.value)} className="border p-1 rounded">
            <option value="">Select target field (to show/hide)</option>
            {schemaFields.map((f) => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>

          <select value={sourceColumn} onChange={(e) => setSourceColumn(e.target.value)} className="border p-1 rounded">
            <option value="">Select source Excel column</option>
            {excelColumns.map((c) => (
              <option key={c.index} value={c.header}>{c.header}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={operator}
              onChange={(e) => setOperator(e.target.value as 'equals' | 'not_equals' | 'contains' | 'not_contains')}
              className="border p-1 rounded"
            >
              <option value="equals">equals</option>
              <option value="not_equals">not equals</option>
              <option value="contains">contains</option>
              <option value="not_contains">not contains</option>
            </select>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" className="border p-1 rounded flex-1" />
          </div>

          <div className="flex justify-end">
            <button onClick={addRule} className="btn btn-primary btn-sm">Add Rule</button>
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm font-medium mb-2">Existing Rules</div>
        <div className="space-y-2">
          {(conditionalRules || []).map((r) => (
            <div key={r.id} className="p-2 border rounded flex items-center justify-between bg-white">
              <div className="text-sm">
                Show <strong>{r.targetFieldId}</strong> if <strong>{r.sourceColumnHeader}</strong> {r.operator} "{r.value}"
              </div>
              <div>
                <button onClick={() => removeRule(r.id)} className="text-rose-600 text-sm">Remove</button>
              </div>
            </div>
          ))}
          {(!conditionalRules || conditionalRules.length === 0) && <div className="text-xs text-gray-500">No conditional rules defined.</div>}
        </div>
      </div>
    </div>
  );
}

export default ConditionalRulesBuilder;
