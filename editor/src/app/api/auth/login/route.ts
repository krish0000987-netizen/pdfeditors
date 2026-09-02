import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    // Deactivated users cannot sign in (checked server-side).
    if (data.user) {
      const admin = createAdminClient();
      const { data: profile } = await admin
        .from("profiles")
        .select("is_active, role")
        .eq("id", data.user.id)
        .single();
      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        return NextResponse.json(
          { error: "This account has been deactivated. Contact an administrator." },
          { status: 403 }
        );
      }
      return NextResponse.json({ success: true, role: profile?.role ?? "editor" });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
