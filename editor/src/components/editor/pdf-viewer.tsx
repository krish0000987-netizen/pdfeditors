"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type {
  ActiveTool,
  CanvasTextElement,
  CanvasImageElement,
  CanvasWhiteoutElement,
} from "./types";
import { Move, Trash2, RotateCw } from "lucide-react";

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

export interface SelectionInfo {
  text: string;
  page: number;
}

export function PDFViewer({
  data,
  page,
  zoom,
  activeTool,
  textElements,
  imageElements,
  whiteoutElements,
  selectedElementId,
  onSelectElement,
  onUpdateTextElement,
  onUpdateImageElement,
  onUpdateWhiteoutElement,
  onDeleteElement,
  onCanvasClickAdd,
  onPageCount,
  onSelectText,
  viewerRef,
}: {
  data: Uint8Array | null;
  page: number; // 1-indexed
  zoom: number;
  activeTool: ActiveTool;
  textElements: CanvasTextElement[];
  imageElements: CanvasImageElement[];
  whiteoutElements: CanvasWhiteoutElement[];
  selectedElementId: string | null;
  onSelectElement: (id: string | null, type?: "text" | "image" | "whiteout") => void;
  onUpdateTextElement: (id: string, updates: Partial<CanvasTextElement>) => void;
  onUpdateImageElement: (id: string, updates: Partial<CanvasImageElement>) => void;
  onUpdateWhiteoutElement: (id: string, updates: Partial<CanvasWhiteoutElement>) => void;
  onDeleteElement: (id: string) => void;
  onCanvasClickAdd?: (x: number, y: number) => void;
  onPageCount?: (n: number) => void;
  onSelectText?: (sel: SelectionInfo) => void;
  viewerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Dragging / Resizing State
  const [dragState, setDragState] = useState<{
    elementId: string;
    type: "text" | "image" | "whiteout";
    action: "move" | "resize";
    handle?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  // Load document when bytes change
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const bytes = new Uint8Array(data);
    void Promise.resolve().then(() => setError(null));
    pdfjs
      .getDocument({ data: bytes })
      .promise.then(async (pdf) => {
        if (cancelled) {
          await pdf.cleanup();
          return;
        }
        docRef.current = pdf;
        onPageCount?.(pdf.numPages);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load PDF");
      });
    return () => {
      cancelled = true;
    };
  }, [data, onPageCount]);

  // Render the current page
  useEffect(() => {
    const pdf = docRef.current;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    const overlay = overlayRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;

    (async () => {
      try {
        setRendering(true);
        renderTaskRef.current?.cancel();
        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale: zoom });
        const outputScale = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        if (overlay) {
          overlay.style.width = `${Math.floor(viewport.width)}px`;
          overlay.style.height = `${Math.floor(viewport.height)}px`;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTaskRef.current = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        await renderTaskRef.current.promise;

        if (cancelled || !textLayer) return;

        // Text layer for selection/search hits
        const textContent = await pdfPage.getTextContent();
        textLayer.innerHTML = "";
        textLayer.style.width = `${Math.floor(viewport.width)}px`;
        textLayer.style.height = `${Math.floor(viewport.height)}px`;

        const tx = pdfjs.Util.transform(viewport.transform, [1, 0, 0, -1, 0, 0]);
        for (const item of textContent.items as Array<{
          str?: string;
          width?: number;
          height?: number;
          transform?: number[];
        }>) {
          if (!item.str || !item.transform) continue;
          const [a, b, c, d, e, f] = item.transform;
          const [ta, tb, tc, td, te, tf] = pdfjs.Util.transform(tx, [a, b, c, d, e, f]);
          const fontHeight = Math.hypot(tb, td);
          const fontWidth = Math.hypot(ta, tc);
          if (fontHeight === 0 || fontWidth === 0) continue;
          const angle = Math.atan2(tb, ta);
          const style = document.createElement("span");
          style.textContent = item.str;
          const left = te;
          const top = tf - fontHeight;
          style.style.left = `${(100 * left) / viewport.width}%`;
          style.style.top = `${(100 * top) / viewport.height}%`;
          style.style.fontSize = `${fontHeight}px`;
          style.style.fontFamily = "sans-serif";
          style.style.width = `${(100 * (item.width || fontWidth)) / viewport.width}%`;
          if (angle !== 0) {
            style.style.transform = `rotate(${angle}rad)`;
          }
          textLayer.appendChild(style);
        }
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (name !== "RenderingCancelledException" && !cancelled) {
          setError(e instanceof Error ? e.message : "Render failed");
        }
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, page, zoom, onPageCount]);

  // Report user text selection
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 0) {
        onSelectText?.({ text, page });
      }
    };
    document.addEventListener("mouseup", handler);
    return () => document.removeEventListener("mouseup", handler);
  }, [page, onSelectText]);

  // Global mouse move and up for dragging / resizing
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = (e.clientX - dragState.startX) / zoom;
      const deltaY = (e.clientY - dragState.startY) / zoom;

      if (dragState.action === "move") {
        const newX = Math.max(0, Math.round(dragState.origX + deltaX));
        const newY = Math.max(0, Math.round(dragState.origY + deltaY));

        if (dragState.type === "text") {
          onUpdateTextElement(dragState.elementId, { x: newX, y: newY });
        } else if (dragState.type === "image") {
          onUpdateImageElement(dragState.elementId, { x: newX, y: newY });
        } else if (dragState.type === "whiteout") {
          onUpdateWhiteoutElement(dragState.elementId, { x: newX, y: newY });
        }
      } else if (dragState.action === "resize") {
        const newW = Math.max(20, Math.round(dragState.origW + deltaX));
        const newH = Math.max(10, Math.round(dragState.origH + deltaY));

        if (dragState.type === "text") {
          onUpdateTextElement(dragState.elementId, { width: newW, height: newH });
        } else if (dragState.type === "image") {
          onUpdateImageElement(dragState.elementId, { width: newW, height: newH });
        } else if (dragState.type === "whiteout") {
          onUpdateWhiteoutElement(dragState.elementId, { width: newW, height: newH });
        }
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    dragState,
    zoom,
    onUpdateTextElement,
    onUpdateImageElement,
    onUpdateWhiteoutElement,
  ]);

  // Canvas Click to Add Text / Whiteout
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState || editingTextId) return;
    const target = e.target as HTMLElement;
    if (target.closest(".canvas-element")) return;

    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const clickX = Math.round((e.clientX - rect.left) / zoom);
    const clickY = Math.round((e.clientY - rect.top) / zoom);

    if (activeTool === "text" || activeTool === "whiteout") {
      onCanvasClickAdd?.(clickX, clickY);
    } else {
      onSelectElement(null);
      setEditingTextId(null);
    }
  };

  const currentPageIndex = page - 1;
  const currentTexts = textElements.filter((t) => t.page === currentPageIndex);
  const currentImages = imageElements.filter((img) => img.page === currentPageIndex);
  const currentWhiteouts = whiteoutElements.filter((w) => w.page === currentPageIndex);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-500">Failed to load PDF: {error}</p>
      </div>
    );
  }

  return (
    <div ref={viewerRef} className="flex flex-col items-center py-6 px-4">
      <div
        className="relative bg-white shadow-xl rounded-sm"
        style={{ lineHeight: 0 }}
      >
        <canvas ref={canvasRef} className="block" />
        <div
          ref={textLayerRef}
          className="pdf-text-layer absolute inset-0 overflow-hidden pointer-events-auto"
        />

        {/* ── INTERACTIVE CANVAS OVERLAY LAYER ── */}
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          className={`absolute inset-0 z-20 ${
            activeTool === "text"
              ? "cursor-text"
              : activeTool === "whiteout"
              ? "cursor-crosshair"
              : "cursor-default"
          }`}
        >
          {/* 1. Whiteout Elements */}
          {currentWhiteouts.map((w) => {
            const isSelected = selectedElementId === w.id;
            return (
              <div
                key={w.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(w.id, "whiteout");
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectElement(w.id, "whiteout");
                  setDragState({
                    elementId: w.id,
                    type: "whiteout",
                    action: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: w.x,
                    origY: w.y,
                    origW: w.width,
                    origH: w.height,
                  });
                }}
                className="canvas-element absolute group select-none"
                style={{
                  left: `${w.x * zoom}px`,
                  top: `${w.y * zoom}px`,
                  width: `${w.width * zoom}px`,
                  height: `${w.height * zoom}px`,
                  backgroundColor: w.color || "#ffffff",
                  outline: isSelected
                    ? "2px dashed #2563eb"
                    : "1px dashed rgba(0,0,0,0.15)",
                }}
              >
                {isSelected && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        elementId: w.id,
                        type: "whiteout",
                        action: "resize",
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: w.x,
                        origY: w.y,
                        origW: w.width,
                        origH: w.height,
                      });
                    }}
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-se-resize shadow-xs"
                  />
                )}
              </div>
            );
          })}

          {/* 2. Image / Stamp / Signature Elements */}
          {currentImages.map((img) => {
            const isSelected = selectedElementId === img.id;
            return (
              <div
                key={img.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(img.id, "image");
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectElement(img.id, "image");
                  setDragState({
                    elementId: img.id,
                    type: "image",
                    action: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: img.x,
                    origY: img.y,
                    origW: img.width,
                    origH: img.height,
                  });
                }}
                className="canvas-element absolute group cursor-move select-none"
                style={{
                  left: `${img.x * zoom}px`,
                  top: `${img.y * zoom}px`,
                  width: `${img.width * zoom}px`,
                  height: `${img.height * zoom}px`,
                  opacity: img.opacity ?? 1,
                  transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
                  outline: isSelected ? "2px solid #2563eb" : undefined,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.title || "Inserted element"}
                  className="w-full h-full object-contain pointer-events-none"
                />
                {isSelected && (
                  <>
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: img.id,
                          type: "image",
                          action: "resize",
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: img.x,
                          origY: img.y,
                          origW: img.width,
                          origH: img.height,
                        });
                      }}
                      className="absolute -right-2 -bottom-2 w-3.5 h-3.5 bg-blue-600 rounded-full cursor-se-resize shadow-sm"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(img.id);
                      }}
                      className="absolute -top-7 right-0 bg-red-600 text-white p-1 rounded-full shadow-md hover:bg-red-700"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* 3. Text Elements (MS Word-Style Inline Editing) */}
          {currentTexts.map((t) => {
            const isSelected = selectedElementId === t.id;
            const isEditing = editingTextId === t.id;

            return (
              <div
                key={t.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(t.id, "text");
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(t.id, "text");
                  setEditingTextId(t.id);
                }}
                onMouseDown={(e) => {
                  if (isEditing) return;
                  e.stopPropagation();
                  onSelectElement(t.id, "text");
                  setDragState({
                    elementId: t.id,
                    type: "text",
                    action: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: t.x,
                    origY: t.y,
                    origW: t.width,
                    origH: t.height,
                  });
                }}
                className={`canvas-element absolute select-none ${
                  isEditing ? "cursor-text" : "cursor-move"
                }`}
                style={{
                  left: `${t.x * zoom}px`,
                  top: `${t.y * zoom}px`,
                  width: t.width ? `${t.width * zoom}px` : "auto",
                  minWidth: "60px",
                  fontSize: `${(t.fontSize || 12) * zoom}px`,
                  fontFamily: t.fontFamily || "Helvetica, Arial, sans-serif",
                  fontWeight: t.fontWeight || "normal",
                  fontStyle: t.fontStyle || "normal",
                  textDecoration: t.underline ? "underline" : "none",
                  color: t.color || "#000000",
                  backgroundColor:
                    t.backgroundColor && t.backgroundColor !== "transparent"
                      ? t.backgroundColor
                      : undefined,
                  textAlign: t.textAlign || "left",
                  outline: isSelected ? "2px dashed #2563eb" : undefined,
                  padding: "2px 4px",
                  lineHeight: 1.25,
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={t.text}
                    onChange={(e) =>
                      onUpdateTextElement(t.id, { text: e.target.value })
                    }
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingTextId(null);
                    }}
                    className="w-full bg-transparent border-none outline-none resize-none p-0 m-0"
                    style={{
                      fontSize: "inherit",
                      fontFamily: "inherit",
                      fontWeight: "inherit",
                      fontStyle: "inherit",
                      color: "inherit",
                      textAlign: "inherit",
                    }}
                    rows={Math.max(1, t.text.split("\n").length)}
                  />
                ) : (
                  <div className="whitespace-pre-wrap break-words">{t.text}</div>
                )}

                {isSelected && !isEditing && (
                  <>
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: t.id,
                          type: "text",
                          action: "resize",
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: t.x,
                          origY: t.y,
                          origW: t.width || 120,
                          origH: t.height || 30,
                        });
                      }}
                      className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-se-resize shadow-xs"
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteElement(t.id);
                      }}
                      className="absolute -top-6 right-0 bg-red-600 text-white p-0.5 rounded shadow-sm hover:bg-red-700 text-[10px]"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {rendering && (
          <div className="absolute top-2 right-2 w-4 h-4 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin z-30" />
        )}
      </div>
    </div>
  );
}
