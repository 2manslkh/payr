import { describe, expect, it } from "vitest";
import { DraftError } from "./errors";
import { IdentityError } from "../identity/contracts";
import { invoiceQuery, receivablesDecimal, safeDraftError } from "./projections";

describe("invoice read queries", () => {
  it("uses one bounded page and normalizes a GET toolbar submission", () => {
    expect(invoiceQuery({})).toEqual({ search: "", commercialState: null, limit: 50, offset: 0 });
    expect(invoiceQuery({ search: "  North  ", state: "draft", offset: "50" })).toEqual({
      search: "North", commercialState: "draft", limit: 50, offset: 50,
    });
    expect(invoiceQuery(new URLSearchParams("search=&state="))).toEqual(invoiceQuery({}));
  });

  it.each([
    { search: "x".repeat(201) }, { search: "bad\u0000text" }, { search: ["a", "b"] },
    { state: "paid" }, { state: ["draft"] }, { offset: "-1" }, { offset: "1.5" },
    { offset: "1e3" }, { offset: "10001" }, { offset: "9007199254740992" },
    { offset: "" }, { limit: "500" }, { workspaceId: "other" },
  ])("rejects malformed, unbounded or scope-changing queries: %j", (query) => {
    expect(() => invoiceQuery(query)).toThrowError(expect.objectContaining({ code: "INVALID_INPUT", status: 400 }));
  });

  it("does not flatten repeated URL parameters", () => {
    expect(() => invoiceQuery(new URLSearchParams("state=draft&state=published"))).toThrow(DraftError);
  });
});

it("formats native 18-decimal USDC receivables without floating point or draft totals", () => {
  expect(receivablesDecimal("0")).toBe("0");
  expect(receivablesDecimal("1000000000000000001")).toBe("1.000000000000000001");
  expect(receivablesDecimal("9007199254740993123456789000000000")).toBe("9007199254740993.123456789");
});

it("maps read errors to fixed codes and private headers, never provider details or statuses", async () => {
  for (const error of [new Error("provider secret"), new DraftError("provider secret", 418), { code: "NOT_FOUND", status: 404 }]) {
    const response = safeDraftError(error);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ code: "INTERNAL_ERROR" });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  }
  const missing = safeDraftError(new DraftError("NOT_FOUND", 418, { draftId: "private" }));
  expect(missing.status).toBe(404);
  expect(await missing.json()).toEqual({ code: "NOT_FOUND" });
  const auth = safeDraftError(new IdentityError("AUTH_REQUIRED", 401));
  expect(auth.status).toBe(401);
  expect(await auth.json()).toEqual({ error: { code: "AUTH_REQUIRED" } });
});
