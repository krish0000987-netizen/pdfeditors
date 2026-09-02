import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/reset-password
 * body: { password, accessToken?, refreshToken? }  ← from recovery link
 *       { password, current_session: true }        ← from Settings → Profile
 */
export async function POST(request: Request) {
  try {
    const { password, accessToken, refreshToken, current_session } = await request.json();

    if (!password || typeof password !== "string" || password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    if (!current_session) {
      if (!accessToken || !refreshToken) {
        return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (sessionError) {
        return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
      }
    } else {
      // must already be signed in
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Reset failed" }, { status: 500 });
  }
}
