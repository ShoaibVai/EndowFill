/**
 * index.ts — EndowFill server entrypoint.
 *
 * Fastify backend serving the OCR / extraction / form-field detection
 * endpoints consumed by the SPA, PLUS the built frontend as a static site
 * with an SPA fallback — one process, one Render web service.
 *
 *   GET  /api/health             → { ok, model }
 *   POST /api/ai/ocr             → page markdown + layout detections
 *   POST /api/ai/extract         → structured items from an OCR result
 *   POST /api/ai/detect-fields   → fillable fields on a blank form
 *   GET  /*                      → static SPA (fallback to /index.html)
 *
 * All three AI routes run PaddleOCR ONNX models locally — no external API
 * keys. Errors are serialized as `{ message, code }` — the exact shape the
 * frontend's ApiError (utils/apiClient.ts) surfaces to the user.
 */

import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import path from 'node:path';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { jwtVerify } from 'jose';
import { BODY_LIMIT_BYTES, config } from './config.js';
import { HttpError } from './validate.js';
import { initialize, isReady } from './ocr/engine.js';
import { registerOcrRoute } from './routes/ocr.js';
import { registerExtractRoute } from './routes/extract.js';
import { registerDetectFieldsRoute } from './routes/detectFields.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: BODY_LIMIT_BYTES,
  // Local OCR can take tens of seconds per page on small instances.
  requestTimeout: 300_000,
  // The app sits behind Render's proxy — trust X-Forwarded-For so rate
  // limiting and logs see the real client IP instead of the proxy's.
  trustProxy: true,
  genReqId: () => crypto.randomUUID(),
});

const corsOrigins =
  config.corsOrigin === '*'
    ? []
    : config.corsOrigin
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

if (corsOrigins.length === 0) {
  app.log.warn('CORS_ORIGIN is "*" or empty — cross-origin requests will be blocked. Set CORS_ORIGIN to your app origin(s) in production.');
}

await app.register(cors, {
  origin: corsOrigins.length > 0 ? corsOrigins : false,
});

// ── Rate limit /api/ai/* — OCR is CPU-bound on small instances ──────────────
await app.register(rateLimit, {
  global: false,
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs,
  errorResponseBuilder: (_request, context) => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: `Rate limit exceeded — try again in ${Math.ceil(Number(context.after) / 1000)}s.`,
    code: 'rate_limited',
  }),
});

const AI_ROUTE_PREFIX = '/api/ai/';

// ── Auth gate for /api/ai/* ─────────────────────────────────────────────────
// The SPA sends `Authorization: Bearer <supabase access token>` on every
// apiFetch (see src/utils/apiClient.ts). When SUPABASE_JWT_SECRET is set we
// require and verify that token; when unset (dev) the endpoints stay open but
// the boot warning makes the risk explicit.
const authSecret = new TextEncoder().encode(config.supabaseJwtSecret);

if (!config.supabaseJwtSecret) {
  app.log.warn(
    'SUPABASE_JWT_SECRET is not set — /api/ai/* will not require authentication. ' +
      'Set SUPABASE_JWT_SECRET in production.'
  );
}

app.addHook('onRequest', async (request) => {
  if (!request.url.startsWith(AI_ROUTE_PREFIX)) return;
  if (!config.supabaseJwtSecret) return;

  const header = request.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!token) {
    throw new HttpError('Missing authentication token.', 401, 'unauthorized');
  }

  try {
    await jwtVerify(token, authSecret, { algorithms: ['HS256'] });
  } catch {
    throw new HttpError('Invalid or expired authentication token.', 401, 'unauthorized');
  }
});

// ── Error serialization: always { message, code } ────────────────────────────

app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send({ message: error.message, code: error.code });
  }

  // Fastify body-limit violation → mirror the frontend's file_too_large code.
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return reply.status(413).send({
      message: `Payload exceeds ${BODY_LIMIT_BYTES / (1024 * 1024)} MiB.`,
      code: 'file_too_large',
    });
  }

  // Fastify rate-limit violation → mirror the frontend's rate_limited code.
  if (error.code === 'FST_ERR_RATE_LIMIT' || error.statusCode === 429) {
    return reply.status(429).send({
      message: 'Rate limit exceeded. Please try again shortly.',
      code: 'rate_limited',
    });
  }

  request.log.error(error);
  const statusCode =
    typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
  return reply.status(statusCode).send({
    message: statusCode === 500 ? 'Internal server error.' : error.message,
    code: error.code ?? 'internal_error',
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({
  ok: true,
  model: config.ocrModelPreset,
  engine: 'paddle-ocr-onnx',
  ready: isReady(),
}));

// Apply the AI rate limiter to the three model routes.
const AI_RATE_LIMIT_CONFIG = { max: config.rateLimitMax, timeWindow: config.rateLimitWindowMs };
registerOcrRoute(app, AI_RATE_LIMIT_CONFIG);
registerExtractRoute(app, AI_RATE_LIMIT_CONFIG);
registerDetectFieldsRoute(app, AI_RATE_LIMIT_CONFIG);

// ── Static SPA serving (production) ─────────────────────────────────────────
const staticDir = path.resolve(process.cwd(), config.staticDir);
await app.register(fastifyStatic, {
  root: staticDir,
  // Cache aggressively: Vite builds emit content-hashed assets.
  maxAge: '1y',
});

// SPA fallback: any non-API GET without a matching file serves index.html.
app.setNotFoundHandler((request, reply) => {
  if (request.method !== 'GET' || request.url.startsWith('/api')) {
    return reply.status(404).send({ message: 'Not found.', code: 'not_found' });
  }
  return reply.sendFile('index.html');
});

// ── Boot ─────────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `EndowFill server listening on ${config.host}:${config.port} (OCR: ${config.ocrModelPreset} onnx)`
  );

  // Render sets OCR_WARMUP=1 so the first real request never pays model-load
  // latency (important on free instances that sleep and cold-start).
  if (process.env.OCR_WARMUP === '1') {
    initialize()
      .then(() => app.log.info('OCR engine warm — models loaded.'))
      .catch((error) => app.log.error(`OCR warmup failed: ${error instanceof Error ? error.message : error}`));
  }
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
