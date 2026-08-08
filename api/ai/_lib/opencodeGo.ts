/**
 * api/ai/_lib/opencodeGo.ts — Minimal OpenAI-compatible chat client for OpenCode Go.
 *
 * Vercel serverless port of server/src/opencodeGo.ts. The API key is read from
 * the OPENCODE_GO_API_KEY environment variable (set in the Vercel project
 * settings) and never leaves the function.
 *
 *   POST {base}/chat/completions   (base default: https://opencode.ai/zen/go/v1)
 *   Authorization: Bearer <OPENCODE_GO_API_KEY>
 */

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

/** Error carrying the upstream HTTP status so handlers can map it sanely. */
export class UpstreamError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'UpstreamError';
    this.status = status;
  }
}

const OPENCODE_GO_API_KEY = process.env.OPENCODE_GO_API_KEY ?? '';
const OPENCODE_GO_MODEL = process.env.OPENCODE_GO_MODEL?.trim() || 'kimi-k2.6';
const OPENCODE_GO_BASE_URL = (
  process.env.OPENCODE_GO_BASE_URL?.trim() || 'https://opencode.ai/zen/go/v1'
).replace(/\/+$/, '');
/** Milliseconds before an upstream model call is aborted. */
const MODEL_TIMEOUT_MS = 180_000;

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

/** Exponential backoff with jitter: base * 2^attempt ± 20%. */
function backoffMs(attempt: number, retryAfter: number | null): number {
  if (retryAfter !== null) return Math.min(retryAfter, 60_000);
  const base = 500 * 2 ** attempt;
  const jitter = base * 0.2 * (Math.random() - 0.5);
  return Math.max(0, Math.round(base + jitter));
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postChatCompletion(body: unknown): Promise<string> {
  if (!OPENCODE_GO_API_KEY) {
    throw new UpstreamError(
      'OPENCODE_GO_API_KEY is not configured on this deployment. Set it in the Vercel project environment variables and redeploy.',
      500
    );
  }
  const url = `${OPENCODE_GO_BASE_URL}/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENCODE_GO_API_KEY}`,
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
    throw new UpstreamError(
      `OCR model request failed (${response.status}): ${upstreamMessage}`,
      response.status
    );
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
    model: OPENCODE_GO_MODEL,
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
 *   backoff + jitter. Total upstream attempts are hard-capped at 3 so a
 *   cascade cannot burn unbounded model quota.
 * - Non-retryable errors (401, 422, empty content) surface immediately.
 */
export async function chatCompletion(request: ChatRequest): Promise<string> {
  const MAX_ATTEMPTS = 3;
  let body = buildBody(request, true);

  for (let attemptIndex = 0; attemptIndex < MAX_ATTEMPTS; attemptIndex += 1) {
    try {
      return await postChatCompletion(body);
    } catch (error) {
      const upstream = error instanceof UpstreamError ? error : null;

      if (
        attemptIndex === 0 &&
        upstream?.status === 400 &&
        body.response_format !== undefined
      ) {
        body = buildBody(request, false);
        continue;
      }

      if (upstream && !isRetryableStatus(upstream.status)) throw error;
      if (attemptIndex >= MAX_ATTEMPTS - 1) throw error;

      await sleep(backoffMs(attemptIndex, null));
    }
  }

  throw new Error('Unreachable: chatCompletion retry loop exhausted.');
}
