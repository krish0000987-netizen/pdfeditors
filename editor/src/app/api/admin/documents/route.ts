import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, adminAudit } from "../_helpers";

/**
 * GET /api/admin/documents — metadata view of all documents (no file
 * contents are exposed). Supports ?q= search and ?limit=.
 */
export async function GET(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const limit = Math.min(500, parseInt(url.searchParams.get("limit") || "200", 10));

  const admin = createAdminClient();

  let query = admin
    .from("documents")
    .select(
      `id, name, owner_id, page_count, file_size, status, document_type,
       created_at, updated_at, deleted_at, mime_type`
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (q) query = query.ilike("name", `%${q}%`);

  const { data: docs, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // owner emails via auth admin API (paged lightly; fine for reasonable sizes)
  const ownerIds = [...new Set((docs ?? []).map((d: any) => d.owner_id))];
  const emailMap = new Map<string, string>();
  for (const uid of ownerIds.slice(0, 200)) {
    const { data: u } = await admin.auth.admin.getUserById(uid);
    if (u?.user?.email) emailMap.set(uid, u.user.email);
  }

  await adminAudit(gate.userId, "admin_documents_viewed", { count: docs?.length ?? 0 });

  const documents = (docs ?? []).map((d: any) => ({
    ...d,
    owner_email: emailMap.get(d.owner_id) ?? "—",
  }));

  return NextResponse.json({ documents });
}
