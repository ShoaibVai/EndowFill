/**
 * EditorCanvas.tsx — The pdfme Designer integration surface.
 *
 * Renders the pdfme Designer inside a ref'd div. On every schema mutation
 * from the Designer, we sync back to the Zustand store.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { Designer } from '@pdfme/ui';
import { text, image, signature, barcodes, checkbox } from '@pdfme/schemas';
import { Upload, FileText } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import type { ISchemaField } from '../../types/pdfme.types';

/**
 * Extract flat ISchemaField[] from pdfme's schema pages.
 */
function extractSchemaFields(schemas: Record<string, unknown>[]): ISchemaField[] {
  const fields: ISchemaField[] = [];

  for (const page of schemas) {
    for (const [name, props] of Object.entries(page)) {
      const p = props as Record<string, unknown>;
      fields.push({
        name,
        type: (p.type as string) || 'text',
        position: {
          x: (p.position as { x: number; y: number })?.x ?? 0,
          y: (p.position as { x: number; y: number })?.y ?? 0,
        },
        width: (p.width as number) ?? 50,
        height: (p.height as number) ?? 10,
        fontSize: p.fontSize as number | undefined,
        fontColor: p.fontColor as string | undefined,
        alignment: p.alignment as ISchemaField['alignment'],
        required: p.required as boolean | undefined,
      });
    }
  }

  return fields;
}

export function EditorCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef = useRef<Designer | null>(null);

  const basePdfBuffer = useAppStore((s) => s.basePdfBuffer);
  const setPdfmeTemplate = useAppStore((s) => s.setPdfmeTemplate);
  const setSchemaFields = useAppStore((s) => s.setSchemaFields);
  const setBasePdfBuffer = useAppStore((s) => s.setBasePdfBuffer);
  const setPdfFileName = useAppStore((s) => s.setPdfFileName);

  const [isDragOver, setIsDragOver] = useState(false);

  // Handle file via drag & drop
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const file = e.dataTransfer.files[0];
      if (!file || !file.name.toLowerCase().endsWith('.pdf')) return;

      const reader = new FileReader();
      reader.onload = () => {
        setBasePdfBuffer(reader.result as ArrayBuffer);
        setPdfFileName(file.name);
      };
      reader.readAsArrayBuffer(file);
    },
    [setBasePdfBuffer, setPdfFileName]
  );

  // Initialize or re-initialize pdfme Designer when basePdfBuffer changes
  useEffect(() => {
    if (!basePdfBuffer || !containerRef.current) return;

    // Clean up any existing designer
    if (designerRef.current) {
      designerRef.current.destroy();
      designerRef.current = null;
    }

    // Clear the container
    containerRef.current.innerHTML = '';

    const template: any = {
      basePdf: basePdfBuffer,
      schemas: [{}],
      columns: ['field1'],
      sampledata: [{ field1: '' }],
    };

    try {
      const designer = new Designer({
        domContainer: containerRef.current,
        template,
        plugins: { 
          text, 
          image, 
          signature, 
          checkbox,
          qrcode: barcodes.qrcode,
          code128: barcodes.code128,
        },
      });

      // Listen for schema changes via the onChangeTemplate callback
      designer.onChangeTemplate((updatedTemplate: any) => {
        setPdfmeTemplate({
          basePdf: updatedTemplate.basePdf as ArrayBuffer,
          schemas: updatedTemplate.schemas as any,
          columns: updatedTemplate.columns as string[],
          sampledata: updatedTemplate.sampledata as Record<string, string>[],
        });

        const fields = extractSchemaFields(
          updatedTemplate.schemas as any
        );
        setSchemaFields(fields);
      });

      designerRef.current = designer;
    } catch (err) {
      console.error('[EditorCanvas] Failed to initialize pdfme Designer:', err);
    }

    return () => {
      if (designerRef.current) {
        designerRef.current.destroy();
        designerRef.current = null;
      }
    };
  }, [basePdfBuffer, setPdfmeTemplate, setSchemaFields]);

  // No PDF uploaded — show drop zone
  if (!basePdfBuffer) {
    return (
      <div
        className={`drop-zone flex flex-col items-center justify-center h-full ${isDragOver ? 'drag-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        id="pdf-drop-zone"
      >
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, var(--color-brand-50), var(--color-brand-100))',
          }}
        >
          {isDragOver ? (
            <FileText className="w-9 h-9" style={{ color: 'var(--color-brand-500)' }} />
          ) : (
            <Upload className="w-9 h-9" style={{ color: 'var(--color-brand-400)' }} />
          )}
        </div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: 'var(--color-surface-800)' }}
        >
          {isDragOver ? 'Drop your PDF here!' : 'Upload a PDF Template'}
        </h3>
        <p
          className="text-sm max-w-md mb-6"
          style={{ color: 'var(--color-surface-400)', lineHeight: 1.6 }}
        >
          Drag & drop a fillable PDF or use the upload button above.
          The Designer will open where you can add and position text fields.
        </p>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-surface-400)' }}>
          <span className="flex items-center gap-1">
            <FileText className="w-3 h-3" /> .pdf files only
          </span>
          <span>•</span>
          <span>Max 50 MB</span>
        </div>
      </div>
    );
  }

  // PDF loaded — render Designer container
  return (
    <div className="flex-1 h-full pdfme-designer-container animate-fade-in">
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '600px' }} />
    </div>
  );
}
