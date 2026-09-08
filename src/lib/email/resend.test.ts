// @vitest-environment node
import { expect, it, vi } from "vitest";
import { createResendReceiptProvider } from "./resend";
import type { ReceiptEmailPayload } from "./outbox-contracts";

const payload: ReceiptEmailPayload = { from: "Payr <sender@example.test>", to: ["client@example.test"], subject: "Receipt",
  html: "<p>Verified receipt</p>", text: "Verified receipt", attachments: [{ filename: "receipt.pdf", content: "JVBERi0=" }] };

it("sends the stable payload and idempotency key to the fixed Resend endpoint", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const request = vi.fn().mockResolvedValue(Response.json({ id }));
  expect(await createResendReceiptProvider("test-api-key", request).send(payload, "payr-receipt-test", performance.now() + 10000)).toEqual({ kind: "sent", providerMessageId: id });
  const [url, options] = request.mock.calls[0];
  expect(url).toBe("https://api.resend.com/emails");
  expect(options.headers).toMatchObject({ Authorization: "Bearer test-api-key", "Idempotency-Key": "payr-receipt-test" });
  expect(JSON.parse(options.body)).toEqual(payload);
  expect(options.redirect).toBe("error");
  expect(options.signal).toBeInstanceOf(AbortSignal);
});

it.each([
  [429, {}, { kind: "retry", code: "PROVIDER_RATE_LIMITED" }],
  [503, {}, { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }],
  [408, {}, { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }],
  [409, { name: "concurrent_idempotent_requests" }, { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }],
  [409, { name: "invalid_idempotent_request" }, { kind: "manual_review", code: "PROVIDER_CONFLICT" }],
  [422, { message: "private recipient detail" }, { kind: "failed", code: "PROVIDER_REJECTED" }],
  [200, { id: "not-a-message-id" }, { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }],
] as const)("classifies HTTP %s without leaking provider detail", async (status, body, expected) => {
  const request = vi.fn().mockResolvedValue(Response.json(body, { status }));
  expect(await createResendReceiptProvider("test-key", request).send(payload, "stable-key", performance.now() + 10000)).toEqual(expected);
});

it("keeps timeout or malformed success responses ambiguous", async () => {
  const request = vi.fn().mockRejectedValueOnce(new Error("private transport detail")).mockResolvedValueOnce(new Response("not-json", { status: 200 }));
  const provider = createResendReceiptProvider("test-key", request);
  expect(await provider.send(payload, "stable-key", performance.now() + 10000)).toEqual({ kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" });
  expect(await provider.send(payload, "stable-key", performance.now() + 10000)).toEqual({ kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" });
});

it("never sends an invalid recipient, unsafe attachment, or absent idempotency key", async () => {
  const request = vi.fn();
  const provider = createResendReceiptProvider("test-key", request);
  expect((await provider.send({ ...payload, to: ["bad-recipient"] }, "stable-key", performance.now() + 10000)).kind).toBe("failed");
  expect((await provider.send({ ...payload, attachments: [{ filename: "../receipt.pdf", content: "JVBERi0=" }] }, "stable-key", performance.now() + 10000)).kind).toBe("failed");
  expect((await provider.send(payload, "", performance.now() + 10000)).kind).toBe("failed");
  expect(request).not.toHaveBeenCalled();
});

it("does not dispatch after the worker's monotonic send deadline", async () => {
  const request = vi.fn();
  expect(await createResendReceiptProvider("test-key", request).send(payload, "stable-key", performance.now() - 1))
    .toEqual({ kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" });
  expect(request).not.toHaveBeenCalled();
});
