import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/documents";

/**
 * GET /api/docs/{id}/file?version=N[&download=1]
 * Streams the stored PDF (original or a version) through authenticated
 * server-side access — the bucket stays private; no public URLs.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("version");
  const asDownload = url.searchParams.get("download") === "1";

  const admin = createAdminClient();

  // Ownership check
  const { data: doc } = await admin
    .from("documents")
    .select("name, owner_id")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .single();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Resolve the version path
  let filePath: string | null = null;
  if (versionParam) {
    const { data: version } = await admin
      .from("document_versions")
      .select("file_path")
      .eq("document_id", documentId)
      .eq("version_number", parseInt(versionParam, 10))
      .single();
    filePath = version?.file_path ?? null;
  } else {
    const { data: version } = await admin
      .from("document_versions")
      .select("file_path")
      .eq("document_id", documentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .single();
    filePath = version?.file_path ?? null;
  }
  if (!filePath) return NextResponse.json({ error: "No file for this document" }, { status: 404 });

  const { data, error } = await admin.storage.from("documents").download(filePath);
  if (error || !data) {
    return NextResponse.json({ error: "File missing from storage" }, { status: 404 });
  }

  const safeName = doc.name.replace(/[^\w.\- ()]/g, "_");
  await audit({
    userId: user.id,
    documentId,
    action: asDownload ? "document_downloaded" : "document_opened",
    metadata: { version: versionParam ?? "latest" },
  });

  return new Response(data, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${asDownload ? "attachment" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=60",
    },
  });
}
