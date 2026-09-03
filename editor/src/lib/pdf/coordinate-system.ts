import type { BoundingBox } from "./document-model";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Converts native PDF bottom-left origin coordinates to standard top-left editor coordinates (points).
 */
export function pdfNativeToEditorRect(
  pdfX: number,
  pdfY: number,
  width: number,
  height: number,
  pageHeight: number
): BoundingBox {
  return {
    x: Math.round(pdfX * 100) / 100,
    y: Math.round((pageHeight - pdfY - height) * 100) / 100,
    width: Math.max(1, Math.round(width * 100) / 100),
    height: Math.max(1, Math.round(height * 100) / 100),
  };
}

/**
 * Converts standard top-left editor coordinates (points) to native PDF bottom-left coordinates.
 */
export function editorToPdfNativeRect(
  editorX: number,
  editorY: number,
  width: number,
  height: number,
  pageHeight: number
): { x: number; y: number; width: number; height: number } {
  return {
    x: editorX,
    y: pageHeight - editorY - height,
    width,
    height,
  };
}

/**
 * Converts standard editor point (at zoom 1.0) to screen pixel coordinates at given zoom.
 */
export function editorToScreenPoint(point: Point, zoom: number): Point {
  return {
    x: Math.round(point.x * zoom),
    y: Math.round(point.y * zoom),
  };
}

/**
 * Converts screen pixel coordinates at given zoom to standard editor point (at zoom 1.0).
 */
export function screenToEditorPoint(point: Point, zoom: number): Point {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    x: Math.round(point.x / safeZoom),
    y: Math.round(point.y / safeZoom),
  };
}

/**
 * Converts standard editor bounding box (at zoom 1.0) to screen pixel rectangle at given zoom.
 */
export function editorToScreenRect(rect: Rect, zoom: number): Rect {
  return {
    x: Math.round(rect.x * zoom),
    y: Math.round(rect.y * zoom),
    width: Math.round(rect.width * zoom),
    height: Math.round(rect.height * zoom),
  };
}

/**
 * Converts screen pixel rectangle at given zoom to standard editor bounding box (at zoom 1.0).
 */
export function screenToEditorRect(rect: Rect, zoom: number): Rect {
  const safeZoom = zoom > 0 ? zoom : 1;
  return {
    x: Math.round(rect.x / safeZoom),
    y: Math.round(rect.y / safeZoom),
    width: Math.round(rect.width / safeZoom),
    height: Math.round(rect.height / safeZoom),
  };
}

/**
 * Rotate a point inside a bounding box given page rotation (0, 90, 180, 270).
 */
export function rotatePoint(
  x: number,
  y: number,
  pageWidth: number,
  pageHeight: number,
  rotation: number
): Point {
  const normalizedRotation = ((rotation % 360) + 360) % 360;
  switch (normalizedRotation) {
    case 90:
      return { x: pageHeight - y, y: x };
    case 180:
      return { x: pageWidth - x, y: pageHeight - y };
    case 270:
      return { x: y, y: pageWidth - x };
    default:
      return { x, y };
  }
}

/**
 * Clamp helper.
 */
export function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}
