"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  users: number;
  documents: number;
  pdfs_processed: number;
  ai_requests: number;
  ai_operations: number;
  versions: number;
  storage_bytes: number;
  recent_users: Array<{ id: string; name: string; role: string; created_at: string }>;
  recent_documents: Array<{ id: string; name: string; page_count: number; created_at: string }>;
};

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed to load");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!stats)
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
            <div className="h-3 bg-gray-100 rounded w-20 mb-2" />
            <div className="h-7 bg-gray-100 rounded w-10" />
          </div>
        ))}
      </div>
    );

  const fmtBytes = (b: number) =>
    b > 1024 * 1024 * 1024
      ? `${(b / 1024 ** 3).toFixed(1)} GB`
      : b > 1024 * 1024
        ? `${(b / 1024 ** 2).toFixed(1)} MB`
        : `${(b / 1024).toFixed(0)} KB`;

  const cards = [
    { label: "Users", value: stats.users },
    { label: "Documents", value: stats.documents },
    { label: "PDFs Processed", value: stats.pdfs_processed },
    { label: "AI Requests", value: stats.ai_requests },
    { label: "AI Operations", value: stats.ai_operations },
    { label: "Versions Created", value: stats.versions },
    { label: "Storage Used", value: fmtBytes(stats.storage_bytes) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs text-gray-500">{c.label}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Newest Users</h2>
            <Link href="/admin/users" className="text-xs text-indigo-600 hover:underline">
              Manage
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.recent_users.map((u) => (
              <div key={u.id} className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-gray-900">{u.name || u.id.slice(0, 8)}</span>
                <span className="text-xs text-gray-400">
                  {u.role} · {new Date(u.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
            {stats.recent_users.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-gray-400">No users yet.</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Newest Documents</h2>
            <Link href="/admin/documents" className="text-xs text-indigo-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="divide-y divide-gray-50">
            {stats.recent_documents.map((d) => (
              <div key={d.id} className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-sm text-gray-900 truncate">{d.name}</span>
                <span className="text-xs text-gray-400">
                  {d.page_count} pages · {new Date(d.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
            {stats.recent_documents.length === 0 && (
              <p className="px-4 py-6 text-center text-xs text-gray-400">No documents yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
