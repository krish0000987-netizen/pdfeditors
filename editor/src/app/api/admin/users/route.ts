import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, adminAudit } from "../_helpers";

const ROLES = ["admin", "editor", "reviewer", "viewer"] as const;

/** GET /api/admin/users — all users with usage counts. */
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const admin = createAdminClient();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, name, avatar_url, timezone, role, is_active, created_at, updated_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // merge auth emails + usage counts
  const users = await Promise.all(
    (profiles ?? []).map(async (p: any) => {
      const [{ data: authUser }, { count: docCount }, { count: aiCount }] = await Promise.all([
        admin.auth.admin.getUserById(p.id),
        admin
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", p.id),
        admin
          .from("ai_requests")
          .select("id", { count: "exact", head: true })
          .eq("user_id", p.id),
      ]);
      return {
        ...p,
        email: authUser?.user?.email ?? "—",
        last_sign_in: authUser?.user?.last_sign_in_at ?? null,
        document_count: docCount ?? 0,
        ai_request_count: aiCount ?? 0,
      };
    })
  );

  return NextResponse.json({ users });
}

/** PATCH /api/admin/users — activate/deactivate or change role. */
export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const body = await request.json();
  const { user_id, role, is_active } = body;
  if (!user_id) return NextResponse.json({ error: "user_id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof role === "string") {
    if (!(ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: `role must be one of ${ROLES.join(", ")}` }, { status: 400 });
    }
    updates.role = role;
  }
  if (typeof is_active === "boolean") updates.is_active = is_active;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Prevent self-demotion / self-deactivation lockouts
  if (user_id === gate.userId) {
    if (updates.role && updates.role !== "admin") {
      return NextResponse.json({ error: "You cannot change your own admin role." }, { status: 400 });
    }
    if (updates.is_active === false) {
      return NextResponse.json({ error: "You cannot deactivate your own account." }, { status: 400 });
    }
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user_id)
    .select("id, role, is_active")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await adminAudit(gate.userId, "admin_user_updated", {
    target_user: user_id,
    changes: updates,
  });

  return NextResponse.json({ user: data });
}
