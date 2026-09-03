"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  Maximize2,
  PanelLeft,
  PanelRight,
  Download,
  Search,
  PenLine,
  Replace,
  Shield,
  History,
  Columns2,
  Loader2,
  Star,
  StickyNote,
  Save,
  CheckCircle2,
} from "lucide-react";
import { PDFViewer, type SelectionInfo } from "./pdf-viewer";
import { EditorRibbon } from "./editor-ribbon";
import {
  FindReplacePanel,
  TextEditPanel,
  RedactPanel,
  VersionsPanel,
  PagesPanel,
} from "./editor-panels";
import { AIPanel } from "@/components/ai/ai-panel";
import { bakePdfOverlays } from "@/lib/pdf-baker";
import type {
  Match,
  Version,
  EditorDocument,
  ActiveTool,
  CanvasTextElement,
  CanvasImageElement,
  CanvasWhiteoutElement,
} from "./types";

type Panel = "ai" | "find" | "edit" | "redact" | "versions" | "pages" | "none";

interface HistoryState {
  textElements: CanvasTextElement[];
  imageElements: CanvasImageElement[];
  whiteoutElements: CanvasWhiteoutElement[];
}

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
  const [savingBake, setSavingBake] = useState(false);

  const [versions, setVersions] = useState<Version[]>([]);
  const [currentVersionNumber, setCurrentVersionNumber] = useState(1);
  const [matches, setMatches] = useState<Match[]>([]);
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [compare, setCompare] = useState(false);
  const [compareOriginal, setCompareOriginal] = useState<Uint8Array | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [externalAiPrompt, setExternalAiPrompt] = useState<string | null>(null);

  // ── MS WORD CANVAS OVERLAY ELEMENTS ──
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [textElements, setTextElements] = useState<CanvasTextElement[]>([]);
  const [imageElements, setImageElements] = useState<CanvasImageElement[]>([]);
  const [whiteoutElements, setWhiteoutElements] = useState<CanvasWhiteoutElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<"text" | "image" | "whiteout" | null>(null);

  // Undo / Redo stacks
  const [historyStack, setHistoryStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  const viewerScrollRef = useRef<HTMLDivElement>(null);

  const pushHistory = useCallback(() => {
    setHistoryStack((prev) => [
      ...prev.slice(-20),
      {
        textElements: JSON.parse(JSON.stringify(textElements)),
        imageElements: JSON.parse(JSON.stringify(imageElements)),
        whiteoutElements: JSON.parse(JSON.stringify(whiteoutElements)),
      },
    ]);
    setRedoStack([]);
  }, [textElements, imageElements, whiteoutElements]);

  const handleUndo = useCallback(() => {
    if (historyStack.length === 0) return;
    const last = historyStack[historyStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      {
        textElements: JSON.parse(JSON.stringify(textElements)),
        imageElements: JSON.parse(JSON.stringify(imageElements)),
        whiteoutElements: JSON.parse(JSON.stringify(whiteoutElements)),
      },
    ]);
    setTextElements(last.textElements);
    setImageElements(last.imageElements);
    setWhiteoutElements(last.whiteoutElements);
    setHistoryStack((prev) => prev.slice(0, -1));
  }, [historyStack, textElements, imageElements, whiteoutElements]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistoryStack((prev) => [
      ...prev,
      {
        textElements: JSON.parse(JSON.stringify(textElements)),
        imageElements: JSON.parse(JSON.stringify(imageElements)),
        whiteoutElements: JSON.parse(JSON.stringify(whiteoutElements)),
      },
    ]);
    setTextElements(next.textElements);
    setImageElements(next.imageElements);
    setWhiteoutElements(next.whiteoutElements);
    setRedoStack((prev) => prev.slice(0, -1));
  }, [redoStack, textElements, imageElements, whiteoutElements]);

  const loadDoc = useCallback(async () => {
    const res = await fetch(`/api/docs/${documentId}`);
    const data = await res.json();
    if (data.document) {
      setDoc(data.document);
      setVersions(data.versions ?? []);
      const latest = (data.versions ?? []).reduce(
        (acc: Version | null, v: Version) =>
          !acc || v.version_number > acc.version_number ? v : acc,
        null
      );
      if (latest) setCurrentVersionNumber(latest.version_number);
    } else {
      setError("Document not found");
    }
  }, [documentId]);

  const loadPdf = useCallback(
    async (versionNumber?: number) => {
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
    },
    [documentId]
  );

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

  // ── ELEMENT ADDITION HANDLERS ──
  const handleAddText = useCallback(
    (customX?: number, customY?: number) => {
      pushHistory();
      const newId = crypto.randomUUID();
      const newElement: CanvasTextElement = {
        id: newId,
        page: page - 1,
        x: customX ?? 80,
        y: customY ?? 120,
        width: 180,
        height: 40,
        text: "Type here...",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "normal",
        fontStyle: "normal",
        underline: false,
        color: "#000000",
        backgroundColor: "transparent",
        textAlign: "left",
        opacity: 1,
      };
      setTextElements((prev) => [...prev, newElement]);
      setSelectedElementId(newId);
      setSelectedElementType("text");
      setActiveTool("select");
      showToast("Text box added — double click to edit");
    },
    [page, pushHistory]
  );

  const handleAddImage = useCallback(
    (dataUrl: string, width = 150, height = 80) => {
      pushHistory();
      const newId = crypto.randomUUID();
      const newElement: CanvasImageElement = {
        id: newId,
        page: page - 1,
        x: 100,
        y: 150,
        width,
        height,
        dataUrl,
        opacity: 1,
        rotation: 0,
      };
      setImageElements((prev) => [...prev, newElement]);
      setSelectedElementId(newId);
      setSelectedElementType("image");
      showToast("Image inserted onto page");
    },
    [page, pushHistory]
  );

  const handleAddWhiteout = useCallback(
    (customX?: number, customY?: number) => {
      pushHistory();
      const newId = crypto.randomUUID();
      const newElement: CanvasWhiteoutElement = {
        id: newId,
        page: page - 1,
        x: customX ?? 80,
        y: customY ?? 120,
        width: 140,
        height: 25,
        color: "#ffffff",
      };
      setWhiteoutElements((prev) => [...prev, newElement]);
      setSelectedElementId(newId);
      setSelectedElementType("whiteout");
      setActiveTool("select");
      showToast("Whiteout box added");
    },
    [page, pushHistory]
  );

  const handleAddStamp = useCallback(
    (title: string, color: string, bg: string) => {
      pushHistory();
      // Generate SVG stamp
      const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="70" viewBox="0 0 200 70">
          <rect x="3" y="3" width="194" height="64" rx="6" fill="${bg}" stroke="${color}" stroke-width="3" stroke-dasharray="6,3"/>
          <text x="100" y="32" font-family="Arial, sans-serif" font-size="12" font-weight="900" fill="${color}" text-anchor="middle" letter-spacing="1.5">${title}</text>
          <text x="100" y="52" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#64748b" text-anchor="middle">DATE: ${new Date().toLocaleDateString()}</text>
        </svg>
      `;
      const dataUrl = `data:image/svg+xml;base64,${btoa(svg)}`;
      handleAddImage(dataUrl, 180, 60);
    },
    [handleAddImage, pushHistory]
  );

  const handleUpdateText = useCallback(
    (id: string, updates: Partial<CanvasTextElement>) => {
      setTextElements((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
      );
    },
    []
  );

  const handleUpdateSelectedText = useCallback(
    (updates: Partial<CanvasTextElement>) => {
      if (selectedElementId && selectedElementType === "text") {
        handleUpdateText(selectedElementId, updates);
      }
    },
    [selectedElementId, selectedElementType, handleUpdateText]
  );

  const handleUpdateImage = useCallback(
    (id: string, updates: Partial<CanvasImageElement>) => {
      setImageElements((prev) =>
        prev.map((img) => (img.id === id ? { ...img, ...updates } : img))
      );
    },
    []
  );

  const handleUpdateWhiteout = useCallback(
    (id: string, updates: Partial<CanvasWhiteoutElement>) => {
      setWhiteoutElements((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...updates } : w))
      );
    },
    []
  );

  const handleDeleteSelected = useCallback(() => {
    if (!selectedElementId) return;
    pushHistory();
    if (selectedElementType === "text") {
      setTextElements((prev) => prev.filter((t) => t.id !== selectedElementId));
    } else if (selectedElementType === "image") {
      setImageElements((prev) => prev.filter((img) => img.id !== selectedElementId));
    } else if (selectedElementType === "whiteout") {
      setWhiteoutElements((prev) => prev.filter((w) => w.id !== selectedElementId));
    }
    setSelectedElementId(null);
    setSelectedElementType(null);
  }, [selectedElementId, selectedElementType, pushHistory]);

  // ── SAVE & BAKE OVERLAYS INTO IMMUTABLE PDF ──
  const saveVisualEdits = useCallback(async () => {
    if (!pdfData) return;
    setSavingBake(true);
    try {
      // 1. Bake all overlays into a fresh PDF byte array
      const bakedBytes = await bakePdfOverlays(pdfData, {
        textElements,
        imageElements,
        whiteoutElements,
      });

      // 2. Upload baked PDF to server
      const blob = new Blob([bakedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", blob, `${doc?.name || "document"}.pdf`);
      formData.append(
        "summary",
        `MS Word Edits: ${textElements.length} text, ${imageElements.length} images, ${whiteoutElements.length} whiteouts`
      );

      const res = await fetch(`/api/docs/${documentId}/bake`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save baked PDF");

      // 3. Reset local canvas overlays and refresh
      setTextElements([]);
      setImageElements([]);
      setWhiteoutElements([]);
      setSelectedElementId(null);
      setHistoryStack([]);
      setRedoStack([]);

      await loadPdf(data.versionNumber);
      await loadDoc();
      showToast(`Version ${data.versionNumber} saved with all edits baked!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save edits");
    } finally {
      setSavingBake(false);
    }
  }, [
    pdfData,
    textElements,
    imageElements,
    whiteoutElements,
    doc?.name,
    documentId,
    loadPdf,
    loadDoc,
  ]);

  const exportPdf = useCallback(async () => {
    if (
      textElements.length > 0 ||
      imageElements.length > 0 ||
      whiteoutElements.length > 0
    ) {
      // Bake locally first so downloaded PDF includes all pending edits
      if (pdfData) {
        const baked = await bakePdfOverlays(pdfData, {
          textElements,
          imageElements,
          whiteoutElements,
        });
        const blob = new Blob([baked.buffer as ArrayBuffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = doc?.name || "edited_document.pdf";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    }
    window.open(`/api/docs/${documentId}/file?download=1`, "_blank");
  }, [textElements, imageElements, whiteoutElements, pdfData, doc?.name, documentId]);

  // ── ENGINE CALLS ──
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
      if (result?.output_path || result?.dry_run === false) {
        await loadPdf();
        await loadDoc();
        showToast(summary);
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
        });
        return { count: result.count ?? 0, warnings: [] };
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
        await refreshAfterEdit(
          result,
          `Replaced ${result.count ?? 0} occurrence(s) — new version saved`
        );
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
    async (find: string, _replace: string) => {
      if (!find) return null;
      setBusy(true);
      try {
        const found = await doFind(find, "document");
        const pageMatches = found.filter((m) => m.page_number === page - 1);
        return { count: pageMatches.length || found.length, warnings: [] };
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
        await refreshAfterEdit(
          result,
          "Redaction applied — content removed, new version saved"
        );
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

  const selectVersion = (v: Version) => {
    setCurrentVersionNumber(v.version_number);
    loadPdf(v.version_number);
  };

  const selectedTextObj =
    selectedElementType === "text"
      ? textElements.find((t) => t.id === selectedElementId) || null
      : null;

  const hasUnsavedVisuals =
    textElements.length > 0 ||
    imageElements.length > 0 ||
    whiteoutElements.length > 0;

  if (error && !doc) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-red-500 mb-3">{error}</p>
          <button
            onClick={() => router.push("/documents")}
            className="text-sm text-indigo-600 hover:underline"
          >
            ← Back to documents
          </button>
        </div>
      </div>
    );
  }

  const activeVersion = versions.find(
    (v) => v.version_number === currentVersionNumber
  );

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* ── TOP HEADER / NAV BAR ── */}
      <div className="h-12 bg-white border-b border-gray-200 flex items-center gap-1.5 px-3 flex-shrink-0 z-30 shadow-xs">
        <button
          onClick={() => router.push("/documents")}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Back to documents"
        >
          <ArrowLeft size={17} />
        </button>
        <span className="h-5 w-px bg-gray-200 mx-1" />
        <button
          onClick={toggleFavorite}
          className="p-1.5 rounded hover:bg-gray-100"
          title="Favorite"
        >
          <Star
            size={16}
            className={doc?.is_favorite ? "text-yellow-500" : "text-gray-400"}
            fill={doc?.is_favorite ? "currentColor" : "none"}
          />
        </button>
        <h1 className="text-sm font-semibold text-gray-900 truncate max-w-[180px]">
          {doc?.name ?? "…"}
        </h1>
        <span className="text-xs text-gray-400 flex-shrink-0 font-medium">
          v{currentVersionNumber}
        </span>

        <span className="h-5 w-px bg-gray-200 mx-1.5" />
        <ToolButton
          icon={Search}
          label="Find & Replace"
          active={panel === "find"}
          onClick={() => setPanel(panel === "find" ? "none" : "find")}
        />
        <ToolButton
          icon={PenLine}
          label="Text Replace"
          active={panel === "edit"}
          onClick={() => setPanel(panel === "edit" ? "none" : "edit")}
        />
        <ToolButton
          icon={Replace}
          label="Pages"
          active={panel === "pages"}
          onClick={() => setPanel(panel === "pages" ? "none" : "pages")}
        />
        <ToolButton
          icon={Shield}
          label="Redact"
          active={panel === "redact"}
          onClick={() => setPanel(panel === "redact" ? "none" : "redact")}
        />
        <ToolButton icon={StickyNote} label="Note" onClick={addStickyNote} />
        <ToolButton
          icon={History}
          label="History"
          active={panel === "versions"}
          onClick={() => setPanel(panel === "versions" ? "none" : "versions")}
        />
        <ToolButton
          icon={Columns2}
          label="Compare"
          active={compare}
          onClick={() => (compare ? setCompare(false) : openCompare())}
        />

        <div className="flex-1" />

        {hasUnsavedVisuals && (
          <button
            onClick={saveVisualEdits}
            disabled={savingBake}
            className="flex items-center gap-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-3 py-1.5 rounded-lg shadow-sm transition-all"
            title="Save your changes to an immutable version in storage"
          >
            {savingBake ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save Edits</span>
          </button>
        )}

        <button
          onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-xs text-gray-600 font-medium w-11 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          title="Zoom in"
        >
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
        <span className="h-5 w-px bg-gray-200 mx-1.5" />
        <button
          onClick={() => setPanel(panel === "ai" ? "none" : "ai")}
          className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 transition-colors ${
            panel === "ai"
              ? "bg-purple-600 text-white shadow-xs"
              : "text-purple-700 bg-purple-50 hover:bg-purple-100"
          }`}
        >
          ✦ AI Copilot
        </button>
        <button
          onClick={exportPdf}
          className="text-xs bg-gray-900 text-white font-medium px-3 py-1.5 rounded-lg hover:bg-gray-800 flex items-center gap-1 shadow-xs"
        >
          <Download size={13} /> Export
        </button>
      </div>

      {/* ── MS WORD RIBBON TOOLBAR ── */}
      <EditorRibbon
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        selectedTextElement={selectedTextObj}
        onUpdateSelectedText={handleUpdateSelectedText}
        onAddText={() => handleAddText()}
        onAddImage={handleAddImage}
        onAddWhiteout={() => handleAddWhiteout()}
        onAddStamp={handleAddStamp}
        onAddSignature={handleAddImage}
        onOpenAI={() => setPanel("ai")}
        onQuickAiPrompt={(p) => {
          setPanel("ai");
          setExternalAiPrompt(p);
        }}
        canUndo={historyStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDeleteSelected={handleDeleteSelected}
        hasSelection={Boolean(selectedElementId)}
      />

      {(busy || savingBake) && (
        <div className="h-0.5 bg-blue-600 animate-pulse flex-shrink-0" />
      )}

      {/* ── MAIN WORKSPACE BODY ── */}
      <div className="flex-1 flex min-h-0">
        {/* Left thumbnails */}
        {leftOpen && (
          <div className="w-36 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0 p-2 space-y-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={`w-full aspect-[3/4] rounded-lg border-2 flex flex-col items-center justify-center text-xs font-semibold transition-colors ${
                  page === n
                    ? "border-blue-600 bg-blue-50/50 text-blue-900 shadow-xs"
                    : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                }`}
              >
                <span>Page</span>
                <span className="text-base font-bold">{n}</span>
              </button>
            ))}
          </div>
        )}

        {/* Center Canvas Viewer */}
        <div className="flex-1 flex flex-col min-w-0">
          {compare ? (
            <div className="flex-1 flex min-h-0">
              <div className="w-1/2 border-r border-gray-200 overflow-auto bg-gray-200 relative">
                <div className="sticky top-0 z-10 bg-gray-900 text-white text-xs px-3 py-1.5 font-bold">
                  ORIGINAL (v1)
                </div>
                {compareOriginal && (
                  <PDFViewer
                    data={compareOriginal}
                    page={page}
                    zoom={zoom}
                    activeTool="select"
                    textElements={[]}
                    imageElements={[]}
                    whiteoutElements={[]}
                    selectedElementId={null}
                    onSelectElement={() => {}}
                    onUpdateTextElement={() => {}}
                    onUpdateImageElement={() => {}}
                    onUpdateWhiteoutElement={() => {}}
                    onDeleteElement={() => {}}
                  />
                )}
              </div>
              <div className="w-1/2 overflow-auto bg-gray-200 relative">
                <div className="sticky top-0 z-10 bg-blue-600 text-white text-xs px-3 py-1.5 font-bold">
                  EDITED (v{currentVersionNumber})
                </div>
                {pdfData && (
                  <PDFViewer
                    data={pdfData}
                    page={page}
                    zoom={zoom}
                    activeTool="select"
                    textElements={textElements}
                    imageElements={imageElements}
                    whiteoutElements={whiteoutElements}
                    selectedElementId={selectedElementId}
                    onSelectElement={(id, type) => {
                      setSelectedElementId(id);
                      setSelectedElementType(type || null);
                    }}
                    onUpdateTextElement={handleUpdateText}
                    onUpdateImageElement={handleUpdateImage}
                    onUpdateWhiteoutElement={handleUpdateWhiteout}
                    onDeleteElement={handleDeleteSelected}
                  />
                )}
              </div>
            </div>
          ) : (
            <div ref={viewerScrollRef} className="flex-1 overflow-auto bg-gray-200/60">
              {loadingPdf || !pdfData ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Loader2
                      className="animate-spin mx-auto text-blue-600 mb-3"
                      size={32}
                    />
                    <p className="text-sm font-medium text-gray-600">
                      Loading PDF &amp; tools…
                    </p>
                  </div>
                </div>
              ) : (
                <PDFViewer
                  data={pdfData}
                  page={page}
                  zoom={zoom}
                  activeTool={activeTool}
                  textElements={textElements}
                  imageElements={imageElements}
                  whiteoutElements={whiteoutElements}
                  selectedElementId={selectedElementId}
                  onSelectElement={(id, type) => {
                    setSelectedElementId(id);
                    setSelectedElementType(type || null);
                  }}
                  onUpdateTextElement={handleUpdateText}
                  onUpdateImageElement={handleUpdateImage}
                  onUpdateWhiteoutElement={handleUpdateWhiteout}
                  onDeleteElement={handleDeleteSelected}
                  onCanvasClickAdd={(clickX, clickY) => {
                    if (activeTool === "text") handleAddText(clickX, clickY);
                    if (activeTool === "whiteout") handleAddWhiteout(clickX, clickY);
                  }}
                  onPageCount={setTotalPages}
                  onSelectText={(sel) => {
                    setSelection(sel);
                    setSelectedText(sel.text);
                  }}
                />
              )}
            </div>
          )}

          {/* Page Footer Navigation */}
          <div className="h-9 bg-white border-t border-gray-200 flex items-center justify-center gap-3 text-xs text-gray-600 flex-shrink-0">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30 font-medium"
            >
              ‹ Prev
            </button>
            <span className="font-semibold text-gray-800">
              Page {page} of {totalPages || "…"}
              {activeVersion?.operation_type && (
                <span className="text-gray-400 font-normal">
                  {" "}
                  · {activeVersion.operation_type}
                </span>
              )}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-2 py-0.5 rounded hover:bg-gray-100 disabled:opacity-30 font-medium"
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

        {/* ── RIGHT PANEL (AI COPILOT / SIDEBAR PANELS) ── */}
        {panel !== "none" && (
          <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto flex-shrink-0 flex flex-col shadow-xs">
            <div className="flex items-center justify-end px-2 pt-2">
              <button
                onClick={() => setPanel("none")}
                className="p-1 rounded hover:bg-gray-100 text-gray-400"
                title="Close panel"
              >
                <PanelRight size={15} />
              </button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              {panel === "ai" && (
                <AIPanel
                  documentId={documentId}
                  selectedText={selectedText}
                  currentPage={page}
                  externalPrompt={externalAiPrompt}
                  onApplied={() => {
                    loadPdf();
                    loadDoc();
                  }}
                  onFindMatches={(find) => {
                    doFind(find, "document").then((found) => {
                      if (found.length > 0) setPage(found[0].page_number + 1);
                      showToast(
                        `${found.length} match(es) highlighted in the match list`
                      );
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
                  onRotate={(p, angle) =>
                    pageOp(
                      { action: "rotate_pages", pages: [p], angle },
                      `Page rotated ${angle}°`
                    )
                  }
                  onDelete={(p) =>
                    pageOp({ action: "delete_pages", pages: [p] }, "Page deleted")
                  }
                  onDuplicate={(p) =>
                    pageOp(
                      { action: "duplicate_pages", pages: [p] },
                      "Page duplicated"
                    )
                  }
                  onInsertBlank={(at) =>
                    pageOp(
                      { action: "insert_blank", at },
                      "Blank page inserted"
                    )
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-2xl z-50 flex items-center gap-2 border border-gray-700 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
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
      className={`hidden md:flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white shadow-xs"
          : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}
