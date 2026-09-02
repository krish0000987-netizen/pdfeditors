"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MoreVertical, Star, Trash2, Download, Copy, Pencil, FileText } from "lucide-react";

export type Doc = {
  id: string;
  name: string;
  page_count: number | null;
  file_size?: number | null;
  status: string;
  document_type: string;
  is_favorite?: boolean;
  favorite?: boolean;
  updated_at: string;
  deleted_at?: string | null;
};

export function DocumentCard({ doc, onChanged }: { doc: Doc; onChanged?: () => void }) {
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
    <div className="group bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-colors overflow-hidden">
      <Link href={`/editor/${doc.id}`} className="block">
        <div className="aspect-[3/4] bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center relative">
          <FileText className="text-red-300" size={44} />
          {favorite && (
            <Star size={14} className="absolute top-2 right-2 text-yellow-500" fill="currentColor" />
          )}
        </div>
      </Link>
      <div className="p-3">
        {renaming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newName.trim()) patch({ name: newName.trim() });
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={() => setRenaming(false)}
              className="w-full text-sm border border-gray-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </form>
        ) : (
          <Link href={`/editor/${doc.id}`}>
            <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
          </Link>
        )}
        <p className="text-xs text-gray-400 mt-0.5">
          {doc.page_count ?? "—"} pages · {new Date(doc.updated_at).toLocaleDateString()}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => patch({ is_favorite: !favorite })}
            className={`p-1 rounded hover:bg-gray-100 ${favorite ? "text-yellow-500" : "text-gray-300"}`}
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
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="p-1 rounded hover:bg-gray-100 text-gray-400"
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
                    <Trash2 size={13} /> Trash
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
