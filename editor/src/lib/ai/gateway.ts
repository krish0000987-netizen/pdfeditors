import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { extractJson } from "@/lib/ai/operations";
import type { AIOperationType } from "@/lib/ai/operations";

/**
 * Provider-agnostic AI gateway. The editor only talks to this interface;
 * provider adapters translate to the wire format of each API family.
 * No provider SDK is used — just HTTP — so any OpenAI-compatible endpoint
 * works without new dependencies.
 */

export type ProviderType = "openai_compatible" | "anthropic_compatible" | "gemini_compatible" | "custom";

export interface ResolvedProvider {
  id: string; // provider row id or "env"
  name: string;
  providerType: ProviderType;
  baseUrl: string;
  apiKey: string; // decrypted — server-side only, never leaves the server
  model: string;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  retryCount: number;
}

export interface AIChatRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  /** when true the gateway parses the reply as JSON and throws on failure */
  json?: boolean;
}

export interface AIChatResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number } | null;
  model: string;
}

class AIProviderError extends Error {
  constructor(
    message: string,
    public kind:
      | "invalid_api_key"
      | "invalid_base_url"
      | "model_not_found"
      | "timeout"
      | "rate_limited"
      | "provider_unavailable"
      | "malformed_response"
      | "unknown"
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export { AIProviderError };

function classifyStatus(status: number): AIProviderError["kind"] {
  if (status === 401 || status === 403) return "invalid_api_key";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "unknown";
}

/** Normalize a user-provided base URL: keep it exactly, no /v1 invention. */
function normalizeBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutSeconds: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new AIProviderError(`Request timed out after ${timeoutSeconds}s`, "timeout");
    }
    throw new AIProviderError(
      `Could not reach provider: ${e instanceof Error ? e.message : "network error"}`,
      "provider_unavailable"
    );
  } finally {
    clearTimeout(timer);
  }
}

// ── provider adapters ────────────────────────────────────────────

async function callOpenAICompatible(
  p: ResolvedProvider,
  req: AIChatRequest
): Promise<AIChatResponse> {
  const url = `${normalizeBase(p.baseUrl)}/chat/completions`;
  let res: Response;
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
        },
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          temperature: req.temperature ?? p.temperature,
          max_tokens: req.maxTokens ?? p.maxTokens,
        }),
      },
      p.timeoutSeconds
    );
  } catch (e) {
    if (e instanceof AIProviderError && e.kind === "provider_unavailable" && normalizeBase(p.baseUrl).length === 0) {
      throw new AIProviderError("Base URL is empty", "invalid_base_url");
    }
    throw e;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AIProviderError(
      `Provider returned HTTP ${res.status}: ${text.slice(0, 300)}`,
      classifyStatus(res.status)
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new AIProviderError("Provider returned non-JSON response", "malformed_response");
  }
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AIProviderError("Provider response missing choices[0].message.content", "malformed_response");
  }
  return {
    content,
    usage: data?.usage
      ? {
          inputTokens: data.usage.prompt_tokens ?? 0,
          outputTokens: data.usage.completion_tokens ?? 0,
        }
      : null,
    model: data?.model ?? p.model,
  };
}

async function callAnthropicCompatible(
  p: ResolvedProvider,
  req: AIChatRequest
): Promise<AIChatResponse> {
  const url = `${normalizeBase(p.baseUrl)}/messages`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": p.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: p.model,
        max_tokens: req.maxTokens ?? p.maxTokens,
        temperature: req.temperature ?? p.temperature,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
      }),
    },
    p.timeoutSeconds
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AIProviderError(
      `Provider returned HTTP ${res.status}: ${text.slice(0, 300)}`,
      classifyStatus(res.status)
    );
  }
  const data: any = await res.json().catch(() => {
    throw new AIProviderError("Provider returned non-JSON response", "malformed_response");
  });
  const block = data?.content?.find?.((c: any) => c?.type === "text");
  if (typeof block?.text !== "string") {
    throw new AIProviderError("Provider response missing text block", "malformed_response");
  }
  return {
    content: block.text,
    usage: data?.usage
      ? { inputTokens: data.usage.input_tokens ?? 0, outputTokens: data.usage.output_tokens ?? 0 }
      : null,
    model: data?.model ?? p.model,
  };
}

async function callGeminiCompatible(
  p: ResolvedProvider,
  req: AIChatRequest
): Promise<AIChatResponse> {
  const url = `${normalizeBase(p.baseUrl)}/models/${encodeURIComponent(p.model)}:generateContent`;
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": p.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: req.temperature ?? p.temperature,
          maxOutputTokens: req.maxTokens ?? p.maxTokens,
        },
      }),
    },
    p.timeoutSeconds
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AIProviderError(
      `Provider returned HTTP ${res.status}: ${text.slice(0, 300)}`,
      classifyStatus(res.status)
    );
  }
  const data: any = await res.json().catch(() => {
    throw new AIProviderError("Provider returned non-JSON response", "malformed_response");
  });
  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text ?? "")
    .join("");
  if (typeof text !== "string") {
    throw new AIProviderError("Provider response missing candidates content", "malformed_response");
  }
  return {
    content: text,
    usage: data?.usageMetadata
      ? {
          inputTokens: data.usageMetadata.promptTokenCount ?? 0,
          outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        }
      : null,
    model: p.model,
  };
}

/** Custom providers must speak one of the supported shapes; default to OpenAI-compatible. */
async function callCustom(p: ResolvedProvider, req: AIChatRequest): Promise<AIChatResponse> {
  return callOpenAICompatible(p, req);
}

export async function callProvider(p: ResolvedProvider, req: AIChatRequest): Promise<AIChatResponse> {
  const maxAttempts = Math.max(1, Math.min(3, p.retryCount || 1));
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      switch (p.providerType) {
        case "anthropic_compatible":
          return await callAnthropicCompatible(p, req);
        case "gemini_compatible":
          return await callGeminiCompatible(p, req);
        case "custom":
          return await callCustom(p, req);
        case "openai_compatible":
        default:
          return await callOpenAICompatible(p, req);
      }
    } catch (e) {
      lastError = e;
      const retryable =
        e instanceof AIProviderError &&
        (e.kind === "timeout" || e.kind === "rate_limited" || e.kind === "provider_unavailable");
      if (!retryable || attempt === maxAttempts) break;
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  throw lastError;
}

// ── provider resolution (per-user DB config, falling back to env) ──

export async function getActiveProvider(userId: string): Promise<ResolvedProvider> {
  const admin = createAdminClient();

  const { data: settings } = await admin
    .from("user_ai_settings")
    .select("active_provider_id")
    .eq("user_id", userId)
    .maybeSingle();

  let providerId = settings?.active_provider_id ?? null;
  if (!providerId) {
    const { data: anyEnabled } = await admin
      .from("ai_providers")
      .select("id")
      .eq("user_id", userId)
      .eq("is_enabled", true)
      .limit(1)
      .maybeSingle();
    providerId = anyEnabled?.id ?? null;
  }

  if (providerId) {
    const { data: provider } = await admin
      .from("ai_providers")
      .select("*")
      .eq("id", providerId)
      .single();
    if (provider) {
      return {
        id: provider.id,
        name: provider.name,
        providerType: provider.provider_type as ProviderType,
        baseUrl: provider.base_url,
        apiKey: decryptSecret(provider.api_key_encrypted),
        model: provider.model,
        temperature: provider.temperature ?? 0.2,
        maxTokens: provider.max_tokens ?? 4096,
        timeoutSeconds: provider.timeout_seconds ?? 60,
        retryCount: provider.retry_count ?? 1,
      };
    }
  }

  // Environment fallback (server-side only)
  const baseUrl = process.env.AI_BASE_URL || "";
  const apiKey = process.env.AI_API_KEY || "";
  const model = process.env.AI_MODEL || "";
  if (!baseUrl || !apiKey || !model) {
    throw new AIProviderError(
      "No AI provider configured. Add one in Settings → AI or set AI_BASE_URL / AI_API_KEY / AI_MODEL.",
      "invalid_base_url"
    );
  }
  return {
    id: "env",
    name: "Environment default",
    providerType: "openai_compatible",
    baseUrl,
    apiKey,
    model,
    temperature: 0.2,
    maxTokens: 4096,
    timeoutSeconds: 60,
    retryCount: 1,
  };
}

export async function getProviderById(userId: string, providerId: string): Promise<ResolvedProvider> {
  const admin = createAdminClient();
  const { data: provider } = await admin
    .from("ai_providers")
    .select("*")
    .eq("id", providerId)
    .eq("user_id", userId)
    .single();
  if (!provider) throw new AIProviderError("Provider not found", "unknown");
  return {
    id: provider.id,
    name: provider.name,
    providerType: provider.provider_type as ProviderType,
    baseUrl: provider.base_url,
    apiKey: decryptSecret(provider.api_key_encrypted),
    model: provider.model,
    temperature: provider.temperature ?? 0.2,
    maxTokens: provider.max_tokens ?? 4096,
    timeoutSeconds: provider.timeout_seconds ?? 60,
    retryCount: provider.retry_count ?? 1,
  };
}

/** Minimal connectivity test against a configured provider. */
export async function testProvider(p: ResolvedProvider): Promise<{ ok: boolean; detail: string; modelEcho?: string }> {
  try {
    const res = await callProvider(p, {
      system: "You are a connectivity probe. Reply with the single word: pong",
      user: "ping",
      maxTokens: 16,
      temperature: 0,
    });
    return { ok: true, detail: `Model responded (${res.content.trim().slice(0, 40) || "empty reply"})`, modelEcho: res.model };
  } catch (e) {
    if (e instanceof AIProviderError) {
      return { ok: false, detail: `${e.kind}: ${e.message}` };
    }
    return { ok: false, detail: e instanceof Error ? e.message : "Unknown error" };
  }
}

/** Mark provider usage counters (best-effort). */
export async function recordUsage(
  providerId: string,
  usage: { inputTokens: number; outputTokens: number } | null
) {
  if (providerId === "env") return;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("ai_providers")
      .select("usage_requests, usage_input_tokens, usage_output_tokens")
      .eq("id", providerId)
      .single();
    if (!data) return;
    await admin
      .from("ai_providers")
      .update({
        usage_requests: (data.usage_requests ?? 0) + 1,
        usage_input_tokens: (data.usage_input_tokens ?? 0) + (usage?.inputTokens ?? 0),
        usage_output_tokens: (data.usage_output_tokens ?? 0) + (usage?.outputTokens ?? 0),
        last_used_at: new Date().toISOString(),
      })
      .eq("id", providerId);
  } catch {
    // best effort
  }
}

// ── document context extraction ──────────────────────────────────

export type AIContext = "selected" | "page" | "pages" | "document";

export interface DocumentContext {
  text: string;
  pageCount: number;
  truncationNote?: string;
}

const MAX_CONTEXT_CHARS = 24000;

/**
 * Pull only the text the user scoped the AI to. Never ships the raw PDF to
 * the provider — just the relevant extracted text.
 */
export async function extractContext(
  userId: string,
  documentId: string,
  context: AIContext,
  opts?: { pages?: number[]; selectedText?: string }
): Promise<DocumentContext> {
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { engine } = await import("@/lib/engine/client");

  const { data: doc } = await supabase
    .from("documents")
    .select("id, page_count, document_versions(file_path, version_number)")
    .eq("id", documentId)
    .eq("owner_id", userId)
    .single();
  if (!doc) throw new Error("Document not found");

  const versions = (doc.document_versions ?? []) as Array<{ file_path: string; version_number: number }>;
  const latest = versions.sort((a, b) => b.version_number - a.version_number)[0];
  if (!latest) throw new Error("Document has no versions");

  const pageCount = doc.page_count ?? 0;

  if (context === "selected" && opts?.selectedText) {
    return { text: opts.selectedText.slice(0, MAX_CONTEXT_CHARS), pageCount };
  }

  if (context === "page") {
    const page = opts?.pages?.[0] ?? 0;
    const { text } = await engine.getText(latest.file_path, page);
    return {
      text: text.slice(0, MAX_CONTEXT_CHARS),
      pageCount,
      truncationNote: text.length > MAX_CONTEXT_CHARS ? "Page text truncated" : undefined,
    };
  }

  if (context === "pages" && opts?.pages?.length) {
    const parts: string[] = [];
    for (const p of opts.pages.slice(0, 10)) {
      const { text } = await engine.getText(latest.file_path, p);
      parts.push(`--- Page ${p + 1} ---\n${text}`);
    }
    const joined = parts.join("\n\n");
    return {
      text: joined.slice(0, MAX_CONTEXT_CHARS),
      pageCount,
      truncationNote: joined.length > MAX_CONTEXT_CHARS ? "Multi-page text truncated" : undefined,
    };
  }

  // entire document — cap pages to keep requests bounded
  const { text } = await engine.getText(latest.file_path);
  return {
    text: text.slice(0, MAX_CONTEXT_CHARS),
    pageCount,
    truncationNote: text.length > MAX_CONTEXT_CHARS ? "Document text truncated to fit context window" : undefined,
  };
}

/** Build the strict system prompt constraining the AI to the operation registry. */
export function buildSystemPrompt(allowed: AIOperationType[], pageCount: number): string {
  const opDocs: Record<string, string> = {
    find_text: '{ "type": "find_text", "find": "<text>", "page": <0-indexed int, optional> }',
    replace_text:
      '{ "type": "replace_text", "find": "<exact existing text>", "replace": "<new text>", "page": <optional>, "match_index": <optional int> }',
    replace_all: '{ "type": "replace_all", "find": "<exact existing text>", "replace": "<new text>" }',
    delete_text: '{ "type": "delete_text", "find": "<exact existing text>", "page": <optional> }',
    insert_text:
      '{ "type": "insert_text", "page": <int>, "x": <pdf x>, "y": <pdf y>, "text": "<text>", "font_size": <optional> }',
    highlight_text: '{ "type": "highlight_text", "find": "<exact text>", "page": <optional> }',
    add_annotation:
      '{ "type": "add_annotation", "page": <int>, "subtype": "Text|FreeText|Square|Circle|Line|Ink", "rect": [x0,y0,x1,y1], "contents": "<note text>" }',
    redact_region:
      '{ "type": "redact_region", "regions": [ { "page": <int>, "bbox": [x0,y0,x1,y1] } ] }',
    extract_text: '{ "type": "extract_text", "page": <optional> }',
    extract_table: '{ "type": "extract_table", "page": <optional>, "find": "<optional header text>" }',
    summarize_document: '{ "type": "summarize_document" }',
    rotate_page: '{ "type": "rotate_page", "page": <int>, "angle": 90|180|270 }',
    delete_page: '{ "type": "delete_page", "page": <int> }',
    duplicate_page: '{ "type": "duplicate_page", "page": <int> }',
    reorder_page: '{ "type": "reorder_page", "page_order": [<new order as 0-indexed ints>] }',
    split_pdf: '{ "type": "split_pdf" }',
    merge_pdf: '{ "type": "merge_pdf", "source_document_ids": ["<document uuid>"] }',
  };

  const registry = allowed.map((t) => `- ${opDocs[t] ?? t}`).join("\n");

  return `You are EDITOR AI, an assistant embedded in a professional PDF editor. You convert the user's request into a STRICT JSON plan of PDF operations. You never execute anything yourself; a validator and the PDF engine handle execution.

DOCUMENT: ${pageCount} pages. Pages are 0-indexed.

ALLOWED OPERATIONS (you must only use these, with exactly these field names):
${registry}

RULES:
1. Respond with ONE JSON object and nothing else. No markdown, no prose outside JSON.
2. Schema:
{
  "intent": "<short verb phrase>",
  "confidence": <0.0-1.0>,
  "explanation": "<one or two sentences describing what will happen>",
  "operations": [ ...one or more allowed operations... ],
  "requires_confirmation": <true if any operation modifies the document>
}
3. "find" values must be copied EXACTLY from the document text provided below — same characters, same case. Never invent text that is not present.
4. Use replace_all only when the user clearly wants every occurrence; otherwise replace_text with a specific page.
5. For redaction, use redact_region with regions only when you can derive bboxes from find results; otherwise propose find_text first and let the user pick.
6. If the request cannot be fulfilled with the allowed operations, return:
{"intent":"unsupported","confidence":0.0,"explanation":"<why>","operations":[],"requires_confirmation":false}
7. Never include credentials, code, or non-PDF operations.`;
}
