"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ZoomIn, ZoomOut, Maximize2, PanelLeft, PanelRight, Download,
  Search, PenLine, Replace, Shield, History, Columns2, Loader2, Star, StickyNote,
} from "lucide-react";
import { PDFViewer, type SelectionInfo } from "./pdf-viewer";
import { FindReplacePanel, TextEditPanel, RedactPanel, VersionsPanel, PagesPanel } from "./editor-panels";
import { AIPanel } from "@/components/ai/ai-panel";
import type { Match, Version, EditorDocument } from "./types";

type Panel = "ai" | "find" | "edit" | "redact" | "versions" | "pages" | "none";

export function EditorWorkspace({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<EditorDocument | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [panel, setPanel] = useState<Panel>("ai");
  const [leftOpen, setLeftOpen] = useState(true);
  const [busy, setBusy] = useState(false);

  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersionNumber, setCurrentVersionNumber] = useState(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [compare, setCompare] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState<Uint8Array | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const viewerScrollRef = useRef<HTMLDivElement>(null);

  const loadDoc = useCallback(async () => {
    const res = await fetch(`/api/docs/${documentId}`);
    const data = await res.json();
    if (data.document) {
      setDoc(data.document);
      setVersions(data.versions ?? []);
      const latest = (data.versions ?? []).reduce(
        (acc: Version | null, v: Version) => (!acc || v.version_number > acc.version_number ? v : acc),
        null
      );
      if (latest) setCurrentVersionNumber(latest.version_number);
    } else {
      setError("Document not found");
    }
  }, [documentId]);

  const loadPdf = useCallback(async (versionNumber?: number) => {
    setLoadingPdf(true);
    setError(null);
    try {
      const url = versionNumber
        ? `/api/docs/${documentId}/file?version=${versionNumber}`
        : `/api/docs/${documentId}/file`;
      const res = await fetch(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load PDF");
      }
      const buf = await res.arrayBuffer();
      setPdfData(new Uint8Array(buf));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load PDF");
    } finally {
      setLoadingPdf(false);
    }
  }, [documentId]);

  useEffect(() => {
    void Promise.resolve().then(() => loadDoc());
  }, [loadDoc]);

  useEffect(() => {
    void Promise.resolve().then(() => loadPdf());
  }, [loadPdf]);

  useEffect(() => {
    if (page > totalPages && totalPages > 0) {
      void Promise.resolve().then(() => setPage(totalPages));
    }
  }, [totalPages, page]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // ── engine calls ─────────────────────────────────────────────
  const engineCall = useCallback(
    async (body: Record<string, unknown>): Promise<any> => {
      const res = await fetch(`/api/docs/${documentId}/engine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Engine operation failed");
      return data;
    },
    [documentId]
  );

  const refreshAfterEdit = useCallback(
    async (result: any, summary: string) => {
      if (result?.output_path) {
        // reload from the just-created latest version
        await loadPdf();
        await loadDoc();
        showToast(summary);
      } else if (result?.dry_run === false) {
        await loadPdf();
        await loadDoc();
      }
    },
    [loadPdf, loadDoc]
  );

  const doFind = useCallback(
    async (text: string, scope: "page" | "document") => {
      if (!text) return [];
      const result = await engineCall({
        action: "find",
        search_text: text,
        page: scope === "page" ? page - 1 : undefined,
      });
      setMatches(result.matches ?? []);
      return (result.matches ?? []) as Match[];
    },
    [engineCall, page]
  );

  const doPreview = useCallback(
    async (
      find: string,
      replace: string,
      scope: "page" | "document"
    ): Promise<{ count: number; warnings: string[] }> => {
      setBusy(true);
      try {
        const result = await engineCall({
          action: "replace_all",
          search: find,
          replacement: replace,
          dry_run: true,
          ...(scope === "page" ? {} : {}),
        });
        return { count: result.count ?? 0, warnings: collectWarnings(result) };
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Preview failed");
        return { count: 0, warnings: [] };
      } finally {
        setBusy(false);
      }
    },
    [engineCall]
  );

  const doReplaceAll = useCallback(
    async (find: string, replace: string, _scope: "page" | "document"): Promise<void> => {
      setBusy(true);
      try {
        const result = await engineCall({
          action: "replace_all",
          search: find,
          replacement: replace,
        });
        await refreshAfterEdit(result, `Replaced ${result.count ?? 0} occurrence(s) — new version saved`);
        setMatches([]);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Replace failed");
      } finally {
        setBusy(false);
      }
    },
    [engineCall, refreshAfterEdit]
  );

  const doTextPreview = useCallback(
    async (find: string, replace: string) => {
      if (!find) return null;
      setBusy(true);
      try {
        const found = await doFind(find, "document");
        const pageMatches = found.filter((m) => m.page_number === page - 1);
        if (pageMatches.length === 0 && found.length > 0) {
          return { count: found.length, warnings: ["No exact match on the current page"] };
        }
        return { count: pageMatches.length, warnings: [] };
      } finally {
        setBusy(false);
      }
    },
    [doFind, page]
  );

  const doTextApply = useCallback(
    async (find: string, replace: string) => {
      if (!find) return;
      setBusy(true);
      try {
        // dry-run first via replace_all scoped check, then single replace on current page
        const result = await engineCall({
          action: "replace",
          search_text: find,
          new_text: replace,
          match_id: 0,
          page: page - 1,
        });
        await refreshAfterEdit(result, "Text replaced — new version saved");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Replace failed");
      } finally {
        setBusy(false);
      }
    },
    [engineCall, page, refreshAfterEdit]
  );

  const doRedactPreview = useCallback(
    async (find: string) => doFind(find, "document"),
    [doFind]
  );

  const doRedactApply = useCallback(
    async (targetPage: number, bbox: Match["bounding_box"]) => {
      setBusy(true);
      try {
        const result = await engineCall({
          action: "redact",
          regions: [{ page: targetPage, bbox }],
        });
        await refreshAfterEdit(result, "Redaction applied — content removed, new version saved");
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Redaction failed");
      } finally {
        setBusy(false);
      }
    },
    [engineCall, refreshAfterEdit]
  );

  const pageOp = useCallback(
    async (body: Record<string, unknown>, summary: string) => {
      setBusy(true);
      try {
        const result = await engineCall(body);
        await refreshAfterEdit(result, summary);
      } catch (e) {
        showToast(e instanceof Error ? e.message : "Page operation failed");
      } finally {
        setBusy(false);
      }
    },
    [engineCall, refreshAfterEdit]
  );

  const addStickyNote = useCallback(async () => {
    if (!selection) {
      showToast("Select a spot in the text first, then add a note.");
      return;
    }
    const note = prompt("Note contents:");
    if (!note) return;
    setBusy(true);
    try {
      // anchor near the current page top-left quadrant by default
      const result = await engineCall({
        action: "add_annotation",
        page: page - 1,
        subtype: "Text",
        rect: [72, 700, 122, 750],
        data: { contents: note, author: "EDITOR" },
      });
      await refreshAfterEdit(result, "Sticky note added — new version saved");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not add note");
    } finally {
      setBusy(false);
    }
  }, [selection, page, engineCall, refreshAfterEdit]);

  const openCompare = useCallback(async () => {
    const original = versions.find((v) => v.version_number === 1);
    if (!original) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/docs/${documentId}/file?version=1`);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        setCompareOriginal(new Uint8Array(buf));
        setCompare(true);
      }
    } finally {
      setBusy(false);
    }
  }, [versions, documentId]);

  const toggleFavorite = async () => {
    if (!doc) return;
    await fetch(`/api/docs/${doc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_favorite: !doc.is_favorite }),
    });
    setDoc({ ...doc, is_favorite: !doc.is_favorite });
  };

  const exportPdf = () => {
    window.open(`/api/docs/${documentId}/file?download=1`, "_blank");
  };

  const selectVersion = (v: Version) => {
    setCurrentVersionNumber(v.version_number);
    loadPdf(v.version_number);
  };

  if (error && !doc) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button onClick={() => router.push("/documents")} className="text-sm text-indigo-600 hover:underline">
            ← Back to documents
          </button>
        </div>
      </div>
    );
  }

  const activeVersion = versions.find((v) => v.version_number === currentVersionNumber);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Toolbar */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-1 px-3 flex-shrink-0">
        <button
          onClick={() => router.push("/documents")}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Back to documents"
        >
          <ArrowLeft size={17} />
        </button>
        <span className="h-5 w-px bg-gray-200 mx-1" />
        <button onClick={toggleFavorite} className="p-1.5 rounded hover:bg-gray-100" title="Favorite">
          <Star size={16} className={doc?.is_favorite ? "text-yellow-500" : "text-gray-400"} fill={doc?.is_favorite ? "currentColor" : "none"} />
        </button>
        <h1 className="text-sm font-medium text-gray-900 truncate max-w-[180px]">{doc?.name ?? "…"}</h1>
        <span className="text-xs text-gray-400 flex-shrink-0">v{currentVersionNumber}</span>

        <span className="h-5 w-px bg-gray-200 mx-2" />
        <ToolButton icon={Search} label="Find" active={panel === "find"} onClick={() => setPanel(panel === "find" ? "none" : "find")} />
        <ToolButton icon={PenLine} label="Edit" active={panel === "edit"} onClick={() => setPanel(panel === "edit" ? "none" : "edit")} />
        <ToolButton icon={Replace} label="Pages" active={panel === "pages"} onClick={() => setPanel(panel === "pages" ? "none" : "pages")} />
        <ToolButton icon={Shield} label="Redact" active={panel === "redact"} onClick={() => setPanel(panel === "redact" ? "none" : "redact")} />
        <ToolButton icon={StickyNote} label="Note" onClick={addStickyNote} />
        <ToolButton icon={History} label="History" active={panel === "versions"} onClick={() => setPanel(panel === "versions" ? "none" : "versions")} />
        <ToolButton icon={Columns2} label="Compare" active={compare} onClick={() => (compare ? setCompare(false) : openCompare())} />

        <div className="flex-1" />

        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Zoom out">
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-gray-500 w-11 text-center">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))} className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="Zoom in">
          <ZoomIn size={16} />
        </button>
        <button
          onClick={() => {
            const el = viewerScrollRef.current;
            if (!el) return;
            setZoom(+Math.max(0.4, (el.clientWidth - 60) / 612).toFixed(2));
          }}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Fit width"
        >
          <Maximize2 size={15} />
        </button>
        <span className="h-5 w-px bg-gray-200 mx-2" />
        <button
          onClick={() => setPanel(panel === "ai" ? "none" : "ai")}
          className={`text-xs px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 ${
            panel === "ai" ? "bg-indigo-600 text-white" : "text-indigo-600 hover:bg-indigo-50"
          }`}
        >
          ✦ AI
        </button>
        <button onClick={exportPdf} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-800 flex items-center gap-1">
          <Download size={13} /> Export
        </button>
      </div>

      {busy && (
        <div className="h-0.5 bg-indigo-600 animate-pulse flex-shrink-0" />
      )}

      {/* Body */}
      <div className="flex-1 flex min-h-0">
        {/* Left thumbnails */}
        {leftOpen && (
          <div className="w-40 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 p-2 space-y-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-full aspect-[3/4] rounded-lg border-2 flex items-center justify-center text-xs font-medium transition-colors ${
                  page === n
                    ? "border-gray-900 bg-gray-50 text-gray-900"
                    : "border-gray-200 bg-gray-100 text-gray-500 hover:border-gray-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* Center viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          {compare ? (
            <div className="flex-1 flex min-h-0">
              <div className="w-1/2 border-r border-gray-200 overflow-auto bg-gray-200 relative">
                <div className="sticky top-0 z-10 bg-gray-900 text-white text-xs px-3 py-1.5">
                  ORIGINAL (v1)
                </div>
                {compareOriginal && (
                  <PDFViewer data={compareOriginal} page={page} zoom={zoom} />
                )}
              </div>
              <div className="w-1/2 overflow-auto bg-gray-200 relative">
                <div className="sticky top-0 z-10 bg-indigo-600 text-white text-xs px-3 py-1.5">
                  EDITED (v{currentVersionNumber})
                </div>
                {pdfData && (
                  <PDFViewer data={pdfData} page={page} zoom={zoom} />
                )}
              </div>
            </div>
          ) : (
            <div ref={viewerScrollRef} className="flex-1 overflow-auto">
              {loadingPdf || !pdfData ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="animate-spin mx-auto text-gray-400 mb-3" size={28} />
                    <p className="text-sm text-gray-500">Loading PDF…</p>
                  </div>
                </div>
              ) : (
                <PDFViewer
                  data={pdfData}
                  page={page}
                  zoom={zoom}
                  onPageCount={setTotalPages}
                  onSelectText={(sel) => {
                    setSelection(sel);
                    setSelectedText(sel.text);
                  }}
                />
              )}
            </div>
          )}

          {/* Page nav */}
          <div className="h-9 bg-white border-t border-gray-200 flex items-center justify-center gap-3 text-xs text-gray-600 flex-shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              ‹ Prev
            </button>
            <span>
              Page {page} of {totalPages || "…"}
              {activeVersion?.operation_type && (
                <span className="text-gray-300"> · {activeVersion.operation_type}</span>
              )}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30"
            >
              Next ›
            </button>
            <button
              onClick={() => setLeftOpen((v) => !v)}
              className="p-1 rounded hover:bg-gray-100"
              title="Toggle page panel"
            >
              <PanelLeft size={14} />
            </button>
          </div>
        </div>

        {/* Right panel */}
        {panel !== "none" && (
          <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0 flex flex-col">
            <div className="flex items-center justify-end px-2 pt-2">
              <button onClick={() => setPanel("none")} className="p-1 rounded hover:bg-gray-100 text-gray-400" title="Close panel">
                <PanelRight size={15} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {panel === "ai" && (
                <AIPanel
                  documentId={documentId}
                  selectedText={selectedText}
                  currentPage={page - 1}
                  onApplied={() => {
                    loadPdf();
                    loadDoc();
                  }}
                  onFindMatches={(find) => {
                    doFind(find, "document").then((found) => {
                      if (found.length > 0) setPage(found[0].page_number + 1);
                      showToast(`${found.length} match(es) highlighted in the match list`);
                    });
                  }}
                />
              )}
              {panel === "find" && (
                <FindReplacePanel
                  onFind={async (t, scope) => {
                    await doFind(t, scope);
                  }}
                  onPreview={doPreview}
                  onReplaceAll={doReplaceAll}
                  matches={matches}
                  currentPage={page - 1}
                  busy={busy}
                />
              )}
              {panel === "edit" && (
                <TextEditPanel
                  selection={
                    selection
                      ? {
                          match_id: -1,
                          matched_text: selection.text,
                          page_number: selection.page,
                          bounding_box: [0, 0, 0, 0],
                          font_name: "selection",
                          font_size: null,
                        }
                      : null
                  }
                  onPreview={doTextPreview}
                  onApply={doTextApply}
                  busy={busy}
                />
              )}
              {panel === "redact" && (
                <RedactPanel
                  selectedText={selectedText}
                  currentPage={page - 1}
                  onPreview={doRedactPreview}
                  onApplyRegion={doRedactApply}
                  busy={busy}
                />
              )}
              {panel === "versions" && (
                <VersionsPanel
                  versions={versions}
                  currentVersion={currentVersionNumber}
                  onSelect={selectVersion}
                  onCompare={openCompare}
                />
              )}
              {panel === "pages" && (
                <PagesPanel
                  totalPages={totalPages}
                  currentPage={page - 1}
                  busy={busy}
                  onRotate={(p, angle) => pageOp({ action: "rotate_pages", pages: [p], angle }, `Page rotated ${angle}°`)}
                  onDelete={(p) => pageOp({ action: "delete_pages", pages: [p] }, "Page deleted")}
                  onDuplicate={(p) => pageOp({ action: "duplicate_pages", pages: [p] }, "Page duplicated")}
                  onInsertBlank={(at) => pageOp({ action: "insert_blank", at }, "Blank page inserted")}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`hidden md:flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg font-medium ${
        active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function collectWarnings(result: any): string[] {
  const warnings: string[] = [];
  for (const r of result?.results ?? []) {
    if (r.warnings) warnings.push(...r.warnings);
    const degs = r.fidelity_report?.degradations ?? [];
    for (const d of degs) warnings.push(`${d.kind}: ${d.detail}`);
  }
  return warnings;
}
