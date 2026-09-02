import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("name, avatar_url, timezone, role")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    profile: {
      name: profile?.name ?? "",
      avatar_url: profile?.avatar_url ?? null,
      timezone: profile?.timezone ?? "UTC",
      role: profile?.role ?? "editor",
    },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, timezone, avatar_url } = await request.json();

  const updates: Record<string, unknown> = {};
  if (typeof name === "string") updates.name = name.slice(0, 120);
  if (typeof timezone === "string" && timezone.length <= 64) updates.timezone = timezone;
  if (typeof avatar_url === "string") updates.avatar_url = avatar_url.slice(0, 500);

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}

/** Permanently delete the account: auth user + cascading data via service role. */
export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const admin = createAdminClient();
    // Storage cleanup: remove this user's folder from the documents bucket.
    const { data: objects } = await admin.storage
      .from("documents")
      .list(user.id, { limit: 1000, sortBy: { column: "name" } });
    if (objects && objects.length > 0) {
      // list is recursive per folder level; walk document-id folders first
      const allPaths: string[] = [];
      for (const entry of objects) {
        if (entry.id === null) {
          // folder — list its children
          const { data: children } = await admin.storage
            .from("documents")
            .list(`${user.id}/${entry.name}`, { limit: 1000 });
          for (const child of children ?? []) {
            if (child.id !== null) allPaths.push(`${user.id}/${entry.name}/${child.name}`);
          }
        } else {
          allPaths.push(`${user.id}/${entry.name}`);
        }
      }
      if (allPaths.length > 0) {
        await admin.storage.from("documents").remove(allPaths);
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Account deletion failed" },
      { status: 500 }
    );
  }
}
