// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { publishInvoiceSchema } from "../../../lib/invoices/publication";
import { GET } from "./route";

afterEach(() => vi.unstubAllEnvs());

it("exposes only publication with bearer authentication and a configured canonical origin", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test/");
  const response = GET();
  const spec = await response.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.servers).toEqual([{ url: "https://canonical.test" }]);
  expect(Object.keys(spec.paths)).toEqual(["/api/invoices/{id}/publish"]);
  expect(Object.keys(spec.paths["/api/invoices/{id}/publish"])).toEqual(["post"]);
  expect(spec.security).toEqual([{ connectorBearer: [] }]);
  expect(spec.components.securitySchemes.connectorBearer).toMatchObject({ type: "http", scheme: "bearer" });
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});

it("documents the canonical approval contract, response, and retry boundaries", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test");
  const spec = await GET().json();
  const operation = spec.paths["/api/invoices/{id}/publish"].post;
  expect(operation.operationId).toBe("publish_invoice");
  const body = operation.requestBody.content["application/json"];
  expect(body.schema.additionalProperties).toBe(false);
  expect(body.schema.required).toEqual(["expectedVersion", "approval", "idempotencyKey"]);
  expect(body.schema.properties.approval.const).toBe(true);
  expect(publishInvoiceSchema.safeParse({ draftId: "00000000-0000-4000-8000-000000000001", ...body.example }).success).toBe(true);
  const result = operation.responses["200"].content["application/json"].schema;
  expect(result.required).toContain("invoiceUrl");
  expect(result.required).toContain("invoicePdfUrl");
  expect(result.properties.sendApprovalRequired.const).toBe(true);
  for (const status of [400, 401, 403, 404, 409, 413, 415, 429, 500, 503]) {
    expect(operation.responses[String(status)].content["application/json"].schema.oneOf).toHaveLength(2);
  }
  expect(operation.responses["429"].headers["Retry-After"]).toBeDefined();
  expect(operation.description).toContain("unchanged input");
  expect(operation.description).toContain("explicit user approval");
  expect(spec.info.description).toContain("does not create drafts");
});
