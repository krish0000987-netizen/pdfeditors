import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    if (typeof password !== "string" || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name || email.split("@")[0] },
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // The on_auth_user_created trigger inserts the profile row. When the
    // project has auto-confirm enabled the session is returned immediately.
    const hasSession = Boolean(data.session);
    return NextResponse.json({
      success: true,
      needsEmailConfirmation: !hasSession,
      message: hasSession
        ? "Account created."
        : "Account created. Check your email to confirm your address before signing in.",
    });
  } catch {
    return NextResponse.json({ error: "Signup failed" }, { status: 500 });
  }
}
