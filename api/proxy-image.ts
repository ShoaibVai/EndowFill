/**
 * Vercel serverless function that proxies image fetches to bypass CORS.
 *
 * For Google Drive URLs, tries multiple serving strategies since no single
 * endpoint works reliably for all public files.
 *
 * Usage: GET /api/proxy-image?url=<any-image-url>
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithRetry(urls: string[]): Promise<{ ok: boolean; status: number; contentType: string; buffer: ArrayBuffer }> {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept': 'image/*,*/*;q=0.8' },
        redirect: 'follow',
      });
      if (res.ok) {
        const contentType = res.headers.get('content-type') || '';
        const buffer = await res.arrayBuffer();
        // Reject HTML error pages (Google sometimes returns 200 with HTML)
        if (buffer.byteLength > 0 && !contentType.includes('text/html')) {
          return { ok: true, status: res.status, contentType, buffer };
        }
      }
    } catch {
      // Try next URL
    }
  }
  return { ok: false, status: 404, contentType: '', buffer: new ArrayBuffer(0) };
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
    status: (code: number) => { json: (body: unknown) => void; send: (buf: Buffer) => void; end: () => void };
    setHeader: (name: string, value: string | number) => void;
  }
) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const urlParam = req.query.url;
  const url = Array.isArray(urlParam) ? urlParam[0] : urlParam;

  if (!url) return res.status(400).json({ error: 'Missing "url" query parameter' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }

  try {
    // Check if this is a Google Drive URL and try multiple strategies
    const fileId = extractGoogleDriveFileId(url);
    let fetchUrls: string[];

    if (fileId) {
      // Multiple Google Drive image serving endpoints
      fetchUrls = [
        `https://lh3.googleusercontent.com/d/${fileId}=w1024`,
        `https://lh3.googleusercontent.com/d/${fileId}`,
        `https://drive.google.com/uc?export=download&id=${fileId}`,
        `https://drive.google.com/uc?export=view&id=${fileId}`,
        `https://drive.google.com/thumbnail?id=${fileId}&sz=w1024`,
      ];
    } else {
      fetchUrls = [url];
    }

    const result = await fetchWithRetry(fetchUrls);

    if (!result.ok) {
      const msg = fileId
        ? 'Failed to fetch Google Drive image. Make sure the file is shared as "Anyone with the link".'
        : `Upstream returned HTTP ${result.status}`;
      return res.status(result.status).json({ error: msg });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.buffer.byteLength);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).send(Buffer.from(result.buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to fetch image: ${message}` });
  }
}
