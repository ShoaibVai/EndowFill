/**
 * memtest.ts — A/B test PaddleOcrService configs for peak RSS.
 * Usage: npx tsx --expose-gc src/memtest.ts [arena0|batch1|tiny|auto960|combo]
 */
import { readFileSync } from 'node:fs';
import { PaddleOcrService, V6_SMALL_MODEL, V6_TINY_MODEL } from 'ppu-paddle-ocr';

const imagePath = 'C:/Users/siofa/AppData/Local/Temp/opencode/test-form.png';
const bytes = readFileSync(imagePath);
const mode = process.argv[2] ?? 'combo';

function rssMb(): number {
  return Math.round(process.memoryUsage().rss / (1024 * 1024));
}

const variants: Record<string, Record<string, unknown>> = {
  baseline: {},
  arena0: { session: { enableCpuMemArena: false } },
  batch1: { recognition: { recBatchSize: 1 } },
  auto960: { detection: { maxSideLength: 960 } },
  tiny: { model: V6_TINY_MODEL },
  combo: {
    model: V6_TINY_MODEL,
    session: { enableCpuMemArena: false },
    recognition: { recBatchSize: 1 },
    detection: { maxSideLength: 960 },
  },
};

const variant = variants[mode] ?? variants.combo;
const service = new PaddleOcrService({
  processing: { engine: 'canvas-native' },
  recognition: { minimumConfidence: 0.4, strategy: 'per-line' } as never,
  session: { executionProviders: ['cpu'], graphOptimizationLevel: 'all' },
  ...variant,
} as never);

const t0 = Date.now();
await service.initialize();
console.log(`[${mode}] init: ${Date.now() - t0}ms, RSS ${rssMb()} MB`);

for (let i = 0; i < 2; i += 1) {
  const start = Date.now();
  await service.recognize(bytes.buffer as ArrayBuffer, { flatten: true });
  if (globalThis.gc) globalThis.gc();
  console.log(`[${mode}] pass ${i + 1}: ${Date.now() - start}ms, RSS ${rssMb()} MB`);
}
if (globalThis.gc) globalThis.gc();
console.log(`[${mode}] final RSS ${rssMb()} MB`);
await service.destroy();
process.exit(0);
