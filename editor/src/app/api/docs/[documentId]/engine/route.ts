import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnedDocument, runEngineVersioned, getLatestVersionPath } from "@/lib/documents";

/**
 * POST /api/docs/{id}/engine
 * Server-side proxy to the PDF engine. Every mutating action flows through
 * runEngineVersioned so the output becomes a new immutable version and the
 * source file is never overwritten.
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
  const doc = await requireOwnedDocument(supabase, user.id, documentId);
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(body.action || "");
  const { engine } = await import("@/lib/engine/client");

  try {
    switch (action) {
      // ── read-only ──────────────────────────────────────────
      case "find": {
        const result = await engine.findText(doc.original_file_path ? await latestPath(supabase, documentId) : "", body.search_text, {
          page: body.page,
          caseSensitive: body.case_sensitive,
        });
        return NextResponse.json(result);
      }
      case "get_text": {
        const { text } = await engine.getText(await latestPath(supabase, documentId), body.page);
        return NextResponse.json({ text });
      }
      case "get_layout": {
        const { blocks } = await engine.getLayout(await latestPath(supabase, documentId), body.page);
        return NextResponse.json({ blocks });
      }
      case "extract_bbox": {
        const { text } = await engine.extractBbox(
          await latestPath(supabase, documentId),
          body.page,
          body.bbox
        );
        return NextResponse.json({ text });
      }
      case "redact_preview": {
        const result = await engine.redactPreview(await latestPath(supabase, documentId), body.regions);
        return NextResponse.json(result);
      }
      case "list_annotations": {
        const result = await engine.listAnnotations(await latestPath(supabase, documentId), body.page);
        return NextResponse.json(result);
      }

      // ── mutating: each creates a new version ───────────────
      case "replace": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "edit",
          operationSummary: `Replace: "${String(body.search_text).slice(0, 40)}" → "${String(body.new_text).slice(0, 40)}"`,
          auditAction: "text_replaced",
          op: (src) =>
            engine.replaceText(src, body.search_text, body.match_id ?? 0, body.new_text ?? "", {
              dryRun: Boolean(body.dry_run),
              page: body.page,
              caseSensitive: body.case_sensitive,
            }),
        });
        return NextResponse.json(out.result);
      }
      case "replace_all": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "edit",
          operationSummary: `Replace all: "${String(body.search).slice(0, 40)}" → "${String(body.replacement).slice(0, 40)}"`,
          auditAction: "text_replaced",
          op: (src) => engine.replaceAll(src, body.search, body.replacement, { dryRun: Boolean(body.dry_run) }),
        });
        return NextResponse.json(out.result);
      }
      case "batch_replace": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "edit",
          operationSummary: `Batch replace (${(body.edits ?? []).length} edits)`,
          auditAction: "text_replaced",
          op: (src) => engine.batchReplace(src, body.edits, { dryRun: Boolean(body.dry_run) }),
        });
        return NextResponse.json(out.result);
      }
      case "replace_block": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "edit",
          operationSummary: `Replace block on page ${body.page_number}`,
          auditAction: "text_replaced",
          op: (src) =>
            engine.replaceBlock(src, body.page_number, body.bbox, body.new_text, {
              fontSize: body.font_size,
            }),
        });
        return NextResponse.json(out.result);
      }
      case "delete_block": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "edit",
          operationSummary: `Delete block on page ${body.page_number}`,
          auditAction: "text_deleted",
          op: (src) => engine.deleteBlock(src, body.page_number, body.bbox, body.close_gap ?? false),
        });
        return NextResponse.json(out.result);
      }
      case "insert_text": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "edit",
          operationSummary: `Insert text on page ${body.page_number}`,
          auditAction: "text_inserted",
          op: (src) =>
            engine.insertTextBlock(src, body.page_number, body.x, body.y, body.text, {
              fontSize: body.font_size,
            }),
        });
        return NextResponse.json(out.result);
      }
      case "highlight": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "highlight",
          operationSummary: `Highlight "${String(body.search_text).slice(0, 40)}"`,
          auditAction: "annotation_created",
          op: (src) =>
            engine.highlightText(src, body.search_text, {
              page: body.page,
              caseSensitive: body.case_sensitive,
            }),
        });
        return NextResponse.json(out.result);
      }
      case "add_annotation": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "annotation",
          operationSummary: `Add ${body.subtype} annotation on page ${body.page}`,
          auditAction: "annotation_created",
          op: (src) => engine.addAnnotation(src, body.page, body.subtype, body.rect, body.data ?? {}),
        });
        // mirror metadata into the annotations table
        await supabase.from("annotations").insert({
          document_id: documentId,
          page_number: body.page,
          type: body.subtype,
          data: body.data ?? {},
          created_by: user.id,
        });
        return NextResponse.json(out.result);
      }
      case "delete_annotation": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "annotation",
          operationSummary: `Remove annotation on page ${body.page}`,
          auditAction: "annotation_deleted",
          op: (src) => engine.deleteAnnotation(src, body.page, body.index),
        });
        return NextResponse.json(out.result);
      }
      case "redact": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "redaction",
          operationSummary: `Redact ${(body.regions ?? []).length} region(s)`,
          auditAction: "redaction_created",
          op: (src) => engine.redactApply(src, body.regions, { removeAnnotations: true }),
        });
        return NextResponse.json(out.result);
      }
      case "rotate_pages": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "pages",
          operationSummary: `Rotate pages (${JSON.stringify(body.pages)}) by ${body.angle}°`,
          op: (src) => engine.rotatePages(src, body.pages, body.angle),
        });
        return NextResponse.json(out.result);
      }
      case "delete_pages": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "pages",
          operationSummary: `Delete pages (${JSON.stringify(body.pages)})`,
          op: (src) => engine.deletePages(src, body.pages),
        });
        return NextResponse.json(out.result);
      }
      case "duplicate_pages": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "pages",
          operationSummary: `Duplicate pages (${JSON.stringify(body.pages)})`,
          op: (src) => engine.duplicatePages(src, body.pages, body.mode),
        });
        return NextResponse.json(out.result);
      }
      case "reorder_pages": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "pages",
          operationSummary: "Reorder pages",
          op: (src) => engine.reorderPages(src, body.page_order),
        });
        return NextResponse.json(out.result);
      }
      case "insert_blank": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "pages",
          operationSummary: `Insert blank page at ${body.at}`,
          op: (src) => engine.insertBlankPage(src, body.at),
        });
        return NextResponse.json(out.result);
      }
      case "set_metadata": {
        const out = await runEngineVersioned(supabase, {
          documentId,
          userId: user.id,
          operationType: "metadata",
          operationSummary: "Edit PDF metadata",
          op: (src) => engine.editMetadata(src, body.metadata ?? {}),
        });
        return NextResponse.json(out.result);
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error(`engine action ${action} failed`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Engine operation failed" },
      { status: 500 }
    );
  }
}

async function latestPath(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: string
): Promise<string> {
  const latest = await getLatestVersionPath(supabase, documentId);
  if (!latest) throw new Error("Document has no editable file");
  return latest.path;
}
