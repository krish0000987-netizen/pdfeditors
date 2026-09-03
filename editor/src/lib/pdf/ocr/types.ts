import type { BoundingBox } from "../document-model";

export interface OcrTextBlock {
  id: string;
  text: string;
  bbox: BoundingBox;
  confidence: number;
  lines: {
    text: string;
    bbox: BoundingBox;
    confidence: number;
  }[];
}

export interface OcrPageResult {
  pageIndex: number;
  blocks: OcrTextBlock[];
  fullText: string;
  orientation?: number;
}

export interface OCRProvider {
  name: string;
  detectText(pageCanvas: HTMLCanvasElement, pageIndex: number): Promise<OcrPageResult>;
  detectBlocks(pageCanvas: HTMLCanvasElement): Promise<OcrTextBlock[]>;
  isAvailable(): boolean;
}
