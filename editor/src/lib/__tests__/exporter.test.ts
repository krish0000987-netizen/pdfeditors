import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { exportPdfDocument } from "../pdf/exporter";
import { createEmptyDocumentModel, createEmptyPageModel } from "../pdf/document-model";

describe("PDF Export & Background Covering Pipeline", () => {
  it("exports a valid PDF document containing added and modified text without errors", async () => {
    // Generate a minimal valid 1-page PDF
    const basePdf = await PDFDocument.create();
    basePdf.addPage([595.28, 841.89]);
    const originalBytes = await basePdf.save();

    // Prepare DocumentModel with original (modified) text and added text
    const model = createEmptyDocumentModel("doc-100", "test-export.pdf");
    const page0 = createEmptyPageModel(0, 595.28, 841.89);

    // Modified original text: should be cleanly covered and replaced
    page0.textElements.push({
      id: "text-orig-1",
      pageIndex: 0,
      text: "John Doe Updated",
      originalText: "John Doe",
      originalBoundingBox: { x: 50, y: 100, width: 120, height: 25 },
      source: "original",
      modified: true,
      deleted: false,
      x: 50,
      y: 100,
      width: 140,
      height: 25,
      fontFamily: "Helvetica, Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fontStyle: "normal",
      underline: true,
      strike: false,
      color: "#1d4ed8",
      backgroundColor: "transparent",
      textAlign: "left",
      lineHeight: 1.25,
      letterSpacing: 0,
      opacity: 1,
      rotation: 0,
    });

    // Added Shape
    page0.shapeElements.push({
      id: "shape-1",
      pageIndex: 0,
      type: "rectangle",
      x: 200,
      y: 300,
      width: 100,
      height: 50,
      fillColor: "#eff6ff",
      strokeColor: "#2563eb",
      strokeWidth: 2,
      opacity: 1,
      rotation: 0,
      source: "added",
      modified: false,
      deleted: false,
    });

    model.pages.push(page0);
    model.pageCount = 1;

    const exportedBytes = await exportPdfDocument(originalBytes, model);

    expect(exportedBytes).toBeInstanceOf(Uint8Array);
    expect(exportedBytes.length).toBeGreaterThan(100);

    // Verify the resulting PDF can be reloaded and parsed cleanly by pdf-lib
    const reloadedDoc = await PDFDocument.load(exportedBytes);
    expect(reloadedDoc.getPageCount()).toBe(1);
  });
});
