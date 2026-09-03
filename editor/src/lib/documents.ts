import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOwnedDocument, getLatestVersion, insertVersion, sqlQuery } from "@/lib/db";
import { engine } from "@/lib/engine/client";
import type { EngineEditResult } from "@/lib/engine/client";

/** Path of the file backing the latest version of a document. */
export async function getLatestVersionPath(
  _supabase: unknown,
  documentId: string
): Promise<{ path: string; versionNumber: number } | null> {
  try {
    const row = await getLatestVersion(documentId);
    if (row?.file_path) {
      return { path: row.file_path, versionNumber: row.version_number };
    }
  } catch {
    // fallback to admin client
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("document_versions")
    .select("file_path, version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1);
  const row = data?.[0];
  return row ? { path: row.file_path, versionNumber: row.version_number } : null;
}

/** Next sequential version number for a document. */
export async function nextVersionNumber(
  _supabase: unknown,
  documentId: string
): Promise<number> {
  try {
    const row = await getLatestVersion(documentId);
    if (row?.version_number) return row.version_number + 1;
  } catch {
    // fallback
  }
  const admin = createAdminClient();
  const { data } = await admin
    .from("document_versions")
    .select("version_number")
    .eq("document_id", documentId)
    .order("version_number", { ascending: false })
    .limit(1);
  return data?.[0] ? data[0].version_number + 1 : 1;
}

/**
 * Create a new version row for an output produced by the engine.
 * The original file (and every prior version file) is never overwritten.
 */
export async function createVersion(
  _supabase: unknown,
  opts: {
    documentId: string;
    userId: string;
    filePath: string;
    operationType: string;
    operationSummary: string;
    pageCount?: number;
  }
) {
  try {
    const row = await insertVersion(opts);
    if (row) return row;
  } catch {
    // fallback
  }
  const admin = createAdminClient();
  const versionNumber = await nextVersionNumber(admin, opts.documentId);
  const { data, error } = await admin
    .from("document_versions")
    .insert({
      document_id: opts.documentId,
      version_number: versionNumber,
      file_path: opts.filePath,
      created_by: opts.userId,
      operation_type: opts.operationType,
      operation_summary: opts.operationSummary,
      page_count: opts.pageCount ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`Version create failed: ${error.message}`);
  return data;
}

/** Write an audit_logs row via the service-role client (RLS blocks direct inserts). */
export async function audit(
  opts: {
    userId: string;
    documentId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    const safeUserId = opts.userId.replace(/'/g, "''");
    const safeDocId = opts.documentId ? `'${opts.documentId.replace(/'/g, "''")}'` : "NULL";
    const safeAction = opts.action.replace(/'/g, "''");
    const safeMeta = JSON.stringify(opts.metadata ?? {}).replace(/'/g, "''");
    await sqlQuery(
      `INSERT INTO public.audit_logs (user_id, document_id, action, metadata)
       VALUES ('${safeUserId}', ${safeDocId}, '${safeAction}', '${safeMeta}'::jsonb);`
    );
  } catch {
    try {
      const admin = createAdminClient();
      await admin.from("audit_logs").insert({
        user_id: opts.userId,
        document_id: opts.documentId ?? null,
        action: opts.action,
        metadata: opts.metadata ?? {},
      });
    } catch (e) {
      console.error("audit log failed", e);
    }
  }
}

/** Verify the caller owns the document and return it. */
export async function requireOwnedDocument(
  _supabase: unknown,
  userId: string,
  documentId: string
) {
  try {
    const doc = await getOwnedDocument(documentId, userId);
    if (doc) return doc;
  } catch {
    // fallback
  }
  const admin = createAdminClient();
  const { data: doc, error } = await admin
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("owner_id", userId)
    .single();
  if (error || !doc) return null;
  return doc;
}

/**
 * Run an engine operation against the document's latest version and record
 * the resulting file as a new version. `op` receives the source path and
 * must return the engine output path (or null when the op only reads).
 */
export async function runEngineVersioned(
  _supabase: unknown,
  opts: {
    documentId: string;
    userId: string;
    sourcePath?: string; // defaults to latest version path
    operationType: string;
    operationSummary: string;
    op: (sourcePath: string) => Promise<{ output_path: string | null }>;
    metadata?: Record<string, unknown>;
    auditAction?: string;
  }
): Promise<{
  output_path: string | null;
  version: Record<string, unknown> | null;
  result: unknown;
}> {
  const admin = createAdminClient();
  const source = opts.sourcePath ?? (await getLatestVersionPath(admin, opts.documentId))?.path;
  if (!source) throw new Error("Document has no editable file");

  const result = await opts.op(source);
  const outputPath = (result as { output_path?: string | null })?.output_path ?? null;

  let version: Record<string, unknown> | null = null;
  if (outputPath) {
    version = (await createVersion(admin, {
      documentId: opts.documentId,
      userId: opts.userId,
      filePath: outputPath,
      operationType: opts.operationType,
      operationSummary: opts.operationSummary,
    })) as unknown as Record<string, unknown>;

    await admin
      .from("documents")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", opts.documentId);

    await audit({
      userId: opts.userId,
      documentId: opts.documentId,
      action: opts.auditAction ?? "version_created",
      metadata: {
        operation_type: opts.operationType,
        source_version_path: source,
        new_version_path: outputPath,
        ...opts.metadata,
      },
    });
  }

  return { output_path: outputPath, version, result };
}

export type { EngineEditResult };
export { engine };
