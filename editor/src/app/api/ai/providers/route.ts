import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptSecret } from "@/lib/crypto";

/** never include api_key_encrypted in responses */
const SAFE_COLUMNS =
  "id, name, provider_type, base_url, model, temperature, max_tokens, timeout_seconds, retry_count, is_active, is_enabled, last_tested_at, last_test_ok, last_used_at, usage_requests, usage_input_tokens, usage_output_tokens, created_at, updated_at";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: providers } = await admin
    .from("ai_providers")
    .select(SAFE_COLUMNS)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const { data: settings } = await admin
    .from("user_ai_settings")
    .select("active_provider_id, fallback_provider_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const activeId = settings?.active_provider_id ?? null;
  const userProviders = providers ?? [];

  // If no user providers, include the system environment provider so the UI shows it active
  const systemProvider = process.env.AI_API_KEY
    ? [
        {
          id: "env",
          name: "Gemini Flash (System Default)",
          provider_type: "gemini_compatible",
          base_url: process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta",
          model: process.env.AI_MODEL || "gemini-3.6-flash",
          is_active: true,
          is_enabled: true,
        },
      ]
    : [];

  const allProviders = userProviders.length > 0 ? userProviders : systemProvider;

  return NextResponse.json({
    providers: allProviders,
    activeProviderId: activeId || (allProviders[0]?.id ?? null),
    active: allProviders.find((p) => p.id === (activeId || allProviders[0]?.id)) ?? null,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { name, provider_type, base_url, api_key, model, temperature, max_tokens, timeout_seconds, retry_count } =
    body;

  if (!name || !base_url || !api_key || !model) {
    return NextResponse.json(
      { error: "name, base_url, api_key and model are required" },
      { status: 400 }
    );
  }
  const allowedTypes = ["openai_compatible", "anthropic_compatible", "gemini_compatible", "custom"];
  const type = allowedTypes.includes(provider_type) ? provider_type : "openai_compatible";

  const admin = createAdminClient();
  const { data: provider, error } = await admin
    .from("ai_providers")
    .insert({
      user_id: user.id,
      name: String(name).slice(0, 80),
      provider_type: type,
      base_url: String(base_url).slice(0, 300),
      api_key_encrypted: encryptSecret(String(api_key)),
      model: String(model).slice(0, 120),
      temperature: Math.min(2, Math.max(0, Number(temperature) || 0.2)),
      max_tokens: Math.min(200000, Math.max(64, parseInt(max_tokens, 10) || 4096)),
      timeout_seconds: Math.min(300, Math.max(5, parseInt(timeout_seconds, 10) || 60)),
      retry_count: Math.min(3, Math.max(1, parseInt(retry_count, 10) || 1)),
      is_enabled: true,
    })
    .select(SAFE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // First provider becomes active automatically.
  const { count } = await admin
    .from("ai_providers")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if (count === 1) {
    await admin
      .from("user_ai_settings")
      .upsert({ user_id: user.id, active_provider_id: provider.id });
  }

  return NextResponse.json({ provider });
}

/** Update (api_key optional — absent means keep existing) or set active. */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();

  // setActive convenience action
  if (body.action === "set_active") {
    const { error } = await admin
      .from("user_ai_settings")
      .upsert({ user_id: user.id, active_provider_id: body.provider_id ?? null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }
  if (body.action === "set_fallback") {
    const { error } = await admin
      .from("user_ai_settings")
      .upsert({ user_id: user.id, fallback_provider_id: body.provider_id ?? null });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ success: true });
  }

  if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string") updates.name = body.name.slice(0, 80);
  if (typeof body.base_url === "string") updates.base_url = body.base_url.slice(0, 300);
  if (typeof body.model === "string") updates.model = body.model.slice(0, 120);
  if (body.temperature !== undefined)
    updates.temperature = Math.min(2, Math.max(0, Number(body.temperature) || 0.2));
  if (body.max_tokens !== undefined)
    updates.max_tokens = Math.min(200000, Math.max(64, parseInt(body.max_tokens, 10) || 4096));
  if (body.timeout_seconds !== undefined)
    updates.timeout_seconds = Math.min(300, Math.max(5, parseInt(body.timeout_seconds, 10) || 60));
  if (body.retry_count !== undefined)
    updates.retry_count = Math.min(3, Math.max(1, parseInt(body.retry_count, 10) || 1));
  if (typeof body.is_enabled === "boolean") updates.is_enabled = body.is_enabled;
  // Re-encrypt only when a new key is provided. Existing key is never echoed back.
  if (typeof body.api_key === "string" && body.api_key.length > 0) {
    updates.api_key_encrypted = encryptSecret(body.api_key);
  }

  const { data, error } = await admin
    .from("ai_providers")
    .update(updates)
    .eq("id", body.id)
    .eq("user_id", user.id)
    .select(SAFE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ provider: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin.from("ai_providers").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // clear active pointer if it pointed at the deleted provider
  await admin
    .from("user_ai_settings")
    .update({ active_provider_id: null })
    .eq("user_id", user.id)
    .eq("active_provider_id", id);

  return NextResponse.json({ success: true });
}
