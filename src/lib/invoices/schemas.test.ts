import { expect, it } from "vitest";
import { parseDraftInput } from "./schemas";

it("accepts partial business input but rejects invalid values and nested authority injection", () => {
  expect(parseDraftInput({ idempotencyKey: "request-1", items: [{ description: "Confirmed work", amount: "1.2300" }] })).toEqual({
    idempotencyKey: "request-1", items: [{ description: "Confirmed work", amount: "1.23" }],
  });
  expect(() => parseDraftInput({ idempotencyKey: "request-1", client: { proposed: { payout_wallet: "0x123" } } })).toThrow("PROHIBITED_FIELD");
  expect(() => parseDraftInput({ idempotencyKey: "request-1", items: [{ amount: "1e3" }] })).toThrow("INVALID_INPUT");
});
