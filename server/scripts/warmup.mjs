/**
 * warmup.mjs — Pre-download PaddleOCR ONNX models into the Docker image.
 *
 * Runs at image BUILD time so a fresh container never downloads models at
 * boot (free instances cold-start often; baking the cache in keeps the
 * first request fast). Uses the same preset the server reads from env.
 */
import { MODEL_PRESETS, PaddleOcrService } from 'ppu-paddle-ocr';

const presetKey = process.env.OCR_MODEL_PRESET ?? 'v6-small';
const preset = MODEL_PRESETS[presetKey];
if (!preset) {
  console.error(`Unknown OCR_MODEL_PRESET: ${presetKey}`);
  process.exit(1);
}

const service = new PaddleOcrService({
  model: {
    detection: preset.detection,
    recognition: preset.recognition,
    charactersDictionary: preset.charactersDictionary,
  },
  processing: { engine: 'canvas-native' },
  session: { executionProviders: ['cpu'], enableCpuMemArena: false },
});
await service.initialize();
console.log(`[warmup] OCR models cached (${presetKey}).`);
process.exit(0);
