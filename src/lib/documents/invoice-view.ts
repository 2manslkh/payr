import { z } from "zod";
import { publicationSnapshotSchema } from "../db/publication";
import { canonicalJson } from "../domain/canonical-json";
import { DocumentVerificationError, type CanonicalInvoiceDocument, type PublishedInvoiceParty, type PublishedInvoiceView } from "./contracts";

const documentSchema = z.object({
  schemaVersion: z.literal("payr.invoice-document.v1"),
  invoiceId: z.string().uuid().refine((value) => value === value.toLowerCase()),
  invoiceVersion: z.number().int().min(1).max(2147483647),
  invoiceNumber: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,31}-[2-9][0-9]{3}-[0-9]{6,19}$/),
  invoiceKey: z.templateLiteral(["0x", z.string().regex(/^[0-9a-f]{64}$/)]),
  chainId: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  contractAddress: z.templateLiteral(["0x", z.string().regex(/^[0-9a-f]{40}$/)])
    .refine((value) => value !== `0x${"0".repeat(40)}`),
  invoice: publicationSnapshotSchema,
}).strict().refine((value) => value.invoiceNumber.startsWith(`${value.invoice.sender.invoicePrefix}-`));

export function parseCanonicalInvoiceDocument(json: string): CanonicalInvoiceDocument {
  try {
    if (typeof json !== "string" || json.length > 1048576) throw new DocumentVerificationError();
    const document = documentSchema.parse(JSON.parse(json));
    if (canonicalJson(document) !== json) throw new DocumentVerificationError();
    return document;
  } catch { throw new DocumentVerificationError(); }
}

export function buildPublishedInvoiceView(document: CanonicalInvoiceDocument, invoiceUrl: string): PublishedInvoiceView {
  const parsed = documentSchema.safeParse(document);
  if (!parsed.success) throw new DocumentVerificationError();
  const invoice = parsed.data.invoice;
  function party(value: typeof invoice.client): PublishedInvoiceParty {
    const address = value.billingAddress;
    return { businessName: value.businessName, contactName: value.contactName, contactEmail: value.contactEmail,
      addressLines: [address.line1, address.line2, address.city, address.region, address.postalCode, address.countryCode]
        .filter((line): line is string => !!line) };
  }
  return {
    invoiceNumber: document.invoiceNumber, invoiceVersion: document.invoiceVersion,
    issueDate: invoice.issueDate, dueDate: invoice.dueDate, payableUntil: invoice.payableUntil,
    sender: party(invoice.sender), client: party(invoice.client), items: invoice.items.map((item) => ({ ...item })),
    amountDecimal: invoice.amountDecimal, amountAtomic: invoice.amountAtomic, memo: invoice.memo,
    payoutWallet: invoice.sender.payoutWallet, asset: "USDC", network: "Arc", invoiceUrl,
  };
}
