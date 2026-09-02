"use client";

import { useState } from "react";
import type { Match, Version } from "./types";

// ── Find & Replace panel ─────────────────────────────────────────
export function FindReplacePanel({
  onFind,
  onPreview,
  onReplaceAll,
  matches,
  currentPage,
  busy,
}: {
  onFind: (text: string, scope: "page" | "document") => Promise<void>;
  onPreview: (find: string, replace: string, scope: "page" | "document") => Promise<{ count: number; warnings: string[] } | null>;
  onReplaceAll: (find: string, replace: string, scope: "page" | "document") => Promise<unknown>;
  matches: Match[];
  currentPage: number;
  busy: boolean;
}) {
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [scope, setScope] = useState<"page" | "document">("document");
  const [preview, setPreview] = useState<{ count: number; warnings: string[] } | null>(null);

  const doFind = async () => {
    setPreview(null);
    await onFind(find, scope);
  };

  const doPreview = async () => {
    const result = await onPreview(find, replace, scope);
    setPreview(result ?? null);
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold border-b border-gray-100 pb-2">Find &amp; Replace</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Find</label>
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && find && doFind()}
            placeholder="Text to search…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Replace with</label>
          <input
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
            placeholder="Replacement text…"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Scope</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "page" | "document")}
            className="w-full rounded-lg border border-gray-200 px-2 py-2 text-sm"
          >
            <option value="document">Entire document</option>
            <option value="page">Current page ({currentPage + 1})</option>
          </select>
        </div>
        <button
          onClick={doFind}
          disabled={!find || busy}
          className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Searching…" : "Find"}
        </button>
      </div>

      {matches.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1">
            {matches.length} match{matches.length !== 1 ? "es" : ""} found
          </p>
          <div className="max-h-36 overflow-y-auto space-y-1">
            {matches.slice(0, 20).map((m) => (
              <div key={m.match_id} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                <span className="font-medium text-gray-700">p{m.page_number + 1}:</span>{" "}
                {m.matched_text.slice(0, 60)}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-3 space-y-2">
        <button
          onClick={doPreview}
          disabled={!find || !replace || busy}
          className="w-full border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-50"
        >
          Preview change
        </button>
        <button
          onClick={async () => {
            await onReplaceAll(find, replace, scope);
            setPreview(null);
          }}
          disabled={!find || !replace || busy || matches.length === 0}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Replace All
        </button>
      </div>

      {preview && (
        <div className="rounded-lg border border-gray-200 p-3 text-xs space-y-1 bg-gray-50">
          <p className="font-medium text-gray-700">
            {preview.count} replacement{preview.count !== 1 ? "s" : ""} would be applied
          </p>
          <p className="text-gray-500">
            “{find.slice(0, 40)}” → “{replace.slice(0, 40)}” ({scope})
          </p>
          {preview.warnings.length > 0 && (
            <p className="text-amber-600">{preview.warnings.length} warning(s) from the engine</p>
          )}
          <p className="text-gray-400">Click “Replace All” to apply as a new version.</p>
        </div>
      )}
    </div>
  );
}

// ── Text edit panel ──────────────────────────────────────────────
export function TextEditPanel({
  selection,
  onPreview,
  onApply,
  busy,
}: {
  selection: Match | null;
  onPreview: (find: string, replace: string) => Promise<{ count: number; warnings: string[] } | null>;
  onApply: (find: string, replace: string) => Promise<void>;
  busy: boolean;
}) {
  const [original, setOriginal] = useState(selection?.matched_text ?? "");
  const [updated, setUpdated] = useState(selection?.matched_text ?? "");
  const [result, setResult] = useState<{ count: number; warnings: string[] } | null>(null);

  const key = selection?.match_id ?? -1;
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setOriginal(selection?.matched_text ?? "");
    setUpdated(selection?.matched_text ?? "");
    setResult(null);
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold border-b border-gray-100 pb-2">Edit Text</h3>
      <p className="text-xs text-gray-400">
        {selection
          ? `Page ${selection.page_number + 1} · ${selection.font_name}${
              selection.font_size ? ` · ${selection.font_size.toFixed(1)}pt` : ""
            }`
          : "Select text in the PDF to edit it, or use Find & Replace."}
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Selected text</label>
        <textarea
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">New text</label>
        <textarea
          value={updated}
          onChange={(e) => setUpdated(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={async () => setResult(await onPreview(original, updated))}
          disabled={!original || busy}
          className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-50"
        >
          Preview
        </button>
        <button
          onClick={async () => {
            await onApply(original, updated);
            setResult(null);
          }}
          disabled={!original || busy}
          className="flex-1 bg-gray-900 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Apply
        </button>
      </div>
      {result && (
        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-xs space-y-1">
          <p className="font-medium text-gray-700">
            {result.count} match{result.count !== 1 ? "es" : ""} found for this text
          </p>
          {result.warnings.length > 0 && (
            <p className="text-amber-600">{result.warnings.length} engine warning(s)</p>
          )}
          <p className="text-gray-400">“Apply” replaces the first occurrence on that page.</p>
        </div>
      )}
    </div>
  );
}

// ── Redaction panel ──────────────────────────────────────────────
export function RedactPanel({
  selectedText,
  currentPage,
  onPreview,
  onApplyRegion,
  busy,
}: {
  selectedText: string;
  currentPage: number;
  onPreview: (find: string) => Promise<Match[]>;
  onApplyRegion: (page: number, bbox: Match["bounding_box"]) => Promise<void>;
  busy: boolean;
}) {
  const [find, setFind] = useState(selectedText);
  const [hits, setHits] = useState<Match[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const searchTargets = async () => {
    setMsg(null);
    const found = await onPreview(find);
    setHits(found);
    if (found.length === 0) setMsg("No occurrences found on any page.");
  };

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold border-b border-gray-100 pb-2">True Redaction</h3>
      <p className="text-xs text-gray-500 leading-relaxed">
        Redaction <strong>removes the underlying text</strong> from the PDF content and draws an
        opaque box — the information is genuinely gone in the redacted version. The original file
        stays untouched as version 1.
      </p>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Text to redact</label>
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          placeholder={selectedText || "Exact text to remove…"}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
      <button
        onClick={searchTargets}
        disabled={!find || busy}
        className="w-full bg-gray-900 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        Find occurrences
      </button>

      {hits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            {hits.length} occurrence{hits.length !== 1 ? "s" : ""} — confirm each redaction:
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1.5">
            {hits.map((m) => (
              <div key={m.match_id} className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5">
                <span className="text-xs truncate flex-1">
                  p{m.page_number + 1}: {m.matched_text.slice(0, 30)}
                </span>
                <button
                  onClick={async () => {
                    await onApplyRegion(m.page_number, m.bounding_box);
                    setHits((prev) => prev.filter((h) => h.match_id !== m.match_id));
                  }}
                  disabled={busy}
                  className="text-xs bg-red-600 text-white rounded px-2 py-0.5 disabled:opacity-50"
                >
                  Redact
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-amber-600">{msg}</p>}
    </div>
  );
}

// ── Versions panel ───────────────────────────────────────────────
export function VersionsPanel({
  versions,
  currentVersion,
  onSelect,
  onCompare,
}: {
  versions: Version[];
  currentVersion: number;
  onSelect: (v: Version) => void;
  onCompare: () => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-gray-100 pb-2">
        <h3 className="text-sm font-semibold">Version History</h3>
        <button
          onClick={onCompare}
          className="text-xs text-indigo-600 hover:underline"
          disabled={versions.length < 2}
        >
          Compare
        </button>
      </div>
      <div className="space-y-1.5">
        {versions.map((v) => (
          <button
            key={v.id}
            onClick={() => onSelect(v)}
            className={`w-full text-left rounded-lg px-3 py-2 border transition-colors ${
              v.version_number === currentVersion
                ? "border-gray-900 bg-gray-50"
                : "border-gray-100 hover:bg-gray-50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">v{v.version_number}</span>
              <span className="text-xs text-gray-400">
                {new Date(v.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {v.operation_type} — {v.operation_summary ?? ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Pages panel ──────────────────────────────────────────────────
export function PagesPanel({
  totalPages,
  currentPage,
  onRotate,
  onDelete,
  onDuplicate,
  onInsertBlank,
  busy,
}: {
  totalPages: number;
  currentPage: number;
  onRotate: (page: number, angle: number) => void;
  onDelete: (page: number) => void;
  onDuplicate: (page: number) => void;
  onInsertBlank: (at: number) => void;
  busy: boolean;
}) {
  return (
    <div className="p-4 space-y-4">
      <h3 className="text-sm font-semibold border-b border-gray-100 pb-2">
        Page {currentPage + 1} of {totalPages}
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onRotate(currentPage, 90)}
          disabled={busy}
          className="border border-gray-200 rounded-lg py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          ⟲ Rotate 90°
        </button>
        <button
          onClick={() => onRotate(currentPage, 270)}
          disabled={busy}
          className="border border-gray-200 rounded-lg py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          ⟳ Rotate 270°
        </button>
        <button
          onClick={() => onDuplicate(currentPage)}
          disabled={busy}
          className="border border-gray-200 rounded-lg py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          Duplicate
        </button>
        <button
          onClick={() => onInsertBlank(currentPage + 1)}
          disabled={busy}
          className="border border-gray-200 rounded-lg py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          Insert blank after
        </button>
      </div>
      <button
        onClick={() => {
          if (totalPages <= 1) {
            alert("Cannot delete the only page.");
            return;
          }
          if (confirm(`Delete page ${currentPage + 1}? This creates a new version.`)) {
            onDelete(currentPage);
          }
        }}
        disabled={busy}
        className="w-full border border-red-200 text-red-600 rounded-lg py-1.5 text-xs hover:bg-red-50 disabled:opacity-50"
      >
        Delete page {currentPage + 1}
      </button>
      <p className="text-xs text-gray-400 leading-relaxed">
        All page operations run through the PDF engine and create a new version — nothing is
        destructive until you confirm.
      </p>
    </div>
  );
}
