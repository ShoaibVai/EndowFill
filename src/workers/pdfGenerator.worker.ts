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
export interface GenerateJobResult {
  jobId: string;
  rowIndex: number;
  filename: string;
  pdfBuffer?: Uint8Array;
  error?: string;
}

self.onmessage = async (event: MessageEvent<GenerateJobData>) => {
  const { jobId, rowIndex, template, input, filename } = event.data;

  try {
    const pdfBuffer = await generate({
      template,
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

    // We can transfer the ArrayBuffer directly to avoid copying memory
    self.postMessage(
      { jobId, rowIndex, filename, pdfBuffer } as GenerateJobResult,
      { transfer: [pdfBuffer.buffer] }
    );
  } catch (error: any) {
    self.postMessage({
      jobId,
      rowIndex,
      filename,
      error: error.message || 'Unknown generation error',
    } as GenerateJobResult);
  }
};
