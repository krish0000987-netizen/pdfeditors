export type Match = {
  match_id: number;
  matched_text: string;
  page_number: number;
  bounding_box: [number, number, number, number];
  font_name: string;
  font_size: number | null;
};

export type Version = {
  id: string;
  version_number: number;
  file_path: string;
  created_by: string;
  operation_type: string | null;
  operation_summary: string | null;
  created_at: string;
};

export type AnnotationMeta = {
  id: string;
  document_id: string;
  page_number: number;
  type: string;
  data: Record<string, unknown>;
  created_at: string;
};

export type EditorDocument = {
  id: string;
  name: string;
  page_count: number;
  status: string;
  document_type: string;
  is_favorite: boolean;
  original_file_path: string;
};

export interface CanvasTextElement {
  id: string;
  page: number; // 0-indexed
  x: number; // in PDF points
  y: number; // in PDF points from top
  width: number;
  height: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  underline: boolean;
  color: string; // hex #rrggbb
  backgroundColor: string; // hex or transparent
  textAlign: "left" | "center" | "right";
  opacity: number;
}

export interface CanvasImageElement {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
  mimeType?: string;
  title?: string;
  opacity: number;
  rotation: number;
}

export interface CanvasWhiteoutElement {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export type ActiveTool =
  | "select"
  | "text"
  | "image"
  | "stamp"
  | "whiteout"
  | "signature"
  | "edit_text"
  | "redact"
  | "find";
