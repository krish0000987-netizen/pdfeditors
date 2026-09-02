"use client";

import Link from "next/link";
import { Star, FileText } from "lucide-react";
import type { Doc } from "./document-card";

export function DocumentRow({ doc, onChanged }: { doc: Doc; onChanged?: () => void }) {
  const favorite = doc.is_favorite ?? doc.favorite ?? false;

  const toggleFavorite = async () => {
    await fetch(`/api/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: !favorite }),
    });
    onChanged?.();
  };

  return (
    <Link
      href={`/editor/${doc.id}`}
      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-10 bg-red-50 rounded border border-red-100 flex items-center justify-center flex-shrink-0">
          <FileText className="text-red-400" size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
          <p className="text-xs text-gray-400">
            {doc.page_count ?? "?"} pages · {doc.document_type} ·{" "}
            {new Date(doc.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.preventDefault();
          toggleFavorite();
        }}
        className={`p-1.5 rounded hover:bg-gray-100 ${favorite ? "text-yellow-500" : "text-gray-300"}`}
      >
        <Star size={15} fill={favorite ? "currentColor" : "none"} />
      </button>
      <span
        className={`ml-3 text-xs px-2 py-0.5 rounded-full ${
          doc.status === "ready" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
        }`}
      >
        {doc.status}
      </span>
    </Link>
  );
}
