"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, LogOut } from "lucide-react";

export function ProfileContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user) {
          setName(d.user.name ?? "");
          setEmail(d.user.email ?? "");
          setTimezone(d.user.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
          setAvatarUrl(d.user.avatar_url ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, timezone, avatar_url: avatarUrl || null }),
      });
      setMessage(
        res.ok
          ? { type: "success", text: "Profile updated." }
          : { type: "error", text: "Failed to update profile." }
      );
    } catch {
      setMessage({ type: "error", text: "Network error." });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setPwMessage(null);
    if (newPassword.length < 8) {
      setPwMessage({ type: "error", text: "Password must be at least 8 characters." });
      return;
    }
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword, current_session: true }),
    });
    const data = await res.json().catch(() => ({}));
    setPwMessage(
      res.ok
        ? { type: "success", text: "Password changed." }
        : { type: "error", text: data.error || "Password change failed." }
    );
    if (res.ok) setNewPassword("");
  };

  const deleteAccount = async () => {
    if (deleteConfirm !== email) {
      setMessage({ type: "error", text: `Type your email (${email}) to confirm deletion.` });
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/settings/profile", { method: "DELETE" });
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: "error", text: data.error || "Account deletion failed." });
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 animate-pulse space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {message && (
        <div
          className={`text-sm rounded-lg px-3 py-2 ${
            message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold">Profile</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="input"
            placeholder="Your name"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input value={email} disabled className="input bg-gray-50 text-gray-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="input"
          >
            {Intl.supportedValuesOf("timeZone").map((tz: string) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Avatar URL <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="input"
            placeholder="https://…/avatar.png"
          />
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="bg-gray-900 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold">Change Password</h2>
        {pwMessage && (
          <div
            className={`text-sm rounded-lg px-3 py-2 ${
              pwMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {pwMessage.text}
          </div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="input"
            placeholder="At least 8 characters"
          />
        </div>
        <button
          onClick={changePassword}
          disabled={!newPassword}
          className="border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          Update Password
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-red-600">Danger Zone</h2>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              router.push("/login");
              router.refresh();
            }}
            className="flex items-center gap-1.5 border border-gray-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <LogOut size={14} /> Log out
          </button>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm text-gray-600">
            Deleting your account permanently removes your profile, documents, versions and history.
            This cannot be undone.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={`Type ${email} to confirm`}
              className="input flex-1"
            />
            <button
              onClick={deleteAccount}
              disabled={deleting || deleteConfirm !== email}
              className="flex items-center gap-1.5 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 flex-shrink-0"
            >
              <Trash2 size={14} /> {deleting ? "Deleting…" : "Delete Account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
