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
 * Convert various Google Drive URL formats to a direct image download URL.
 *
 * Supported formats:
 *   - https://drive.google.com/file/d/{ID}/view?usp=sharing
 *   - https://drive.google.com/file/d/{ID}/view
 *   - https://drive.google.com/open?id={ID}
 *   - https://drive.google.com/uc?id={ID}&export=download
 *   - https://drive.google.com/uc?id={ID}&export=view
 *   - https://drive.google.com/uc?export=view&id={ID}
 *
 * Returns a direct URL that serves the image content.
 */
export function parseGoogleDriveUrl(url: string): string {
  const trimmed = url.trim();

  // Pattern: /file/d/{FILE_ID}/...
  const fileMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return `https://drive.google.com/uc?export=view&id=${fileMatch[1]}`;
  }

  // Pattern: /open?id={FILE_ID}
  const openMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (openMatch) {
    return `https://drive.google.com/uc?export=view&id=${openMatch[1]}`;
  }

  // Pattern: /uc?...id={FILE_ID}... or /uc?...export=...&id={FILE_ID}
  const ucMatch = trimmed.match(/drive\.google\.com\/uc\?.*\bid=([a-zA-Z0-9_-]+)/);
  if (ucMatch) {
    return `https://drive.google.com/uc?export=view&id=${ucMatch[1]}`;
  }

  // Not a recognized Google Drive URL — return as-is (could be any image URL)
  return trimmed;
}

/**
 * Fetch an image from a URL and return it as a base64 data URI string.
 *
 * Handles Google Drive URLs specially by converting them to direct download links.
 * The returned string is in the format `data:image/{type};base64,...` which is
 * what pdfme's image plugin expects.
 */
export async function fetchImageAsDataUrl(url: string): Promise<string> {
  const directUrl = parseGoogleDriveUrl(url);

  const response = await fetch(directUrl);

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

  // Determine MIME type from response header, fallback to jpeg
  let mimeType = 'image/jpeg';
  if (contentType.includes('image/png')) {
    mimeType = 'image/png';
  } else if (contentType.includes('image/webp')) {
    mimeType = 'image/webp';
  } else if (contentType.includes('image/gif')) {
    mimeType = 'image/gif';
  } else if (contentType.includes('image/svg')) {
    throw new Error(`SVG images are not supported. Please use JPEG or PNG for ${url}`);
  }

  const base64 = arrayBufferToBase64(buffer);
  return `data:${mimeType};base64,${base64}`;
}
