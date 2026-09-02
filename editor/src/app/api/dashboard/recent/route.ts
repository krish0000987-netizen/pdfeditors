import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: documents } = await supabase
    .from("documents")
    .select("id, name, page_count, status, is_favorite, updated_at, document_type")
    .eq("owner_id", user.id)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(8);

  return NextResponse.json({ documents: documents ?? [] });
}
