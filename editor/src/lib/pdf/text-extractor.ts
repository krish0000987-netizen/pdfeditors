import type { TextElement, BoundingBox } from "./document-model";
import { pdfNativeToEditorRect } from "./coordinate-system";

export interface RawPdfTextItem {
  str: string;
  dir?: string;
  width?: number;
  height?: number;
  transform: number[]; // [a, b, c, d, e, f]
  fontName?: string;
  hasEOL?: boolean;
}

export interface ExtractedPageTextResult {
  textElements: TextElement[];
  isScanned: boolean;
}

/**
 * Normalizes PDF font name string into standard web font family.
 */
export function normalizeFontFamily(pdfFontName?: string): string {
  if (!pdfFontName) return "Helvetica, Arial, sans-serif";
  const lower = pdfFontName.toLowerCase();
  if (lower.includes("times") || lower.includes("serif") || lower.includes("georgia") || lower.includes("minion")) {
    return "Times New Roman, Times, serif";
  }
  if (lower.includes("courier") || lower.includes("mono") || lower.includes("code") || lower.includes("consolas")) {
    return "Courier New, Courier, monospace";
  }
  if (lower.includes("roboto")) return "Roboto, sans-serif";
  if (lower.includes("trebuchet")) return "Trebuchet MS, sans-serif";
  return "Helvetica, Arial, sans-serif";
}

/**
 * Detects whether font name indicates bold weight.
 */
export function detectFontWeight(pdfFontName?: string): "normal" | "bold" {
  if (!pdfFontName) return "normal";
  const lower = pdfFontName.toLowerCase();
  return lower.includes("bold") || lower.includes("black") || lower.includes("heavy") || lower.includes("semibold")
    ? "bold"
    : "normal";
}

/**
 * Detects whether font name indicates italic/oblique style.
 */
export function detectFontStyle(pdfFontName?: string): "normal" | "italic" {
  if (!pdfFontName) return "normal";
  const lower = pdfFontName.toLowerCase();
  return lower.includes("italic") || lower.includes("oblique") || lower.includes("slanted")
    ? "italic"
    : "normal";
}

interface IntermediateTextRun {
  str: string;
  pdfX: number;
  pdfY: number;
  width: number;
  height: number;
  fontSize: number;
  fontName?: string;
  fontFamily: string;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  rotation: number;
}

/**
 * Groups raw PDF text runs into coherent lines and paragraphs for Word-like inline editing.
 */
export function groupTextRunsIntoElements(
  rawRuns: IntermediateTextRun[],
  pageIndex: number,
  pageHeight: number
): TextElement[] {
  if (rawRuns.length === 0) return [];

  // Filter out empty or whitespace-only runs
  const validRuns = rawRuns.filter((r) => r.str.trim().length > 0 && r.width > 0);
  if (validRuns.length === 0) return [];

  // Sort primarily by Y descending (top to bottom in PDF coordinates), then X ascending
  const sorted = [...validRuns].sort((a, b) => {
    const yDiff = b.pdfY - a.pdfY;
    if (Math.abs(yDiff) > Math.min(a.fontSize, b.fontSize) * 0.4) {
      return yDiff;
    }
    return a.pdfX - b.pdfX;
  });

  const lines: IntermediateTextRun[][] = [];
  let currentLine: IntermediateTextRun[] = [];

  for (const run of sorted) {
    if (currentLine.length === 0) {
      currentLine.push(run);
      continue;
    }

    const firstInLine = currentLine[0];
    const lastInLine = currentLine[currentLine.length - 1];

    const yDiff = Math.abs(run.pdfY - firstInLine.pdfY);
    const sizeDiff = Math.abs(run.fontSize - firstInLine.fontSize);
    const yThreshold = Math.max(3, firstInLine.fontSize * 0.45);

    // Check if on same baseline and compatible size/font
    const isSameBaseline = yDiff <= yThreshold && sizeDiff <= 3;
    const horizontalGap = run.pdfX - (lastInLine.pdfX + lastInLine.width);
    const isNearby = horizontalGap <= firstInLine.fontSize * 2.0;

    if (isSameBaseline && isNearby) {
      currentLine.push(run);
    } else {
      lines.push(currentLine);
      currentLine = [run];
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  // Convert each grouped line into a TextElement
  const elements: TextElement[] = [];

  for (const line of lines) {
    if (line.length === 0) continue;

    // Sort line runs left to right
    line.sort((a, b) => a.pdfX - b.pdfX);

    let combinedText = "";
    let minPdfX = line[0].pdfX;
    let minPdfY = line[0].pdfY;
    let maxPdfX = line[0].pdfX + line[0].width;
    let maxPdfY = line[0].pdfY + line[0].height;
    const primaryRun = line[0];

    for (let i = 0; i < line.length; i++) {
      const r = line[i];
      if (i > 0) {
        const prev = line[i - 1];
        const gap = r.pdfX - (prev.pdfX + prev.width);
        if (gap > primaryRun.fontSize * 0.18 && !combinedText.endsWith(" ") && !r.str.startsWith(" ")) {
          combinedText += " ";
        }
      }
      combinedText += r.str;
      minPdfX = Math.min(minPdfX, r.pdfX);
      minPdfY = Math.min(minPdfY, r.pdfY);
      maxPdfX = Math.max(maxPdfX, r.pdfX + r.width);
      maxPdfY = Math.max(maxPdfY, r.pdfY + r.height);
    }

    const totalWidth = Math.max(20, maxPdfX - minPdfX);
    const totalHeight = Math.max(primaryRun.fontSize * 1.15, maxPdfY - minPdfY);

    // Convert to editor top-left coordinates
    const bbox: BoundingBox = pdfNativeToEditorRect(
      minPdfX,
      minPdfY,
      totalWidth,
      totalHeight,
      pageHeight
    );

    const elementId = `text-orig-p${pageIndex}-${Math.round(minPdfX)}-${Math.round(minPdfY)}-${Math.random().toString(36).substring(2, 7)}`;

    elements.push({
      id: elementId,
      pageIndex,
      text: combinedText.trim(),
      originalText: combinedText.trim(),
      originalBoundingBox: { ...bbox },
      source: "original",
      modified: false,
      deleted: false,
      x: bbox.x,
      y: bbox.y,
      width: bbox.width,
      height: bbox.height,
      fontFamily: primaryRun.fontFamily,
      fontSize: Math.round(primaryRun.fontSize * 10) / 10,
      fontWeight: primaryRun.fontWeight,
      fontStyle: primaryRun.fontStyle,
      underline: false,
      strike: false,
      color: "#000000",
      backgroundColor: "transparent",
      textAlign: "left",
      lineHeight: 1.25,
      letterSpacing: 0,
      opacity: 1,
      rotation: primaryRun.rotation,
      confidence: 1,
    });
  }

  return elements;
}

import type * as pdfjs from "pdfjs-dist";

/**
 * Extracts text items from a PDF.js page object.
 */
export async function extractTextFromPdfPage(
  pdfPage: pdfjs.PDFPageProxy,
  pageIndex: number
): Promise<ExtractedPageTextResult> {
  try {
    const textContent = await pdfPage.getTextContent({ includeMarkedContent: true });
    const viewport = pdfPage.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;

    const rawRuns: IntermediateTextRun[] = [];

    for (const rawItem of textContent.items || []) {
      const item = rawItem as {
        str?: string;
        width?: number;
        height?: number;
        transform?: number[];
        fontName?: string;
      };
      if (!item.str || item.str.length === 0 || !item.transform) continue;

      const [a, b, c, d, e, f] = item.transform;
      const fontSize = Math.hypot(b, d) || Math.abs(d) || 12;
      const fontWidth = Math.hypot(a, c) || Math.abs(a) || fontSize;
      const width = item.width || fontWidth * (item.str.length * 0.55);
      const height = item.height || fontSize;
      const angleRad = Math.atan2(b, a);
      const rotation = Math.round((angleRad * 180) / Math.PI);

      rawRuns.push({
        str: item.str,
        pdfX: e,
        pdfY: f,
        width,
        height,
        fontSize,
        fontName: item.fontName,
        fontFamily: normalizeFontFamily(item.fontName),
        fontWeight: detectFontWeight(item.fontName),
        fontStyle: detectFontStyle(item.fontName),
        rotation,
      });
    }

    const textElements = groupTextRunsIntoElements(rawRuns, pageIndex, pageHeight);
    const isScanned = textElements.length === 0;

    return {
      textElements,
      isScanned,
    };
  } catch (error) {
    console.warn(`Text extraction error on page ${pageIndex}:`, error);
    return {
      textElements: [],
      isScanned: true,
    };
  }
}
