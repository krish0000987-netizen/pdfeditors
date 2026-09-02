"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

type HistoryItem = {
  id: string;
  prompt: string;
  model: string | null;
  provider: string | null;
  status: string;
  error: string | null;
  created_at: string;
  document_id: string | null;
  document_name: string | null;
};

export default function AIHistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/history?limit=100")
      .then((r) => r.json())
      .then((d) => setItems(d.history ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppShell>
      <div className="p-4 lg:p-6 max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">AI History</h1>
        <p className="text-sm text-gray-500 mb-6">
          Every AI request, its provider, and its outcome. Click a document to open it.
        </p>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 bg-white border border-gray-200 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
            No AI requests yet.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            <div className="hidden sm:grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
              <div className="col-span-4">Prompt</div>
              <div className="col-span-3">Document</div>
              <div className="col-span-2">Model</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-2 text-right">Date</div>
            </div>
            {items.map((h) => (
              <div key={h.id} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-2 items-center hover:bg-gray-50">
                <div className="sm:col-span-4 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{h.prompt}</p>
                  {h.error && <p className="text-xs text-red-500 truncate">{h.error}</p>}
                </div>
                <div className="sm:col-span-3 text-sm min-w-0">
                  {h.document_id ? (
                    <Link href={`/editor/${h.document_id}`} className="text-indigo-600 hover:underline truncate block">
                      {h.document_name ?? "Open document"}
                    </Link>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </div>
                <div className="sm:col-span-2 text-xs text-gray-500 truncate">
                  {h.model ?? "—"}
                  {h.provider && <span className="text-gray-300"> · {h.provider}</span>}
                </div>
                <div className="sm:col-span-1">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      h.status === "succeeded"
                        ? "bg-green-50 text-green-700"
                        : h.status === "failed" || h.status === "rejected"
                          ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {h.status}
                  </span>
                </div>
                <div className="sm:col-span-2 text-xs text-gray-400 sm:text-right">
                  {new Date(h.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
