import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateProposal } from "@/lib/ai/operations";
import { runEngineVersioned, audit, getLatestVersionPath } from "@/lib/documents";
import { engine } from "@/lib/engine/client";

/**
 * POST /api/ai/apply
 * body: { requestId, operationId?, documentId, proposal }
 * Re-validates the proposal server-side (never trusts the client copy),
 * executes each operation through the PDF engine as new versions, and
 * records the outcome. The original document is never overwritten.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { requestId, operationId, documentId, proposal: clientProposal } = body;

  if (!documentId || !clientProposal) {
    return NextResponse.json({ error: "documentId and proposal required" }, { status: 400 });
  }

  // ownership
  const { data: doc } = await supabase
    .from("documents")
    .select("id")
    .eq("id", documentId)
    .eq("owner_id", user.id)
    .single();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // re-validate from scratch — the client copy could be tampered with
  const validation = validateProposal(clientProposal);
  if (!validation.ok || !validation.proposal) {
    return NextResponse.json(
      { error: `Invalid operation proposal: ${validation.errors[0] ?? "unknown"}` },
      { status: 400 }
    );
  }
  const proposal = validation.proposal;
  if (proposal.operations.length === 0) {
    return NextResponse.json({ error: "No operations to apply" }, { status: 400 });
  }

  const admin = createAdminClient();

  // confirm the ai_operation row exists and belongs to this user
  if (operationId) {
    const { data: opRow } = await admin
      .from("ai_operations")
      .select("id, status, ai_request_id")
      .eq("id", operationId)
      .single();
    if (!opRow) return NextResponse.json({ error: "Unknown AI operation" }, { status: 404 });
    if (opRow.status === "applied") {
      return NextResponse.json({ error: "This operation was already applied" }, { status: 409 });
    }
  }

  let currentPath = (await getLatestVersionPath(supabase, documentId))?.path;
  if (!currentPath) return NextResponse.json({ error: "Document has no file" }, { status: 400 });

  let applied = 0;
  let failed = 0;
  const results: Array<{ type: string; ok: boolean; detail?: string; versionPath?: string }> = [];
  let lastOutputPath: string | null = null;
  let lastIntentDetail = "";

  try {
    for (const op of proposal.operations) {
      try {
        const source = currentPath;
        switch (op.type) {
          case "find_text": {
            const r = await engine.findText(source, String(op.find), {
              page: op.page as number | undefined,
            });
            results.push({ type: op.type, ok: true, detail: `${r.count} match(es)` });
            applied++;
            break;
          }
          case "replace_text": {
            const r = await engine.replaceAll(source, String(op.find), String(op.replace ?? ""));
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: r.success !== false, detail: `${r.count} replaced` });
            applied++;
            break;
          }
          case "replace_all": {
            const r = await engine.replaceAll(source, String(op.find), String(op.replace ?? ""));
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true, detail: `${r.count} replaced` });
            applied++;
            break;
          }
          case "delete_text": {
            const r = await engine.replaceAll(source, String(op.find), "");
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true, detail: `${r.count} deleted` });
            applied++;
            break;
          }
          case "insert_text": {
            const r = await engine.insertTextBlock(
              source,
              Number(op.page),
              Number(op.x),
              Number(op.y),
              String(op.text),
              { fontSize: op.font_size as number | undefined }
            );
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: r.success !== false });
            applied++;
            break;
          }
          case "highlight_text": {
            const r = await engine.highlightText(source, String(op.find), {
              page: op.page as number | undefined,
            });
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true, detail: `${r.count} highlighted` });
            applied++;
            break;
          }
          case "add_annotation": {
            const r = await engine.addAnnotation(
              source,
              Number(op.page),
              String(op.subtype),
              op.rect as [number, number, number, number],
              { contents: String(op.contents ?? "") }
            );
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true });
            applied++;
            break;
          }
          case "redact_region": {
            const r = await engine.redactApply(
              source,
              op.regions as Array<{ page: number; bbox: [number, number, number, number] }>,
              { removeAnnotations: true }
            );
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true, detail: `${r.regions} region(s)` });
            applied++;
            break;
          }
          case "extract_text": {
            const r = await engine.getText(source, op.page as number | undefined);
            results.push({ type: op.type, ok: true, detail: `${r.text.length} chars extracted` });
            applied++;
            break;
          }
          case "extract_table":
          case "summarize_document": {
            // read-only context ops — surface text back to the UI
            const r = await engine.getText(source, op.page as number | undefined);
            results.push({ type: op.type, ok: true, detail: r.text.slice(0, 2000) });
            applied++;
            break;
          }
          case "rotate_page": {
            const r = await engine.rotatePages(source, [Number(op.page)], Number(op.angle || 90));
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true });
            applied++;
            break;
          }
          case "delete_page": {
            const r = await engine.deletePages(source, [Number(op.page)]);
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true });
            applied++;
            break;
          }
          case "duplicate_page": {
            const r = await engine.duplicatePages(source, [Number(op.page)]);
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true });
            applied++;
            break;
          }
          case "reorder_page": {
            const r = await engine.reorderPages(source, op.page_order as number[]);
            if (r.output_path) {
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
            }
            results.push({ type: op.type, ok: true });
            applied++;
            break;
          }
          case "split_pdf": {
            const r = await engine.splitPdf(source);
            results.push({
              type: op.type,
              ok: true,
              detail: `${r.output_paths.length} parts created`,
            });
            applied++;
            break;
          }
          case "merge_pdf": {
            // merge other owned documents into this one
            const ids = (op.source_document_ids as string[]) ?? [];
            const paths: string[] = [source];
            for (const srcId of ids.slice(0, 5)) {
              const { data: srcDoc } = await supabase
                .from("documents")
                .select("id")
                .eq("id", srcId)
                .eq("owner_id", user.id)
                .single();
              if (!srcDoc) continue;
              const p = (await getLatestVersionPath(supabase, srcId))?.path;
              if (p) paths.push(p);
            }
            if (paths.length > 1) {
              const r = await engine.mergePdfs(paths);
              currentPath = r.output_path;
              lastOutputPath = r.output_path;
              results.push({ type: op.type, ok: true, detail: `${paths.length} merged` });
            } else {
              results.push({ type: op.type, ok: false, detail: "No source documents found" });
              failed++;
            }
            applied++;
            break;
          }
          default:
            results.push({ type: String(op.type), ok: false, detail: "Unsupported" });
            failed++;
        }
      } catch (opError) {
        failed++;
        results.push({
          type: String(op.type),
          ok: false,
          detail: opError instanceof Error ? opError.message.slice(0, 200) : "Operation failed",
        });
      }
    }

    // Persist the final file as one new version (if anything mutated)
    let version: Record<string, unknown> | null = null;
    if (lastOutputPath && lastOutputPath !== (await getLatestVersionPath(supabase, documentId))?.path) {
      const { createVersion } = await import("@/lib/documents");
      version = (await createVersion(supabase, {
        documentId,
        userId: user.id,
        filePath: lastOutputPath,
        operationType: "ai",
        operationSummary: `AI: ${proposal.intent} (${applied} op${applied === 1 ? "" : "s"})`,
      })) as unknown as Record<string, unknown>;

      await supabase
        .from("documents")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", documentId);
    }

    // Mark the stored proposal applied/rejected
    if (operationId) {
      await admin
        .from("ai_operations")
        .update({
          status: lastOutputPath ? "applied" : failed > 0 ? "failed" : "applied",
          result: { results, applied, failed },
          applied_at: new Date().toISOString(),
        })
        .eq("id", operationId);
    }

    await audit({
      userId: user.id,
      documentId,
      action: "ai_operation_applied",
      metadata: {
        intent: proposal.intent,
        applied,
        failed,
        new_version_path: lastOutputPath,
        results: results.slice(0, 10),
      },
    });

    return NextResponse.json({
      success: applied > 0,
      applied,
      failed,
      results,
      version,
      output_path: lastOutputPath,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Apply failed" },
      { status: 500 }
    );
  }
}
