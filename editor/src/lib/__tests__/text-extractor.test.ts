import { describe, it, expect } from "vitest";
import {
  normalizeFontFamily,
  detectFontWeight,
  detectFontStyle,
  groupTextRunsIntoElements,
} from "../pdf/text-extractor";

describe("Text Extractor & Typography Detection", () => {
  it("normalizes font family names accurately", () => {
    expect(normalizeFontFamily("TimesNewRomanPSMT")).toContain("Times");
    expect(normalizeFontFamily("CourierNewPS-BoldMT")).toContain("Courier");
    expect(normalizeFontFamily("Arial-BoldMT")).toContain("Helvetica");
    expect(normalizeFontFamily(undefined)).toBe("Helvetica, Arial, sans-serif");
  });

  it("detects bold and italic styles from font names", () => {
    expect(detectFontWeight("Helvetica-Bold")).toBe("bold");
    expect(detectFontWeight("Calibri-Black")).toBe("bold");
    expect(detectFontWeight("ArialMT")).toBe("normal");

    expect(detectFontStyle("TimesNewRoman-Italic")).toBe("italic");
    expect(detectFontStyle("Helvetica-Oblique")).toBe("italic");
    expect(detectFontStyle("ArialMT")).toBe("normal");
  });

  it("groups split text runs on the same baseline into coherent lines", () => {
    const rawRuns = [
      {
        str: "Hello",
        pdfX: 72,
        pdfY: 700,
        width: 30,
        height: 12,
        fontSize: 12,
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: "normal" as const,
        fontStyle: "normal" as const,
        rotation: 0,
      },
      {
        str: "World",
        pdfX: 106,
        pdfY: 700,
        width: 35,
        height: 12,
        fontSize: 12,
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: "normal" as const,
        fontStyle: "normal" as const,
        rotation: 0,
      },
      {
        str: "Second Line Paragraph",
        pdfX: 72,
        pdfY: 670,
        width: 120,
        height: 12,
        fontSize: 12,
        fontFamily: "Helvetica, Arial, sans-serif",
        fontWeight: "normal" as const,
        fontStyle: "normal" as const,
        rotation: 0,
      },
    ];

    const elements = groupTextRunsIntoElements(rawRuns, 0, 792);

    expect(elements.length).toBe(2);
    expect(elements[0].text).toBe("Hello World");
    expect(elements[0].source).toBe("original");
    expect(elements[0].modified).toBe(false);
    expect(elements[0].deleted).toBe(false);
    expect(elements[1].text).toBe("Second Line Paragraph");
  });
});
