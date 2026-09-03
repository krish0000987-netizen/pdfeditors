/**
 * High-reliability database execution layer.
 * Executes queries via direct Supabase DB engine or PostgREST, ensuring
 * that any PostgREST schema cache misses never cause "Document not found" errors.
 */

const SUPABASE_PROJECT_REF = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0]
  : "cepitbphqnffdpdldgmq";

const SUPABASE_MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || "";

export async function sqlQuery<T = any>(sql: string): Promise<T[]> {
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_MGMT_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DB query failed: ${err}`);
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error("Direct SQL query error:", e);
    throw e;
  }
}

/** Get a single document owned by a user */
export async function getOwnedDocument(documentId: string, userId: string) {
  const safeDocId = documentId.replace(/'/g, "''");
  const safeUserId = userId.replace(/'/g, "''");
  const rows = await sqlQuery(
    `SELECT * FROM public.documents WHERE id = '${safeDocId}' AND owner_id = '${safeUserId}' LIMIT 1;`
  );
  return rows[0] || null;
}

/** Get latest version for a document */
export async function getLatestVersion(documentId: string) {
  const safeDocId = documentId.replace(/'/g, "''");
  const rows = await sqlQuery(
    `SELECT * FROM public.document_versions WHERE document_id = '${safeDocId}' ORDER BY version_number DESC LIMIT 1;`
  );
  return rows[0] || null;
}

/** Get all versions for a document */
export async function getAllVersions(documentId: string) {
  const safeDocId = documentId.replace(/'/g, "''");
  return sqlQuery(
    `SELECT * FROM public.document_versions WHERE document_id = '${safeDocId}' ORDER BY version_number ASC;`
  );
}

/** Get all annotations for a document */
export async function getAllAnnotations(documentId: string) {
  const safeDocId = documentId.replace(/'/g, "''");
  return sqlQuery(
    `SELECT * FROM public.annotations WHERE document_id = '${safeDocId}' ORDER BY created_at DESC;`
  );
}

/** Insert a new document version */
export async function insertVersion(opts: {
  documentId: string;
  userId: string;
  filePath: string;
  operationType: string;
  operationSummary: string;
  pageCount?: number;
}) {
  const safeDocId = opts.documentId.replace(/'/g, "''");
  const safeUserId = opts.userId.replace(/'/g, "''");
  const safePath = opts.filePath.replace(/'/g, "''");
  const safeType = opts.operationType.replace(/'/g, "''");
  const safeSummary = (opts.operationSummary || "").replace(/'/g, "''");

  const nextVerRows = await sqlQuery<{ next_ver: number }>(
    `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver FROM public.document_versions WHERE document_id = '${safeDocId}';`
  );
  const nextVer = nextVerRows[0]?.next_ver || 1;

  const rows = await sqlQuery(
    `INSERT INTO public.document_versions (document_id, version_number, file_path, created_by, operation_type, operation_summary, page_count)
     VALUES ('${safeDocId}', ${nextVer}, '${safePath}', '${safeUserId}', '${safeType}', '${safeSummary}', ${opts.pageCount ? Number(opts.pageCount) : "NULL"})
     RETURNING *;`
  );
  return rows[0] || null;
}
