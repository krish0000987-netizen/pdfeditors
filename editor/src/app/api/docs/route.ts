import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/documents";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const filter = url.searchParams.get("filter") || "all";
  const sort = url.searchParams.get("sort") || "recent";
  const inTrash = filter === "trash";

  let query = admin
    .from("documents")
    .select(
      `id, name, page_count, file_size, status, document_type, is_favorite,
       created_at, updated_at, deleted_at, mime_type,
       document_versions(version_number, operation_type)`
    )
    .eq("owner_id", user.id);

  query = inTrash ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);

  if (q) {
    query = query.ilike("name", `%${q}%`);
  }

  switch (filter) {
    case "favorites":
      query = query.eq("is_favorite", true);
      break;
    case "bank_statement":
      query = query.eq("document_type", "bank_statement");
      break;
    case "invoice":
      query = query.eq("document_type", "invoice");
      break;
    case "contract":
      query = query.eq("document_type", "contract");
      break;
    case "ai_processed":
    case "annotated":
    case "redacted":
    case "edited":
      // post-filtered below from joined versions
      break;
    default:
      break;
  }

  switch (sort) {
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "size":
      query = query.order("file_size", { ascending: false });
      break;
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    case "recent":
    default:
      query = query.order("updated_at", { ascending: false });
      break;
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let docs = data ?? [];

  if (["edited", "ai_processed", "annotated", "redacted"].includes(filter)) {
    docs = docs.filter((d: any) =>
      (d.document_versions ?? []).some((v: any) => {
        switch (filter) {
          case "edited":
            return v.version_number > 1;
          case "ai_processed":
            return v.operation_type === "ai";
          case "annotated":
            return ["annotation", "highlight", "note"].includes(v.operation_type);
          case "redacted":
            return v.operation_type === "redaction";
          default:
            return false;
        }
      })
    );
  }

  // strip the joined versions from the payload
  const documents = docs.map(({ document_versions, ...rest }: any) => ({
    ...rest,
    version_count: document_versions?.length ?? 0,
  }));

  return NextResponse.json({ documents });
}

/** Soft-delete (move to trash). */
export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await request.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = createAdminClient();
  const { error } = await admin
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("owner_id", user.id)
    .is("deleted_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await audit({ userId: user.id, documentId: id, action: "document_trashed" });
  return NextResponse.json({ success: true });
}
