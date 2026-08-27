/**
 * engine.ts — Local PaddleOCR ONNX engine wrapper.
 *
 * Runs PP-OCRv6/v5 detection + recognition entirely in-process via
 * onnxruntime-node. No external API calls, no API keys — the models are a
 * few tens of MB and are cached under ~/.cache/ppu-paddle-ocr (pre-warmed
 * at Docker build time so a container boot never downloads anything).
 *
 * The engine is a lazy singleton: models load on the first /api/ai/* request
 * (or on boot when OCR_WARMUP=1, which Render enables) so free-tier cold
 * starts stay as fast as possible.
 */

import {
  MODEL_PRESETS,
  PaddleOcrService,
  type ModelPreset,
} from 'ppu-paddle-ocr';
import { config } from '../config.js';

/** A recognized text region in ORIGINAL image pixel coordinates. */
export interface OcrItem {
  text: string;
  box: { x: number; y: number; width: number; height: number };
  confidence: number;
}

export interface PageOcr {
  items: OcrItem[];
  /** Original image dimensions (pixels) — boxes are relative to these. */
  imageWidth: number;
  imageHeight: number;
  averageConfidence: number;
}

export class OcrModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrModelError';
  }
}

let service: PaddleOcrService | null = null;
let initPromise: Promise<void> | null = null;

/** True once models are loaded and the engine is ready. */
export function isReady(): boolean {
  return service?.isInitialized() ?? false;
}

/**
 * Initialize the ONNX sessions. Safe to call repeatedly — a single shared
 * promise guards concurrent first requests. Rejects with OcrModelError when
 * the preset is unknown or model loading fails (callers map to 500/502).
 */
export function initialize(): Promise<void> {
  if (initPromise) return initPromise;

  const presetKey = config.ocrModelPreset as ModelPreset;
  const preset = MODEL_PRESETS[presetKey];
  if (!preset) {
    const known = Object.keys(MODEL_PRESETS).join(', ');
    initPromise = Promise.reject(
      new OcrModelError(`Unknown OCR_MODEL_PRESET "${config.ocrModelPreset}". Known presets: ${known}`)
    );
    return initPromise;
  }

  service = new PaddleOcrService({
    model: {
      detection: preset.detection,
      recognition: preset.recognition,
      charactersDictionary: preset.charactersDictionary,
    },
    processing: { engine: config.ocrEngine as 'canvas-native' | 'opencv' },
    detection: { maxSideLength: 'auto' },
    // `charactersDictionary` is filled by the library during initialize()
    // from the model preset — the cast only satisfies the (stricter) type.
    recognition: {
      minimumConfidence: config.ocrMinConfidence,
      strategy: 'per-line',
      // Measured: batch size 1 keeps peak RSS well under the 512 MB free
      // tier without a meaningful slowdown on single-page requests.
      recBatchSize: 1,
    } as import('ppu-paddle-ocr').PaddleOptions['recognition'],
    session: {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
      // Disabling the CPU memory arena is the single biggest RSS win
      // (514 MB → 290 MB steady state in local measurement) at a small
      // per-inference cost — worth it on small instances.
      enableCpuMemArena: false,
    },
  });

  initPromise = service
    .initialize()
    .then(() => {
      if (!service?.isInitialized()) {
        throw new OcrModelError('OCR engine failed to initialize (sessions not ready).');
      }
    })
    .catch((error) => {
      // Allow a retry after a failed boot instead of caching the rejection forever.
      service = null;
      initPromise = null;
      throw error instanceof OcrModelError
        ? error
        : new OcrModelError(
            `OCR engine failed to load models: ${error instanceof Error ? error.message : String(error)}`
          );
    });

  return initPromise;
}

/**
 * Run OCR on one encoded image (JPEG/PNG bytes) and return recognized text
 * regions in original-image coordinates, sorted in reading order.
 * `imageWidth`/`imageHeight` are the caller's decoded dimensions — the engine
 * reports boxes in the same coordinate space (ppu decodes identically).
 */
export async function recognizeImage(
  imageBytes: ArrayBuffer,
  imageWidth: number,
  imageHeight: number
): Promise<PageOcr> {
  await initialize();
  if (!service) throw new OcrModelError('OCR engine is not initialized.');

  // ppu-paddle-ocr expects an ArrayBuffer; it decodes internally.
  const result = await service.recognize(imageBytes, { flatten: true });

  if (!('results' in result)) {
    throw new OcrModelError('OCR engine returned an unexpected result shape.');
  }

  const items: OcrItem[] = result.results.map((entry) => ({
    text: entry.text ?? '',
    box: {
      x: entry.box.x,
      y: entry.box.y,
      width: entry.box.width,
      height: entry.box.height,
    },
    confidence: Number.isFinite(entry.confidence) ? entry.confidence : 0,
  }));

  const averageConfidence =
    items.length === 0
      ? 0
      : items.reduce((sum, item) => sum + item.confidence, 0) / items.length;

  return {
    items: items.filter((item) => item.text.trim().length > 0),
    imageWidth,
    imageHeight,
    averageConfidence,
  };
}
