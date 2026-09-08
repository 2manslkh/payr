import { expect, it } from "vitest";
import { createReceiptDeliveryEnv } from "./env";

it("keeps receipt email disabled without explicit runtime opt-in", () => {
  expect(createReceiptDeliveryEnv({})).toBeNull();
  expect(createReceiptDeliveryEnv({ PAYR_RECEIPT_EMAIL_ENABLED: "false" })).toBeNull();
});
it("requires configured provider credentials and a safe sender after opt-in", () => {
  const value = { PAYR_RECEIPT_EMAIL_ENABLED: "true", RESEND_API_KEY: "re_test_only_key", RESEND_FROM_EMAIL: "Payr <sender@example.test>" };
  expect(createReceiptDeliveryEnv(value)).toEqual({ apiKey: value.RESEND_API_KEY, from: value.RESEND_FROM_EMAIL });
  expect(() => createReceiptDeliveryEnv({ ...value, RESEND_API_KEY: "" })).toThrow();
  expect(() => createReceiptDeliveryEnv({ ...value, RESEND_FROM_EMAIL: "sender@example.test\r\nBcc:other@example.test" })).toThrow();
});
