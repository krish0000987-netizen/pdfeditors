"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">E</span>
              </div>
              <span className="text-xl font-bold tracking-tight">EDITOR</span>
            </div>
            <p className="text-sm text-gray-500">Choose a new password</p>
          </div>

          <Suspense fallback={<div className="text-sm text-gray-400 text-center">Loading…</div>}>
            <ResetPasswordFormInner />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

function ResetPasswordFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tokens, setTokens] = useState<{ access: string; refresh: string } | null>(null);

  useEffect(() => {
    // Supabase recovery links deliver tokens in the URL fragment (#access_token=…)
    const fromParams = {
      access: searchParams.get("access_token") ?? "",
      refresh: searchParams.get("refresh_token") ?? "",
    };
    if (fromParams.access && fromParams.refresh) {
      void Promise.resolve().then(() => setTokens(fromParams));
      return;
    }
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const access = hash.get("access_token");
    const refresh = hash.get("refresh_token");
    if (access && refresh) {
      void Promise.resolve().then(() => setTokens({ access, refresh }));
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }
    if (!tokens) {
      setError("Invalid or expired reset link. Please request a new one.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          accessToken: tokens.access,
          refreshToken: tokens.refresh,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Reset failed");
        return;
      }

      router.push("/login");
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 text-red-700 text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          placeholder="Repeat your password"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800"
      >
        {loading ? "Resetting…" : "Reset Password"}
      </button>

      <p className="text-center text-sm text-gray-500">
        Remembered it?{" "}
        <Link href="/login" className="text-gray-900 font-medium hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
