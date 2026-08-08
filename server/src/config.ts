/**
 * config.ts — Environment configuration for the EndowFill AI server.
 *
 * Required environment variables (place in server/.env — gitignored):
 *
 *   OPENCODE_GO_API_KEY   API key from https://opencode.ai/auth (Go subscription)
 *   OPENCODE_GO_MODEL     Vision model id (default "kimi-k2.6"; "kimi-k3" for max quality)
 *   OPENCODE_GO_BASE_URL  OpenAI-compatible base (default "https://opencode.ai/zen/go/v1")
 *   PORT                  Listen port (default 8787 — nginx proxies /api/ here)
 *   HOST                  Bind address (default 127.0.0.1)
 *   CORS_ORIGIN           Allowed browser origin(s), comma-separated
 *   SUPABASE_JWT_SECRET   Supabase project JWT secret (project settings → API).
 *                        When set, /api/ai/* requires a valid Supabase access
 *                        token (the SPA sends it via Authorization: Bearer).
 *                        When unset, auth is not enforced and a warning is
 *                        logged at boot (development only — never leave it
 *                        unset in production; these endpoints burn model cost).
 *   RATE_LIMIT_MAX        Max /api/ai/* requests per window per IP (default 10)
 *   RATE_LIMIT_WINDOW_MS  Rate-limit window in ms (default 60_000)
 *
 * Example server/.env:
 *   OPENCODE_GO_API_KEY=sk-...
 *   OPENCODE_GO_MODEL=kimi-k2.6
 *   PORT=8787
 */

import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    // Fail fast at boot — a missing key would only surface as confusing 500s later.
    throw new Error(`[config] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

export const config = {
  /** OpenCode Go API key (server-side only — never exposed to the browser). */
  openCodeGoApiKey: required('OPENCODE_GO_API_KEY'),
  /** Vision model served through OpenCode Go. */
  openCodeGoModel: optional('OPENCODE_GO_MODEL', 'kimi-k2.6'),
  /** OpenAI-compatible base URL (no trailing slash). */
  openCodeGoBaseUrl: optional('OPENCODE_GO_BASE_URL', 'https://opencode.ai/zen/go/v1').replace(/\/+$/, ''),
  /** HTTP listen settings. */
  port: Number(optional('PORT', '8787')),
  host: optional('HOST', '127.0.0.1'),
  /** CORS allowed origin(s) — comma-separated. Never "*". */
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:5173'),
  /** Supabase JWT secret — when set, /api/ai/* requires a valid Bearer token. */
  supabaseJwtSecret: optional('SUPABASE_JWT_SECRET', ''),
  /** Rate limit for /api/ai/* (per IP per window). */
  rateLimitMax: Number(optional('RATE_LIMIT_MAX', '10')),
  rateLimitWindowMs: Number(optional('RATE_LIMIT_WINDOW_MS', '60000')),
} as const;

/** Milliseconds before an upstream model call is aborted (vision calls are slow). */
export const MODEL_TIMEOUT_MS = 180_000;

/** Total request-body cap — mirrors the frontend's 25 MiB per-file guard. */
export const BODY_LIMIT_BYTES = 25 * 1024 * 1024;
