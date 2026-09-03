export type ElementSource = "original" | "added";

export interface BoundingBox {
  x: number; // PDF points, top-left relative in standard editor coordinate space
  y: number; // PDF points, top-left relative
  width: number;
  height: number;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold" | 400 | 500 | 600 | 700 | 800;
  fontStyle: "normal" | "italic";
  underline: boolean;
  strike: boolean;
  color: string; // hex #rrggbb or rgba
  backgroundColor?: string; // hex or transparent
  textAlign: "left" | "center" | "right" | "justify";
  lineHeight: number; // relative, e.g. 1.2
  letterSpacing: number; // pt
  opacity: number; // 0 to 1
  rotation: number; // degrees
}

export interface TextElement extends BoundingBox, TextStyle {
  id: string;
  pageIndex: number; // 0-indexed
  text: string;
  originalText?: string;
  originalBoundingBox?: BoundingBox;
  source: ElementSource;
  modified: boolean;
  deleted: boolean;
  confidence?: number;
  // Detected underlying background color to cover original text cleanly
  detectedBackgroundColor?: string;
}

export interface ImageElement extends BoundingBox {
  id: string;
  pageIndex: number;
  dataUrl: string;
  originalDataUrl?: string;
  mimeType?: string;
  title?: string;
  opacity: number;
  rotation: number;
  aspectRatioLocked: boolean;
  originalBoundingBox?: BoundingBox;
  source: ElementSource;
  modified: boolean;
  deleted: boolean;
}

export type ShapeType = "rectangle" | "circle" | "line" | "arrow" | "highlight";

export interface ShapeElement extends BoundingBox {
  id: string;
  pageIndex: number;
  type: ShapeType;
  fillColor: string; // hex or rgba or transparent
  strokeColor: string;
  strokeWidth: number;
  strokeDash?: number[];
  opacity: number;
  rotation: number;
  source: ElementSource;
  modified: boolean;
  deleted: boolean;
}

export interface RedactionElement extends BoundingBox {
  id: string;
  pageIndex: number;
  overlayText?: string;
  overlayTextColor?: string;
  fillColor: string; // usually #000000 or #ffffff
  source: ElementSource;
  deleted: boolean;
}

export interface PageModel {
  pageIndex: number; // 0-indexed
  pageNumber: number; // 1-indexed
  width: number; // in PDF points (72 DPI)
  height: number; // in PDF points
  rotation: number; // 0, 90, 180, 270
  isScanned: boolean;
  textElements: TextElement[];
  imageElements: ImageElement[];
  shapeElements: ShapeElement[];
  redactionElements: RedactionElement[];
}

export interface DocumentModel {
  id: string;
  fileName: string;
  pageCount: number;
  pages: PageModel[];
  scale: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export function createEmptyPageModel(pageIndex: number, width = 595.28, height = 841.89): PageModel {
  return {
    pageIndex,
    pageNumber: pageIndex + 1,
    width,
    height,
    rotation: 0,
    isScanned: false,
    textElements: [],
    imageElements: [],
    shapeElements: [],
    redactionElements: [],
  };
}

export function createEmptyDocumentModel(id: string, fileName: string): DocumentModel {
  return {
    id,
    fileName,
    pageCount: 0,
    pages: [],
    scale: 1,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
