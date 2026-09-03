import type { DocumentModel } from "./document-model";

export type CommandType =
  | "add_element"
  | "update_element"
  | "delete_element"
  | "batch"
  | "page_operation";

export interface EditorCommand {
  id: string;
  type: CommandType;
  description: string;
  timestamp: number;
  // Deep clone before & after state snapshot for deterministic undo/redo
  beforeState: DocumentModel;
  afterState: DocumentModel;
}

export class HistoryManager {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private maxHistory: number;

  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory;
  }

  public record(
    type: CommandType,
    description: string,
    beforeState: DocumentModel,
    afterState: DocumentModel
  ): void {
    const cmd: EditorCommand = {
      id: crypto.randomUUID(),
      type,
      description,
      timestamp: Date.now(),
      beforeState: JSON.parse(JSON.stringify(beforeState)),
      afterState: JSON.parse(JSON.stringify(afterState)),
    };
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undo(): DocumentModel | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    this.redoStack.push(cmd);
    return JSON.parse(JSON.stringify(cmd.beforeState));
  }

  public redo(): DocumentModel | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    this.undoStack.push(cmd);
    return JSON.parse(JSON.stringify(cmd.afterState));
  }

  public clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  public getUndoDescriptions(): string[] {
    return this.undoStack.map((c) => c.description);
  }
}
