# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# EndowFill — single-container deploy for Render (free tier friendly)
#
# One Node process serves:
#   • the built React SPA (static, with SPA fallback)  → /
#   • the Fastify API                                  → /api/*
#   • local PaddleOCR ONNX inference (in-process, no sidecar, no API keys)
#
# Models are downloaded into the image at build time (server/scripts/warmup.mjs)
# so cold starts never hit the network.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build frontend + server, warm the model cache ──────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /build

# Frontend build (needs .env.production with public VITE_* values)
COPY package.json package-lock.json ./
RUN npm ci
COPY .env.production ./
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# Server build (TypeScript → dist/)
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build

# Warm the PaddleOCR model cache (~/.cache/ppu-paddle-ocr)
COPY server/scripts/warmup.mjs ./warmup.mjs
ENV OCR_MODEL_PRESET=v6-small
RUN node warmup.mjs

# ── Stage 2: minimal runtime image ───────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /build/server/dist ./dist
COPY --from=build /build/dist /app/client
COPY --from=build /root/.cache/ppu-paddle-ocr /root/.cache/ppu-paddle-ocr

ENV PORT=10000 \
    HOST=0.0.0.0 \
    STATIC_DIR=/app/client \
    OCR_WARMUP=1

EXPOSE 10000
CMD ["node", "dist/index.js"]
