/**
 * opencodeGo.ts — Minimal OpenAI-compatible chat client for OpenCode Go.
 *
 * OpenCode Go exposes an OpenAI-compatible endpoint:
 *   POST {base}/chat/completions   (base default: https://opencode.ai/zen/go/v1)
 *   Authorization: Bearer <OPENCODE_GO_API_KEY>
 *
 * Vision requests send page images as `image_url` content parts with
 * base64 data URLs. The API key never leaves this server — the browser
 * only talks to /api/ai/*.
 */

import { config, MODEL_TIMEOUT_MS } from './config.js';

export interface PageImage {
  imageBase64: string;
  mimeType: string;
}

export interface ChatRequest {
  system: string;
  userText: string;
  images?: PageImage[];
  /** Max completion tokens (default 4096 — enough for dense OCR pages). */
  maxTokens?: number;
  temperature?: number;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: unknown } }[];
  error?: { message?: string; type?: string };
}

/** Error carrying the upstream HTTP status so routes can map it sanely. */
export class UpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

/** Extract assistant text, tolerating string or content-part responses. */
function readAssistantText(payload: ChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

/** Retry-after in ms from a 429/503 response header, or null. */
function retryAfterMs(payload: ChatCompletionResponse, response: Response | null): number | null {
  const headerValue = response?.headers.get('retry-after');
  if (headerValue) {
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  }
  return null;
}

/** Exponential backoff with jitter: base * 2^attempt ± 20%. */
function backoffMs(attempt: number, retryAfter: number | null): number {
  if (retryAfter !== null) return Math.min(retryAfter, 60_000);
  const base = 500 * 2 ** attempt;
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return Math.max(0, Math.round(base + jitter));
}

/** Sleep helper (also abortable so shutdown can cut retries short). */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

async function postChatCompletion(body: unknown): Promise<string> {
  const url = `${config.openCodeGoBaseUrl}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openCodeGoApiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Network error';
    throw new UpstreamError(`Could not reach the OCR model: ${message}`, 0);
  }

  const text = await response.text();
  let payload: ChatCompletionResponse = {};
  try {
    payload = JSON.parse(text) as ChatCompletionResponse;
  } catch {
    // Non-JSON body — handled below via status check.
  }

  if (!response.ok) {
    const upstreamMessage =
      payload.error?.message ?? text.slice(0, 300) ?? `HTTP ${response.status}`;
    const err = new UpstreamError(
      `OCR model request failed (${response.status}): ${upstreamMessage}`,
      response.status
    );
    (err as UpstreamError & { retryAfter?: number | null }).retryAfter = retryAfterMs(payload, response);
    throw err;
  }

  const content = readAssistantText(payload);
  if (!content.trim()) {
    throw new UpstreamError('OCR model returned an empty response.', 200);
  }
  return content;
}

function buildBody(request: ChatRequest, withJsonMode: boolean): Record<string, unknown> {
  const userContent: unknown[] = [{ type: 'text', text: request.userText }];
  for (const image of request.images ?? []) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${image.mimeType};base64,${image.imageBase64}` },
    });
  }

  const body: Record<string, unknown> = {
    model: config.openCodeGoModel,
    // Kimi (and other reasoning models) surface their chain-of-thought in
    // content when it runs long, consuming the whole token budget before any
    // JSON is emitted. Disable thinking: these endpoints demand JSON only.
    thinking: { type: 'disabled' },
    messages: [
      { role: 'system', content: request.system },
      { role: 'user', content: userContent },
    ],
    temperature: request.temperature ?? 0,
    max_tokens: request.maxTokens ?? 4096,
  };
  if (withJsonMode) body.response_format = { type: 'json_object' };
  return body;
}

/**
 * Send a chat completion and return the assistant's raw text.
 *
 * - First attempt uses OpenAI JSON mode; a 400 (unsupported on some
 *   OpenCode Go routes) retries once without it.
 * - Transient statuses (429/5xx) or network failures retry with exponential
 *   backoff + jitter, honoring Retry-After. Total upstream attempts are
 *   hard-capped at 3 so a cascade cannot burn unbounded model quota.
 * - Non-retryable errors (401, 422, empty content) surface immediately.
 */
export async function chatCompletion(request: ChatRequest): Promise<string> {
  const MAX_ATTEMPTS = 3;
  let body = buildBody(request, true);
  let retryAfter: number | null = null;

  for (let attemptIndex = 0; attemptIndex < MAX_ATTEMPTS; attemptIndex += 1) {
    try {
      return await postChatCompletion(body);
    } catch (error) {
      const upstream = error instanceof UpstreamError ? error : null;

      // A 400 while JSON mode is enabled means the route may not support it —
      // retry exactly once without JSON mode before considering non-retryable.
      if (
        attemptIndex === 0 &&
        upstream?.status === 400 &&
        body.response_format !== undefined
      ) {
        body = buildBody(request, false);
        retryAfter = (upstream as UpstreamError & { retryAfter?: number | null }).retryAfter ?? null;
        continue;
      }

      if (upstream && !isRetryableStatus(upstream.status)) throw error;
      if (attemptIndex >= MAX_ATTEMPTS - 1) throw error;

      retryAfter = (upstream as UpstreamError & { retryAfter?: number | null }).retryAfter ?? retryAfter;
      await sleep(backoffMs(attemptIndex, retryAfter));
    }
  }

  throw new Error('Unreachable: chatCompletion retry loop exhausted.');
}
