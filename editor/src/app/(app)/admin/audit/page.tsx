"use client";

import { useEffect, useState } from "react";

type LogEntry = {
  id: string;
  user_id: string | null;
  user_name: string | null;
  document_id: string | null;
  document_name: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

const COMMON_ACTIONS = [
  "",
  "document_uploaded",
  "document_opened",
  "document_downloaded",
  "text_replaced",
  "annotation_created",
  "redaction_created",
  "ai_request",
  "ai_operation_applied",
  "version_created",
  "admin_user_updated",
  "admin_documents_viewed",
];

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(true), 0);
    fetch(`/api/admin/audit?limit=200${action ? `&action=${action}` : ""}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || "Failed to load");
        setLogs(data.logs ?? []);
      })
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
    return () => clearTimeout(t);
  }, [action]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="text-sm rounded-lg border border-gray-200 px-3 py-2"
        >
          {COMMON_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a === "" ? "All actions" : a}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400">{logs.length} entries</span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-white border border-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {logs.map((log) => (
            <div key={log.id}>
              <button
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full px-4 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-gray-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono bg-gray-100 rounded px-1.5 py-0.5 text-gray-600 flex-shrink-0">
                    {log.action}
                  </span>
                  <span className="text-sm text-gray-900 truncate">
                    {log.user_name ?? log.user_id?.slice(0, 8) ?? "system"}
                    {log.document_name && (
                      <span className="text-gray-400"> · {log.document_name}</span>
                    )}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {new Date(log.created_at).toLocaleString()}
                </span>
              </button>
              {expanded === log.id && (
                <div className="px-4 pb-3">
                  <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-gray-600">
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
          {logs.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-gray-400">No audit entries.</p>
          )}
        </div>
      )}
    </div>
  );
}
