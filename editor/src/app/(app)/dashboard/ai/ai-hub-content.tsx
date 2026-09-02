"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Settings, History, CheckCircle2, XCircle } from "lucide-react";

type Provider = { id: string; name: string; model: string; is_active: boolean; is_enabled: boolean };
type HistoryItem = { id: string; prompt: string; status: string; created_at: string; document_name: string | null };

export function AIHubContent() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [active, setActive] = useState<Provider | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/ai/providers").then((r) => r.json()),
      fetch("/api/ai/history?limit=8").then((r) => r.json()),
    ])
      .then(([p, h]) => {
        setProviders(p.providers ?? []);
        setActive(p.active ?? null);
        setHistory(h.history ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={20} className="text-indigo-600" />
          AI Assistant
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Bring your own OpenAI-compatible API. The AI proposes validated PDF operations; you confirm
          before anything is applied.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold mb-3">Active Provider</h2>
          {loading ? (
            <div className="h-10 bg-gray-100 rounded animate-pulse" />
          ) : active ? (
            <div className="flex items-center gap-3">
              <CheckCircle2 className="text-green-600" size={20} />
              <div>
                <p className="text-sm font-medium">{active.name}</p>
                <p className="text-xs text-gray-500">Model: {active.model}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <XCircle className="text-amber-500" size={20} />
              <div>
                <p className="text-sm font-medium">No provider configured</p>
                <Link
                  href="/dashboard/settings/ai"
                  className="text-xs text-indigo-600 hover:underline"
                >
                  Configure one in Settings → AI
                </Link>
              </div>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            {providers.length} provider{providers.length === 1 ? "" : "s"} configured. Keys are
            encrypted server-side and never exposed to the browser.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold mb-2">Quick Links</h2>
            <div className="space-y-1.5 mt-2">
              <Link href="/dashboard/settings/ai" className="text-sm text-gray-700 hover:text-gray-900 flex items-center gap-2">
                <Settings size={14} /> AI Settings — add or test providers
              </Link>
              <Link href="/dashboard/ai/history" className="text-sm text-gray-700 hover:text-gray-900 flex items-center gap-2">
                <History size={14} /> AI History — past requests and results
              </Link>
              <Link href="/documents" className="text-sm text-gray-700 hover:text-gray-900 flex items-center gap-2">
                <Sparkles size={14} /> Open a document to chat with the AI
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold">Recent AI Activity</h2>
        </div>
        {loading ? (
          <div className="p-5 space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 bg-gray-50 rounded animate-pulse" />
            ))}
          </div>
        ) : history.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">
            No AI requests yet. Open a document and try the assistant.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.map((h) => (
              <div key={h.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-gray-900 truncate">{h.prompt}</p>
                  <p className="text-xs text-gray-400">
                    {h.document_name ?? "—"} · {new Date(h.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                    h.status === "succeeded"
                      ? "bg-green-50 text-green-700"
                      : h.status === "failed"
                        ? "bg-red-50 text-red-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {h.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
