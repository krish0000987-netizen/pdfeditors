import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProviderById, getActiveProvider, testProvider, type ResolvedProvider } from "@/lib/ai/gateway";

/**
 * POST /api/ai/test
 * Body: {} → test the active provider
 *       { provider_id } → test a stored provider
 *       { base_url, api_key, model, provider_type? } → test an unsaved draft
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    /* empty body = test active provider */
  }

  try {
    let provider: ResolvedProvider;

    if (typeof body.provider_id === "string" && body.provider_id) {
      provider = await getProviderById(user.id, body.provider_id as string);
    } else if (typeof body.base_url === "string" && body.base_url && body.api_key && body.model) {
      provider = {
        id: "draft",
        name: "draft",
        providerType: ((): ResolvedProvider["providerType"] => {
          const t = String(body.provider_type || "openai_compatible");
          return ["openai_compatible", "anthropic_compatible", "gemini_compatible", "custom"].includes(t)
            ? (t as ResolvedProvider["providerType"])
            : "openai_compatible";
        })(),
        baseUrl: String(body.base_url),
        apiKey: String(body.api_key),
        model: String(body.model),
        temperature: 0,
        maxTokens: 16,
        timeoutSeconds: 20,
        retryCount: 1,
      };
    } else {
      provider = await getActiveProvider(user.id);
    }

    const result = await testProvider(provider);

    // record test outcome for stored providers
    if (provider.id !== "draft" && provider.id !== "env") {
      const admin = createAdminClient();
      await admin
        .from("ai_providers")
        .update({ last_tested_at: new Date().toISOString(), last_test_ok: result.ok })
        .eq("id", provider.id)
        .eq("user_id", user.id);
    }

    return NextResponse.json({
      success: result.ok,
      detail: result.detail,
      provider: { id: provider.id, name: provider.name, model: provider.model },
    });
  } catch (e) {
    return NextResponse.json({
      success: false,
      detail: e instanceof Error ? e.message : "Test failed",
    });
  }
}
