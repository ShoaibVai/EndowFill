/**
 * smoke.ts — Local OCR smoke test (run with: npx tsx src/smoke.ts).
 *
 * OCRs a test form image and prints results + peak RSS so the instance
 * tier decision is based on real measurements.
 */

import { readFileSync } from 'node:fs';
import { initialize, recognizeImage } from '../src/ocr/engine.js';
import { decodeImage } from '../src/ocr/image.js';
import { reconstructMarkdown } from '../src/ocr/markdown.js';
import { extractItems } from '../src/ocr/extractRules.js';
import { detectFields } from '../src/ocr/detectFieldsRules.js';
import type { NormalizedBBox } from '../src/validate.js';

const imagePath = process.argv[2] ?? 'C:/Users/siofa/AppData/Local/Temp/opencode/test-form.png';

const started = Date.now();
const bytes = readFileSync(imagePath);
const image = decodeImage(bytes.buffer as ArrayBuffer, 'image/png');

await initialize();
const pageOcr = await recognizeImage(bytes.buffer as ArrayBuffer, image.width, image.height);
const ocrMs = Date.now() - started;

console.log('=== OCR RESULT ===');
console.log(`image: ${image.width}x${image.height}px, ${pageOcr.items.length} items, ${ocrMs}ms, avgConf ${pageOcr.averageConfidence.toFixed(3)}`);
console.log('--- text ---');
for (const item of pageOcr.items.slice(0, 40)) {
  console.log(`  [${item.box.x.toFixed(0)},${item.box.y.toFixed(0)} ${item.box.width.toFixed(0)}x${item.box.height.toFixed(0)}] ${item.confidence.toFixed(2)} "${item.text}"`);
}

console.log('--- markdown ---');
console.log(reconstructMarkdown(pageOcr.items));

// Map OCR items into the detections shape the extract route uses.
const detections = pageOcr.items.map((item, index) => ({
  pageIndex: 0,
  bbox: {
    x: item.box.x / image.width,
    y: item.box.y / image.height,
    width: item.box.width / image.width,
    height: item.box.height / image.height,
  } as NormalizedBBox,
  label: 'text',
  text: item.text,
}));

console.log('=== EXTRACT ===');
const items = extractItems([{ pageIndex: 0, detections }]);
for (const item of items) {
  console.log(`  ${item.category.padEnd(10)} ${item.label} = ${item.value} (${item.confidence})`);
}

console.log('=== DETECT FIELDS ===');
const fields = detectFields(image, pageOcr.items, 0);
for (const field of fields) {
  console.log(`  [${field.fieldType.padEnd(9)}] ${field.label} bbox=(${field.bbox.x.toFixed(2)},${field.bbox.y.toFixed(2)},${field.bbox.width.toFixed(2)},${field.bbox.height.toFixed(2)})${field.options ? ` options=${JSON.stringify(field.options)}` : ''}`);
}

const rssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
console.log(`\npeak RSS ≈ ${rssMb} MB (within this process)`);
process.exit(0);

