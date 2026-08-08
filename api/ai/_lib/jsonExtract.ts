/**
 * api/ai/_lib/jsonExtract.ts — Lenient JSON extraction for model output.
 *
 * Port of server/src/jsonExtract.ts. Vision models occasionally wrap JSON in
 * markdown fences, add preamble ("Here is the JSON:"), or emit trailing
 * commas. These helpers extract the first complete JSON object/array from
 * such text and parse it strictly.
 */

/** Strip a leading ```json / ``` fence and a trailing ``` if present. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/i);
  return fence ? fence[1].trim() : trimmed;
}

/** Remove trailing commas before } or ] — the most common model JSON mistake. */
function stripTrailingCommas(text: string): string {
  return text.replace(/,\s*([}\]])/g, '$1');
}

/** Return the balanced-brace span starting at `start` (index of '{' or '['). */
function balancedSpan(text: string, start: number): string | null {
  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Extract and parse the first JSON value (object or array) in model output.
 * Throws with an excerpt of the raw text when nothing parseable is found.
 */
export function extractJson<T>(raw: string, context: string): T {
  const unfenced = stripCodeFence(raw ?? '');

  // Fast path: the whole output is JSON already.
  try {
    return JSON.parse(stripTrailingCommas(unfenced)) as T;
  } catch {
    // Fall through to span extraction.
  }

  // Scan for the first '{' or '[' and try its balanced span.
  for (let i = 0; i < unfenced.length; i += 1) {
    const ch = unfenced[i];
    if (ch !== '{' && ch !== '[') continue;
    const span = balancedSpan(unfenced, i);
    if (!span) continue;
    try {
      return JSON.parse(stripTrailingCommas(span)) as T;
    } catch {
      // Keep scanning — a later span may parse.
    }
  }

  const excerpt = unfenced.slice(0, 400).replace(/\s+/g, ' ');
  throw new Error(`[${context}] Model returned non-JSON output: "${excerpt}…"`);
}
