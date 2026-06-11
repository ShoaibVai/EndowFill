import { arrayBufferToBase64 } from './bufferUtils';

/**
 * Check if a string value is a URL (http/https) rather than a base64 data URI.
 */
export function isImageUrl(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

/**
 * Check if a string value is already a valid image data URI.
 */
export function isImageDataUri(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('data:image/');
}

/**
 * Extract the file ID from various Google Drive URL formats.
 *
 * Supported formats:
 *   - https://drive.google.com/file/d/{ID}/view?usp=sharing
 *   - https://drive.google.com/file/d/{ID}/view
 *   - https://drive.google.com/open?id={ID}
 *   - https://drive.google.com/uc?id={ID}&export=download
 *   - https://drive.google.com/uc?export=view&id={ID}
 */
function extractGoogleDriveFileId(url: string): string | null {
  const trimmed = url.trim();

  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) return fileMatch[1];

  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) return openMatch[1];

  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?.*\bid=([a-zA-Z0-9_-]+)/);
  if (ucMatch) return ucMatch[1];

  return null;
}

/**
 * Check if a URL is a Google Drive URL.
 */
function isGoogleDriveUrl(url: string): boolean {
  return extractGoogleDriveFileId(url.trim()) !== null;
}

/**
 * Build the /api/proxy-image URL for a given target URL.
 */
function buildProxyUrl(targetUrl: string): string {
  return `/api/proxy-image?url=${encodeURIComponent(targetUrl)}`;
}

/**
 * Fetch image bytes, routing through the serverless proxy for Google Drive URLs
 * and directly for other URLs.
 */
async function fetchImageBytes(url: string): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  if (isGoogleDriveUrl(url)) {
    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) {
      throw new Error(`Could not extract file ID from Google Drive URL: ${url}`);
    }

    // Use serverless proxy — no CORS issues since it runs on the server
    const directUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
    const proxyUrl = buildProxyUrl(directUrl);
    const response = await fetch(proxyUrl);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let detail = '';
      try { detail = JSON.parse(body).error || ''; } catch { /* ignore */ }
      throw new Error(
        `Failed to fetch Google Drive image${detail ? ': ' + detail : ''}. ` +
        `Make sure the file sharing is set to "Anyone with the link".`
      );
    }

    const contentType = response.headers.get('content-type') || '';
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error('Empty image data received from Google Drive.');
    }

    return { buffer, contentType };
  }

  // Non-Google Drive URL — fetch directly
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image: HTTP ${response.status} ${response.statusText} from ${url}`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) {
    throw new Error(`Empty image data received from ${url}`);
  }

  return { buffer, contentType };
}

/**
 * Determine MIME type from response Content-Type header or magic bytes.
 */
function detectMimeType(contentType: string, buffer: ArrayBuffer): string {
  if (contentType.includes('image/png')) return 'image/png';
  if (contentType.includes('image/webp')) return 'image/webp';
  if (contentType.includes('image/gif')) return 'image/gif';
  if (contentType.includes('image/svg')) {
    throw new Error('SVG images are not supported. Please use JPEG or PNG.');
  }

  if (buffer.byteLength >= 4) {
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'image/png';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'image/gif';
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
        buffer.byteLength >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) {
      return 'image/webp';
    }
  }

  return 'image/jpeg';
}

/**
 * Fetch an image from a URL and return it as a base64 data URI string.
 *
 * Google Drive URLs are routed through a serverless proxy to bypass CORS.
 * The returned string is in the format `data:image/{type};base64,...` which is
 * what pdfme's image plugin expects.
 */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  const { buffer, contentType } = await fetchImageBytes(url);
  const mimeType = detectMimeType(contentType, buffer);
  const base64 = arrayBufferToBase64(buffer);
  return `data:${mimeType};base64,${base64}`;
}
