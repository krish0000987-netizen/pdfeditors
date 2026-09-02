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
