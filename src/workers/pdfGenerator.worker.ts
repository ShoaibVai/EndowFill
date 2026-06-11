import { generate } from '@pdfme/generator';
import { text, image, signature, barcodes, checkbox } from '@pdfme/schemas';
import type { IConditionalRule, IPdfmeTemplate, IValidationRule } from '../types/pdfme.types';
import type { GenerateProps } from '@pdfme/common';
import { isImageUrl, isImageDataUri, fetchImageAsDataUrl } from '../utils/imageUtils';
// Cache bust: 12345

interface WorkerTemplate extends IPdfmeTemplate {
  validationRules?: IValidationRule[];
  conditionalRules?: IConditionalRule[];
}

// Message sent to the worker
export interface GenerateJobData {
  jobId: string;
  rowIndex: number;
  template: WorkerTemplate;
  input: Record<string, string>;
  filename: string;
}

// Message sent from the worker
export interface IFieldValidationError {
  fieldId?: string;
  message: string;
  code?: string;
  details?: unknown;
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
      } catch {
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

    // Resolve image URLs: if an image field's value is a URL, fetch and convert to base64 data URI
    const IMAGE_TYPES = new Set(['image', 'signature']);
    const imageFieldNames = new Set<string>();
    if (effectiveTemplate && effectiveTemplate.schemas) {
      for (const page of effectiveTemplate.schemas) {
        if (page && typeof page === 'object') {
          for (const [fieldName, fieldProps] of Object.entries(page)) {
            if (fieldProps.type && IMAGE_TYPES.has(fieldProps.type.toLowerCase())) {
              imageFieldNames.add(fieldName);
            }
          }
        }
      }
    }

    if (imageFieldNames.size > 0) {
      const resolvedInput = { ...input };
      const fetchPromises: Promise<void>[] = [];

      for (const [fieldName, value] of Object.entries(resolvedInput)) {
        if (imageFieldNames.has(fieldName) && isImageUrl(value) && !isImageDataUri(value)) {
          fetchPromises.push(
            fetchImageAsDataUrl(value)
              .then((dataUrl) => {
                resolvedInput[fieldName] = dataUrl;
              })
              .catch((err) => {
                const errorMsg = err instanceof Error ? err.message : 'Unknown error';
                throw new Error(`Failed to load image for field "${fieldName}": ${errorMsg}`);
              })
          );
        }
      }

      if (fetchPromises.length > 0) {
        await Promise.all(fetchPromises);
        // Replace input with resolved version
        Object.assign(input, resolvedInput);
      }
    }

    // Convert our lightweight template shape into the strict shape expected by @pdfme/generator
    const toArrayBuffer = (bytes: Uint8Array) =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    const normalizeSchemas = (schemas: unknown): GenerateProps['template']['schemas'] => {
      if (!schemas) return [] as GenerateProps['template']['schemas'];
      if (Array.isArray(schemas) && schemas.length > 0 && Array.isArray(schemas[0])) {
        return schemas as GenerateProps['template']['schemas'];
      }
      if (Array.isArray(schemas)) {
        return schemas.map((page) => {
          const p = page as Record<string, unknown>;
          return Object.entries(p).map(([name, props]) => ({ name, ...(props as Record<string, unknown>) } as Record<string, unknown>));
        }) as GenerateProps['template']['schemas'];
      }
      return [[{ name: 'field1', type: 'text', position: { x: 0, y: 0 }, width: 50, height: 10 }]] as GenerateProps['template']['schemas'];
    };

    const normalizeBasePdf = (b: IPdfmeTemplate['basePdf']) => {
      if (b instanceof Uint8Array) return toArrayBuffer(b);
      return b as ArrayBuffer | string | undefined | object | null;
    };

    const adaptedTemplate: GenerateProps['template'] = {
      schemas: normalizeSchemas(effectiveTemplate.schemas),
      basePdf: normalizeBasePdf(effectiveTemplate.basePdf),
    } as GenerateProps['template'];

    const pdfBuffer = await generate({
      template: adaptedTemplate,
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
      const transferBuffer = pdfBuffer.buffer.slice(
        pdfBuffer.byteOffset,
        pdfBuffer.byteOffset + pdfBuffer.byteLength
      ) as ArrayBuffer;

      // Post the result and transfer the ArrayBuffer to the main thread
      (self as unknown as { postMessage: (msg: GenerateJobResult, transfer?: Transferable[]) => void }).postMessage({ jobId, rowIndex, filename, pdfBuffer } as GenerateJobResult, [transferBuffer]);
    } else {
      (self as unknown as { postMessage: (msg: GenerateJobResult, transfer?: Transferable[]) => void }).postMessage({ jobId, rowIndex, filename, pdfBuffer } as GenerateJobResult);
    }
  } catch (error) {
    const errObj: IFieldValidationError = {
      message: error instanceof Error ? error.message : 'Unknown generation error',
      details: error instanceof Error ? { stack: error.stack } : undefined,
    };
    self.postMessage({ jobId, rowIndex, filename, error: errObj } as GenerateJobResult);
  }
};
