/**
 * Vercel serverless function that proxies image fetches to bypass CORS.
 *
 * Usage: GET /api/proxy-image?url=https://drive.google.com/uc?export=view&id=FILE_ID
 *
 * Returns the image bytes with appropriate Content-Type and CORS headers.
 */
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

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const urlParam = req.query.url;
  const url = Array.isArray(urlParam) ? urlParam[0] : urlParam;

  if (!url) {
    return res.status(400).json({ error: 'Missing "url" query parameter' });
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs are allowed' });
  }

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ImageProxy/1.0)',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Upstream returned HTTP ${response.status} ${response.statusText}`,
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    if (buffer.byteLength === 0) {
      return res.status(404).json({ error: 'Empty response from upstream' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('Cache-Control', 'public, max-age=3600');

    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(502).json({ error: `Failed to fetch image: ${message}` });
  }
}
