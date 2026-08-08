/**
 * config.ts — Environment configuration for the EndowFill AI server.
 *
 * Required environment variables (place in server/.env — gitignored):
 *
 *   OPENCODE_GO_API_KEY   API key from https://opencode.ai/auth (Go subscription)
 *   OPENCODE_GO_MODEL     Vision model id (default "kimi-k2.6"; "kimi-k3" for max quality)
 *   OPENCODE_GO_BASE_URL  OpenAI-compatible base (default "https://opencode.ai/zen/go/v1")
 *   PORT                  Listen port (default 8787 — nginx proxies /api/ here)
 *   HOST                  Bind address (default 0.0.0.0)
 *   CORS_ORIGIN           Allowed browser origin(s), comma-separated (default "*")
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
  host: optional('HOST', '0.0.0.0'),
  /** CORS allowed origin(s) — "*" or comma-separated list. */
  corsOrigin: optional('CORS_ORIGIN', '*'),
} as const;

/** Milliseconds before an upstream model call is aborted (vision calls are slow). */
export const MODEL_TIMEOUT_MS = 180_000;

/** Total request-body cap — mirrors the frontend's 25 MiB per-file guard. */
export const BODY_LIMIT_BYTES = 25 * 1024 * 1024;
