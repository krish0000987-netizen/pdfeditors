import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/documents";

const MAX_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * Secure upload: never trust the filename. Validate declared MIME type,
 * extension, size and the PDF signature server-side, then store in the
 * private bucket under {user}/{document}/original/… and register with the
 * engine for page counting.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const documentType = String(formData.get("document_type") || "general");

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    // 1. Extension + declared MIME checks (untrusted input)
    const name = file.name || "document.pdf";
    if (!name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Only .pdf files are accepted" }, { status: 400 });
    }
    if (file.type && file.type !== "application/pdf" && file.type !== "application/octet-stream") {
      return NextResponse.json({ error: `Unexpected content type: ${file.type}` }, { status: 400 });
    }
    // 2. Size check
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: "File too large (max 100MB)" }, { status: 413 });
    }
    if (file.size < 100) {
      return NextResponse.json({ error: "File too small to be a PDF" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // 3. Magic-byte signature check — %PDF-
    if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) {
      return NextResponse.json({ error: "File is not a valid PDF (bad signature)" }, { status: 400 });
    }

    // 4. Determine page count: try engine first, fallback to pure JS parser if engine is offline
    let pageCount = 1;
    try {
      const { engine } = await import("@/lib/engine/client");
      const created = await engine.createFromBytes(Buffer.from(bytes).toString("base64"));
      if (created && typeof created.page_count === "number") {
        pageCount = created.page_count;
      }
    } catch (engineErr) {
      console.warn("Engine service not reachable, using fallback page counter:", engineErr);
      try {
        const text = new TextDecoder("latin1").decode(bytes);
        const countMatches = [...text.matchAll(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/gi)];
        if (countMatches.length > 0) {
          const count = parseInt(countMatches[countMatches.length - 1][1], 10);
          if (count > 0) pageCount = count;
        } else {
          const pageMatches = text.match(/\/Type\s*\/Page\b(?!\s*s)/gi);
          if (pageMatches && pageMatches.length > 0) {
            pageCount = pageMatches.length;
          }
        }
      } catch {
        pageCount = 1;
      }
    }

    const safeName = name.replace(/[^\w.\- ()]/g, "_").slice(0, 180);
    const docId = crypto.randomUUID();
    const storagePath = `${user.id}/${docId}/original/${safeName}`;

    const admin = createAdminClient();
    const { error: uploadError } = await admin.storage
      .from("documents")
      .upload(storagePath, bytes, { contentType: "application/pdf" });
    if (uploadError) throw new Error(`Storage upload failed: ${uploadError.message}`);

    const allowedTypes = ["general", "bank_statement", "invoice", "contract", "form", "other"];
    const { data: doc, error: docError } = await supabase
      .from("documents")
      .insert({
        id: docId,
        owner_id: user.id,
        name: safeName,
        original_file_path: storagePath,
        mime_type: "application/pdf",
        file_size: bytes.byteLength,
        page_count: pageCount,
        status: "ready",
        document_type: allowedTypes.includes(documentType) ? documentType : "general",
      })
      .select()
      .single();
    if (docError) throw new Error(docError.message);

    // Original is immutable version 1
    const { error: vError } = await supabase.from("document_versions").insert({
      document_id: docId,
      version_number: 1,
      file_path: storagePath,
      created_by: user.id,
      operation_type: "original",
      operation_summary: "Original upload",
      page_count: pageCount,
      file_size: bytes.byteLength,
    });
    if (vError) throw new Error(vError.message);

    await audit({
      userId: user.id,
      documentId: docId,
      action: "document_uploaded",
      metadata: { file_name: safeName, file_size: bytes.byteLength, page_count: pageCount },
    });

    return NextResponse.json({ document: doc });
  } catch (e) {
    console.error("upload failed", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
