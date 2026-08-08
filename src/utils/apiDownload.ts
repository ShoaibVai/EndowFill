/**
 * utils/apiDownload.ts
 *
 * Authenticated binary download helper for the self-hosted Fastify API.
 *
 * apiClient's `api.get()` parses responses as JSON, so binary endpoints
 * (ZIP / Excel downloads) are fetched directly with the access token
 * attached. Errors are normalized to the shared ApiError shape so callers
 * can keep using the same `{ error: { code, message } }` handling.
 */

import { API_BASE_URL, ApiError, getAccessToken } from './apiClient';

/** Best-effort parse of an error body; falls back to empty strings. */
function parseErrorBody(text: string): { message: string; code: string } {
  try {
    const payload = JSON.parse(text) as Record<string, unknown>;
    return {
      message: typeof payload.message === 'string' ? payload.message : '',
      code: typeof payload.code === 'string' ? payload.code : '',
    };
  } catch (err) {
    console.warn('[apiDownload] error response body was not JSON', err);
    return { message: '', code: '' };
  }
}

/**
 * Download a binary resource with the current access token attached.
 * Returns the raw bytes as an ArrayBuffer; throws ApiError on failure.
 */
export async function downloadBinary(path: string): Promise<ArrayBuffer> {
  const token = getAccessToken();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const response = await fetch(`${API_BASE_URL}${normalized}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const { message, code } = parseErrorBody(text);
    throw new ApiError(
      message || response.statusText || `Request failed (${response.status})`,
      response.status,
      code || `http_${response.status}`
    );
  }

  return response.arrayBuffer();
}
