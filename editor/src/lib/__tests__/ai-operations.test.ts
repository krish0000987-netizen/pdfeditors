import { describe, it, expect } from "vitest";
import { validateProposal, extractJson, AI_OPERATIONS, MUTATING_OPERATIONS } from "@/lib/ai/operations";

describe("validateProposal", () => {
  it("accepts a valid replace proposal", () => {
    const result = validateProposal({
      intent: "replace_text",
      confidence: 0.98,
      explanation: "Replace the selected text.",
      operations: [{ type: "replace_text", find: "OLD", replace: "NEW", page: 2 }],
      requires_confirmation: true,
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.proposal?.operations[0].type).toBe("replace_text");
    expect(result.mutatingOps).toBe(1);
  });

  it("rejects unknown operation types", () => {
    const result = validateProposal({
      intent: "hack",
      operations: [{ type: "execute_code", code: "rm -rf /" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toContain("not an allowed operation");
  });

  it("rejects missing required fields", () => {
    const result = validateProposal({
      intent: "replace",
      operations: [{ type: "replace_text", find: "OLD" }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("replace");
  });

  it("rejects non-object input", () => {
    expect(validateProposal("hello").ok).toBe(false);
    expect(validateProposal(null).ok).toBe(false);
    expect(validateProposal(42).ok).toBe(false);
  });

  it("rejects empty operations array", () => {
    expect(validateProposal({ intent: "x", operations: [] }).ok).toBe(false);
    expect(validateProposal({ intent: "x" }).ok).toBe(false);
  });

  it("rejects malformed rects for annotations", () => {
    const result = validateProposal({
      intent: "annotate",
      operations: [{ type: "add_annotation", page: 0, subtype: "Text", rect: [10, 10, 5, 5] }],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toContain("x1>x0");
  });

  it("rejects bad annotation subtypes", () => {
    const result = validateProposal({
      intent: "annotate",
      operations: [{ type: "add_annotation", page: 0, subtype: "JavaScript", rect: [0, 0, 10, 10] }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects malformed redaction regions", () => {
    const result = validateProposal({
      intent: "redact",
      operations: [{ type: "redact_region", regions: [{ page: 0, bbox: [1, 2, 3] }] }],
    });
    expect(result.ok).toBe(false);
  });

  it("forces confirmation on mutating operations", () => {
    const result = validateProposal({
      intent: "delete",
      operations: [{ type: "delete_page", page: 3 }],
      requires_confirmation: false,
    });
    expect(result.ok).toBe(true);
    expect(result.proposal?.requires_confirmation).toBe(true);
    expect(result.warnings.length).toBe(1);
  });

  it("allows read-only ops without confirmation", () => {
    const result = validateProposal({
      intent: "summarize",
      operations: [{ type: "summarize_document" }],
    });
    expect(result.ok).toBe(true);
    expect(result.proposal?.requires_confirmation).toBe(false);
    expect(result.mutatingOps).toBe(0);
  });

  it("rejects find text that is too long", () => {
    const result = validateProposal({
      intent: "replace",
      operations: [{ type: "replace_text", find: "a".repeat(3000), replace: "b" }],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range pages", () => {
    const result = validateProposal({
      intent: "find",
      operations: [{ type: "find_text", find: "x", page: 99999 }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON in code fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("parses JSON embedded in prose", () => {
    expect(extractJson('Sure! Here is the plan: {"a":1} — let me know.')).toEqual({ a: 1 });
  });

  it("throws when no JSON is present", () => {
    expect(() => extractJson("no json here at all")).toThrow();
  });
});

describe("operation registry", () => {
  it("defines every operation with required metadata", () => {
    for (const [key, schema] of Object.entries(AI_OPERATIONS)) {
      expect(schema.type).toBe(key);
      expect(schema.label.length).toBeGreaterThan(0);
      expect(typeof schema.mutating).toBe("boolean");
    }
  });

  it("marks structural and edit operations as mutating", () => {
    for (const t of ["replace_text", "delete_page", "redact_region", "merge_pdf"] as const) {
      expect(MUTATING_OPERATIONS.has(t)).toBe(true);
    }
  });

  it("keeps extraction operations read-only", () => {
    for (const t of ["find_text", "extract_text", "summarize_document"] as const) {
      expect(MUTATING_OPERATIONS.has(t)).toBe(false);
    }
  });
});
