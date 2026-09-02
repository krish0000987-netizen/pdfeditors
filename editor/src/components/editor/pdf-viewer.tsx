"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";

pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

export interface SelectionInfo {
  text: string;
  page: number;
}

export function PDFViewer({
  data,
  page,
  zoom,
  onPageCount,
  onSelectText,
  viewerRef,
}: {
  data: Uint8Array | null;
  page: number; // 1-indexed
  zoom: number;
  onPageCount?: (n: number) => void;
  onSelectText?: (sel: SelectionInfo) => void;
  viewerRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Load document when bytes change
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    // copy so pdf.js can transfer the buffer safely
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Render the current page
  useEffect(() => {
    const pdf = docRef.current;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
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

        // Render text layer manually (works across pdf.js versions):
        // each text item becomes an absolutely-positioned transparent span.
        textLayer.innerHTML = "";
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
          style.style.width = `${(100 * item.width!) / viewport.width}%`;
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-red-500">Failed to load PDF: {error}</p>
      </div>
    );
  }

  return (
    <div ref={viewerRef} className="flex flex-col items-center py-6 px-4">
      <div className="relative bg-white shadow-lg" style={{ lineHeight: 0 }}>
        <canvas ref={canvasRef} className="block" />
        <div
          ref={textLayerRef}
          className="pdf-text-layer absolute inset-0 overflow-hidden"
        />
        {rendering && (
          <div className="absolute top-2 right-2 w-4 h-4 border-2 border-gray-200 border-t-gray-700 rounded-full animate-spin" />
        )}
      </div>
    </div>
  );
}
