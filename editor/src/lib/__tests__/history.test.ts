import { describe, it, expect } from "vitest";
import { HistoryManager } from "../pdf/history";
import { createEmptyDocumentModel, createEmptyPageModel } from "../pdf/document-model";

describe("HistoryManager Command Undo/Redo", () => {
  it("records state changes and performs undo and redo correctly", () => {
    const history = new HistoryManager(10);
    const initialDoc = createEmptyDocumentModel("doc-1", "test.pdf");
    initialDoc.pages.push(createEmptyPageModel(0));

    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);

    // State 1: Add a text element
    const state1 = JSON.parse(JSON.stringify(initialDoc));
    state1.pages[0].textElements.push({
      id: "text-1",
      pageIndex: 0,
      text: "Invoice #1234",
      source: "added",
      modified: false,
      deleted: false,
      x: 100,
      y: 100,
      width: 150,
      height: 30,
      fontFamily: "Helvetica, Arial, sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fontStyle: "normal",
      underline: false,
      strike: false,
      color: "#000000",
      textAlign: "left",
      lineHeight: 1.2,
      letterSpacing: 0,
      opacity: 1,
      rotation: 0,
    });

    history.record("add_element", "Add Invoice text", initialDoc, state1);
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);

    // Undo
    const undone = history.undo();
    expect(undone).not.toBeNull();
    expect(undone?.pages[0].textElements.length).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);

    // Redo
    const redone = history.redo();
    expect(redone).not.toBeNull();
    expect(redone?.pages[0].textElements.length).toBe(1);
    expect(redone?.pages[0].textElements[0].text).toBe("Invoice #1234");
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
  });
});
