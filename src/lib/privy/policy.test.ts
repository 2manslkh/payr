import { expect, it } from "vitest";
import { receivingWalletPolicy } from "./policy";

it("allows only purpose- and origin-bound payout messages, never a signing or spending wildcard", () => {
  const policy = receivingWalletPolicy("https://payr.test");
  expect(policy.rules).toHaveLength(1);
  expect(policy.rules[0]).toMatchObject({ method: "personal_sign", action: "ALLOW" });
  expect(policy.rules[0].conditions).toEqual(expect.arrayContaining([
    expect.objectContaining({ field_source: "message", value: "\nURI: https://payr.test\n" }),
    expect.objectContaining({ value: "\nChain ID: 5042002\n" }),
    expect.objectContaining({ value: "\nPurpose: payr-payout-change-v1\n" }),
  ]));
});
