import { expect, it } from "vitest";
import { receiptRecipients } from "./address";

it("normalizes confirmed addresses and retains both roles on one logical delivery", () => {
  expect(receiptRecipients("  OWNER@Example.test ", "owner@example.test")).toEqual([
    { messageKind: "receipt", normalizedRecipient: "owner@example.test", roles: ["issuer", "client"] },
  ]);
});

it("orders different recipients deterministically without changing their roles", () => {
  expect(receiptRecipients(" Z@Example.test ", " A@example.test ")).toEqual([
    { messageKind: "receipt", normalizedRecipient: "a@example.test", roles: ["client"] },
    { messageKind: "receipt", normalizedRecipient: "z@example.test", roles: ["issuer"] },
  ]);
});

it.each(["", "not-an-email", "Alice <owner@example.test>", "owner@example.test\nBcc:other@example.test", `${"a".repeat(255)}@example.test`])(
  "rejects invalid frozen recipient data without returning partial deliveries: %s", (value) => {
    expect(() => receiptRecipients(value, "client@example.test")).toThrow("INVALID_RECEIPT_RECIPIENT");
    expect(() => receiptRecipients("owner@example.test", value)).toThrow("INVALID_RECEIPT_RECIPIENT");
  },
);
