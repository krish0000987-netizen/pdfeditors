import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getActiveProvider,
  extractContext,
  buildSystemPrompt,
  callProvider,
  AIProviderError,
  type AIContext,
} from "@/lib/ai/gateway";
import { validateProposal, AI_OPERATIONS } from "@/lib/ai/operations";
import { audit } from "@/lib/documents";

const ALL_OPS = Object.keys(AI_OPERATIONS) as Array<keyof typeof AI_OPERATIONS>;

/**
 * POST /api/ai/chat
 * body: { prompt, documentId, context: "selected"|"page"|"pages"|"document",
 *         pages?: number[], selectedText?: string, providerId?: string }
 *
 * Pipeline: context → provider → structured JSON → schema validation →
 * persisted as ai_operations with status "proposed". Nothing is executed here.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const prompt = String(body.prompt || "").trim();
  const documentId = body.documentId ? String(body.documentId) : null;
  const context = (["selected", "page", "pages", "document"].includes(body.context)
    ? body.context
    : "page") as AIContext;

  if (!prompt) return NextResponse.json({ error: "Prompt required" }, { status: 400 });
  if (!documentId) return NextResponse.json({ error: "documentId required" }, { status: 400 });

  const admin = createAdminClient();

  // resolve provider (explicit override → active → env fallback)
  let provider;
  try {
    provider = body.providerId
      ? await (async () => {
          const { getProviderById } = await import("@/lib/ai/gateway");
          return getProviderById(user.id, String(body.providerId));
        })()
      : await getActiveProvider(user.id);
  } catch (e) {
    return NextResponse.json(
      {
        explanation:
          e instanceof Error ? e.message : "No AI provider configured. Add one in Settings → AI.",
        proposal: null,
      },
      { status: 200 }
    );
  }

  // record the request
  const { data: aiRequest } = await admin
    .from("ai_requests")
    .insert({
      user_id: user.id,
      document_id: documentId,
      prompt: prompt.slice(0, 4000),
      model: provider.model,
      provider: provider.name,
      status: "processing",
    })
    .select("id")
    .single();

  try {
    // 1. Extract only the scoped document text
    const docContext = await extractContext(user.id, documentId, context, {
      pages: Array.isArray(body.pages) ? body.pages.slice(0, 10).map(Number) : undefined,
      selectedText: typeof body.selectedText === "string" ? body.selectedText.slice(0, 8000) : undefined,
    });

    // 2. Call the provider through the adapter
    const system = buildSystemPrompt(ALL_OPS, docContext.pageCount);
    const userMessage = [
      `USER REQUEST:\n${prompt}`,
      "",
      `DOCUMENT CONTEXT (${context}${docContext.truncationNote ? ", truncated" : ""}):`,
      docContext.text,
    ].join("\n");

    const response = await callProvider(provider, { system, user: userMessage, json: false });

    // 3. Parse + validate the structured output
    const { extractJson } = await import("@/lib/ai/operations");
    let raw: unknown;
    try {
      raw = extractJson(response.content);
    } catch {
      // Natural language conversational or informational response
      if (aiRequest) {
        await admin.from("ai_requests").update({ status: "succeeded" }).eq("id", aiRequest.id);
      }
      return NextResponse.json({
        explanation: response.content.trim(),
        proposal: null,
      });
    }

    const rawObj = raw as Record<string, unknown>;
    // If raw JSON contains no operations array or empty operations (informational/chat)
    if (!rawObj || !Array.isArray(rawObj.operations) || rawObj.operations.length === 0) {
      if (aiRequest) {
        await admin.from("ai_requests").update({ status: "succeeded" }).eq("id", aiRequest.id);
      }
      const explanation =
        typeof rawObj?.explanation === "string" && rawObj.explanation.trim()
          ? rawObj.explanation.trim()
          : typeof rawObj?.answer === "string"
          ? rawObj.answer.trim()
          : response.content.trim();

      return NextResponse.json({
        explanation,
        proposal: null,
      });
    }

    const validation = validateProposal(raw);
    if (!validation.ok || !validation.proposal) {
      if (aiRequest) {
        await admin
          .from("ai_requests")
          .update({ status: "rejected", error: validation.errors.join("; ").slice(0, 500) })
          .eq("id", aiRequest.id);
      }
      await audit({
        userId: user.id,
        documentId,
        action: "ai_request",
        metadata: { prompt: prompt.slice(0, 200), outcome: "invalid_response", errors: validation.errors.slice(0, 3) },
      });
      return NextResponse.json({
        explanation: `The AI proposed an operation that could not be validated: ${validation.errors[0] ?? "invalid response"}`,
        proposal: null,
        validationErrors: validation.errors.slice(0, 5),
      });
    }

    const proposal = validation.proposal;

    // 4. Persist the validated proposal for the confirmation step
    if (aiRequest) {
      await admin.from("ai_requests").update({ status: "succeeded" }).eq("id", aiRequest.id);
      const { data: opRow } = await admin
        .from("ai_operations")
        .insert({
          ai_request_id: aiRequest.id,
          document_id: documentId,
          operation_json: proposal,
          status: "proposed",
        })
        .select("id")
        .single();

      await audit({
        userId: user.id,
        documentId,
        action: "ai_preview",
        metadata: {
          intent: proposal.intent,
          operations: proposal.operations.length,
          provider: provider.name,
          model: provider.model,
        },
      });

      return NextResponse.json({
        explanation: proposal.explanation,
        proposal,
        requestId: aiRequest.id,
        operationId: opRow?.id ?? null,
        provider: { id: provider.id, name: provider.name, model: provider.model },
        warnings: validation.warnings,
      });
    }

    return NextResponse.json({ explanation: proposal.explanation, proposal });
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI request failed";
    if (aiRequest) {
      await admin
        .from("ai_requests")
        .update({ status: "failed", error: message.slice(0, 500) })
        .eq("id", aiRequest.id);
    }
    return NextResponse.json({ explanation: `AI request failed: ${message}`, proposal: null });
  }
}
