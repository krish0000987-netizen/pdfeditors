# EDITOR

AI-Powered PDF Editor

Professional PDF editing with AI assistance. Built on the pdf-edit-engine for format-preserving text editing.

## Features

- Format-preserving PDF text editing (preserves fonts, layout, visual fidelity)
- AI-powered text editing with any OpenAI-compatible API
- Multi-provider AI gateway (OpenAI, Anthropic, Gemini, custom)
- Document versioning (original never overwritten)
- True PDF redaction
- Annotations (highlight, underline, sticky notes, etc.)
- Find & Replace with preview
- Bank statement support
- Audit logging
- Admin dashboard
- Supabase authentication & storage

## Architecture

```
EDITOR FRONTEND (Next.js 16 + React 19 + Tailwind v4)
        │
        ▼
EDITOR BACKEND API (Next.js API Routes)
        │
        ├──────────────────┐
        │                  │
        ▼                  ▼
    SUPABASE          PDF ENGINE SERVICE (FastAPI)
        │                  │
        │                  ▼
        │             pdf-edit-engine (pikepdf + fonttools)
        │
        ├── Auth
        ├── Database
        ├── Storage
        └── Audit Logs
```

## AI Architecture

```
Frontend
   │
   ▼
Backend AI Endpoint
   │
   ▼
AI Gateway (provider-agnostic)
   │
   ▼
Provider Adapter (OpenAI-compatible / Anthropic / Gemini / Custom)
   │
   ▼
External AI API (user-configured)
   │
   ▼
Structured JSON Operation
   │
   ▼
Validation → Preview → User Confirmation → PDF Engine
```

## Installation

```bash
cd editor
npm install
```

## Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SECRET_KEY=your-service-role-key

# Engine service (Python FastAPI backend)
ENGINE_URL=http://127.0.0.1:8000
ENGINE_API_KEY=your-engine-key

# AI settings (optional — can be configured per-user in UI)
AI_DEFAULT_PROVIDER=
AI_DEFAULT_MODEL=
```

## Supabase Setup

1. Create a Supabase project at https://supabase.com
2. Apply migrations from `supabase/migrations/`
3. Configure Storage bucket `documents` (private)
4. Enable Email auth provider
5. Add environment variables

## Engine Service Setup

```bash
cd engine-service
python -m venv .venv
source .venv/bin/activate
pip install -e ../pdf-edit-engine[dev]
pip install fastapi uvicorn
python main.py
```

## Development

```bash
# Terminal 1: Engine service
cd engine-service && python main.py

# Terminal 2: Next.js frontend
cd editor && npm run dev
```

## Testing

```bash
# PDF engine tests
cd pdf-edit-engine && make test

# Frontend lint
cd editor && npm run lint
```

## Production

Deploy the frontend to Vercel and the engine service to any Python-compatible host.

```bash
cd editor && npx vercel --prod --yes
```

## Security

- Server-side API key authentication on engine endpoints
- Supabase RLS on all tables
- Private storage with signed URLs
- AI API keys never exposed to client
- Input validation on all endpoints
- Audit logging for all operations

## License

MIT — pdf-edit-engine by Aryan B V. See `pdf-edit-engine/LICENSE` for details.
