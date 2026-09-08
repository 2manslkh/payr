import { z } from "zod";
import { canonicalJson } from "../domain/canonical-json";
import type { ReceiptEmailProvider } from "./outbox-contracts";
import { receiptSenderSchema } from "./address";
const payloadSchema = z.object({
  from: receiptSenderSchema, to: z.tuple([z.email().max(254)]), subject: z.string().min(1).max(300).regex(/^[^\r\n]+$/),
  html: z.string().max(200000), text: z.string().max(100000),
  attachments: z.tuple([z.object({ filename: z.string().max(200).regex(/^[A-Za-z0-9_-]+\.pdf$/),
    content: z.string().max(13981016).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict()]),
}).strict();

export function createResendReceiptProvider(apiKey: string, request: typeof fetch = fetch): ReceiptEmailProvider {
  return { async send(payload, idempotencyKey, deadline) {
    if (!apiKey || !payloadSchema.safeParse(payload).success || !/^[A-Za-z0-9_/-]{1,256}$/.test(idempotencyKey)) {
      return { kind: "failed", code: "PROVIDER_REJECTED" };
    }
    try {
      const body = canonicalJson(payload);
      const remaining = Math.floor(Math.min(10_000, deadline - performance.now()));
      if (!Number.isFinite(remaining) || remaining <= 0) return { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" };
      const response = await request("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body, redirect: "error", signal: AbortSignal.timeout(remaining),
      });
      if (response.status === 429) { void response.body?.cancel().catch(() => {}); return { kind: "retry", code: "PROVIDER_RATE_LIMITED" }; }
      if (response.status >= 500 || response.status === 408) { void response.body?.cancel().catch(() => {}); return { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }; }
      if (!response.ok && response.status !== 409) { void response.body?.cancel().catch(() => {}); return { kind: "failed", code: "PROVIDER_REJECTED" }; }
      const reader = response.body?.getReader();
      if (!reader) return { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" };
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16384) { void reader.cancel().catch(() => {}); return { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }; }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const resultBody: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (response.status === 409) {
        const error = z.object({ name: z.string() }).safeParse(resultBody);
        return error.success && error.data.name === "concurrent_idempotent_requests"
          ? { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" } : { kind: "manual_review", code: "PROVIDER_CONFLICT" };
      }
      const result = z.object({ id: z.string().uuid() }).safeParse(resultBody);
      return result.success ? { kind: "sent", providerMessageId: result.data.id } : { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" };
    } catch { return { kind: "ambiguous", code: "PROVIDER_AMBIGUOUS" }; }
  } };
}
