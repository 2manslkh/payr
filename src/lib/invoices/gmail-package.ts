import type { DraftSnapshot } from "./contracts";
import type { GmailReadyPackage } from "./publication-contracts";

export function buildGmailPackage(_input: { snapshot: DraftSnapshot; invoiceNumber: string; invoiceUrl: string; invoicePdfUrl: string }): GmailReadyPackage {
  throw new Error("R05 implementation pending");
}
