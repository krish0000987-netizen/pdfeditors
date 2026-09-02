import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "../_helpers";

/** GET /api/admin/stats — platform-wide metrics for the admin dashboard. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();

  const [
    { count: userCount },
    { count: docCount },
    { count: processedDocs },
    { count: aiRequests },
    { count: aiOpsApplied },
    { data: storageRows },
    { count: versionCount },
    { data: recentUsers },
    { data: recentDocs },
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("documents").select("id", { count: "exact", head: true }),
    admin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready"),
    admin.from("ai_requests").select("id", { count: "exact", head: true }),
    admin
      .from("ai_operations")
      .select("id", { count: "exact", head: true })
      .eq("status", "applied"),
    admin.from("documents").select("file_size"),
    admin.from("document_versions").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id, name, role, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("documents")
      .select("id, name, page_count, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const storageBytes = (storageRows ?? []).reduce(
    (sum: number, r: any) => sum + (Number(r.file_size) || 0),
    0
  );

  return NextResponse.json({
    users: userCount ?? 0,
    documents: docCount ?? 0,
    pdfs_processed: processedDocs ?? 0,
    ai_requests: aiRequests ?? 0,
    ai_operations: aiOpsApplied ?? 0,
    versions: versionCount ?? 0,
    storage_bytes: storageBytes,
    recent_users: recentUsers ?? [],
    recent_documents: recentDocs ?? [],
  });
}
