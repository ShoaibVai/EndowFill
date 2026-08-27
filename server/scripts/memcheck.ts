/**
 * memcheck.ts — Steady-state RSS measurement after warmup + GC.
 */
import { readFileSync } from 'node:fs';
import { initialize, recognizeImage } from '../src/ocr/engine.js';

const imagePath = process.argv[2] ?? 'C:/Users/siofa/AppData/Local/Temp/opencode/test-form.png';
const bytes = readFileSync(imagePath);

function rssMb(): number {
  return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

console.log(`RSS at start: ${rssMb()} MB`);
const t0 = Date.now();
await initialize();
console.log(`RSS after model init: ${rssMb()} MB (${Date.now() - t0}ms)`);

for (let i = 0; i < 3; i += 1) {
  await recognizeImage(bytes.buffer as ArrayBuffer, 1200, 1600);
  if (globalThis.gc) globalThis.gc();
  console.log(`RSS after OCR pass ${i + 1}: ${rssMb()} MB`);
}

setTimeout(() => {
  if (globalThis.gc) globalThis.gc();
  console.log(`RSS final (post-GC): ${rssMb()} MB`);
  process.exit(0);
}, 2000);

