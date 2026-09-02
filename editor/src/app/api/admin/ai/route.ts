import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "../_helpers";

/** GET /api/admin/ai — AI usage overview across all users. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();

  const [
    { data: providers },
    { count: totalRequests },
    { count: appliedOps },
    { data: recent },
  ] = await Promise.all([
    admin
      .from("ai_providers")
      .select(
        `id, user_id, name, provider_type, model, is_enabled, is_active,
         usage_requests, usage_input_tokens, usage_output_tokens,
         last_used_at, last_tested_at, last_test_ok`
      )
      .order("usage_requests", { ascending: false })
      .limit(100),
    admin.from("ai_requests").select("id", { count: "exact", head: true }),
    admin
      .from("ai_operations")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied"),
    admin
      .from("ai_requests")
      .select(
        `id, prompt, model, provider, status, created_at,
         profiles(name)`
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return NextResponse.json({
    totals: {
      requests: totalRequests ?? 0,
      applied_operations: appliedOps ?? 0,
      input_tokens: (providers ?? []).reduce((s: number, p: any) => s + (p.usage_input_tokens || 0), 0),
      output_tokens: (providers ?? []).reduce((s: number, p: any) => s + (p.usage_output_tokens || 0), 0),
    },
    providers: providers ?? [],
    recent_requests: (recent ?? []).map((r: any) => ({
      ...r,
      user_name: r.profiles?.name ?? null,
    })),
  });
}
