/**
 * chatJson.ts — JSON-parse with corrective retry.
 *
 * Some OpenCode Go routes ignore `response_format: json_object`, and the
 * vision model then narrates its analysis instead of emitting JSON. This
 * helper retries once with a hard instruction to reply with JSON only, so
 * a narration slip becomes a one-call retry instead of a failed scan.
 */

import { chatCompletion, type ChatRequest } from './opencodeGo.js';
import { extractJson } from './jsonExtract.js';

/** Append-only correction appended on retries. */
const CORRECTION =
  'IMPORTANT: Your previous response was not valid JSON. Return ONLY a single JSON object with the exact shape requested, nothing else. No commentary, no explanations, no markdown fences. Begin your response directly with "{".';

/**
 * Run one chat completion and parse its output as JSON.
 * Retries once with a corrective instruction when parsing fails.
 */
export async function chatJson<T>(
  request: ChatRequest,
  context: string
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= 1; attempt += 1) {
    const content = await chatCompletion({
      ...request,
      userText: attempt === 0 ? request.userText : `${request.userText}\n\n${CORRECTION}`,
    });
    try {
      return extractJson<T>(content, context);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
