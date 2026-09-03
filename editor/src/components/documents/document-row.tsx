"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Star, FileText, Trash2, MoreVertical, Download, Copy, Pencil } from "lucide-react";
import type { Doc } from "./document-card";

export function DocumentRow({ doc, onChanged }: { doc: Doc; onChanged?: () => void }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(doc.name);

  const favorite = doc.is_favorite ?? doc.favorite ?? false;

  const patch = async (body: Record<string, unknown>) => {
    await fetch(`/api/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    onChanged?.();
    router.refresh();
  };

  const trash = async () => {
    if (!confirm(`Move “${doc.name}” to trash?`)) return;
    await fetch(`/api/docs/${doc.id}`, { method: "DELETE" });
    onChanged?.();
    router.refresh();
  };

  const duplicate = async () => {
    await fetch(`/api/docs/${doc.id}`, { method: "POST" });
    onChanged?.();
    router.refresh();
  };

  const download = () => {
    window.open(`/api/docs/${doc.id}/file?download=1`, "_blank");
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors group">
      <Link
        href={`/editor/${doc.id}`}
        className="flex items-center gap-3 min-w-0 flex-1"
      >
        <div className="w-8 h-10 bg-red-50 rounded border border-red-100 flex items-center justify-center flex-shrink-0">
          <FileText className="text-red-400" size={16} />
        </div>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newName.trim()) patch({ name: newName.trim() });
                setRenaming(false);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onBlur={() => setRenaming(false)}
                className="text-sm border border-gray-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-gray-900"
              />
            </form>
          ) : (
            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
          )}
          <p className="text-xs text-gray-400">
            {doc.page_count ?? "?"} pages · {doc.document_type} ·{" "}
            {new Date(doc.updated_at).toLocaleDateString()}
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-1.5 ml-4">
        <button
          onClick={(e) => {
            e.preventDefault();
            patch({ is_favorite: !favorite });
          }}
          className={`p-1.5 rounded hover:bg-gray-100 ${favorite ? "text-yellow-500" : "text-gray-300"}`}
          title={favorite ? "Unfavorite" : "Favorite"}
        >
          <Star size={15} fill={favorite ? "currentColor" : "none"} />
        </button>

        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            doc.status === "ready" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
          }`}
        >
          {doc.status}
        </span>

        {/* Quick Trash / Delete Button */}
        <button
          onClick={(e) => {
            e.preventDefault();
            trash();
          }}
          className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
          title="Delete / Move to Trash"
        >
          <Trash2 size={15} />
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
          >
            <MoreVertical size={15} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40 z-20">
                <button
                  onClick={() => {
                    setRenaming(true);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left"
                >
                  <Pencil size={13} /> Rename
                </button>
                <button
                  onClick={() => {
                    duplicate();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left"
                >
                  <Copy size={13} /> Duplicate
                </button>
                <button
                  onClick={() => {
                    download();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 w-full text-left"
                >
                  <Download size={13} /> Download
                </button>
                <button
                  onClick={() => {
                    trash();
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 w-full text-left"
                >
                  <Trash2 size={13} /> Delete / Trash
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
