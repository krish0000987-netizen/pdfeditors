"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type {
  ActiveTool,
  TextElement,
  ImageElement,
  ShapeElement,
  RedactionElement,
  PageModel,
} from "./types";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Copy,
  Lock,
} from "lucide-react";
import { extractTextFromPdfPage } from "@/lib/pdf/text-extractor";
import { extractImagesFromPdfPage } from "@/lib/pdf/image-extractor";

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
  pageModel,
  selectedElementId,
  selectedElementType,
  onSelectElement,
  onUpdateTextElement,
  onUpdateImageElement,
  onUpdateShapeElement,
  onUpdateRedactionElement,
  onDeleteElement,
  onDuplicateElement,
  onCanvasClickAdd,
  onPageCount,
  onSelectText,
  onPageExtracted,
  viewerRef,
}: {
  data: Uint8Array | null;
  page: number; // 1-indexed
  zoom: number;
  activeTool: ActiveTool;
  pageModel?: PageModel;
  selectedElementId: string | null;
  selectedElementType: "text" | "image" | "shape" | "redaction" | null;
  onSelectElement: (id: string | null, type?: "text" | "image" | "shape" | "redaction") => void;
  onUpdateTextElement: (id: string, updates: Partial<TextElement>) => void;
  onUpdateImageElement: (id: string, updates: Partial<ImageElement>) => void;
  onUpdateShapeElement: (id: string, updates: Partial<ShapeElement>) => void;
  onUpdateRedactionElement: (id: string, updates: Partial<RedactionElement>) => void;
  onDeleteElement: (id: string) => void;
  onDuplicateElement?: (id: string) => void;
  onCanvasClickAdd?: (x: number, y: number) => void;
  onPageCount?: (n: number) => void;
  onSelectText?: (sel: SelectionInfo) => void;
  onPageExtracted?: (pageIndex: number, textElements: TextElement[], imageElements: ImageElement[]) => void;
  viewerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const passwordCallbackRef = useRef<((pwd: string) => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  // Dragging / Resizing State
  const [dragState, setDragState] = useState<{
    elementId: string;
    type: "text" | "image" | "shape" | "redaction";
    action: "move" | "resize" | "rotate";
    handle?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    origRotation?: number;
  } | null>(null);

  // Load document when bytes change or password is provided
  const loadDocument = useCallback(
    async (pwd?: string) => {
      if (!data) return;
      setError(null);
      setPasswordError(null);
      if (pwd) setUnlocking(true);

      try {
        // Clone ArrayBuffer so PDF.js worker never detaches original data
        const clonedBytes = new Uint8Array(data.slice(0));
        const loadingTask = pdfjs.getDocument({
          data: clonedBytes,
          password: pwd || undefined,
        });

        loadingTask.onPassword = (callback: (pwd: string) => void, reason: number) => {
          passwordCallbackRef.current = callback;
          setIsPasswordProtected(true);
          setUnlocking(false);
          if (reason === 2) {
            setPasswordError("Incorrect password. Please try again.");
          }
        };

        const pdf = await loadingTask.promise;
        docRef.current = pdf;
        passwordCallbackRef.current = null;
        setPdfDoc(pdf);
        setIsPasswordProtected(false);
        setPasswordError(null);
        setUnlocking(false);
        onPageCount?.(pdf.numPages);
      } catch (e: unknown) {
        setUnlocking(false);
        const err = e as { name?: string; message?: string };
        const msg = String(err?.message || "").toLowerCase();
        if (err?.name === "PasswordException" || msg.includes("password")) {
          setIsPasswordProtected(true);
          if (pwd) {
            setPasswordError("Incorrect password. Please try again.");
          }
        } else {
          setError(err?.message || "Failed to load PDF");
        }
      }
    },
    [data, onPageCount]
  );

  const handleUnlockPassword = useCallback(
    (pwd: string) => {
      const clean = pwd.trim();
      if (!clean) return;
      setUnlocking(true);
      setPasswordError(null);

      // If PDF.js is waiting for the onPassword callback, supply it directly
      if (passwordCallbackRef.current) {
        try {
          passwordCallbackRef.current(clean);
          return;
        } catch {
          // fallback to reload
        }
      }

      void loadDocument(clean);
    },
    [loadDocument]
  );

  useEffect(() => {
    setPdfDoc(null);
    setIsPasswordProtected(false);
    setPasswordInput("");
    setPasswordError(null);
    passwordCallbackRef.current = null;
    void loadDocument();
  }, [data, loadDocument]);

  // Render the current page & extract content when pdfDoc, page, or zoom changes
  useEffect(() => {
    const pdf = pdfDoc || docRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!pdf || !canvas) return;
    let cancelled = false;

    (async () => {
      try {
        setRendering(true);
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
          renderTaskRef.current = null;
        }

        const pdfPage = await pdf.getPage(page);
        if (cancelled) return;

        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const pixelViewport = pdfPage.getViewport({ scale: zoom * dpr });
        const cssWidth = Math.floor(pixelViewport.width / dpr);
        const cssHeight = Math.floor(pixelViewport.height / dpr);

        canvas.width = Math.floor(pixelViewport.width);
        canvas.height = Math.floor(pixelViewport.height);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;

        if (overlay) {
          overlay.style.width = `${cssWidth}px`;
          overlay.style.height = `${cssHeight}px`;
        }

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const task = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport: pixelViewport,
        });
        renderTaskRef.current = task;
        await task.promise;

        if (cancelled) return;

        // Auto-extract text and images for this page if not yet extracted
        const pageIdx = page - 1;
        if (
          onPageExtracted &&
          (!pageModel ||
            (pageModel.textElements.length === 0 && pageModel.imageElements.length === 0))
        ) {
          const textResult = await extractTextFromPdfPage(pdfPage, pageIdx);
          const imageResult = await extractImagesFromPdfPage(pdfPage, pageIdx);
          if (!cancelled) {
            onPageExtracted(pageIdx, textResult.textElements, imageResult);
          }
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
  }, [pdfDoc, page, zoom, pageModel, onPageExtracted]);

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
          onUpdateTextElement(dragState.elementId, { x: newX, y: newY, modified: true });
        } else if (dragState.type === "image") {
          onUpdateImageElement(dragState.elementId, { x: newX, y: newY, modified: true });
        } else if (dragState.type === "shape") {
          onUpdateShapeElement(dragState.elementId, { x: newX, y: newY, modified: true });
        } else if (dragState.type === "redaction") {
          onUpdateRedactionElement(dragState.elementId, { x: newX, y: newY });
        }
      } else if (dragState.action === "resize") {
        const handle = dragState.handle || "se";
        let newX = dragState.origX;
        let newY = dragState.origY;
        let newW = dragState.origW;
        let newH = dragState.origH;

        if (handle.includes("e")) newW = Math.max(15, Math.round(dragState.origW + deltaX));
        if (handle.includes("s")) newH = Math.max(10, Math.round(dragState.origH + deltaY));
        if (handle.includes("w")) {
          const potentialW = Math.max(15, Math.round(dragState.origW - deltaX));
          newX = Math.round(dragState.origX + (dragState.origW - potentialW));
          newW = potentialW;
        }
        if (handle.includes("n")) {
          const potentialH = Math.max(10, Math.round(dragState.origH - deltaY));
          newY = Math.round(dragState.origY + (dragState.origH - potentialH));
          newH = potentialH;
        }

        if (dragState.type === "text") {
          onUpdateTextElement(dragState.elementId, { x: newX, y: newY, width: newW, height: newH, modified: true });
        } else if (dragState.type === "image") {
          onUpdateImageElement(dragState.elementId, { x: newX, y: newY, width: newW, height: newH, modified: true });
        } else if (dragState.type === "shape") {
          onUpdateShapeElement(dragState.elementId, { x: newX, y: newY, width: newW, height: newH, modified: true });
        } else if (dragState.type === "redaction") {
          onUpdateRedactionElement(dragState.elementId, { x: newX, y: newY, width: newW, height: newH });
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
    onUpdateShapeElement,
    onUpdateRedactionElement,
  ]);

  // Keyboard navigation & element manipulation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedElementId || editingTextId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteElement(selectedElementId);
        onSelectElement(null);
      } else if (e.key === "Escape") {
        onSelectElement(null);
        setEditingTextId(null);
      } else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === "ArrowUp") dy = -step;
        if (e.key === "ArrowDown") dy = step;
        if (e.key === "ArrowLeft") dx = -step;
        if (e.key === "ArrowRight") dx = step;

        if (selectedElementType === "text") {
          const el = pageModel?.textElements.find((t) => t.id === selectedElementId);
          if (el) onUpdateTextElement(selectedElementId, { x: Math.max(0, el.x + dx), y: Math.max(0, el.y + dy), modified: true });
        } else if (selectedElementType === "image") {
          const el = pageModel?.imageElements.find((i) => i.id === selectedElementId);
          if (el) onUpdateImageElement(selectedElementId, { x: Math.max(0, el.x + dx), y: Math.max(0, el.y + dy), modified: true });
        } else if (selectedElementType === "shape") {
          const el = pageModel?.shapeElements.find((s) => s.id === selectedElementId);
          if (el) onUpdateShapeElement(selectedElementId, { x: Math.max(0, el.x + dx), y: Math.max(0, el.y + dy), modified: true });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    selectedElementId,
    selectedElementType,
    editingTextId,
    pageModel,
    onDeleteElement,
    onSelectElement,
    onUpdateTextElement,
    onUpdateImageElement,
    onUpdateShapeElement,
  ]);

  // Canvas Click Handler
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragState || editingTextId) return;
    const target = e.target as HTMLElement;
    if (target.closest(".canvas-interactive-element")) return;

    const overlay = overlayRef.current;
    if (!overlay) return;
    const rect = overlay.getBoundingClientRect();
    const clickX = Math.round((e.clientX - rect.left) / zoom);
    const clickY = Math.round((e.clientY - rect.top) / zoom);

    if (activeTool !== "select") {
      onCanvasClickAdd?.(clickX, clickY);
    } else {
      onSelectElement(null);
      setEditingTextId(null);
    }
  };

  const activeTexts = (pageModel?.textElements || []).filter((t) => !t.deleted);
  const activeImages = (pageModel?.imageElements || []).filter((i) => !i.deleted);
  const activeShapes = (pageModel?.shapeElements || []).filter((s) => !s.deleted);
  const activeRedactions = (pageModel?.redactionElements || []).filter((r) => !r.deleted);

  const selectedTextEl = activeTexts.find((t) => t.id === selectedElementId);
  const selectedImageEl = activeImages.find((i) => i.id === selectedElementId);
  const selectedShapeEl = activeShapes.find((s) => s.id === selectedElementId);

  if (isPasswordProtected) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-white rounded-2xl shadow-xl max-w-md mx-auto my-16 border border-gray-200 animate-in fade-in">
        <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 border border-blue-100">
          <Lock className="w-7 h-7" />
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-1">Password Protected PDF</h3>
        <p className="text-xs text-gray-500 mb-5 text-center leading-relaxed">
          This PDF document is encrypted. Please enter the password to view and edit its contents.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordInput.trim()) {
              handleUnlockPassword(passwordInput.trim());
            }
          }}
          className="w-full space-y-3"
        >
          <div className="space-y-1">
            <input
              type="password"
              autoFocus
              placeholder="Enter password"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                if (passwordError) setPasswordError(null);
              }}
              className={`w-full px-3.5 py-2.5 border rounded-xl text-sm outline-none transition-all ${
                passwordError
                  ? "border-red-500 focus:ring-2 focus:ring-red-200"
                  : "border-gray-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              }`}
            />
            {passwordError && (
              <p className="text-xs text-red-600 font-medium">{passwordError}</p>
            )}
          </div>
          <button
            type="submit"
            disabled={unlocking || !passwordInput.trim()}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
          >
            {unlocking ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Unlocking...</span>
              </>
            ) : (
              <span>Unlock PDF</span>
            )}
          </button>
        </form>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          Failed to load PDF: {error}
        </div>
      </div>
    );
  }

  return (
    <div ref={viewerRef} className="flex flex-col items-center py-6 px-4">
      <div className="relative bg-white shadow-2xl rounded-sm" style={{ lineHeight: 0 }}>
        {/* BASE PDF CANVAS */}
        <canvas ref={canvasRef} className="block" />

        {/* ── SYNCHRONIZED INTERACTIVE EDITOR OVERLAY LAYER ── */}
        <div
          ref={overlayRef}
          onClick={handleOverlayClick}
          className={`absolute inset-0 z-20 ${
            activeTool === "text"
              ? "cursor-text"
              : activeTool === "redact"
              ? "cursor-crosshair"
              : activeTool.startsWith("shape")
              ? "cursor-crosshair"
              : "cursor-default"
          }`}
        >
          {/* 1. Whiteout / Mask Layer for Modified Original Text & Images */}
          {activeTexts
            .filter((t) => t.source === "original" && (t.modified || t.deleted))
            .map((t) => {
              const orig = t.originalBoundingBox || t;
              return (
                <div
                  key={`mask-${t.id}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${orig.x * zoom}px`,
                    top: `${orig.y * zoom}px`,
                    width: `${orig.width * zoom}px`,
                    height: `${orig.height * zoom}px`,
                    backgroundColor: t.detectedBackgroundColor || "#ffffff",
                  }}
                />
              );
            })}

          {activeImages
            .filter((img) => img.source === "original" && (img.modified || img.deleted))
            .map((img) => {
              const orig = img.originalBoundingBox || img;
              return (
                <div
                  key={`mask-img-${img.id}`}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${orig.x * zoom}px`,
                    top: `${orig.y * zoom}px`,
                    width: `${orig.width * zoom}px`,
                    height: `${orig.height * zoom}px`,
                    backgroundColor: "#ffffff",
                  }}
                />
              );
            })}

          {/* 2. Redactions */}
          {activeRedactions.map((red) => {
            const isSelected = selectedElementId === red.id;
            return (
              <div
                key={red.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(red.id, "redaction");
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectElement(red.id, "redaction");
                  setDragState({
                    elementId: red.id,
                    type: "redaction",
                    action: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: red.x,
                    origY: red.y,
                    origW: red.width,
                    origH: red.height,
                  });
                }}
                className="canvas-interactive-element absolute group select-none cursor-move"
                style={{
                  left: `${red.x * zoom}px`,
                  top: `${red.y * zoom}px`,
                  width: `${red.width * zoom}px`,
                  height: `${red.height * zoom}px`,
                  backgroundColor: red.fillColor || "#000000",
                  outline: isSelected ? "2px solid #ef4444" : undefined,
                }}
              >
                {red.overlayText && (
                  <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-white tracking-widest pointer-events-none">
                    {red.overlayText}
                  </div>
                )}
                {isSelected && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        elementId: red.id,
                        type: "redaction",
                        action: "resize",
                        handle: "se",
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: red.x,
                        origY: red.y,
                        origW: red.width,
                        origH: red.height,
                      });
                    }}
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-red-600 rounded-full cursor-se-resize shadow-xs"
                  />
                )}
              </div>
            );
          })}

          {/* 3. Shapes (Rectangles, Circles, Lines, Highlights) */}
          {activeShapes.map((shape) => {
            const isSelected = selectedElementId === shape.id;
            return (
              <div
                key={shape.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectElement(shape.id, "shape");
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  onSelectElement(shape.id, "shape");
                  setDragState({
                    elementId: shape.id,
                    type: "shape",
                    action: "move",
                    startX: e.clientX,
                    startY: e.clientY,
                    origX: shape.x,
                    origY: shape.y,
                    origW: shape.width,
                    origH: shape.height,
                  });
                }}
                className="canvas-interactive-element absolute group select-none cursor-move"
                style={{
                  left: `${shape.x * zoom}px`,
                  top: `${shape.y * zoom}px`,
                  width: `${shape.width * zoom}px`,
                  height: `${shape.height * zoom}px`,
                  backgroundColor: shape.fillColor !== "transparent" ? shape.fillColor : undefined,
                  borderWidth: shape.type !== "highlight" ? `${shape.strokeWidth || 1}px` : "0",
                  borderColor: shape.strokeColor || "#000000",
                  borderRadius: shape.type === "circle" ? "50%" : shape.type === "highlight" ? "2px" : "0",
                  opacity: shape.type === "highlight" ? (shape.opacity || 0.35) : (shape.opacity ?? 1),
                  outline: isSelected ? "2px dashed #2563eb" : undefined,
                }}
              >
                {isSelected && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        elementId: shape.id,
                        type: "shape",
                        action: "resize",
                        handle: "se",
                        startX: e.clientX,
                        startY: e.clientY,
                        origX: shape.x,
                        origY: shape.y,
                        origW: shape.width,
                        origH: shape.height,
                      });
                    }}
                    className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-se-resize shadow-xs"
                  />
                )}
              </div>
            );
          })}

          {/* 4. Images (Original & Inserted) */}
          {activeImages.map((img) => {
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
                className="canvas-interactive-element absolute group cursor-move select-none"
                style={{
                  left: `${img.x * zoom}px`,
                  top: `${img.y * zoom}px`,
                  width: `${img.width * zoom}px`,
                  height: `${img.height * zoom}px`,
                  opacity: img.opacity ?? 1,
                  transform: img.rotation ? `rotate(${img.rotation}deg)` : undefined,
                  outline: isSelected ? "2px solid #2563eb" : "1px dashed transparent",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.dataUrl}
                  alt={img.title || "PDF Image"}
                  className="w-full h-full object-contain pointer-events-none"
                />
                {isSelected && (
                  <>
                    {/* 8-point resize handles */}
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: img.id,
                          type: "image",
                          action: "resize",
                          handle: "nw",
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: img.x,
                          origY: img.y,
                          origW: img.width,
                          origH: img.height,
                        });
                      }}
                      className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-nw-resize shadow-xs"
                    />
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: img.id,
                          type: "image",
                          action: "resize",
                          handle: "ne",
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: img.x,
                          origY: img.y,
                          origW: img.width,
                          origH: img.height,
                        });
                      }}
                      className="absolute -right-1.5 -top-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-ne-resize shadow-xs"
                    />
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: img.id,
                          type: "image",
                          action: "resize",
                          handle: "se",
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: img.x,
                          origY: img.y,
                          origW: img.width,
                          origH: img.height,
                        });
                      }}
                      className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-se-resize shadow-xs"
                    />
                    <div
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDragState({
                          elementId: img.id,
                          type: "image",
                          action: "resize",
                          handle: "sw",
                          startX: e.clientX,
                          startY: e.clientY,
                          origX: img.x,
                          origY: img.y,
                          origW: img.width,
                          origH: img.height,
                        });
                      }}
                      className="absolute -left-1.5 -bottom-1.5 w-3 h-3 bg-blue-600 rounded-full cursor-sw-resize shadow-xs"
                    />
                  </>
                )}
              </div>
            );
          })}

          {/* 5. Text Elements (Click-to-Select & Inline Word-Style Editing) */}
          {activeTexts.map((t) => {
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
                className={`canvas-interactive-element absolute select-none ${
                  isEditing ? "cursor-text" : "cursor-move"
                } ${isSelected ? "z-30" : "z-10"}`}
                style={{
                  left: `${t.x * zoom}px`,
                  top: `${t.y * zoom}px`,
                  width: t.width ? `${t.width * zoom}px` : "auto",
                  minWidth: "24px",
                  fontSize: `${(t.fontSize || 12) * zoom}px`,
                  fontFamily: t.fontFamily || "Helvetica, Arial, sans-serif",
                  fontWeight: t.fontWeight || "normal",
                  fontStyle: t.fontStyle || "normal",
                  textDecoration: t.underline
                    ? t.strike
                      ? "underline line-through"
                      : "underline"
                    : t.strike
                    ? "line-through"
                    : "none",
                  color: t.color || "#000000",
                  backgroundColor:
                    t.backgroundColor && t.backgroundColor !== "transparent"
                      ? t.backgroundColor
                      : t.source === "original" && (t.modified || isEditing)
                      ? t.detectedBackgroundColor || "#ffffff"
                      : undefined,
                  textAlign: t.textAlign || "left",
                  opacity: t.opacity ?? 1,
                  outline: isSelected ? "2px solid #2563eb" : undefined,
                  padding: "1px 2px",
                  lineHeight: t.lineHeight || 1.25,
                }}
              >
                {isEditing ? (
                  <textarea
                    autoFocus
                    value={t.text}
                    onChange={(e) =>
                      onUpdateTextElement(t.id, { text: e.target.value, modified: true })
                    }
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setEditingTextId(null);
                    }}
                    className="w-full bg-transparent border-none outline-none resize-none p-0 m-0 leading-tight"
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
                  <div
                    className="whitespace-pre-wrap break-words"
                    style={{
                      // If untouched original text, render transparently over PDF base canvas so user can click to edit
                      color: t.source === "original" && !t.modified ? "transparent" : (t.color || "#000000"),
                    }}
                  >
                    {t.text}
                  </div>
                )}

                {isSelected && !isEditing && (
                  <div
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDragState({
                        elementId: t.id,
                        type: "text",
                        action: "resize",
                        handle: "se",
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
                )}
              </div>
            );
          })}

          {/* 6. Contextual Floating Toolbar for Selected Elements */}
          {selectedElementId && (selectedTextEl || selectedImageEl || selectedShapeEl) && !editingTextId && (
            <div
              className="absolute z-50 flex items-center gap-1 p-1 bg-gray-900/95 backdrop-blur-md text-white rounded-lg shadow-xl border border-gray-700 text-xs animate-in fade-in"
              style={{
                left: `${((selectedTextEl || selectedImageEl || selectedShapeEl)!.x) * zoom}px`,
                top: `${Math.max(0, ((selectedTextEl || selectedImageEl || selectedShapeEl)!.y) * zoom - 44)}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {selectedTextEl && (
                <>
                  <button
                    onClick={() =>
                      onUpdateTextElement(selectedTextEl.id, {
                        fontWeight: selectedTextEl.fontWeight === "bold" ? "normal" : "bold",
                        modified: true,
                      })
                    }
                    className={`p-1.5 rounded hover:bg-gray-800 ${
                      selectedTextEl.fontWeight === "bold" ? "bg-blue-600 text-white" : ""
                    }`}
                    title="Bold"
                  >
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onUpdateTextElement(selectedTextEl.id, {
                        fontStyle: selectedTextEl.fontStyle === "italic" ? "normal" : "italic",
                        modified: true,
                      })
                    }
                    className={`p-1.5 rounded hover:bg-gray-800 ${
                      selectedTextEl.fontStyle === "italic" ? "bg-blue-600 text-white" : ""
                    }`}
                    title="Italic"
                  >
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onUpdateTextElement(selectedTextEl.id, {
                        underline: !selectedTextEl.underline,
                        modified: true,
                      })
                    }
                    className={`p-1.5 rounded hover:bg-gray-800 ${
                      selectedTextEl.underline ? "bg-blue-600 text-white" : ""
                    }`}
                    title="Underline"
                  >
                    <Underline className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-[1px] h-4 bg-gray-700 mx-0.5" />
                  <button
                    onClick={() =>
                      onUpdateTextElement(selectedTextEl.id, { textAlign: "left", modified: true })
                    }
                    className={`p-1.5 rounded hover:bg-gray-800 ${
                      selectedTextEl.textAlign === "left" ? "bg-blue-600 text-white" : ""
                    }`}
                  >
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onUpdateTextElement(selectedTextEl.id, { textAlign: "center", modified: true })
                    }
                    className={`p-1.5 rounded hover:bg-gray-800 ${
                      selectedTextEl.textAlign === "center" ? "bg-blue-600 text-white" : ""
                    }`}
                  >
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      onUpdateTextElement(selectedTextEl.id, { textAlign: "right", modified: true })
                    }
                    className={`p-1.5 rounded hover:bg-gray-800 ${
                      selectedTextEl.textAlign === "right" ? "bg-blue-600 text-white" : ""
                    }`}
                  >
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                  <div className="w-[1px] h-4 bg-gray-700 mx-0.5" />
                </>
              )}

              {onDuplicateElement && (
                <button
                  onClick={() => onDuplicateElement(selectedElementId)}
                  className="p-1.5 rounded hover:bg-gray-800 text-gray-300 hover:text-white"
                  title="Duplicate"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}

              <button
                onClick={() => onDeleteElement(selectedElementId)}
                className="p-1.5 rounded hover:bg-red-900/60 text-red-400 hover:text-red-200"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {rendering && (
          <div className="absolute top-3 right-3 w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin z-40" />
        )}
      </div>
    </div>
  );
}
