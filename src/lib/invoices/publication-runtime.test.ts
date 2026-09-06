import { expect, it } from "vitest";
import { getPublicationDocumentPort } from "./publication-runtime";

it("never substitutes a synthetic document provider in production", () => {
  expect(() => getPublicationDocumentPort()).toThrow("DOCUMENTS_NOT_CONFIGURED");
});
