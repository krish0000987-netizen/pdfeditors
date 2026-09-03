import { describe, it, expect } from "vitest";
import {
  pdfNativeToEditorRect,
  editorToPdfNativeRect,
  editorToScreenPoint,
  screenToEditorPoint,
  editorToScreenRect,
  screenToEditorRect,
  rotatePoint,
} from "../pdf/coordinate-system";

describe("Coordinate System Conversions", () => {
  const pageHeight = 841.89; // A4 height

  it("converts native PDF bottom-left rect to editor top-left rect", () => {
    const pdfX = 50;
    const pdfY = 100;
    const width = 200;
    const height = 40;

    const editorRect = pdfNativeToEditorRect(pdfX, pdfY, width, height, pageHeight);

    expect(editorRect.x).toBe(50);
    expect(editorRect.y).toBe(Math.round((pageHeight - 100 - 40) * 100) / 100);
    expect(editorRect.width).toBe(200);
    expect(editorRect.height).toBe(40);
  });

  it("is reversible between native PDF rect and editor rect", () => {
    const origPdfX = 72;
    const origPdfY = 300;
    const w = 150;
    const h = 25;

    const editorRect = pdfNativeToEditorRect(origPdfX, origPdfY, w, h, pageHeight);
    const roundTripPdf = editorToPdfNativeRect(
      editorRect.x,
      editorRect.y,
      editorRect.width,
      editorRect.height,
      pageHeight
    );

    expect(roundTripPdf.x).toBe(origPdfX);
    expect(roundTripPdf.y).toBeCloseTo(origPdfY, 1);
    expect(roundTripPdf.width).toBe(w);
    expect(roundTripPdf.height).toBe(h);
  });

  it("scales points and rects with zoom", () => {
    const pt = { x: 100, y: 200 };
    const zoom = 1.5;

    const screenPt = editorToScreenPoint(pt, zoom);
    expect(screenPt).toEqual({ x: 150, y: 300 });

    const backPt = screenToEditorPoint(screenPt, zoom);
    expect(backPt).toEqual(pt);

    const rect = { x: 40, y: 60, width: 120, height: 80 };
    const screenRect = editorToScreenRect(rect, zoom);
    expect(screenRect).toEqual({ x: 60, y: 90, width: 180, height: 120 });

    const backRect = screenToEditorRect(screenRect, zoom);
    expect(backRect).toEqual(rect);
  });

  it("handles rotation properly", () => {
    const pt = rotatePoint(10, 20, 100, 200, 90);
    expect(pt).toEqual({ x: 200 - 20, y: 10 });
  });
});
