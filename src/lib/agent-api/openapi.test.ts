// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
import * as route from "../../app/openapi/agent.json/route";
import { ACCOUNT_SCOPES, operationNames, operationSchemas, operationScopes } from "./contracts";
import { buildAgentOpenApi } from "./openapi";

afterEach(() => vi.unstubAllEnvs());

const expectedOperations = [
  "create_account_challenge", "register_account", "get_account", "revoke_current_credential",
  "get_sender_profile", "save_sender_profile", "create_invoice_draft", "list_invoices", "get_invoice", "publish_invoice", "get_invoice_status", "get_account_context",
];

it("serves a public GET specification using only the configured canonical origin", async () => {
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://canonical.test/");
  expect(Object.keys(route)).toEqual(["GET"]);
  const response = route.GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("set-cookie")).toBeNull();
  const spec = await response.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.servers).toEqual([{ url: "https://canonical.test" }]);
  expect(spec.info.description).toContain("initially free");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://user:secret@untrusted.test");
  expect(route.GET).toThrow();
});

it("exposes twelve POST paths including read-only wallet context, with no spending actions", () => {
  const spec = buildAgentOpenApi("https://canonical.test");
  expect(operationNames).toEqual(expectedOperations);
  expect(Object.keys(spec.paths)).toEqual(expectedOperations.map((name) => `/api/v1/${name}`));
  expect(Object.keys(spec.paths)).toHaveLength(12);
  for (const name of expectedOperations) {
    expect(Object.keys(spec.paths[`/api/v1/${name}`])).toEqual(["post"]);
    expect(spec.paths[`/api/v1/${name}`].post.operationId).toBe(name);
  }
  expect(ACCOUNT_SCOPES).toEqual(["invoice:draft", "invoice:publish", "invoice:status", "sender:read", "sender:write"]);
  expect(JSON.stringify(spec)).not.toContain("invoice:void");
  expect(JSON.stringify(spec)).not.toContain("void_invoice");
});

it("requires the private service header in every security alternative and never models body auth as anonymous", () => {
  const spec = buildAgentOpenApi("https://canonical.test");
  expect(spec.security).toEqual([{ serviceKey: [] }]);
  expect(spec.components.securitySchemes.serviceKey).toMatchObject({ type: "apiKey", in: "header", name: "X-Payr-Service-Key" });
  expect(spec.components.securitySchemes.accountBearer).toMatchObject({ type: "http", scheme: "bearer", bearerFormat: "pac_UUID.secret" });
  for (const name of operationNames) {
    const op = spec.paths[`/api/v1/${name}`].post;
    const schema = op.requestBody.content["application/json"].schema;
    expect(op.requestBody.required).toBe(true);
    expect(schema.required).toEqual(["input"]);
    expect(schema.additionalProperties).toBe(false);
    for (const requirement of op.security) expect(requirement.serviceKey).toEqual([]);
    expect(schema.properties).not.toHaveProperty("serviceKey");
    expect(schema.properties).not.toHaveProperty("X-Payr-Service-Key");
    if (operationScopes[name]) {
      expect(op.security).toEqual([{ serviceKey: [], accountBearer: [] }, { serviceKey: [] }]);
      expect(op["x-account-credential"]).toEqual({ required: true, mutuallyExclusive: true,
        alternatives: [{ in: "header", name: "Authorization", scheme: "bearer" }, { in: "body", name: "accountCredential" }], scopes: [operationScopes[name]] });
      expect(schema.properties.accountCredential).toMatchObject({ type: "string", format: "password", writeOnly: true, "x-sensitive": true });
      expect(op.description).toContain("valid ONLY when accountCredential is supplied");
      expect(op.description).toContain("never both");
      expect(op.description).toContain("model-visible");
      expect(op.description).toContain("externally unverified");
    } else {
      expect(op.security).toEqual([{ serviceKey: [] }]);
      expect(Object.keys(schema.properties)).toEqual(["input"]);
      expect(op["x-account-credential"]).toEqual({ required: false, forbidden: ["Authorization", "accountCredential"] });
      expect(op.description).toContain("Authorization and accountCredential are forbidden");
    }
    expect(op.description).toContain("out of prompts, URLs, recordings");
    expect(op.description).toContain("short-lived, least-privilege scoped credentials");
  }
});

it("derives every operation input from canonical Zod input schemas, preserving constraints and valid secret-free examples", () => {
  const spec = buildAgentOpenApi("https://canonical.test");
  for (const name of operationNames) {
    const body = spec.paths[`/api/v1/${name}`].post.requestBody.content["application/json"];
    const canonical = z.toJSONSchema(operationSchemas[name], { io: "input" });
    expect(body.schema.properties.input).toMatchObject(canonical);
    expect(body.schema.properties.input.additionalProperties).toBe(false);
    expect(operationSchemas[name].safeParse(body.example.input).success).toBe(true);
    expect(body.example).not.toHaveProperty("accountCredential");
    expect(JSON.stringify(body.example)).not.toMatch(/pac_|pgw_|Bearer/);
  }
  const input = (name: string) => spec.paths[`/api/v1/${name}`].post.requestBody.content["application/json"].schema.properties.input;
  expect(input("create_account_challenge").properties?.scopes).toMatchObject({ minItems: 1, maxItems: 6, uniqueItems: true, contains: { const: "invoice:status" }, items: { enum: [...ACCOUNT_SCOPES, "wallet:read"] } });
  expect(input("create_account_challenge").properties?.expiresInDays).toMatchObject({ type: "integer", minimum: 1, maximum: 7, default: 1 });
  expect(input("register_account").required).toEqual(["challengeId", "signature"]);
  expect(input("register_account").properties?.signature).toMatchObject({ pattern: "^0x[0-9a-fA-F]{130}$" });
  expect(input("revoke_current_credential").properties?.approval).toMatchObject({ const: true });
  expect(input("save_sender_profile").properties?.expectedRevision).toMatchObject({ type: "integer", exclusiveMinimum: 0, maximum: 2147483647 });
  expect(input("save_sender_profile").required).toEqual(expect.arrayContaining(["expectedProfileId", "expectedRevision", "approval"]));
  expect(input("create_invoice_draft").dependentRequired).toEqual({ draftId: ["expectedVersion"], expectedVersion: ["draftId"] });
  expect(input("create_invoice_draft").properties?.items).toMatchObject({ maxItems: 100 });
  expect(input("list_invoices").properties?.offset).toMatchObject({ type: "integer", minimum: 0, maximum: 10000, default: 0 });
  expect(input("list_invoices").properties?.search).toMatchObject({ maxLength: 200 });
  expect(input("list_invoices").properties).not.toHaveProperty("limit");
  expect(input("publish_invoice").required).toEqual(["draftId", "expectedVersion", "approval", "deliveryApproval", "idempotencyKey"]);
  expect(input("publish_invoice").properties?.deliveryApproval).toMatchObject({ const: true });
  expect(input("publish_invoice").properties?.approval).toMatchObject({ const: true });
  for (const name of ["get_invoice", "get_invoice_status"]) expect(input(name).properties?.invoiceId).toMatchObject({ format: "uuid" });
});

it("documents approval, retry, registration and bounded-read semantics without inventing response DTOs", () => {
  const spec = buildAgentOpenApi("https://canonical.test");
  const op = (name: string) => spec.paths[`/api/v1/${name}`].post;
  expect(op("create_account_challenge").description).toContain("single-use");
  expect(op("create_account_challenge").description).toContain("sign locally with their EOA wallet");
  expect(op("register_account").description).toContain("existing workspace");
  expect(op("register_account").description).toContain("returned only once");
  expect(op("register_account").description).toContain("gateway-only regardless");
  expect(op("save_sender_profile").description).toContain("non-idempotent compare-and-swap");
  expect(op("save_sender_profile").description).toContain("fresh approval");
  expect(op("create_invoice_draft").description).toContain("no draft write occurs");
  expect(op("create_invoice_draft").description).toContain("same idempotencyKey and unchanged input");
  expect(op("publish_invoice").description).toContain("explicit approval");
  expect(op("publish_invoice").description).toContain("same idempotencyKey and unchanged input");
  expect(op("publish_invoice").description).toContain("Do not send a duplicate via Gmail");
  expect(op("list_invoices").description).toContain("at most 50");
  expect(op("get_invoice").description).toContain("not as a substitute for get_invoice_status");
  expect(op("get_invoice_status").description).toContain("receiptEmail");
  expect(op("revoke_current_credential").description).toContain("only the current account credential");
  const account = op("get_account").responses["200"].content["application/json"].schema;
  expect(account.required?.sort()).toEqual(["credential", "ownerWallet", "senderSetupRequired", "workspaceId"]);
  expect(account.properties?.credential.properties.scopes.items.enum).toEqual([...ACCOUNT_SCOPES, "wallet:read"]);
  expect(account.properties?.credential.properties).not.toHaveProperty("token");
  for (const name of operationNames) {
    expect(op(name).responses["200"].content["application/json"].schema.additionalProperties).toBe(true);
    expect(op(name).responses["429"].headers["Retry-After"]).toBeDefined();
  }
  expect(op("get_sender_profile").responses["200"].description).toContain("not a flat SenderProfile");
  expect(op("get_invoice").responses["200"].description).toContain("DraftVersion or null, not an integer");
  expect(op("publish_invoice").responses["200"].description).toContain("invoiceEmail {state,deliveries:");
});
