import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "../_helpers";

/** GET /api/admin/audit — platform audit trail with optional filters. */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("user_id");
  const limit = Math.min(500, parseInt(url.searchParams.get("limit") || "100", 10));

  const admin = createAdminClient();

  let query = admin
    .from("audit_logs")
    .select(
      `id, user_id, document_id, action, metadata, created_at,
       profiles(name),
       documents(name)`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (action) query = query.eq("action", action);
  if (userId) query = query.eq("user_id", userId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const logs = (data ?? []).map((row: any) => ({
    id: row.id,
    user_id: row.user_id,
    user_name: row.profiles?.name ?? null,
    document_id: row.document_id,
    document_name: row.documents?.name ?? null,
    action: row.action,
    metadata: row.metadata,
    created_at: row.created_at,
  }));

  return NextResponse.json({ logs });
}
