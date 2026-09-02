import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit, createVersion } from "@/lib/documents";

/** POST /api/docs/new — create an empty multi-page PDF document. */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const pages = Math.min(50, Math.max(1, parseInt(body.pages, 10) || 1));
    const name = String(body.name || "Untitled document.pdf")
      .replace(/[^\w.\- ()]/g, "_")
      .slice(0, 180);
    const docType = ["general", "bank_statement", "invoice", "contract", "form", "other"].includes(
      body.document_type
    )
      ? body.document_type
      : "general";

    const { engine } = await import("@/lib/engine/client");
    const created = await engine.createBlank(pages);

    // fetch the produced bytes and store them
    const file = await engine.downloadFile(created.output_path);
    const bytes = Buffer.from(file.data_b64, "base64");

    const docId = crypto.randomUUID();
    const storagePath = `${user.id}/${docId}/original/${name.endsWith(".pdf") ? name : `${name}.pdf`}`;

    const admin = createAdminClient();
    const { error: upErr } = await admin.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf" });
    if (upErr) throw new Error(upErr.message);

    const { data: doc, error: docErr } = await supabase
      .from("documents")
      .insert({
        id: docId,
        owner_id: user.id,
        name: storagePath.split("/").pop(),
        original_file_path: storagePath,
        mime_type: "application/pdf",
        file_size: bytes.byteLength,
        page_count: pages,
        status: "ready",
        document_type: docType,
      })
      .select()
      .single();
    if (docErr) throw new Error(docErr.message);

    await createVersion(supabase, {
      documentId: docId,
      userId: user.id,
      filePath: storagePath,
      operationType: "original",
      operationSummary: "New blank document",
      pageCount: pages,
    });

    await audit({ userId: user.id, documentId: docId, action: "document_created" });

    return NextResponse.json({ document: doc });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Create failed" },
      { status: 500 }
    );
  }
}
