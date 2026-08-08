/**
 * index.ts — EndowFill AI server entrypoint.
 *
 * Fastify backend serving the OCR / extraction / form-field detection
 * endpoints consumed by the SPA (via the office server's nginx /api/
 * proxy, or the Vite dev proxy on localhost).
 *
 *   GET  /api/health             → { ok, model }
 *   POST /api/ai/ocr             → page markdown + layout detections
 *   POST /api/ai/extract         → structured items from an OCR result
 *   POST /api/ai/detect-fields   → fillable fields on a blank form
 *
 * Errors are serialized as `{ message, code }` — the exact shape the
 * frontend's ApiError (utils/apiClient.ts) surfaces to the user.
 */

import Fastify from 'fastify';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { BODY_LIMIT_BYTES, config } from './config.js';
import { HttpError } from './validate.js';
import { registerOcrRoute } from './routes/ocr.js';
import { registerExtractRoute } from './routes/extract.js';
import { registerDetectFieldsRoute } from './routes/detectFields.js';

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: BODY_LIMIT_BYTES,
  // Vision calls can run for minutes on long documents.
  requestTimeout: 300_000,
});

await app.register(cors, {
  origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',').map((o) => o.trim()),
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

  request.log.error(error);
  const statusCode =
    typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
  return reply.status(statusCode).send({
    message: statusCode === 500 ? 'Internal server error.' : error.message,
    code: error.code ?? 'internal_error',
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────

app.get('/api/health', async () => ({ ok: true, model: config.openCodeGoModel }));

registerOcrRoute(app);
registerExtractRoute(app);
registerDetectFieldsRoute(app);

// ── Boot ─────────────────────────────────────────────────────────────────────

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info(`EndowFill AI server listening on ${config.host}:${config.port} (model: ${config.openCodeGoModel})`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
