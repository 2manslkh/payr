export type FieldIssue = { path: string; reason: string };
export type MissingField = { path: string; reason: "required" | "default_unavailable" | "confirmation_required" };

export class DraftError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly details: { fieldIssues?: FieldIssue[]; missingFields?: MissingField[]; draftId?: string; currentVersion?: number } = {},
  ) {
    super(code);
    this.name = "DraftError";
  }
}
