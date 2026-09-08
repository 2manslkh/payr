import type { DeliveryState } from "../domain/status";
import type { ReceiptWork } from "../receipts/contracts";

export type DeliveryWork = {
  id: string; workspaceId: string; settlementId: string; receiptDocumentId: string;
  normalizedRecipient: string; roles: Array<"issuer" | "client">; messageKind: "receipt";
  state: DeliveryState; fence: string; attemptCount: number; leaseUntil: string | null; nextAttemptAt: string | null;
  providerIdempotencyKey: string; firstProviderAttemptAt: string | null; providerRequestStartedAt: string | null;
  ambiguousSince: string | null; providerMessageId: string | null; payloadHash: string | null; lastErrorCode: string | null;
  receipt: ReceiptWork;
};
export type DeliveryResult = { kind: "sent"; providerMessageId: string } | {
  kind: "retry" | "ambiguous" | "failed" | "manual_review";
  code: "DOCUMENT_UNAVAILABLE" | "DOCUMENT_INVALID" | "PROVIDER_RATE_LIMITED" | "PROVIDER_REJECTED" | "PROVIDER_AMBIGUOUS" | "PROVIDER_CONFLICT";
};
export type OutboxRepository = {
  claim(id?: string): Promise<DeliveryWork | null>;
  begin(id: string, fence: string, payloadHash: string): Promise<DeliveryWork | null>;
  finish(id: string, fence: string, result: DeliveryResult): Promise<DeliveryWork | null>;
};
export type ReceiptEmailPayload = {
  from: string; to: [string]; subject: string; html: string; text: string;
  attachments: [{ filename: string; content: string }];
};
export type ReceiptEmailProvider = { send(payload: ReceiptEmailPayload, idempotencyKey: string, deadline: number): Promise<DeliveryResult> };
