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
 * - One extra retry on transient statuses (429/5xx) or network failures.
 */
export async function chatCompletion(request: ChatRequest): Promise<string> {
  try {
    return await postChatCompletion(buildBody(request, true));
  } catch (firstError) {
    if (firstError instanceof UpstreamError && firstError.status === 400) {
      try {
        return await postChatCompletion(buildBody(request, false));
      } catch (secondError) {
        if (secondError instanceof UpstreamError && !isRetryableStatus(secondError.status)) {
          throw secondError;
        }
        return postChatCompletion(buildBody(request, false));
      }
    }
    if (firstError instanceof UpstreamError && !isRetryableStatus(firstError.status)) {
      throw firstError;
    }
    return postChatCompletion(buildBody(request, true));
  }
}
