import { z } from "zod";
import type { SettlementDeliveryInput } from "../db/repositories";

export const receiptSenderSchema = z.string().trim().max(254).refine((value) => {
  if (/[\x00-\x1f\x7f]/.test(value)) return false;
  const address = /^(?:[^<>]{1,80} <([^<>]+)>|([^<>]+))$/.exec(value);
  return address !== null && z.email().safeParse(address[1] ?? address[2]).success;
});

export function receiptRecipients(issuer: string, client: string): SettlementDeliveryInput[] {
  const deliveries: SettlementDeliveryInput[] = [];
  for (const [role, value] of [["issuer", issuer], ["client", client]] as const) {
    const parsed = z.email().max(254).safeParse(typeof value === "string" ? value.trim().toLowerCase() : value);
    if (!parsed.success) throw new Error("INVALID_RECEIPT_RECIPIENT");
    const existing = deliveries.find((entry) => entry.normalizedRecipient === parsed.data);
    if (existing) existing.roles.push(role);
    else deliveries.push({ messageKind: "receipt", normalizedRecipient: parsed.data, roles: [role] });
  }
  return deliveries.sort((a, b) => a.normalizedRecipient < b.normalizedRecipient ? -1 : a.normalizedRecipient > b.normalizedRecipient ? 1 : 0);
}
