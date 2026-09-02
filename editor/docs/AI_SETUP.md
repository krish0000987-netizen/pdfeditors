# AI Setup for EDITOR

EDITOR's AI is a **provider-agnostic gateway**. The app never ships with a
model, never calls a hard-coded vendor, and does not use Ollama or any local
inference. You connect any remote API you have an account for.

```
User prompt
   ↓
Scoped PDF context (selected text / current page / selected pages / whole doc)
   ↓
AI Gateway  (src/lib/ai/gateway.ts)
   ↓
Provider Adapter  (openai_compatible · anthropic_compatible · gemini_compatible · custom)
   ↓
External AI API (user-configured)
   ↓
Structured JSON operation
   ↓
Schema validation  (src/lib/ai/operations.ts — strict registry)
   ↓
Preview → user confirmation → PDF engine → new version
```

## In-app configuration

**Settings → AI → Add Provider**

| Field | Meaning |
|---|---|
| Provider Name | Display label, e.g. "OpenRouter", "Work gateway" |
| API Type | `OpenAI Compatible` (default) / `Anthropic Compatible` / `Gemini Compatible` / `Custom` |
| Base URL | Exactly as your provider documents. Include `/v1` only if required — EDITOR does not assume or append it |
| API Key | Stored **AES-256-GCM encrypted** server-side; never returned to the browser |
| Model | Free-text, or fetched from the provider's `/models` via the refresh button when available |
| Temperature / Max Tokens / Timeout / Retries | Advanced defaults (0.2 / 4096 / 60 s / 1) |

**Test Connection** performs a real request and maps failures to specific
causes: `invalid_api_key`, `invalid_base_url`, `model_not_found`, `timeout`,
`rate_limited`, `provider_unavailable`, `malformed_response`.

Multiple providers can be configured; one is **Active**. The editor's AI panel
has its own provider selector so you can switch mid-session.

## Environment configuration (production fallback)

```env
AI_BASE_URL=https://provider.example.com/v1
AI_API_KEY=...
AI_MODEL=...
```

Used only when the user has no active provider. User-level providers take
priority; their keys live encrypted in the `ai_providers` table.

## What the AI is allowed to propose

The registry (`src/lib/ai/operations.ts`) defines the complete, exhaustive
operation set — anything else is rejected before execution:

`find_text`, `replace_text`, `replace_all`, `delete_text`, `insert_text`,
`highlight_text`, `add_annotation`, `redact_region`, `extract_text`,
`extract_table`, `summarize_document`, `rotate_page`, `delete_page`,
`duplicate_page`, `reorder_page`, `split_pdf`, `merge_pdf`

Validation enforces:

- exact operation types and field names (unknown ops rejected);
- primitive types for every required/optional field;
- geometry sanity (`rect` = `[x0,y0,x1,y1]`, `x1 > x0`, `y1 > y0`, bounded);
- redaction regions shaped `{page, bbox}`;
- `find` excerpts ≤ 2000 chars;
- confirmation is *forced* for any mutating operation, even if the model
  claims otherwise.

The AI's reply is parsed out of prose/code-fences (`extractJson`), validated,
stored as `ai_operations.status='proposed'`, shown as a preview card, and only
executed when you press **Confirm & Apply** — which re-validates the proposal
server-side and writes the result as a new version.

## Security rules enforced

- API keys are encrypted at rest and are **never** placed in React components,
  browser storage, `NEXT_PUBLIC_*` variables, logs, or client responses.
- Only the scoped text you chose is sent to the provider — never the raw PDF.
- The AI cannot execute code or arbitrary engine calls; only registry ops pass.
- Provider failures never corrupt documents: edits either complete into a new
  version or leave the current version untouched, with a retry option.
- Usage counters (requests, tokens in/out, last used) are tracked per provider
  and visible in the admin **AI Usage** view. Cost display is intentionally
  omitted when the provider does not supply pricing — EDITOR never invents it.

## Notes

- No specific provider, price or model availability is guaranteed — you own
  the relationship with your AI vendor.
- Custom REST providers must speak one of the supported wire formats
  (OpenAI-compatible is the safest default).
