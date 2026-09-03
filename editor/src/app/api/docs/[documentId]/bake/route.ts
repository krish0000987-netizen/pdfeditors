import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedDocument, insertVersion, getLatestVersion } from "@/lib/db";
import { audit } from "@/lib/documents";

/**
 * POST /api/docs/{id}/bake
 * Receives the newly edited/baked PDF bytes from the MS Word-style editor,
 * saves it into Supabase Storage as a new immutable version, and logs an audit trail.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId } = await params;
  const doc = await getOwnedDocument(documentId, user.id);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const summary = (formData.get("summary") as string) || "Visual edits & additions saved";

    if (!file) {
      return NextResponse.json({ error: "No PDF file provided" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const latest = await getLatestVersion(documentId);
    const nextVer = (latest?.version_number || 1) + 1;
    const storagePath = `${user.id}/${documentId}/versions/v${nextVer}_${Date.now()}.pdf`;

    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from("documents")
      .upload(storagePath, bytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (upErr) throw new Error(upErr.message);

    const version = await insertVersion({
      documentId,
      userId: user.id,
      filePath: storagePath,
      operationType: "ms_word_edit",
      operationSummary: summary,
      pageCount: doc.page_count,
    });

    await audit({
      userId: user.id,
      documentId,
      action: "document_edited_visual",
      metadata: { version: nextVer, summary },
    });

    return NextResponse.json({
      success: true,
      versionNumber: nextVer,
      version,
      filePath: storagePath,
    });
  } catch (err) {
    console.error("Bake save error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save baked version" },
      { status: 500 }
    );
  }
}
