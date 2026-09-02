"use client";

import { useEffect, useState } from "react";

type AIUsage = {
  totals: {
    requests: number;
    applied_operations: number;
    input_tokens: number;
    output_tokens: number;
  };
  providers: Array<{
    id: string;
    name: string;
    provider_type: string;
    model: string;
    user_id: string;
    is_enabled: boolean;
    usage_requests: number;
    usage_input_tokens: number;
    usage_output_tokens: number;
    last_used_at: string | null;
    last_test_ok: boolean | null;
  }>;
  recent_requests: Array<{
    id: string;
    prompt: string;
    model: string | null;
    provider: string | null;
    status: string;
    user_name: string | null;
    created_at: string;
  }>;
};

export default function AdminAIPage() {
  const [data, setData] = useState<AIUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/ai")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || "Failed to load");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-500">{error}</p>;
  if (!data)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 bg-white border border-gray-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );

  const fmtTokens = (n: number) => (n > 1_000_000 ? `${(n / 1e6).toFixed(1)}M` : n > 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

  const cards = [
    { label: "Total Requests", value: data.totals.requests },
    { label: "Applied Operations", value: data.totals.applied_operations },
    { label: "Input Tokens", value: fmtTokens(data.totals.input_tokens) },
    { label: "Output Tokens", value: fmtTokens(data.totals.output_tokens) },
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold">Configured Providers</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
              <th className="px-4 py-2.5 font-medium">Provider</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Model</th>
              <th className="px-4 py-2.5 font-medium">Requests</th>
              <th className="px-4 py-2.5 font-medium">Tokens (in/out)</th>
              <th className="px-4 py-2.5 font-medium">Last Used</th>
              <th className="px-4 py-2.5 font-medium">Health</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.providers.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{p.provider_type}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{p.model}</td>
                <td className="px-4 py-2.5 text-gray-600">{p.usage_requests}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">
                  {fmtTokens(p.usage_input_tokens)} / {fmtTokens(p.usage_output_tokens)}
                </td>
                <td className="px-4 py-2.5 text-xs text-gray-400">
                  {p.last_used_at ? new Date(p.last_used_at).toLocaleDateString() : "never"}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      p.last_test_ok === true
                        ? "bg-green-50 text-green-700"
                        : p.last_test_ok === false
                          ? "bg-red-50 text-red-700"
                          : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {p.last_test_ok === true ? "connected" : p.last_test_ok === false ? "failing" : "untested"}
                  </span>
                </td>
              </tr>
            ))}
            {data.providers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  No providers configured yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-4 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold">Recent AI Requests</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {data.recent_requests.map((r) => (
            <div key={r.id} className="px-4 py-2.5 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-gray-900 truncate">{r.prompt}</p>
                <p className="text-xs text-gray-400">
                  {r.user_name ?? "unknown"} · {r.provider ?? "—"} / {r.model ?? "—"}
                </p>
              </div>
              <span
                className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                  r.status === "succeeded"
                    ? "bg-green-50 text-green-700"
                    : r.status === "failed" || r.status === "rejected"
                      ? "bg-red-50 text-red-700"
                      : "bg-gray-100 text-gray-600"
                }`}
              >
                {r.status}
              </span>
            </div>
          ))}
          {data.recent_requests.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">No AI activity yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
