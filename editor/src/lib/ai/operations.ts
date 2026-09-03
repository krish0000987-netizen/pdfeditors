/**
 * AI operation registry — the single source of truth for operations the AI
 * may propose. Every operation is validated server-side before the PDF
 * engine ever sees it. The AI cannot execute arbitrary code: only these
 * typed operations pass validation.
 */

export type AIOperationType =
  // text
  | "find_text"
  | "replace_text"
  | "replace_all"
  | "delete_text"
  | "insert_text"
  | "highlight_text"
  // annotations & redaction
  | "add_annotation"
  | "redact_region"
  // read-only
  | "extract_text"
  | "extract_table"
  | "summarize_document"
  // pages
  | "rotate_page"
  | "delete_page"
  | "duplicate_page"
  | "reorder_page"
  | "split_pdf"
  | "merge_pdf";

export interface AIOperationSchema {
  type: AIOperationType;
  label: string;
  /** true = mutating (creates a new version, requires confirmation) */
  mutating: boolean;
  /** required fields with primitive types */
  required: Record<string, "string" | "number" | "array" | "object">;
  optional?: Record<string, "string" | "number" | "boolean" | "array" | "object">;
}

export const AI_OPERATIONS: Record<AIOperationType, AIOperationSchema> = {
  find_text: {
    type: "find_text",
    label: "Find Text",
    mutating: false,
    required: { find: "string" },
    optional: { page: "number", case_sensitive: "boolean" },
  },
  replace_text: {
    type: "replace_text",
    label: "Replace Text",
    mutating: true,
    required: { find: "string", replace: "string" },
    optional: { page: "number", match_index: "number" },
  },
  replace_all: {
    type: "replace_all",
    label: "Replace All",
    mutating: true,
    required: { find: "string", replace: "string" },
  },
  delete_text: {
    type: "delete_text",
    label: "Delete Text",
    mutating: true,
    required: { find: "string" },
    optional: { page: "number", match_index: "number" },
  },
  insert_text: {
    type: "insert_text",
    label: "Insert Text",
    mutating: true,
    required: { page: "number", x: "number", y: "number", text: "string" },
    optional: { font_size: "number" },
  },
  highlight_text: {
    type: "highlight_text",
    label: "Highlight Text",
    mutating: true,
    required: { find: "string" },
    optional: { page: "number" },
  },
  add_annotation: {
    type: "add_annotation",
    label: "Add Annotation",
    mutating: true,
    required: { page: "number", subtype: "string", rect: "array" },
    optional: { contents: "string", color: "string" },
  },
  redact_region: {
    type: "redact_region",
    label: "Redact Region",
    mutating: true,
    required: { regions: "array" },
    optional: { find: "string", page: "number" },
  },
  extract_text: {
    type: "extract_text",
    label: "Extract Text",
    mutating: false,
    required: {},
    optional: { page: "number" },
  },
  extract_table: {
    type: "extract_table",
    label: "Extract Table",
    mutating: false,
    required: {},
    optional: { page: "number", find: "string" },
  },
  summarize_document: {
    type: "summarize_document",
    label: "Summarize Document",
    mutating: false,
    required: {},
  },
  rotate_page: {
    type: "rotate_page",
    label: "Rotate Page",
    mutating: true,
    required: { page: "number", angle: "number" },
  },
  delete_page: {
    type: "delete_page",
    label: "Delete Page",
    mutating: true,
    required: { page: "number" },
  },
  duplicate_page: {
    type: "duplicate_page",
    label: "Duplicate Page",
    mutating: true,
    required: { page: "number" },
  },
  reorder_page: {
    type: "reorder_page",
    label: "Reorder Pages",
    mutating: true,
    required: { page_order: "array" },
  },
  split_pdf: {
    type: "split_pdf",
    label: "Split PDF",
    mutating: true,
    required: {},
  },
  merge_pdf: {
    type: "merge_pdf",
    label: "Merge PDF",
    mutating: true,
    required: { source_document_ids: "array" },
  },
};

export const MUTATING_OPERATIONS = new Set(
  Object.values(AI_OPERATIONS)
    .filter((o) => o.mutating)
    .map((o) => o.type)
);

export interface AIProposal {
  intent: string;
  confidence: number;
  explanation: string;
  operations: AIOperation[];
  requires_confirmation: boolean;
}

export interface AIOperation {
  type: AIOperationType;
  [key: string]: unknown;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  proposal?: AIProposal;
  mutatingOps: number;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function checkField(
  op: AIOperation,
  field: string,
  kind: "string" | "number" | "array" | "object" | "boolean",
  errors: string[]
) {
  const v = (op as Record<string, unknown>)[field];
  switch (kind) {
    case "string":
      if (typeof v !== "string" || v.length === 0) {
        errors.push(`${op.type}.${field} must be a non-empty string`);
      }
      break;
    case "number":
      if (!isFiniteNumber(v)) errors.push(`${op.type}.${field} must be a finite number`);
      break;
    case "array":
      if (!Array.isArray(v) || v.length === 0) {
        errors.push(`${op.type}.${field} must be a non-empty array`);
      }
      break;
    case "object":
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        errors.push(`${op.type}.${field} must be an object`);
      }
      break;
    case "boolean":
      if (typeof v !== "boolean") errors.push(`${op.type}.${field} must be a boolean`);
      break;
  }
}

/** Rect sanity: [x0,y0,x1,y1] with x1>x0, y1>y0 and non-absurd coordinates. */
function checkRect(op: AIOperation, field: string, errors: string[]) {
  const v = (op as Record<string, unknown>)[field];
  if (!Array.isArray(v) || v.length !== 4 || !v.every(isFiniteNumber)) {
    errors.push(`${op.type}.${field} must be [x0,y0,x1,y1] numbers`);
    return;
  }
  const [x0, y0, x1, y1] = v as number[];
  if (x1 <= x0 || y1 <= y0) errors.push(`${op.type}.${field} must satisfy x1>x0 and y1>y0`);
  if (Math.max(Math.abs(x0), Math.abs(y0), Math.abs(x1), Math.abs(y1)) > 100000) {
    errors.push(`${op.type}.${field} coordinates out of range`);
  }
}

function checkRegions(op: AIOperation, errors: string[]) {
  const regions = (op as Record<string, unknown>).regions;
  if (!Array.isArray(regions) || regions.length === 0) {
    errors.push(`${op.type}.regions must be a non-empty array of {page,bbox}`);
    return;
  }
  for (const r of regions) {
    if (
      typeof r !== "object" ||
      r === null ||
      !isFiniteNumber((r as Record<string, unknown>).page) ||
      !Array.isArray((r as Record<string, unknown>).bbox)
    ) {
      errors.push(`${op.type}.regions entries must be {page:number,bbox:[x0,y0,x1,y1]}`);
      return;
    }
    checkRect({ ...op, rect: (r as Record<string, unknown>).bbox }, "rect", errors);
  }
}

/**
 * Validate a raw AI response against the registry. Rejects unknown operation
 * types, missing/mistyped fields and malformed geometry before anything is
 * executed. Returns a normalized proposal when valid.
 */
export function validateProposal(raw: unknown): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    return { ok: false, errors: ["AI response is not a JSON object"], warnings, mutatingOps: 0 };
  }
  const obj = raw as Record<string, unknown>;

  const opsRaw = obj.operations;
  if (!Array.isArray(opsRaw) || opsRaw.length === 0) {
    return { ok: false, errors: ["AI response contains no operations array"], warnings, mutatingOps: 0 };
  }

  let mutatingOps = 0;
  const ops: AIOperation[] = [];

  for (let i = 0; i < opsRaw.length; i++) {
    const entry = opsRaw[i] as Record<string, unknown>;
    if (typeof entry !== "object" || entry === null) {
      errors.push(`operations[${i}] is not an object`);
      continue;
    }
    const type = entry.type;
    if (typeof type !== "string" || !(type in AI_OPERATIONS)) {
      errors.push(`operations[${i}].type "${String(type)}" is not an allowed operation`);
      continue;
    }
    const schema = AI_OPERATIONS[type as AIOperationType];

    for (const [field, kind] of Object.entries(schema.required)) {
      checkField(entry as AIOperation, field, kind, errors);
    }
    for (const [field, kind] of Object.entries(schema.optional ?? {})) {
      if ((entry as Record<string, unknown>)[field] !== undefined) {
        checkField(entry as AIOperation, field, kind as "string", errors);
      }
    }
    if (type === "add_annotation") {
      checkRect(entry as AIOperation, "rect", errors);
      const subtype = (entry as Record<string, unknown>).subtype;
      const allowed = ["Text", "FreeText", "Square", "Circle", "Line", "Ink", "Highlight", "Underline", "StrikeOut"];
      if (typeof subtype !== "string" || !allowed.includes(subtype)) {
        errors.push(`add_annotation.subtype must be one of: ${allowed.join(", ")}`);
      }
    }
    if (type === "redact_region") {
      checkRegions(entry as AIOperation, errors);
    }
    if (type === "replace_text" || type === "replace_all" || type === "delete_text") {
      const find = (entry as Record<string, unknown>).find;
      if (typeof find === "string" && find.length > 2000) {
        errors.push(`${type}.find exceeds 2000 characters — send a shorter excerpt`);
      }
    }
    if ((entry as Record<string, unknown>).page !== undefined) {
      const p = (entry as Record<string, unknown>).page;
      if (isFiniteNumber(p) && (p < 0 || p > 10000)) {
        errors.push(`${type}.page out of range`);
      }
    }

    if (schema.mutating) mutatingOps++;
    ops.push({ ...(entry as AIOperation), type: type as AIOperationType });
  }

  if (ops.length === 0) {
    errors.push("No valid operations after validation");
  }

  const confidence = typeof obj.confidence === "number" ? obj.confidence : 0.5;
  const proposal: AIProposal = {
    intent: typeof obj.intent === "string" ? obj.intent : "unspecified",
    confidence: Math.min(1, Math.max(0, confidence)),
    explanation:
      typeof obj.explanation === "string"
        ? obj.explanation.slice(0, 500)
        : "AI did not provide an explanation.",
    operations: ops,
    requires_confirmation:
      typeof obj.requires_confirmation === "boolean"
        ? obj.requires_confirmation
        : mutatingOps > 0,
  };

  if (mutatingOps > 0 && !proposal.requires_confirmation) {
    warnings.push("AI marked a mutating operation as not requiring confirmation; forcing confirmation.");
    proposal.requires_confirmation = true;
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    proposal: errors.length === 0 ? proposal : undefined,
    mutatingOps,
  };
}

/** Extract the first JSON object from an LLM response that may include prose or code fences. */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  // direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  // fenced block
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  // first {...} block
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* give up */
    }
  }
  throw new Error("AI response does not contain valid JSON");
}


