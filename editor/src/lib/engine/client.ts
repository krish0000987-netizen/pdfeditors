import { EngineError } from "./errors";

const ENGINE_URL =
  process.env.ENGINE_URL || process.env.NEXT_PUBLIC_ENGINE_URL || "http://127.0.0.1:8000";
const ENGINE_API_KEY = process.env.ENGINE_API_KEY || "dev-engine-secret-local";

export { ENGINE_URL, ENGINE_API_KEY };

async function enginePost<T = any>(endpoint: string, body: any): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Engine-Key": ENGINE_API_KEY,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data?.detail ?? data);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new EngineError(`Engine ${endpoint} failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
  }
  return res.json();
}

async function engineGet<T = any>(endpoint: string): Promise<T> {
  const res = await fetch(`${ENGINE_URL}${endpoint}`, {
    headers: { "X-Engine-Key": ENGINE_API_KEY },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const data = await res.json();
      detail = typeof data?.detail === "string" ? data.detail : JSON.stringify(data?.detail ?? data);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new EngineError(`Engine ${endpoint} failed (${res.status}): ${detail.slice(0, 300)}`, res.status);
  }
  return res.json();
}

/**
 * Typed client for the EDITOR Engine Service (FastAPI wrapper around the
 * unmodified pdf-edit-engine). All paths are engine-work-root-relative.
 */
export const engine = {
  // ── health ───────────────────────────────────────────────
  async health() {
    return engineGet<{ status: string; engine: string }>("/health");
  },

  // ── files ────────────────────────────────────────────────
  async createFromBytes(dataB64: string) {
    return enginePost<{ path: string; page_count: number; size: number }>(
      "/files/create-from-bytes",
      { data_b64: dataB64 }
    );
  },
  async createBlank(pages = 1) {
    return enginePost<{ output_path: string; page_count: number }>("/pages/create-blank", { pages });
  },
  async downloadFile(path: string) {
    return engineGet<{ data_b64: string; size: number }>(`/files/${path}`);
  },
  async deleteFile(path: string) {
    const res = await fetch(`${ENGINE_URL}/files/${path}`, {
      method: "DELETE",
      headers: { "X-Engine-Key": ENGINE_API_KEY },
    });
    return res.ok;
  },

  // ── text ─────────────────────────────────────────────────
  async getText(path: string, page?: number) {
    return enginePost<{ text: string; page: number | null }>("/text/get", { path, page: page ?? null });
  },
  async getLayout(path: string, page?: number) {
    return enginePost<{ blocks: EngineTextBlock[] }>("/text/layout", { path, page: page ?? null });
  },
  async findText(path: string, searchText: string, opts?: { page?: number; caseSensitive?: boolean }) {
    return enginePost<{ matches: EngineMatch[]; count: number }>("/text/find", {
      path,
      search_text: searchText,
      page: opts?.page ?? null,
      case_sensitive: opts?.caseSensitive ?? true,
    });
  },
  async extractBbox(path: string, page: number, bbox: [number, number, number, number]) {
    return enginePost<{ text: string }>("/text/extract-bbox", { path, page, bbox });
  },
  async replaceText(
    path: string,
    searchText: string,
    matchId: number,
    newText: string,
    opts?: { dryRun?: boolean; page?: number; caseSensitive?: boolean; outputPath?: string }
  ) {
    return enginePost<EngineEditResult & { output_path: string | null; dry_run: boolean }>(
      "/text/replace",
      {
        path,
        search_text: searchText,
        match_id: matchId,
        new_text: newText,
        dry_run: opts?.dryRun ?? false,
        page: opts?.page ?? null,
        case_sensitive: opts?.caseSensitive ?? true,
        output_path: opts?.outputPath,
      }
    );
  },
  async replaceAll(
    path: string,
    search: string,
    replacement: string,
    opts?: { dryRun?: boolean }
  ) {
    return enginePost<
      EngineEditResult & { count: number; output_path: string | null; dry_run: boolean }
    >("/text/replace-all", {
      path,
      search,
      replacement,
      dry_run: opts?.dryRun ?? false,
    });
  },
  async batchReplace(path: string, edits: Array<{ find: string; replace: string }>, opts?: { dryRun?: boolean }) {
    return enginePost<
      EngineEditResult & { count: number; output_path: string | null; dry_run: boolean }
    >("/text/batch-replace", { path, edits, dry_run: opts?.dryRun ?? false });
  },

  // ── structural ───────────────────────────────────────────
  async replaceBlock(
    path: string,
    pageNumber: number,
    bbox: [number, number, number, number],
    newText: string,
    opts?: { fontName?: string; fontSize?: number; fit?: string }
  ) {
    return enginePost<EngineEditResult & { output_path: string }>("/structural/replace-block", {
      path,
      page_number: pageNumber,
      bbox,
      new_text: newText,
      font_name: opts?.fontName,
      font_size: opts?.fontSize,
      fit: opts?.fit,
    });
  },
  async deleteBlock(path: string, pageNumber: number, bbox: [number, number, number, number], closeGap = true) {
    return enginePost<EngineEditResult & { output_path: string }>("/structural/delete-block", {
      path,
      page_number: pageNumber,
      bbox,
      close_gap: closeGap,
    });
  },
  async insertTextBlock(
    path: string,
    pageNumber: number,
    x: number,
    y: number,
    text: string,
    opts?: { fontSize?: number; maxWidth?: number }
  ) {
    return enginePost<EngineEditResult & { output_path: string }>("/structural/insert-text-block", {
      path,
      page_number: pageNumber,
      x,
      y,
      text,
      font_size: opts?.fontSize,
      max_width: opts?.maxWidth,
    });
  },

  // ── pages ────────────────────────────────────────────────
  async rotatePages(path: string, pages: number[], angle: number) {
    return enginePost<{ output_path: string }>("/pages/rotate", { path, pages, angle });
  },
  async deletePages(path: string, pages: number[]) {
    return enginePost<{ output_path: string }>("/pages/delete", { path, pages });
  },
  async duplicatePages(path: string, pages: number[], mode: "in_place" | "append" = "in_place") {
    return enginePost<{ output_path: string }>("/pages/duplicate", { path, pages, mode });
  },
  async reorderPages(path: string, pageOrder: number[]) {
    return enginePost<{ output_path: string }>("/pages/reorder", { path, page_order: pageOrder });
  },
  async splitPdf(path: string) {
    return enginePost<{ output_paths: string[] }>("/pages/split", { path });
  },
  async mergePdfs(paths: string[]) {
    return enginePost<{ output_path: string }>("/pages/merge", { paths });
  },
  async insertBlankPage(path: string, at: number) {
    return enginePost<{ output_path: string }>("/pages/insert-blank", { path, at });
  },

  // ── annotations ──────────────────────────────────────────
  async listAnnotations(path: string, page?: number) {
    return enginePost<{
      annotations: Array<{
        index: number;
        page: number;
        subtype: string;
        rect: number[];
        uri: string | null;
        text: string;
      }>;
    }>("/annotations/list", { path, page: page ?? null });
  },
  async highlightText(path: string, searchText: string, opts?: { page?: number; caseSensitive?: boolean }) {
    return enginePost<{ output_path: string; count: number }>("/annotations/highlight", {
      path,
      search_text: searchText,
      page: opts?.page ?? null,
      case_sensitive: opts?.caseSensitive ?? true,
    });
  },
  async addAnnotation(
    path: string,
    page: number,
    subtype: string,
    rect: [number, number, number, number],
    data: Record<string, unknown> = {}
  ) {
    return enginePost<{ output_path: string }>("/annotations/add", {
      path,
      page,
      subtype,
      rect,
      data,
    });
  },
  async deleteAnnotation(path: string, page: number, index: number) {
    return enginePost<{ output_path: string }>("/annotations/delete", { path, page, index });
  },

  // ── true redaction ───────────────────────────────────────
  async redactPreview(path: string, regions: RedactRegion[]) {
    return enginePost<{
      previews: Array<{ page: number; bbox: number[]; text: string }>;
    }>("/redact/preview", { path, regions });
  },
  async redactApply(path: string, regions: RedactRegion[], opts?: { removeAnnotations?: boolean }) {
    return enginePost<{ output_path: string; regions: number; warnings: string[] }>("/redact/apply", {
      path,
      regions,
      remove_annotations: opts?.removeAnnotations ?? true,
    });
  },

  // ── pdf metadata ─────────────────────────────────────────
  async editMetadata(path: string, metadata: Record<string, string>) {
    return enginePost<{ output_path: string }>("/pdf/metadata", { path, metadata });
  },
};

export interface EngineMatch {
  match_id: number;
  matched_text: string;
  page_number: number;
  bounding_box: [number, number, number, number];
  font_name: string;
  font_size: number | null;
}

export interface EngineTextBlock {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font_name: string;
  font_size: number;
  page: number;
}

export interface RedactRegion {
  page: number;
  bbox: [number, number, number, number];
}

export interface EngineEditResult {
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
    degradations: Array<{ kind: string; severity: string; detail: string }>;
  };
}
