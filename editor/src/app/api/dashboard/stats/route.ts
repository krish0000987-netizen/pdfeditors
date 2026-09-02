import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    { count: totalDocs },
    { data: pagesData },
    { count: aiOps },
    { data: versionCounts },
  ] = await Promise.all([
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id)
      .is("deleted_at", null),
    supabase.from("documents").select("page_count").eq("owner_id", user.id).is("deleted_at", null),
    supabase
      .from("ai_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    // versions beyond the original → "edited" documents
    supabase
      .from("document_versions")
      .select("document_id, version_number")
      .gt("version_number", 1),
  ]);

  const ownedIds = new Set(
    (await supabase.from("documents").select("id").eq("owner_id", user.id)).data?.map((d) => d.id) ?? []
  );
  const editedDocs = new Set(
    (versionCounts ?? [])
      .filter((v: any) => ownedIds.has(v.document_id))
      .map((v: any) => v.document_id)
  ).size;

  const totalPages = (pagesData ?? []).reduce((sum, d) => sum + (d.page_count || 0), 0);

  return NextResponse.json({
    total_documents: totalDocs ?? 0,
    edited_documents: editedDocs,
    total_pages: totalPages,
    ai_operations: aiOps ?? 0,
  });
}
