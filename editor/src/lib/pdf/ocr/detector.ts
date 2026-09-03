import type { PageModel } from "../document-model";
import type { OCRProvider, OcrPageResult, OcrTextBlock } from "./types";

/**
 * Determines whether a page is scanned/image-only based on text extraction heuristics.
 */
export function isPageScanned(page: PageModel): boolean {
  if (page.textElements.length === 0) return true;
  const totalChars = page.textElements.reduce((acc, el) => acc + el.text.trim().length, 0);
  return totalChars < 10;
}

/**
 * Fallback / Mock OCR provider that can be plugged in with Tesseract.js, Google Cloud Vision, or local WASM OCR.
 */
export class ClientOcrProvider implements OCRProvider {
  name = "StandardClientOCR";

  isAvailable(): boolean {
    return typeof window !== "undefined";
  }

  async detectText(_pageCanvas: HTMLCanvasElement, pageIndex: number): Promise<OcrPageResult> {
    // Scaffold ready for Tesseract.js / backend OCR service
    return {
      pageIndex,
      blocks: [],
      fullText: "",
    };
  }

  async detectBlocks(_pageCanvas: HTMLCanvasElement): Promise<OcrTextBlock[]> {
    return [];
  }
}
