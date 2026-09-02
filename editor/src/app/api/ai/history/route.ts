import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/ai/history — the user's AI request history with document names. */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(100, parseInt(new URL(request.url).searchParams.get("limit") || "50", 10));

  const { data, error } = await supabase
    .from("ai_requests")
    .select(
      `id, prompt, model, provider, status, error, created_at, document_id,
       documents(name)`
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const history = (data ?? []).map((row: any) => ({
    id: row.id,
    prompt: row.prompt,
    model: row.model,
    provider: row.provider,
    status: row.status,
    error: row.error,
    created_at: row.created_at,
    document_id: row.document_id,
    document_name: row.documents?.name ?? null,
  }));

  return NextResponse.json({ history });
}
