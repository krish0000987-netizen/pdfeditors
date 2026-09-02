"use client";

import { useCallback, useEffect, useState } from "react";
import { Grid, List, Search, Trash2, RotateCcw } from "lucide-react";
import { DocumentCard, type Doc } from "./document-card";
import { DocumentRow } from "./document-row";

export type GridFilter = "all" | "favorites" | "trash" | "edited" | "ai_processed" | "annotated" | "redacted" | "bank_statement";

export function DocumentGrid({
  filter = "all",
  initialQuery = "",
  title = "Documents",
  showFilters = true,
  emptyMessage = "No documents found.",
}: {
  filter?: GridFilter;
  initialQuery?: string;
  title?: string;
  showFilters?: boolean;
  emptyMessage?: string;
}) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState("recent");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ filter, sort });
    if (query) params.set("q", query);
    const res = await fetch(`/api/docs?${params.toString()}`);
    const data = await res.json();
    setDocs(data.documents ?? []);
    setLoading(false);
  }, [filter, query, sort]);

  useEffect(() => {
    const t = setTimeout(load, query ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <div className="flex-1" />
        {showFilters && (
          <>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="text-sm rounded-lg border border-gray-200 px-2 py-2"
            >
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest</option>
              <option value="name">Name</option>
              <option value="size">Largest</option>
            </select>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setView("grid")}
                className={`p-2 ${view === "grid" ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <Grid size={15} />
              </button>
              <button
                onClick={() => setView("list")}
                className={`p-2 ${view === "list" ? "bg-gray-100" : "hover:bg-gray-50"}`}
              >
                <List size={15} />
              </button>
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden animate-pulse">
              <div className="aspect-[3/4] bg-gray-100" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : docs.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-14 text-center">
          {filter === "trash" ? <Trash2 className="mx-auto text-gray-300 mb-3" size={40} /> : null}
          <p className="text-sm text-gray-500">{emptyMessage}</p>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {docs.map((doc) =>
            filter === "trash" ? (
              <TrashCard key={doc.id} doc={doc} onChanged={load} />
            ) : (
              <DocumentCard key={doc.id} doc={doc} onChanged={load} />
            )
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {docs.map((doc) =>
            filter === "trash" ? (
              <TrashCard key={doc.id} doc={doc} onChanged={load} />
            ) : (
              <DocumentRow key={doc.id} doc={doc} onChanged={load} />
            )
          )}
        </div>
      )}
    </div>
  );
}

function TrashCard({ doc, onChanged }: { doc: Doc; onChanged?: () => void }) {
  const restore = async () => {
    await fetch(`/api/docs/${doc.id}?action=restore`, { method: "DELETE" });
    onChanged?.();
  };
  const purge = async () => {
    if (!confirm(`Permanently delete “${doc.name}”? This cannot be undone.`)) return;
    await fetch(`/api/docs/${doc.id}?action=purge`, { method: "DELETE" });
    onChanged?.();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col items-center text-center gap-2 opacity-90">
      <Trash2 className="text-gray-300" size={28} />
      <p className="text-sm font-medium text-gray-900 truncate w-full">{doc.name}</p>
      <p className="text-xs text-gray-400">
        {doc.page_count ?? "?"} pages · deleted{" "}
        {doc.deleted_at ? new Date(doc.deleted_at).toLocaleDateString() : "—"}
      </p>
      <div className="flex gap-2 mt-1">
        <button
          onClick={restore}
          className="flex items-center gap-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 hover:bg-gray-50"
        >
          <RotateCcw size={12} /> Restore
        </button>
        <button
          onClick={purge}
          className="flex items-center gap-1 text-xs border border-red-200 text-red-600 rounded-lg px-2.5 py-1.5 hover:bg-red-50"
        >
          Delete forever
        </button>
      </div>
    </div>
  );
}
