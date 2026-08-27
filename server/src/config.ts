/**
 * config.ts — Environment configuration for the EndowFill server.
 *
 * The AI endpoints run OCR locally via PaddleOCR ONNX models (no external
 * API keys). Required environment variables (place in server/.env — gitignored):
 *
 *   SUPABASE_JWT_SECRET   Supabase project JWT secret (project settings → API).
 *                         When set, /api/ai/* requires a valid Supabase access
 *                         token (the SPA sends it via Authorization: Bearer).
 *                         When unset, auth is not enforced and a warning is
 *                         logged at boot (development only — set it in
 *                         production).
 *   PORT                  Listen port (Render injects this; default 8787)
 *   HOST                  Bind address (default 0.0.0.0 for containers)
 *   CORS_ORIGIN           Allowed browser origin(s), comma-separated
 *   OCR_MODEL_PRESET      PaddleOCR ONNX preset (default "v6-small")
 *   OCR_MIN_CONFIDENCE    Drop recognitions below this score (default 0.4)
 *   STATIC_DIR            Directory with the built SPA (default ../dist)
 *   RATE_LIMIT_MAX        Max /api/ai/* requests per window per IP (default 10)
 *   RATE_LIMIT_WINDOW_MS  Rate-limit window in ms (default 60_000)
 */

import 'dotenv/config';

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

export const config = {
  /** HTTP listen settings. Render sets PORT; HOST must be 0.0.0.0 in containers. */
  port: Number(optional('PORT', '8787')),
  host: optional('HOST', '0.0.0.0'),
  /** CORS allowed origin(s) — comma-separated. Never "*" in production. */
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  /** Supabase JWT secret — when set, /api/ai/* requires a valid Bearer token. */
  supabaseJwtSecret: optional('SUPABASE_JWT_SECRET', ''),
  /** Rate limit for /api/ai/* (per IP per window). */
  rateLimitMax: Number(optional('RATE_LIMIT_MAX', '10')),
  rateLimitWindowMs: Number(optional('RATE_LIMIT_WINDOW_MS', '60000')),

  // ── Local OCR engine ──────────────────────────────────────────────────────
  /** PaddleOCR ONNX preset: v6-tiny | v6-small | v6-medium | v5-en-mobile | … */
  ocrModelPreset: optional('OCR_MODEL_PRESET', 'v6-small'),
  /** Image-processing backend: "canvas-native" (lighter) or "opencv". */
  ocrEngine: optional('OCR_ENGINE', 'canvas-native'),
  /** Drop recognitions below this confidence (0 disables). */
  ocrMinConfidence: Number(optional('OCR_MIN_CONFIDENCE', '0.4')),
  /** Directory containing the built frontend (served at /). */
  staticDir: optional('STATIC_DIR', '../dist'),
} as const;

/** Total request-body cap — mirrors the frontend's 25 MiB per-file guard. */
export const BODY_LIMIT_BYTES = 25 * 1024 * 1024;

/** Longest side (px) allowed for pixel analysis — keeps free-tier RAM bounded. */
export const MAX_ANALYSIS_SIDE_PX = 1600;
