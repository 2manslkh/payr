import { z } from "zod";
import { IdentityError, saveConnectorSenderSchema, type IdentityRepository, type SenderProfile } from "../identity/contracts";
import type { InvoiceActor } from "../invoices/contracts";
import { isCountryCode } from "../domain/country";

const actorSchema = z.object({ workspaceId: z.string().uuid(), connectorId: z.string().uuid(), ownerWallet: z.null() }).strict();
const readSchema = z.object({}).strict();

function result(profile: SenderProfile) {
  const missingFields = (["businessName", "billingAddress", "contactName", "contactEmail", "invoicePrefix", "defaultPaymentTermsDays"] as const)
    .filter((field) => profile[field] === null).map((field) => ({ path: `sender.${field}`, reason: "required" }));
  if (profile.billingAddress && !isCountryCode(profile.billingAddress.countryCode)) {
    missingFields.push({ path: "sender.billingAddress.countryCode", reason: "confirmation_required" });
  }
  return { profile, missingFields, guidance: "Review all sender business/contact/address, prefix and default terms with the user. Save only after explicit approval, using this profile id and revision. On conflict, read again and obtain fresh approval. Payout changes require an owner-signed dashboard action; these tools cannot change payout. After setup, retry the original invoice input with its original idempotencyKey." };
}

export function createConnectorSenderService(repository: Pick<IdentityRepository, "getConnectorProfile" | "saveConnectorProfile">) {
  function connector(actor: InvoiceActor) {
    const parsed = actorSchema.safeParse(actor);
    if (!parsed.success) throw new IdentityError("FORBIDDEN", 403);
    return parsed.data;
  }
  return {
    async getSenderProfile(actor: InvoiceActor, input: unknown) {
      readSchema.parse(input);
      return result(await repository.getConnectorProfile(connector(actor)));
    },
    async saveSenderProfile(actor: InvoiceActor, input: unknown) {
      const parsed = saveConnectorSenderSchema.parse(input);
      return result(await repository.saveConnectorProfile(connector(actor), parsed));
    },
  };
}
