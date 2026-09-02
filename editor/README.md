# EDITOR

**AI-Powered PDF Editor**

Professional PDF editing with AI assistance — built around the
[ pdf-edit-engine ](https://github.com/AryanBV/pdf-edit-engine) for
format-preserving, content-stream-level PDF text editing.

---

## Features

- **Format-preserving PDF text editing** — the original engine rewrites text
  runs in place, preserving fonts, positions, layout and spacing wherever
  technically possible (with a per-edit fidelity report).
- **True redaction** — confirming a redaction removes the underlying text
  content from the PDF and draws an opaque cover box in a *new version*. The
  information is genuinely gone; the original file stays untouched.
- **Bring-your-own AI** — connect any OpenAI-compatible API (plus Anthropic- and
  Gemini-style wire formats) in Settings → AI. Keys are encrypted server-side
  and never sent to the browser. No Ollama, no bundled models.
- **AI operation pipeline** — prompt → scoped context extraction → provider →
  strict JSON operation → schema validation → preview → user confirmation →
  PDF engine → new version. The AI can never execute arbitrary code.
- **Immutable versioning** — every edit creates a version; version 1 is always
  the original upload. Compare mode shows original vs edited side by side.
- **Annotations** — highlights (engine-native QuadPoints), sticky notes,
  shapes and freehand, mirrored as metadata in Postgres.
- **Page tools** — rotate, delete, duplicate, insert blank, reorder, split,
  merge (via the engine).
- **Find & Replace** — per-page or whole-document, with dry-run preview and
  match counts before anything is applied.
- **Document library** — search, sort, filter (edited / AI processed /
  annotated / redacted / favorites), soft-delete trash with restore/purge,
  document classification (bank statement, invoice, contract, form…).
- **Admin panel** (`/admin`) — platform metrics, user management with roles and
  activation, metadata-only document view, AI usage per provider, and the full
  audit trail.
- **Security** — Supabase Auth, Row Level Security on every table, private
  storage bucket, authenticated server-side file streaming, engine API-key
  auth, path-traversal protection, AES-256-GCM encryption for AI keys, audit
  logging of every action.

## Architecture

```
EDITOR FRONTEND (Next.js 16 · React 19 · Tailwind v4)
        │
        ▼
EDITOR BACKEND API (Next.js Route Handlers)
        │
        ├──────────────────┐
        │                  │
        ▼                  ▼
    SUPABASE          ENGINE SERVICE (FastAPI)
        │                  │  unmodified pdf-edit-engine
        │                  ▼  (pikepdf + fonttools)
        │             PDF PROCESSING
        ├── Auth
        ├── Database (RLS)      AI:
        ├── Storage (private)   Frontend → Backend → AI Gateway
        └── Audit Logs          → Provider Adapter → any API
                                → JSON validation → Preview
                                → Confirmation → PDF Engine
```

The **pdf-edit-engine is never modified**. The FastAPI service in
`engine-service/` wraps it with a REST surface (`find`, `replace`,
`replace_all`, `batch_replace`, structural ops, page ops, annotations, true
redaction) and enforces an API key + work-root path containment. Every edit is
file-in / file-out: the Next.js backend records each output as an immutable new
version.

## Repository layout

```
pdf-edit-engine/   The PDF engine (DO NOT MODIFY — upstream library)
engine-service/    FastAPI wrapper around the engine (with flow tests)
editor/            The EDITOR web application (Next.js)
  src/app/(auth)     login · signup · forgot-password · reset-password
  src/app/(app)      dashboard · documents · editor · admin · settings
  src/app/api        auth · docs · engine proxy · ai · admin · audit
  src/lib/ai         provider-agnostic gateway + operation registry
  src/lib/engine     typed client for the engine service
  supabase/migrations  0001 core schema · 0002 AI/audit · 0003 storage
```

## Installation

```bash
git clone https://github.com/AryanBV/pdf-edit-engine.git
cd pdf-edit-engine            # repo root contains editor/ + engine-service/

# 1. Engine service
cd engine-service
python -m venv .venv && source .venv/bin/activate
pip install -e ../pdf-edit-engine
pip install fastapi uvicorn python-multipart
cp .env.example .env          # set ENGINE_API_KEY
python main.py                # http://127.0.0.1:8000

# 2. Web app (new terminal)
cd editor
npm install
cp .env.example .env.local    # fill in values (see below)
npm run dev                   # http://localhost:3000
```

## Environment variables (`editor/.env.local`)

| Variable | Used by | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client + server | publishable (anon) key |
| `SUPABASE_SECRET_KEY` | **server only** | secret/service key — RLS bypass |
| `APP_ENCRYPTION_KEY` | **server only** | AES-256-GCM key for stored AI keys (`openssl rand -base64 32`) |
| `ENGINE_URL` | server | engine service URL |
| `ENGINE_API_KEY` | server | must match engine's `ENGINE_API_KEY` |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | server | optional env fallback AI provider |

Never put real credentials in source, `.env.example`, docs or client code.
`NEXT_PUBLIC_*` values are visible to browsers by design; everything else must
stay server-side.

## Supabase setup

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Authentication → Providers → Email**: enable. For development you can
   turn on "Confirm email" = off to auto-confirm signups.
3. **Database → Migrations**: apply the three files in `editor/supabase/migrations/`
   in order (`0001_init.sql`, `0002_ai_audit.sql`, `0003_storage.sql`) —
   either `supabase db push` or paste each into the SQL editor.
   This creates profiles/documents/versions/annotations/AI tables/audit logs,
   all RLS policies, the signup trigger, and the private `documents` bucket.
4. **Make yourself an admin** (SQL editor):
   ```sql
   update public.profiles set role = 'admin' where id = (
     select id from auth.users where email = 'you@example.com'
   );
   ```
5. **API Keys → copy** the project URL, publishable key and secret key into
   `.env.local`.

Storage layout (private, service-role writes):
`documents/{user_id}/{document_id}/{original|versions|exports}/…`

## AI API setup

In-app: **Settings → AI → Add Provider**

1. **Provider name** — anything ("My OpenRouter", "Work Gateway").
2. **API type** — OpenAI Compatible (default), Anthropic Compatible, Gemini
   Compatible, or Custom (OpenAI-compatible fallback).
3. **Base URL** — exactly as your provider documents it. Include `/v1` only if
   your provider requires it; EDITOR never appends or strips paths on its own.
4. **API key** — pasted once, encrypted (AES-256-GCM) server-side, never
   returned to the browser or shown again.
5. **Model** — type it, or press the refresh icon to fetch the provider's
   `/models` list when available. No hard-coded model list.
6. **Test Connection** — sends a real minimal request and reports
   `✓ Connection successful` or `✕ <kind>: <detail>` (invalid key, model not
   found, timeout, rate limit, provider unavailable, malformed response).
7. **Save** — the first provider becomes active automatically; switch any time
   (also from the provider selector inside the editor's AI panel).

Production alternative: set `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` server-side;
they act as a fallback when a user has no provider configured.

EDITOR is provider-agnostic by design: the same operation registry and PDF
pipeline run identically no matter which API you connect, and no particular
provider or model is guaranteed to remain available or free.

## Testing

```bash
# AI operation validation + crypto (Vitest, 27 tests)
cd editor && npm test

# Typecheck / lint / production build
cd editor && npm run typecheck && npm run lint && npm run build

# PDF engine flow (upload → find → replace → highlight → TRUE redaction →
# page ops → traversal/auth checks) against a synthetic statement
cd engine-service && .venv/bin/python test_engine_flow.py

# Synthetic test documents (fictional data only)
python3 editor/scripts/generate_synthetic_pdfs.py ./test-docs
```

The engine flow test prints explicit proof that the original file's bytes are
unchanged after edits and that redacted text (`XXXX-1234`) is truly absent from
the redacted output's extracted text.

## Production

1. Deploy the engine service to any Python host (set a strong `ENGINE_API_KEY`,
   ideally keep it on a private network / behind mTLS).
2. Deploy `editor/` (e.g. Vercel) with all env vars set — including
   `APP_ENCRYPTION_KEY` and `SUPABASE_SECRET_KEY`, which must never be exposed
   client-side.
3. Apply the Supabase migrations to the production project.
4. Optionally configure the env-fallback AI provider; leave user-level keys to
   each user's Settings → AI.

## Security model

- **AuthN**: Supabase email/password; sessions via httpOnly cookies (`@supabase/ssr`);
  middleware protects `/dashboard`, `/documents`, `/editor`, `/settings`, `/admin`, `/ai`.
- **AuthZ**: RLS on every table (owner-scoped; admins read-only extras); admin
  routes re-verify the caller's role server-side on every request.
- **Deactivated users** cannot sign in; admins cannot demote/deactivate themselves.
- **Files**: private bucket; downloads only via an owned, authenticated route
  that streams the bytes (no public URLs, no signed-URL leakage).
- **Uploads**: extension + declared MIME + size + `%PDF` signature checks and
  engine-side integrity/page-count validation. Filenames are sanitized.
- **Engine**: API-key protected; every path is resolved and contained in the
  work root (traversal is refused).
- **AI**: strict operation registry — unknown operations and malformed fields
  are rejected server-side; mutating proposals always require explicit user
  confirmation; the proposal is re-validated on apply.
- **Audit**: `audit_logs` records uploads, opens, downloads, replaces,
  annotations, redactions, AI requests/previews/applies, version creation, and
  all administrative actions (including admin document-list views).

## API

Selected routes (all authenticated unless noted):

| Route | Purpose |
|---|---|
| `POST /api/auth/{signup,login,logout,forgot-password,reset-password}` | auth |
| `GET /api/auth/me` | profile + role |
| `GET/POST /api/docs`, `POST /api/docs/upload`, `POST /api/docs/new` | library |
| `GET/PATCH/POST/DELETE /api/docs/{id}` | detail, rename/favorite, duplicate, trash/restore/purge |
| `GET /api/docs/{id}/file?version=N` | authenticated PDF streaming |
| `GET /api/docs/{id}/versions` | version list |
| `POST /api/docs/{id}/engine` | engine proxy (find/replace/redact/pages/annotations…) |
| `GET/POST/PATCH/DELETE /api/ai/providers` | multi-provider CRUD (keys encrypted) |
| `POST /api/ai/test` | real connection test |
| `POST /api/ai/models` | provider model listing |
| `POST /api/ai/chat` | prompt → validated proposal (never executes) |
| `POST /api/ai/apply` | re-validate + execute + new version |
| `GET /api/ai/history` | request history |
| `GET /api/admin/{stats,users,documents,audit,ai}` | admin suite (role-gated) |

## License

EDITOR application code: MIT.
PDF engine: see [`pdf-edit-engine/LICENSE`](../pdf-edit-engine/LICENSE)
(pdf-edit-engine by Aryan B V).
