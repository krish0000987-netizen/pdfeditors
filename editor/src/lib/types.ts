export interface Profile {
  id: string;
  user_id: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Folder {
  id: string;
  owner_id: string;
  name: string;
  created_at: string;
}

export interface Document {
  id: string;
  owner_id: string;
  name: string;
  original_file_path: string | null;
  thumbnail_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  page_count: number | null;
  status: "processing" | "ready" | "failed" | "archived";
  document_type: "general" | "bank_statement" | "invoice" | "contract" | "form" | "other";
  favorite: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  created_by: string;
  operation_type: string | null;
  operation_summary: string | null;
  created_at: string;
}

export interface Annotation {
  id: string;
  document_id: string;
  version_id: string | null;
  page_number: number;
  type: string;
  data: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface AIRequest {
  id: string;
  user_id: string;
  document_id: string | null;
  prompt: string;
  model: string;
  provider: string;
  status: string;
  created_at: string;
}

export interface AIOperation {
  id: string;
  ai_request_id: string;
  document_id: string;
  operation_json: Record<string, unknown>;
  status: "proposed" | "validated" | "applied" | "rejected" | "failed";
  created_at: string;
  applied_at: string | null;
}

export interface AuditLog {
  id: string;
  user_id: string;
  document_id: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIProvider {
  id: string;
  user_id: string;
  name: string;
  provider_type: "openai_compatible" | "anthropic_compatible" | "gemini_compatible" | "custom";
  base_url: string;
  api_key_encrypted: string | null;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout: number;
  is_active: boolean;
  is_default: boolean;
  usage_requests: number;
  usage_input_tokens: number;
  usage_output_tokens: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EditResultData {
  success: boolean;
  original_text: string;
  new_text: string;
  font_action: string;
  warnings: string[];
  fidelity_report: {
    font_substituted: string | null;
    font_preserved: boolean;
    overflow_detected: boolean;
    reflow_applied: boolean;
    glyphs_missing: string[];
    degradations: Array<{
      kind: string;
      severity: string;
      detail: string;
    }>;
  };
}
