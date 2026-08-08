/**
 * Encode an ArrayBuffer to a base64 string using chunked btoa.
 * The per-byte String.fromCharCode loop is O(n²) for multi-MB buffers;
 * batching into 0x8000-byte chunks is ~5-10x faster on large scans.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < len; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, len)));
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}
