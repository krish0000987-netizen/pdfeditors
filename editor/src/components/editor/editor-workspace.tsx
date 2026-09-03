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
  ChevronLeft,
  ChevronRight,
  Trash2,
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
import { exportPdfDocument } from "@/lib/pdf/exporter";
import { HistoryManager } from "@/lib/pdf/history";
import {
  createEmptyDocumentModel,
  createEmptyPageModel,
  type DocumentModel,
  type PageModel,
  type TextElement,
  type ImageElement,
  type ShapeElement,
  type RedactionElement,
  type ShapeType,
} from "@/lib/pdf/document-model";
import type {
  Match,
  Version,
  EditorDocument,
  ActiveTool,
} from "./types";

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

  // ── CORE DOCUMENT MODEL & SELECTION ──
  const [docModel, setDocModel] = useState<DocumentModel>(() =>
    createEmptyDocumentModel(documentId, "document.pdf")
  );
  const [activeTool, setActiveTool] = useState<ActiveTool>("select");
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [selectedElementType, setSelectedElementType] = useState<
    "text" | "image" | "shape" | "redaction" | null
  >(null);

  // Command-based History Manager
  const historyManagerRef = useRef<HistoryManager>(new HistoryManager(50));
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateHistoryStatus = useCallback(() => {
    setCanUndo(historyManagerRef.current.canUndo());
    setCanRedo(historyManagerRef.current.canRedo());
  }, []);

  const recordHistory = useCallback(
    (desc: string, beforeState: DocumentModel, afterState: DocumentModel) => {
      historyManagerRef.current.record("update_element", desc, beforeState, afterState);
      updateHistoryStatus();
    },
    [updateHistoryStatus]
  );

  const handleUndo = useCallback(() => {
    const prevState = historyManagerRef.current.undo();
    if (prevState) {
      setDocModel(prevState);
      updateHistoryStatus();
    }
  }, [updateHistoryStatus]);

  const handleRedo = useCallback(() => {
    const nextState = historyManagerRef.current.redo();
    if (nextState) {
      setDocModel(nextState);
      updateHistoryStatus();
    }
  }, [updateHistoryStatus]);

  const viewerScrollRef = useRef<HTMLDivElement>(null);

  const loadDoc = useCallback(async () => {
    try {
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
    } catch {
      setError("Failed to fetch document metadata");
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handlePageCount = useCallback((numPages: number) => {
    setTotalPages(numPages);
    setDocModel((prev) => {
      if (prev.pages.length === numPages) return prev;
      const newPages: PageModel[] = [];
      for (let i = 0; i < numPages; i++) {
        if (prev.pages[i]) {
          newPages.push(prev.pages[i]);
        } else {
          newPages.push(createEmptyPageModel(i));
        }
      }
      return {
        ...prev,
        pageCount: numPages,
        pages: newPages,
      };
    });
  }, []);

  // When a page extracts original text/images from PDF.js
  const handlePageExtracted = useCallback(
    (pageIndex: number, extractedTexts: TextElement[], extractedImages: ImageElement[]) => {
      setDocModel((prev) => {
        const nextPages = [...prev.pages];
        if (!nextPages[pageIndex]) {
          nextPages[pageIndex] = createEmptyPageModel(pageIndex);
        }
        const currentPage = nextPages[pageIndex];
        // Only populate original items if page has no text elements yet
        if (currentPage.textElements.length === 0 && currentPage.imageElements.length === 0) {
          nextPages[pageIndex] = {
            ...currentPage,
            textElements: extractedTexts,
            imageElements: extractedImages,
          };
          return { ...prev, pages: nextPages };
        }
        return prev;
      });
    },
    []
  );

  const currentPageIndex = page - 1;
  const currentPageModel = docModel.pages[currentPageIndex] || createEmptyPageModel(currentPageIndex);

  // ── ELEMENT ADDITION HANDLERS ──
  const handleAddText = useCallback(
    (customX?: number, customY?: number) => {
      const newId = `text-add-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newElement: TextElement = {
        id: newId,
        pageIndex: currentPageIndex,
        x: customX ?? 80,
        y: customY ?? 120,
        width: 180,
        height: 35,
        text: "Type here...",
        fontFamily: "Helvetica, Arial, sans-serif",
        fontSize: 12,
        fontWeight: "normal",
        fontStyle: "normal",
        underline: false,
        strike: false,
        color: "#000000",
        backgroundColor: "transparent",
        textAlign: "left",
        lineHeight: 1.25,
        letterSpacing: 0,
        opacity: 1,
        rotation: 0,
        source: "added",
        modified: false,
        deleted: false,
      };

      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        if (!next.pages[currentPageIndex]) next.pages[currentPageIndex] = createEmptyPageModel(currentPageIndex);
        next.pages[currentPageIndex].textElements.push(newElement);
        recordHistory("Add text element", prev, next);
        return next;
      });

      setSelectedElementId(newId);
      setSelectedElementType("text");
      setActiveTool("select");
      showToast("Text box added — double click to edit");
    },
    [currentPageIndex, recordHistory]
  );

  const handleAddImage = useCallback(
    (dataUrl: string, width = 150, height = 80) => {
      const newId = `img-add-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const newElement: ImageElement = {
        id: newId,
        pageIndex: currentPageIndex,
        x: 100,
        y: 150,
        width,
        height,
        dataUrl,
        opacity: 1,
        rotation: 0,
        aspectRatioLocked: true,
        source: "added",
        modified: false,
        deleted: false,
      };

      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        if (!next.pages[currentPageIndex]) next.pages[currentPageIndex] = createEmptyPageModel(currentPageIndex);
        next.pages[currentPageIndex].imageElements.push(newElement);
        recordHistory("Add image element", prev, next);
        return next;
      });

      setSelectedElementId(newId);
      setSelectedElementType("image");
      showToast("Image inserted onto page");
    },
    [currentPageIndex, recordHistory]
  );

  const handleAddShape = useCallback(
    (type: ShapeType) => {
      const newId = `shape-${type}-${Date.now()}`;
      const newShape: ShapeElement = {
        id: newId,
        pageIndex: currentPageIndex,
        type,
        x: 120,
        y: 140,
        width: type === "circle" ? 80 : 120,
        height: type === "line" ? 2 : type === "circle" ? 80 : 50,
        fillColor: type === "highlight" ? "#fef08a" : "transparent",
        strokeColor: type === "highlight" ? "#fef08a" : "#2563eb",
        strokeWidth: type === "highlight" ? 0 : 2,
        opacity: type === "highlight" ? 0.35 : 1,
        rotation: 0,
        source: "added",
        modified: false,
        deleted: false,
      };

      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        if (!next.pages[currentPageIndex]) next.pages[currentPageIndex] = createEmptyPageModel(currentPageIndex);
        next.pages[currentPageIndex].shapeElements.push(newShape);
        recordHistory(`Add ${type} shape`, prev, next);
        return next;
      });

      setSelectedElementId(newId);
      setSelectedElementType("shape");
      showToast(`${type} shape added`);
    },
    [currentPageIndex, recordHistory]
  );

  const handleAddRedaction = useCallback(() => {
    const newId = `redact-${Date.now()}`;
    const newRedaction: RedactionElement = {
      id: newId,
      pageIndex: currentPageIndex,
      x: 100,
      y: 120,
      width: 140,
      height: 25,
      fillColor: "#000000",
      overlayText: "REDACTED",
      overlayTextColor: "#ffffff",
      source: "added",
      deleted: false,
    };

    setDocModel((prev) => {
      const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
      if (!next.pages[currentPageIndex]) next.pages[currentPageIndex] = createEmptyPageModel(currentPageIndex);
      next.pages[currentPageIndex].redactionElements.push(newRedaction);
      recordHistory("Add redaction element", prev, next);
      return next;
    });

    setSelectedElementId(newId);
    setSelectedElementType("redaction");
    showToast("Redaction box added");
  }, [currentPageIndex, recordHistory]);

  const handleAddWhiteout = useCallback(
    (customX?: number, customY?: number) => {
      const newId = `whiteout-${Date.now()}`;
      const newShape: ShapeElement = {
        id: newId,
        pageIndex: currentPageIndex,
        type: "rectangle",
        x: customX ?? 80,
        y: customY ?? 120,
        width: 140,
        height: 25,
        fillColor: "#ffffff",
        strokeColor: "#ffffff",
        strokeWidth: 0,
        opacity: 1,
        rotation: 0,
        source: "added",
        modified: false,
        deleted: false,
      };

      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        if (!next.pages[currentPageIndex]) next.pages[currentPageIndex] = createEmptyPageModel(currentPageIndex);
        next.pages[currentPageIndex].shapeElements.push(newShape);
        recordHistory("Add whiteout element", prev, next);
        return next;
      });

      setSelectedElementId(newId);
      setSelectedElementType("shape");
      showToast("Whiteout box added");
    },
    [currentPageIndex, recordHistory]
  );

  const handleAddStamp = useCallback(
    (title: string, color: string, bg: string) => {
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
    [handleAddImage]
  );

  // ── ELEMENT UPDATE HANDLERS ──
  const handleUpdateText = useCallback(
    (id: string, updates: Partial<TextElement>) => {
      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        for (const p of next.pages) {
          const el = p.textElements.find((t) => t.id === id);
          if (el) {
            Object.assign(el, updates, { modified: true });
            break;
          }
        }
        return next;
      });
    },
    []
  );

  const handleUpdateImage = useCallback(
    (id: string, updates: Partial<ImageElement>) => {
      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        for (const p of next.pages) {
          const el = p.imageElements.find((img) => img.id === id);
          if (el) {
            Object.assign(el, updates, { modified: true });
            break;
          }
        }
        return next;
      });
    },
    []
  );

  const handleUpdateShape = useCallback(
    (id: string, updates: Partial<ShapeElement>) => {
      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        for (const p of next.pages) {
          const el = p.shapeElements.find((s) => s.id === id);
          if (el) {
            Object.assign(el, updates, { modified: true });
            break;
          }
        }
        return next;
      });
    },
    []
  );

  const handleUpdateRedaction = useCallback(
    (id: string, updates: Partial<RedactionElement>) => {
      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        for (const p of next.pages) {
          const el = p.redactionElements.find((r) => r.id === id);
          if (el) {
            Object.assign(el, updates);
            break;
          }
        }
        return next;
      });
    },
    []
  );

  const handleDeleteElement = useCallback(
    (id: string) => {
      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        for (const p of next.pages) {
          const textEl = p.textElements.find((t) => t.id === id);
          if (textEl) {
            if (textEl.source === "original") textEl.deleted = true;
            else p.textElements = p.textElements.filter((t) => t.id !== id);
            break;
          }
          const imgEl = p.imageElements.find((i) => i.id === id);
          if (imgEl) {
            if (imgEl.source === "original") imgEl.deleted = true;
            else p.imageElements = p.imageElements.filter((i) => i.id !== id);
            break;
          }
          const shapeEl = p.shapeElements.find((s) => s.id === id);
          if (shapeEl) {
            p.shapeElements = p.shapeElements.filter((s) => s.id !== id);
            break;
          }
          const redEl = p.redactionElements.find((r) => r.id === id);
          if (redEl) {
            p.redactionElements = p.redactionElements.filter((r) => r.id !== id);
            break;
          }
        }
        recordHistory("Delete element", prev, next);
        return next;
      });

      setSelectedElementId(null);
      setSelectedElementType(null);
    },
    [recordHistory]
  );

  const handleDuplicateElement = useCallback(
    (id: string) => {
      setDocModel((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as DocumentModel;
        for (const p of next.pages) {
          const textEl = p.textElements.find((t) => t.id === id);
          if (textEl) {
            const dupId = `text-dup-${Date.now()}`;
            p.textElements.push({
              ...textEl,
              id: dupId,
              x: textEl.x + 15,
              y: textEl.y + 15,
              source: "added",
              modified: false,
              deleted: false,
            });
            setSelectedElementId(dupId);
            setSelectedElementType("text");
            break;
          }
          const imgEl = p.imageElements.find((i) => i.id === id);
          if (imgEl) {
            const dupId = `img-dup-${Date.now()}`;
            p.imageElements.push({
              ...imgEl,
              id: dupId,
              x: imgEl.x + 15,
              y: imgEl.y + 15,
              source: "added",
              modified: false,
              deleted: false,
            });
            setSelectedElementId(dupId);
            setSelectedElementType("image");
            break;
          }
        }
        recordHistory("Duplicate element", prev, next);
        return next;
      });
      showToast("Element duplicated");
    },
    [recordHistory]
  );

  // ── SAVE & EXPORT INTO TRUE PDF ──
  const saveVisualEdits = useCallback(async () => {
    if (!pdfData) return;
    setSavingBake(true);
    try {
      // 1. Export PDF using robust pdf-lib pipeline
      const bakedBytes = await exportPdfDocument(pdfData, docModel);

      // 2. Upload baked PDF to server
      const blob = new Blob([bakedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", blob, `${doc?.name || "document"}.pdf`);
      formData.append("summary", `True Word-style PDF modifications baked`);

      const res = await fetch(`/api/docs/${documentId}/bake`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save baked PDF");

      await loadPdf(data.versionNumber);
      await loadDoc();
      showToast(`Version ${data.versionNumber} saved with all edits baked!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to save edits");
    } finally {
      setSavingBake(false);
    }
  }, [pdfData, docModel, doc?.name, documentId, loadPdf, loadDoc]);

  const exportPdf = useCallback(async () => {
    if (pdfData) {
      const bakedBytes = await exportPdfDocument(pdfData, docModel);
      const blob = new Blob([bakedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc?.name || "edited_document.pdf";
      a.click();
      URL.revokeObjectURL(url);
      showToast("Downloading edited PDF");
      return;
    }
    window.open(`/api/docs/${documentId}/file?download=1`, "_blank");
  }, [pdfData, docModel, doc?.name, documentId]);

  const handleDeleteDocument = useCallback(async () => {
    if (
      !confirm(
        `Are you sure you want to delete "${doc?.name || "this document"}" and move it to trash?`
      )
    )
      return;
    try {
      const res = await fetch(`/api/docs/${documentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete document");
      router.push("/documents");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to delete document");
    }
  }, [doc?.name, documentId, router]);

  const selectedTextEl = currentPageModel.textElements.find((t) => t.id === selectedElementId) || null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-100 font-sans text-gray-900 select-none">
      {/* ── TOP HEADER / WORKSPACE BAR ── */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 z-40">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/documents")}
            className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 rounded p-1 hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Documents</span>
          </button>
          <div className="h-4 w-[1px] bg-gray-200" />
          <h1 className="text-xs font-bold text-gray-800 truncate max-w-[200px] sm:max-w-xs">
            {doc?.name || "PDF Document"}
          </h1>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-bold border border-blue-200">
            v{currentVersionNumber}
          </span>
        </div>

        {/* Page Nav & Zoom Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-1 py-0.5 text-xs">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
              title="Previous Page"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-semibold text-gray-700 px-1">
              {page} / {totalPages || 1}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
              title="Next Page"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-md px-1.5 py-0.5 text-xs">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              className="p-1 hover:bg-gray-200 rounded"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-semibold text-gray-700 w-10 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(3.0, Math.round((z + 0.1) * 10) / 10))}
              className="p-1 hover:bg-gray-200 rounded"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Save, Download & Delete Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={saveVisualEdits}
            disabled={savingBake}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50"
          >
            {savingBake ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>Save</span>
          </button>
          <button
            onClick={exportPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-black text-white rounded-lg text-xs font-semibold shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </button>
          <button
            onClick={handleDeleteDocument}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold shadow-xs transition-colors"
            title="Delete file and move to trash"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </header>

      {/* ── MS WORD-STYLE RIBBON TOOLBAR ── */}
      <EditorRibbon
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        selectedTextElement={selectedTextEl}
        onUpdateSelectedText={(updates) => {
          if (selectedElementId && selectedElementType === "text") {
            handleUpdateText(selectedElementId, updates);
          }
        }}
        onAddText={handleAddText}
        onAddImage={handleAddImage}
        onAddShape={handleAddShape}
        onAddRedaction={handleAddRedaction}
        onAddWhiteout={handleAddWhiteout}
        onAddStamp={handleAddStamp}
        onAddSignature={(dataUrl) => handleAddImage(dataUrl, 140, 60)}
        onOpenAI={() => setPanel("ai")}
        onQuickAiPrompt={(prompt) => {
          setExternalAiPrompt(prompt);
          setPanel("ai");
        }}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onDeleteSelected={() => {
          if (selectedElementId) handleDeleteElement(selectedElementId);
        }}
        hasSelection={!!selectedElementId}
      />

      {/* ── MAIN WORKSPACE AREA ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Thumbnails / Pages Panel */}
        <aside className="w-44 shrink-0 border-r border-gray-200 bg-white overflow-y-auto hidden md:flex flex-col p-3 gap-3">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
            Pages ({totalPages || 1})
          </span>
          <div className="space-y-2.5">
            {Array.from({ length: totalPages || 1 }, (_, idx) => {
              const pNum = idx + 1;
              const isCurrent = pNum === page;
              return (
                <button
                  key={pNum}
                  onClick={() => setPage(pNum)}
                  className={`w-full p-2 rounded-lg border text-left flex flex-col items-center gap-1 transition-all ${
                    isCurrent
                      ? "border-blue-600 bg-blue-50/60 shadow-xs"
                      : "border-gray-200 hover:border-gray-300 bg-gray-50/40"
                  }`}
                >
                  <div className="w-full aspect-3/4 bg-white border border-gray-200 shadow-2xs rounded-sm flex items-center justify-center text-gray-400 text-xs font-bold">
                    P. {pNum}
                  </div>
                  <span className={`text-[10px] font-semibold ${isCurrent ? "text-blue-700" : "text-gray-600"}`}>
                    Page {pNum}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Center Canvas Workspace */}
        <main className="flex-1 overflow-auto bg-gray-200/80 relative" ref={viewerScrollRef}>
          {loadingPdf ? (
            <div className="flex h-full w-full items-center justify-center flex-col gap-2">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              <p className="text-xs font-semibold text-gray-600">Loading document...</p>
            </div>
          ) : (
            <PDFViewer
              data={pdfData}
              page={page}
              zoom={zoom}
              activeTool={activeTool}
              pageModel={currentPageModel}
              selectedElementId={selectedElementId}
              selectedElementType={selectedElementType}
              onSelectElement={(id, type) => {
                setSelectedElementId(id);
                setSelectedElementType(type || null);
              }}
              onUpdateTextElement={handleUpdateText}
              onUpdateImageElement={handleUpdateImage}
              onUpdateShapeElement={handleUpdateShape}
              onUpdateRedactionElement={handleUpdateRedaction}
              onDeleteElement={handleDeleteElement}
              onDuplicateElement={handleDuplicateElement}
              onCanvasClickAdd={(x, y) => {
                if (activeTool === "text") handleAddText(x, y);
                else if (activeTool === "whiteout") handleAddWhiteout(x, y);
                else if (activeTool === "redact") handleAddRedaction();
                else if (activeTool === "shape_rect") handleAddShape("rectangle");
                else if (activeTool === "shape_circle") handleAddShape("circle");
                else if (activeTool === "shape_line") handleAddShape("line");
                else if (activeTool === "highlight") handleAddShape("highlight");
              }}
              onPageCount={handlePageCount}
              onPageExtracted={handlePageExtracted}
              onSelectText={(sel) => {
                setSelection(sel);
                setSelectedText(sel.text);
              }}
            />
          )}
        </main>

        {/* Right Tool Panels (AI Copilot / Find & Replace / Redact / Versions) */}
        {panel !== "none" && (
          <aside className="w-80 shrink-0 border-l border-gray-200 bg-white flex flex-col z-30 shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPanel("ai")}
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    panel === "ai" ? "bg-purple-100 text-purple-800" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  AI Copilot
                </button>
                <button
                  onClick={() => setPanel("find")}
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    panel === "find" ? "bg-blue-100 text-blue-800" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  Find
                </button>
                <button
                  onClick={() => setPanel("versions")}
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    panel === "versions" ? "bg-amber-100 text-amber-800" : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  History
                </button>
              </div>
              <button
                onClick={() => setPanel("none")}
                className="text-gray-400 hover:text-gray-600 text-xs font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {panel === "ai" && (
                <AIPanel
                  documentId={documentId}
                  currentPage={page}
                  selectedText={selectedText}
                  onApplied={() => {
                    void loadPdf();
                    void loadDoc();
                  }}
                  onFindMatches={(_findText: string) => {
                    setPanel("find");
                  }}
                  externalPrompt={externalAiPrompt}
                />
              )}
              {panel === "find" && (
                <FindReplacePanel
                  matches={matches}
                  currentPage={page}
                  busy={busy}
                  onFind={async (text, scope) => {
                    try {
                      const res = await fetch(`/api/docs/${documentId}/engine`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          action: "find_text",
                          search_text: text,
                          page: scope === "page" ? page : undefined,
                        }),
                      });
                      const data = await res.json();
                      setMatches(data.matches || []);
                    } catch {
                      // ignore
                    }
                  }}
                  onPreview={async (_find, _replace, _scope) => {
                    return { count: matches.length, warnings: [] };
                  }}
                  onReplaceAll={async (find, replace, scope) => {
                    const res = await fetch(`/api/docs/${documentId}/engine`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "replace_text",
                        search_text: find,
                        replace_text: replace,
                        page: scope === "page" ? page : undefined,
                      }),
                    });
                    await loadPdf();
                    await loadDoc();
                    return res.json();
                  }}
                />
              )}
              {panel === "versions" && (
                <VersionsPanel
                  versions={versions}
                  currentVersion={currentVersionNumber}
                  onSelect={(v: Version) => {
                    void loadPdf(v.version_number);
                    setCurrentVersionNumber(v.version_number);
                  }}
                  onCompare={() => setCompare(!compare)}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Toast notification popup */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-xl animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
