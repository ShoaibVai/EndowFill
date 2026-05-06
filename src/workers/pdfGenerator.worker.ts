import { generate } from '@pdfme/generator';
import { text, image, signature, barcodes, checkbox } from '@pdfme/schemas';
// Cache bust: 12345

// Message sent to the worker
export interface GenerateJobData {
  jobId: string;
  rowIndex: number;
  template: any; // IPdfmeTemplate
  input: Record<string, string>;
  filename: string;
}

// Message sent from the worker
export interface IFieldValidationError {
  fieldId?: string;
  message: string;
  code?: string;
  details?: any;
}

export interface GenerateJobResult {
  jobId: string;
  rowIndex: number;
  filename: string;
  pdfBuffer?: Uint8Array;
  error?: IFieldValidationError | string;
}

self.onmessage = async (event: MessageEvent<GenerateJobData>) => {
  const { jobId, rowIndex, template, input, filename } = event.data;

  try {
    // Pre-flight validation: if template contains `validationRules`, enforce them
    const rules = (template && template.validationRules) || [];
    // Conditional rules (visibility)
    const conds = (template && template.conditionalRules) || [];

    // Apply conditional rules by mutating a shallow copy of the template schemas
    let effectiveTemplate = template;
    if (conds && conds.length > 0 && template && template.schemas) {
      try {
        // Clone schemas to avoid mutating shared object
        const schemasCopy = JSON.parse(JSON.stringify(template.schemas));
        for (const cr of conds) {
          const sourceVal = input[cr.sourceColumnHeader] ?? input[cr.sourceColumnHeader.toString()];
          const sv = sourceVal != null ? String(sourceVal) : '';
          let match = false;
          if (cr.operator === 'equals') match = sv === cr.value;
          else if (cr.operator === 'not_equals') match = sv !== cr.value;
          else if (cr.operator === 'contains') match = sv.includes(cr.value);
          else if (cr.operator === 'not_contains') match = !sv.includes(cr.value);

          // If the condition does NOT match, remove the target field from all pages
          if (!match) {
            for (const page of schemasCopy) {
              if (page && page[cr.targetFieldId]) {
                delete page[cr.targetFieldId];
              }
            }
          }
        }
        effectiveTemplate = { ...template, schemas: schemasCopy };
      } catch (err) {
        // If conditional rule processing fails, continue with original template
        effectiveTemplate = template;
      }
    }
    for (const r of rules) {
      const value = input[r.fieldId as string];
      if (r.required && (value === undefined || value === null || String(value).trim() === '')) {
        const err = { fieldId: r.fieldId, message: 'Field is required', code: 'REQUIRED' } as IFieldValidationError;
        self.postMessage({ jobId, rowIndex, filename, error: err } as GenerateJobResult);
        return;
      }
      if (value != null && typeof value === 'string') {
        const v = value as string;
        if (typeof r.minLength === 'number' && v.length < r.minLength) {
          const err = { fieldId: r.fieldId, message: `Too short (min ${r.minLength})`, code: 'MIN_LENGTH' } as IFieldValidationError;
          self.postMessage({ jobId, rowIndex, filename, error: err } as GenerateJobResult);
          return;
        }
        if (typeof r.maxLength === 'number' && v.length > r.maxLength) {
          const err = { fieldId: r.fieldId, message: `Too long (max ${r.maxLength})`, code: 'MAX_LENGTH' } as IFieldValidationError;
          self.postMessage({ jobId, rowIndex, filename, error: err } as GenerateJobResult);
          return;
        }
        if (r.pattern) {
          const re = new RegExp(r.pattern);
          if (!re.test(v)) {
            const err = { fieldId: r.fieldId, message: `Pattern mismatch`, code: 'PATTERN' } as IFieldValidationError;
            self.postMessage({ jobId, rowIndex, filename, error: err } as GenerateJobResult);
            return;
          }
        }
      }
    }

    const pdfBuffer = await generate({
      template: effectiveTemplate,
      inputs: [input],
      plugins: {
        text,
        image,
        signature,
        checkbox,
        qrcode: barcodes.qrcode,
        code128: barcodes.code128,
      },
    });

    // Transfer the underlying ArrayBuffer if available
    if (pdfBuffer && pdfBuffer.buffer) {
      self.postMessage(
        { jobId, rowIndex, filename, pdfBuffer } as GenerateJobResult,
        // @ts-ignore - transferable
        { transfer: [pdfBuffer.buffer] }
      );
    } else {
      self.postMessage({ jobId, rowIndex, filename, pdfBuffer } as GenerateJobResult);
    }
  } catch (error: any) {
    const errObj: IFieldValidationError = {
      message: error?.message || 'Unknown generation error',
      details: { stack: error?.stack },
    };
    self.postMessage({ jobId, rowIndex, filename, error: errObj } as GenerateJobResult);
  }
};
