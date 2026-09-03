import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ user: null });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("name, avatar_url, timezone, role, is_active")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      name: profile?.name || user.email?.split("@")[0],
      avatar_url: profile?.avatar_url ?? null,
      timezone: profile?.timezone ?? "UTC",
      role: profile?.role ?? "editor",
      is_active: profile?.is_active ?? true,
    },
  });
}
