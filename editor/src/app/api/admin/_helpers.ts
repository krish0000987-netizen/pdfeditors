import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminUser = {
  id: string;
  email: string;
};

/**
 * Every /api/admin/* route calls this first. Authorization is enforced
 * server-side by reading the profile role from the database — the client
 * can never grant itself admin.
 */
export async function requireAdmin(): Promise<
  { ok: true; userId: string; admin: AdminUser } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin" || profile.is_active === false) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden — admin access required" }, { status: 403 }),
    };
  }

  return {
    ok: true,
    userId: user.id,
    admin: { id: user.id, email: user.email ?? "" },
  };
}

/** Audit an administrative action (always attributed to the acting admin). */
export async function adminAudit(
  adminId: string,
  action: string,
  metadata: Record<string, unknown> = {}
) {
  try {
    const admin = createAdminClient();
    await admin.from("audit_logs").insert({
      user_id: adminId,
      action,
      metadata: { admin_action: true, ...metadata },
    });
  } catch (e) {
    console.error("admin audit failed", e);
  }
}
