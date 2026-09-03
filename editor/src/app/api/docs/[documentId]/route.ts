import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit, createVersion } from "@/lib/documents";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const admin = createAdminClient();

  const { data: doc, error } = await admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .single();
  if (error || !doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [{ data: versions }, { data: annotations }] = await Promise.all([
    admin
      .from("document_versions")
      .select("*")
      .eq("document_id", documentId)
      .order("version_number", { ascending: true }),
    admin
      .from("annotations")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    document: doc,
    versions: versions ?? [],
    annotations: annotations ?? [],
  });
}

/** Rename / set type / favorite toggle. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) {
    updates.name = body.name.trim().slice(0, 200);
  }
  if (typeof body.is_favorite === "boolean") updates.is_favorite = body.is_favorite;
  if (typeof body.document_type === "string") {
    const allowed = ["general", "bank_statement", "invoice", "contract", "form", "other"];
    if (allowed.includes(body.document_type)) updates.document_type = body.document_type;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("documents")
    .update(updates)
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ document: data });
}

/** Duplicate the document (copies latest file bytes to a new document). */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const admin = createAdminClient();

  const { data: doc } = await admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .single();
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: latestVersion } = await admin
    .from("document_versions")
    .select("file_path, page_count, file_size")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1)
    .single();
  if (!latestVersion) return NextResponse.json({ error: "No file to duplicate" }, { status: 400 });

  try {
    const { data: blob } = await admin.storage.from("documents").download(latestVersion.file_path);
    if (!blob) throw new Error("Source file missing");

    const newId = crypto.randomUUID();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const copyName = `${doc.name.replace(/\.pdf$/i, "")} (copy).pdf`;
    const newPath = `${user.id}/${newId}/original/${copyName}`;

    const { error: upErr } = await admin.storage
      .from("documents")
      .upload(newPath, bytes, { contentType: "application/pdf" });
    if (upErr) throw new Error(upErr.message);

    const { data: copy, error: insErr } = await admin
      .from("documents")
      .insert({
        id: newId,
        owner_id: user.id,
        name: copyName,
        original_file_path: newPath,
        mime_type: doc.mime_type,
        file_size: latestVersion.file_size ?? bytes.byteLength,
        page_count: latestVersion.page_count ?? doc.page_count,
        status: "ready",
        document_type: doc.document_type,
      })
      .select()
      .single();
    if (insErr) throw new Error(insErr.message);

    await createVersion(admin, {
      documentId: newId,
      userId: user.id,
      filePath: newPath,
      operationType: "original",
      operationSummary: `Duplicated from ${doc.name}`,
      pageCount: latestVersion.page_count ?? undefined,
    });

    await audit({
      userId: user.id,
      documentId: newId,
      action: "document_duplicated",
      metadata: { source: documentId },
    });

    return NextResponse.json({ document: copy });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Duplicate failed" },
      { status: 500 }
    );
  }
}

/** Trash actions: ?action=restore or ?action=purge (permanent). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const action = new URL(request.url).searchParams.get("action") || "trash";
  const admin = createAdminClient();

  if (action === "restore") {
    const { error } = await admin
      .from("documents")
      .update({ deleted_at: null })
      .eq("id", documentId)
      .eq("owner_id", user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await audit({ userId: user.id, documentId, action: "document_restored" });
    return NextResponse.json({ success: true });
  }

  if (action === "purge") {
    // gather storage paths to remove
    const { data: versions } = await admin
      .from("document_versions")
      .select("file_path")
      .eq("document_id", documentId);

    const { error: delError } = await admin
      .from("documents")
      .delete()
      .eq("id", documentId)
      .eq("owner_id", user.id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 400 });

    if (versions?.length) {
      await admin.storage
        .from("documents")
        .remove(versions.map((v) => v.file_path));
    }

    await audit({ userId: user.id, action: "document_purged", metadata: { documentId } });
    return NextResponse.json({ success: true });
  }

  // default: move to trash
  const { error } = await admin
    .from("documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .is("deleted_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await audit({ userId: user.id, documentId, action: "document_trashed" });
  return NextResponse.json({ success: true });
}
