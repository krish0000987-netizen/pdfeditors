export class EngineError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "EngineError";
    this.status = status;
  }
}
