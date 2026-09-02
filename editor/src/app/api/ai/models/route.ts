import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProviderById } from "@/lib/ai/gateway";

/**
 * POST /api/ai/models
 * body: { provider_id } or { base_url, api_key }
 * Lists models from an OpenAI-compatible provider's /models endpoint.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();

  try {
    let baseUrl = String(body.base_url || "").replace(/\/+$/, "");
    let apiKey = String(body.api_key || "");

    if (body.provider_id) {
      const provider = await getProviderById(user.id, String(body.provider_id));
      baseUrl = provider.baseUrl;
      apiKey = provider.apiKey;
    }

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ models: [], detail: "Base URL and API key required" });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({
        models: [],
        detail: `Provider /models returned HTTP ${res.status} — enter the model ID manually.`,
      });
    }

    const data = await res.json();
    const models: string[] = (data?.data ?? data?.models ?? [])
      .map((m: any) => (typeof m === "string" ? m : m?.id ?? m?.name))
      .filter((m: unknown): m is string => typeof m === "string")
      .sort();

    return NextResponse.json({ models });
  } catch {
    return NextResponse.json({
      models: [],
      detail: "Could not reach the provider's /models endpoint — enter the model ID manually.",
    });
  }
}
