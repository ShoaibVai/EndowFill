/**
 * Vercel serverless function that proxies Google Drive image fetches to
 * bypass CORS.
 *
 * Usage: GET /api/proxy-image?url=<google-drive-url>
 *
 * Hardened against SSRF / open-proxy abuse:
 *   - scheme allowlist: https only
 *   - host allowlist: Google Drive host family only
 *   - DNS resolution re-check blocks private / loopback / link-local /
 *     metadata ranges (DNS-rebinding guard)
 *   - manual redirect handling re-validates every hop
 *   - 5 MB response-size cap (unbounded reads are a memory-DoS vector)
 *   - response MIME restricted to image/* (SVG rejected — XSS vector)
 *   - CORS restricted to a configured origin (no "*" by default)
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/** Google Drive hosts the app actually needs (imageUtils.ts only proxies Drive). */
const ALLOWED_HOSTS = new Set([
  'drive.google.com',
  'drive.usercontent.google.com',
  'lh3.googleusercontent.com',
  'docs.google.com',
]);

/** Max bytes we are willing to buffer from upstream (5 MB). */
const MAX_BYTES = 5 * 1024 * 1024;

/** Allowed response content types (svg/xml/html/javascript are rejected). */
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
];

/** Comma-separated allowed CORS origins; absent/empty means same-origin only. */
function allowedCorsOrigins(): string[] {
  const raw = process.env.PROXY_CORS_ORIGIN ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function isPrivateIp(ip: string): boolean {
  const addr = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv6 loopback + link-local + ULA.
  if (addr === '::1' || addr === '::') return true;
  if (addr.startsWith('fe80:') || addr.startsWith('fc') || addr.startsWith('fd')) return true;

  // IPv4 dotted quad (also matches the v4-mapped ::ffff:a.b.c.d forms).
  const match = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [a, b] = [Number(match[1]), Number(match[2])];

  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  return false;
}

/**
 * Resolve a hostname and assert every address is public.
 * Throws when the host is private / fails to resolve.
 */
async function assertPublicHost(hostname: string): Promise<void> {
  const hosts = await dnsLookupAll(hostname);
  if (hosts.length === 0) {
    throw new Error('Host could not be resolved.');
  }
  const privateHits = hosts.filter(isPrivateIp);
  if (privateHits.length > 0) {
    throw new Error(`Host resolves to a blocked private address (${privateHits[0]}).`);
  }
}

async function dnsLookupAll(hostname: string): Promise<string[]> {
  const dns = await import('node:dns').then((m) => m.promises);
  try {
    const result = await dns.lookup(hostname, { all: true, verbatim: true });
    return result.map((entry) => entry.address);
  } catch {
    return [];
  }
}

/** Validate a URL against the allowlist + SSRF rules. Throws on violation. */
async function validateUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL.');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Only https URLs are allowed.');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error('Only Google Drive hosts are allowed.');
  }

  await assertPublicHost(parsed.hostname);
  return parsed;
}

/** Read the response body, enforcing a hard byte cap. */
async function readCappedBody(
  response: Response,
  maxBytes: number
): Promise<ArrayBuffer> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes) {
    throw new Error(`Upstream file exceeds the ${maxBytes / (1024 * 1024)} MB limit.`);
  }
  const reader = response.body?.getReader();
  if (!reader) {
    // No streaming body (e.g. mocked in tests) — fall back to arrayBuffer.
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes) {
      throw new Error(`Upstream file exceeds the ${maxBytes / (1024 * 1024)} MB limit.`);
    }
    return buffer;
  }
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      throw new Error(`Upstream file exceeds the ${maxBytes / (1024 * 1024)} MB limit.`);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

/** Fetch with manual redirect handling — every hop is re-validated. */
async function fetchWithValidation(
  url: string,
  depth: number
): Promise<{ ok: boolean; status: number; contentType: string; buffer: ArrayBuffer }> {
  const MAX_REDIRECTS = 5;
  if (depth > MAX_REDIRECTS) {
    return { ok: false, status: 310, contentType: '', buffer: new ArrayBuffer(0) };
  }

  const target = await validateUrl(url);
  let response: Response;
  try {
    response = await fetch(target, {
      headers: { 'User-Agent': UA, Accept: 'image/*,*/*;q=0.8' },
      redirect: 'manual',
    });
  } catch {
    return { ok: false, status: 404, contentType: '', buffer: new ArrayBuffer(0) };
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location');
    if (!location) return { ok: false, status: response.status, contentType: '', buffer: new ArrayBuffer(0) };
    return fetchWithValidation(new URL(location, target).toString(), depth + 1);
  }

  if (!response.ok) {
    return { ok: false, status: response.status, contentType: '', buffer: new ArrayBuffer(0) };
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
    return { ok: false, status: 415, contentType: '', buffer: new ArrayBuffer(0) };
  }

  try {
    const buffer = await readCappedBody(response, MAX_BYTES);
    if (buffer.byteLength === 0) {
      return { ok: false, status: 404, contentType: '', buffer: new ArrayBuffer(0) };
    }
    return { ok: true, status: response.status, contentType, buffer };
  } catch {
    return { ok: false, status: 413, contentType: '', buffer: new ArrayBuffer(0) };
  }
}

function extractGoogleDriveFileId(url: string): string | null {
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  return null;
}

export default async function handler(
  req: { method: string; query: Record<string, string | string[] | undefined> },
  res: {
    status: (code: number) => {
      json: (body: unknown) => void;
      send: (buf: Buffer) => void;
      end: () => void;
    };
    setHeader: (name: string, value: string | number) => void;
  }
) {
  const corsOrigins = allowedCorsOrigins();
  if (corsOrigins.length > 0) {
    res.setHeader('Access-Control-Allow-Origin', corsOrigins.join(', '));
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const urlParam = req.query.url;
  const url = Array.isArray(urlParam) ? urlParam[0] : urlParam;

  if (!url) return res.status(400).json({ error: 'Missing "url" query parameter' });

  try {
    // Pre-validate before extracting the file ID so the allowlist applies
    // to the input URL as well as the rewrite targets.
    await validateUrl(url);

    const fileId = extractGoogleDriveFileId(url);
    if (!fileId) {
      return res.status(400).json({ error: 'Could not extract a Google Drive file ID.' });
    }

    // Multiple Google Drive image serving endpoints.
    const fetchUrls = [
      `https://lh3.googleusercontent.com/d/${fileId}=w1024`,
      `https://lh3.googleusercontent.com/d/${fileId}`,
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1024`,
    ];

    let result = { ok: false, status: 404, contentType: '', buffer: new ArrayBuffer(0) };
    for (const candidate of fetchUrls) {
      result = await fetchWithValidation(candidate, 0);
      if (result.ok) break;
    }

    if (!result.ok) {
      const msg =
        result.status === 413
          ? 'The image is larger than the 5 MB limit.'
          : result.status === 415
            ? 'The resource is not a supported image type.'
            : 'Failed to fetch Google Drive image. Make sure the file is shared as "Anyone with the link".';
      return res.status(result.status === 413 || result.status === 415 ? result.status : 404).json({
        error: msg,
      });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.buffer.byteLength);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).send(Buffer.from(result.buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Validation errors are client problems (400), not upstream failures.
    const isValidation = /(allowed|blocked|resolve|https|drive|file ID|Invalid)/i.test(message);
    return res.status(isValidation ? 400 : 502).json({
      error: isValidation ? message : `Failed to fetch image: ${message}`,
    });
  }
}
