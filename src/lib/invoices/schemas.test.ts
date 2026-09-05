import { expect, it } from "vitest";
import { parseDraftInput } from "./schemas";
import { DraftError } from "./errors";

const address = { line1: "1 Main St", city: "London", postalCode: "SW1A 1AA", countryCode: "GB" };
const confirmed = (value: unknown, provenance: unknown = { kind: "user_provided" }) => ({ value, provenance, confirmed: true });
const proposed = (field: string, value: unknown) => ({ client: { proposed: { [field]: value } } });
function expectInvalid(input: unknown) {
  try {
    parseDraftInput(input);
    expect.fail("Expected invalid input");
  } catch (error) {
    expect(error).toBeInstanceOf(DraftError);
    expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400, details: { fieldIssues: expect.any(Array) } });
    expect(JSON.stringify(error)).not.toContain("SECRET");
  }
}

it("accepts partial business input but rejects invalid values and nested authority injection", () => {
  expect(parseDraftInput({ idempotencyKey: "request-1", items: [{ description: "Confirmed work", amount: "1.2300" }] })).toEqual({
    idempotencyKey: "request-1", items: [{ description: "Confirmed work", amount: "1.23" }],
  });
  expect(() => parseDraftInput({ idempotencyKey: "request-1", client: { proposed: { payout_wallet: "0x123" } } })).toThrow("PROHIBITED_FIELD");
  expect(() => parseDraftInput({ idempotencyKey: "request-1", items: [{ amount: "1e3" }] })).toThrow("INVALID_INPUT");
});

it("normalizes only trim-safe text, UUIDs, validated email, and canonical decimals", () => {
  expect(parseDraftInput({
    idempotencyKey: " key ", draftId: "ABCDEF00-0000-4000-8000-000000000001", expectedVersion: 1,
    client: { id: "ABCDEF00-0000-4000-8000-000000000002", alias: " Case Sensitive ", proposed: {
      businessName: confirmed(" Studio "), contactEmail: confirmed(" CLIENT@EXAMPLE.COM "),
      billingAddress: confirmed({ ...address, line1: " 1 Main St ", line2: " ", region: " London " }),
    } }, items: [{ description: " Work ", amount: "1.000000000000000000" }], memo: " Memo ",
  })).toEqual({
    idempotencyKey: "key", draftId: "abcdef00-0000-4000-8000-000000000001", expectedVersion: 1,
    client: { id: "abcdef00-0000-4000-8000-000000000002", alias: "Case Sensitive", proposed: {
      businessName: confirmed("Studio"), contactEmail: confirmed("client@example.com"),
      billingAddress: confirmed({ ...address, line2: "", region: "London" }),
    } }, items: [{ description: "Work", amount: "1" }], memo: "Memo",
  });
});

it.each(["sender", "ISSUER", "Sender_Profile", "sender-profile-id", "payout", "PAYOUT_wallet", "payeeAddress", "Invoice-Prefix", "issuer_contact_email"])("rejects authority alias %s at every nesting", (key) => {
  const levels = [
    { [key]: "SECRET" }, { client: { [key]: "SECRET" } }, { client: { proposed: { [key]: "SECRET" } } },
    proposed("businessName", { ...confirmed("Studio"), [key]: "SECRET" }),
    proposed("billingAddress", confirmed({ ...address, [key]: "SECRET" })),
    proposed("contactName", confirmed("Client", { kind: "user_provided", [key]: "SECRET" })),
    { items: [{ [key]: "SECRET" }] }, { unknown: [{ nested: { [key]: "SECRET" } }] },
  ];
  for (const value of levels) {
    expect(() => parseDraftInput({ idempotencyKey: "key", ...value })).toThrow("PROHIBITED_FIELD");
  }
});

it.each([
  { unknown_SECRET: "SECRET" }, { client: { unknown_SECRET: "SECRET" } },
  { client: { proposed: { unknown_SECRET: "SECRET" } } },
  proposed("businessName", { ...confirmed("Studio"), unknown_SECRET: "SECRET" }),
  proposed("billingAddress", confirmed({ ...address, unknown_SECRET: "SECRET" })),
  proposed("contactName", confirmed("Client", { kind: "user_provided", unknown_SECRET: "SECRET" })),
  { items: [{ unknown_SECRET: "SECRET" }] },
  { workspaceId: "SECRET" }, { actor: "SECRET" }, { client: { proposed: { contactEmail: "SECRET" } } },
])("rejects unknown fields and malformed nested objects without reflecting names or values (%#)", (value) => {
  expectInvalid({ idempotencyKey: "key", ...value });
});

it.each([
  { kind: "saved_profile" }, { kind: "inferred" }, { kind: "web_source" },
  { kind: "web_source", url: "SECRET" }, { kind: "web_source", url: "/relative" },
  { kind: "web_source", url: "ftp://example.com" }, { kind: "web_source", url: "javascript:alert(1)" },
  { kind: "web_source", url: "https://user:SECRET@example.com" },
  { kind: "web_source", url: "https://example.com/a b" }, { kind: "web_source", url: "https://example.com\\path" },
  { kind: "user_provided", url: "https://example.com" }, null, false,
])("rejects invalid provenance safely (%#)", (provenance) => {
  expectInvalid({ idempotencyKey: "key", ...proposed("contactName", confirmed("Client", provenance)) });
});

it.each([false, "true", 1, null, undefined])("rejects false, missing, or invalid confirmation (%s)", (confirmation) => {
  const field = { value: "Client", provenance: { kind: "user_provided" }, ...(confirmation === undefined ? {} : { confirmed: confirmation }) };
  expectInvalid({ idempotencyKey: "key", ...proposed("contactName", field) });
});

it.each(["http://example.com/contact", "https://example.com/contact?q=1#source"])("accepts declared confirmed web sources without fetching (%s)", (url) => {
  expect(parseDraftInput({ idempotencyKey: "key", ...proposed("contactName", confirmed("Client", { kind: "web_source", url })) }).client?.proposed?.contactName?.provenance).toEqual({ kind: "web_source", url });
});

it.each(["ZZ", "UK", "EU", "XK", "AA", "gb", " GB "])("requires actual uppercase ISO alpha-2 country membership (%s)", (countryCode) => {
  expectInvalid({ idempotencyKey: "key", ...proposed("billingAddress", confirmed({ ...address, countryCode })) });
});

it.each(["GB", "US", "AX", "BQ", "SS", "ZW"])("accepts assigned ISO alpha-2 code %s", (countryCode) => {
  expect(parseDraftInput({ idempotencyKey: "key", ...proposed("billingAddress", confirmed({ ...address, countryCode })) }).client?.proposed?.billingAddress?.value.countryCode).toBe(countryCode);
});

it.each(["0", "0.000", "-1", "+1", "01", "1e3", "1,000", " 1", "1 ", ".1", "1.", "1.0000000000000000001", "9".repeat(80), 1, null])("rejects noncanonical or nonpositive money notation and overflow (%s)", (amount) => {
  expectInvalid({ idempotencyKey: "key", items: [{ amount }] });
});

it("accepts the exact uint256 maximum and rejects one atomic unit more", () => {
  const maximum = "115792089237316195423570985008687907853269984665640564039457.584007913129639935";
  expect(parseDraftInput({ idempotencyKey: "key", items: [{ amount: maximum }] }).items?.[0].amount).toBe(maximum);
  expectInvalid({ idempotencyKey: "key", items: [{ amount: maximum.slice(0, -1) + "6" }] });
});

it("rejects a total above uint256 and overflowing explicit deadlines during caller validation", () => {
  expectInvalid({ idempotencyKey: "key", items: [
    { amount: "115792089237316195423570985008687907853269984665640564039457.584007913129639935" },
    { amount: "0.000000000000000001" },
  ] });
  expectInvalid({ idempotencyKey: "key", dueDate: "9999-12-02" });
});

it.each(["1999-12-31", "10000-01-01", "2026-02-29", "2100-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-1-01", "2026-01-01T00:00:00Z", " 2026-01-01"])("rejects invalid Gregorian date %s", (date) => {
  for (const field of ["issueDate", "dueDate"]) expectInvalid({ idempotencyKey: "key", [field]: date });
});

it.each(["2000-02-29", "2028-02-29", "9999-11-30"])("accepts valid Gregorian date %s", (issueDate) => {
  expect(parseDraftInput({ idempotencyKey: "key", issueDate }).issueDate).toBe(issueDate);
});

it.each([
  {}, { idempotencyKey: " " }, { idempotencyKey: "k".repeat(129) },
  { draftId: "00000000-0000-4000-8000-000000000001" }, { expectedVersion: 1 },
  { draftId: "bad", expectedVersion: 1 }, { draftId: "00000000-0000-4000-8000-000000000001", expectedVersion: 1.5 },
  { client: null }, { client: { alias: " " } }, { items: {} }, { items: [null] },
  { items: [{ description: " " }] }, { items: [{ description: "d".repeat(501) }] },
  { items: Array.from({ length: 101 }, () => ({})) }, { memo: "m".repeat(2001) }, { memo: null },
  { useDefaultTerms: "true" }, { issueDate: "2026-09-06", dueDate: "2026-09-05" },
])("validates supplied values and bounds before business omissions (%#)", (value) => {
  expectInvalid(Object.keys(value).length ? { idempotencyKey: "key", ...value } : value);
});

it("accepts partial business objects and exact collection/text bounds", () => {
  const value = { idempotencyKey: "k".repeat(128), client: { proposed: {} }, memo: "m".repeat(2000), items: Array.from({ length: 100 }, () => ({ description: "d".repeat(500) })) };
  expect(parseDraftInput(value)).toEqual(value);
  expect(parseDraftInput({ idempotencyKey: "key", items: [{}], memo: "" }).items).toEqual([{}]);
});

it("bounds depth, bytes, and field issues and rejects non-JSON service inputs", () => {
  let deep: unknown = {};
  for (let i = 0; i < 33; i++) deep = { nested: deep };
  expectInvalid({ idempotencyKey: "key", deep });
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  for (const value of [cycle, undefined, new Date(), { idempotencyKey: "key", memo: undefined }, { get idempotencyKey() { throw new Error("SECRET"); } }]) expectInvalid(value);
  expect(() => parseDraftInput({ idempotencyKey: "key", memo: "x".repeat(65536) })).toThrow("PAYLOAD_TOO_LARGE");
  try {
    parseDraftInput({ idempotencyKey: "key", items: Array.from({ length: 100 }, () => ({ description: false, amount: false })) });
  } catch (error) {
    expect((error as DraftError).details.fieldIssues).toHaveLength(100);
  }
});
