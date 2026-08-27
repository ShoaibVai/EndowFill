# EndowFill

A collaborative PDF template editor and bulk generation tool built with React, TypeScript, and Vite — with AI-assisted form scanning that runs **100% self-hosted** (local PaddleOCR ONNX models, no external AI API keys).

## Features

### PDF Template Editor
- **Drag-and-drop field designer** - Upload PDF templates and place text, image, and signature fields visually
- **Real-time preview** - See exactly how filled PDFs will look before generation
- **Template versioning** - Automatic snapshots and change tracking

### Bulk PDF Generation
- **Excel/CSV import** - Upload data files to generate hundreds of filled PDFs
- **Field mapping** - Map Excel columns to template fields with intuitive UI
- **Validation rules** - Define validation constraints for data quality assurance
- **Conditional rules** - Dynamic field behavior based on data values
- **Custom filenames** - Pattern-based naming using your data fields
- **Progress tracking** - Real-time generation progress with pause/resume support

### AI Document Scanning (self-hosted OCR)
- **OCR any PDF/image** - PP-OCRv6 ONNX models run inside the server process: page markdown transcripts + per-line detection boxes
- **Structured extraction** - Deterministic label/value pairing with category classification (identity, contact, address, date, id numbers…)
- **Form field detection** - Geometry heuristics find fillable text fields (underlines), checkbox groups (square outlines), signature and photo areas on blank forms
- No OpenRouter/OpenAI/API keys — everything runs on your own server

### Workspace Collaboration
- **Multi-user workspaces** - Organize templates into shared workspaces
- **Role-based access** - Owner (full access), Editor (edit), Viewer (read-only)
- **Invite system** - Email invites and join requests for workspace access
- **Template sharing** - Export/import templates in portable `.pdftemplate` format

### Technical Features
- **Offline support** - IndexedDB for local storage and caching
- **Auto-save** - Automatic template saving to Supabase
- **Dark/Light/System theme** - Adaptive theming with CSS variables
- **Responsive design** - Tailwind CSS styling

## Tech Stack

- **React 19** with TypeScript
- **Vite** for fast development/build
- **pdfme** for PDF editing and generation
- **Supabase** for authentication and database
- **Zustand** for state management
- **Tailwind CSS** for styling
- **Fastify** (Node) — API server + static hosting
- **PaddleOCR PP-OCRv6** via `ppu-paddle-ocr` + ONNX Runtime — in-process OCR (no Python, no GPU)

## Project Structure

```
src/                      # React SPA (Vite)
├── components/           # editor, bulk, workspace, scan, layout, ui
├── pages/                # routes
├── services/             # Supabase queries and business logic
├── store/                # Zustand state
└── utils/                # apiClient, pdfRaster, aiChunk, …

server/                   # Fastify server (serves /api/* AND the built SPA)
├── src/
│   ├── index.ts          # entrypoint: API routes + static SPA + auth/rate limits
│   ├── config.ts         # env configuration
│   ├── validate.ts       # shared validation + bbox normalization
│   ├── routes/           # /api/ai/ocr, /api/ai/extract, /api/ai/detect-fields
│   └── ocr/              # local OCR: engine, markdown, extract rules, field heuristics, image utils
├── scripts/              # dev tools (smoke tests, memory checks, model warmup)
└── test/                 # vitest unit tests for the rule modules

Dockerfile                # single-container image (SPA + API + OCR models)
render.yaml               # Render Blueprint (deploy via dashboard: New → Blueprint)
```

## Getting Started (local development)

### Prerequisites

- Node.js 20+
- Supabase project (free tier works)

### Installation

```bash
npm install
cd server && npm install && cd ..
```

### Configuration

1. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` - Your anon/public key
2. (Optional) `server/.env`: set `SUPABASE_JWT_SECRET` to require auth on `/api/ai/*`.

### Development

```bash
npm run dev        # Vite dev server (frontend, port 5173)
cd server
npm run dev        # Fastify server (port 8787)
```

The Vite dev server proxies `/api` to `http://localhost:8787`.

### Build & test

```bash
npm run build      # frontend → dist/
npm run test       # frontend tests
cd server
npm run build      # server → server/dist/
npm run test       # server rule-module tests (vitest)
```

## Deployment (Render)

The whole site — frontend, API, and OCR — runs as **one Docker web service** on Render. No external AI API keys, no Python, no GPU required.

### One-time setup

1. Push this repo to GitHub (Render builds from git).
2. In the Render dashboard: **New → Blueprint** and select the repo — Render reads `render.yaml` and creates the `endowfill` free web service.
   - Or create it via CLI:
     ```bash
     render services create --name endowfill --type web_service \
       --repo https://github.com/<you>/EndowFill.git \
       --runtime docker --plan free --region oregon \
       --health-check-path /api/health --auto-deploy \
       --env-var OCR_MODEL_PRESET=v6-small \
       --env-var OCR_WARMUP=1 --env-var LOG_LEVEL=warn --confirm
     ```
3. Set the one secret in **Render → endowfill → Environment**:
   - `SUPABASE_JWT_SECRET` — Supabase → Project Settings → API → JWT Secret
   (Required so `/api/ai/*` only accepts authenticated requests.)
4. Optional: set `CORS_ORIGIN` to your `https://<service>.onrender.com` origin.

The Docker build runs `npm ci`, builds the SPA and the server, and **pre-downloads the OCR models into the image** — so a cold start never hits the network. Your site is live at `https://endowfill.onrender.com` (or your service's assigned subdomain).

### Notes on the free tier

- Free instances (512 MB RAM / 0.1 CPU) sleep after ~15 minutes of inactivity; the first request wakes them (~30-60 s cold start, models load in seconds since they're baked into the image).
- One OCR'd page takes roughly 5-30 s on the free tier. For faster OCR, switch the service plan to `starter` ($7/mo) or `standard` ($25/mo) in the dashboard — no code changes needed.
- Supabase remains externally hosted (unchanged).

## Database Schema

The application requires the following Supabase tables:

- `profiles` - User profile information
- `workspaces` - Workspace metadata
- `workspace_members` - User membership (workspace_id, user_id, role)
- `templates` - PDF template data and schema
- `join_requests` - Workspace join requests
- `template_snapshots` - Template version history

## License

MIT
