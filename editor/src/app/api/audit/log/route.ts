import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/documents";

const ALLOWED_ACTIONS = new Set([
  "document_opened",
  "document_downloaded",
  "document_exported",
  "text_replaced",
  "text_deleted",
  "annotation_created",
  "redaction_created",
  "ai_request",
  "ai_preview",
  "ai_operation_applied",
  "version_created",
  "search_performed",
]);

/** POST /api/audit/log — client-side audit events (validated action allow-list). */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { documentId, action, metadata } = await request.json().catch(() => ({}));

  if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  await audit({
    userId: user.id,
    documentId: typeof documentId === "string" ? documentId : null,
    action,
    metadata: metadata && typeof metadata === "object" ? metadata : {},
  });

  return NextResponse.json({ success: true });
}
