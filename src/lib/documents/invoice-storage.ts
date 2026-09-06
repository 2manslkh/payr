import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { InvoiceDocumentPort } from "../invoices/contracts";
import { DocumentUnavailableError, DocumentVerificationError, type DocumentRepository, type PrivateDocumentStorage,
  type PdfTextItem, type PublishedInvoiceView, type StoredDocument } from "./contracts";

const maxBytes = 10485760;
const uuid = z.string().uuid().refine((value) => value === value.toLowerCase());

function keyParts(key: string) {
  const match = typeof key === "string" && /^workspace\/([0-9a-f-]{36})\/invoice\/([0-9a-f-]{36})\/([1-9][0-9]{0,9})\/attempt\/([0-9a-f-]{36})\.pdf$/.exec(key);
  if (!match || ![match[1], match[2], match[4]].every((id) => uuid.safeParse(id).success)
    || Number(match[3]) > 2147483647) throw new DocumentVerificationError();
  return { invoiceId: match[2], invoiceVersion: Number(match[3]) };
}

function verifyEnvelope(document: StoredDocument) {
  if (!(document.bytes instanceof Uint8Array) || document.contentType !== "application/pdf"
    || document.byteLength !== document.bytes.byteLength || document.byteLength < 5 || document.byteLength > maxBytes
    || ![37, 80, 68, 70, 45].every((value, index) => document.bytes[index] === value)) throw new DocumentVerificationError();
}

export function createPrivateDocumentStorage(client: SupabaseClient): PrivateDocumentStorage {
  return {
    async read(storageKey) {
      keyParts(storageKey);
      try {
        const { data, error } = await client.storage.from("documents").download(storageKey);
        if (error) {
          if (error.statusCode === "404" && error.message === "Object not found") return null;
          throw new DocumentUnavailableError();
        }
        if (!data) throw new DocumentUnavailableError();
        if (data.type !== "application/pdf" || data.size < 5 || data.size > maxBytes) throw new DocumentVerificationError();
        const result = { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type, byteLength: data.size };
        verifyEnvelope(result);
        return result;
      } catch (error) {
        if (error instanceof DocumentVerificationError) throw error;
        throw new DocumentUnavailableError();
      }
    },
    async create(storageKey, bytes) {
      keyParts(storageKey);
      verifyEnvelope({ bytes, contentType: "application/pdf", byteLength: bytes instanceof Uint8Array ? bytes.byteLength : 0 });
      try {
        const { data, error } = await client.storage.from("documents").upload(storageKey, bytes, { contentType: "application/pdf", upsert: false });
        if (error) {
          if (error.statusCode === "409") return "exists";
          throw new DocumentUnavailableError();
        }
        if (!data || data.path !== storageKey) throw new DocumentUnavailableError();
        return "created";
      } catch { throw new DocumentUnavailableError(); }
    },
  };
}

export function createInvoiceDocumentPort(storage: PrivateDocumentStorage, repository: Pick<DocumentRepository, "storageState">): InvoiceDocumentPort {
  return { async createOrRead(input) {
    try {
      const key = keyParts(input.storageKey);
      if (!/^0x[0-9a-f]{64}$/.test(input.publicationSalt)) throw new DocumentVerificationError();
      // Lazy producer loading also lets private reads operate independently of the renderer.
      const { parseCanonicalInvoiceDocument, buildPublishedInvoiceView } = await import("./invoice-view");
      const document = parseCanonicalInvoiceDocument(input.canonicalInvoiceJson);
      if (document.invoiceId !== key.invoiceId || document.invoiceVersion !== key.invoiceVersion
        || document.invoiceNumber !== input.invoiceNumber) throw new DocumentVerificationError();
      const view: PublishedInvoiceView = buildPublishedInvoiceView(document, input.invoiceUrl);
      let stored = await storage.read(input.storageKey);
      const state = await repository.storageState(input.storageKey);
      if (!["reserved", "rendering", "stored", "finalized"].includes(state ?? "")) throw new DocumentUnavailableError();
      if (stored === null) {
        if (state !== "reserved" && state !== "rendering") throw new DocumentUnavailableError();
        const { renderInvoicePdf } = await import("./invoice-pdf");
        const bytes = await renderInvoicePdf(view);
        verifyEnvelope({ bytes, contentType: "application/pdf", byteLength: bytes instanceof Uint8Array ? bytes.byteLength : 0 });
        // Rendering can outlive a lease; recheck progress before issuing any create.
        const beforeCreate = await repository.storageState(input.storageKey);
        if (beforeCreate === "reserved" || beforeCreate === "rendering") await storage.create(input.storageKey, bytes);
        else if (beforeCreate !== "stored" && beforeCreate !== "finalized") throw new DocumentUnavailableError();
        stored = await storage.read(input.storageKey);
        if (stored === null) throw new DocumentUnavailableError();
      }
      verifyEnvelope(stored);
      const { inspectInvoicePdf } = await import("./pdf-verification");
      const inspection = await inspectInvoicePdf(stored.bytes);
      if (!inspection || !Number.isInteger(inspection.pageCount) || inspection.pageCount < 1
        || typeof inspection.text !== "string" || !Array.isArray(inspection.qrDestinations) || inspection.qrDestinations.length !== 1
        || inspection.qrDestinations[0] !== input.invoiceUrl) throw new DocumentVerificationError();
      // Remove only numbered footer lines, then compare the complete ordered material text.
      // Whitespace can split digits during layout; amounts, atomic units and repeated rows cannot move or disappear.
      let footerCount = 0;
      const materialText = inspection.text.replace(
        /(?:^|\n)Commercial invoice \/ payment request[ \t]+\|[ \t]+Page ([1-9][0-9]*) of ([1-9][0-9]*)(?=[ \t]*(?:\n|$))/g,
        (_footer, page, total) => {
          if (Number(page) !== ++footerCount || Number(total) !== inspection.pageCount) throw new DocumentVerificationError();
          return "\n";
        },
      );
      const compact = (value: string) => value.replace(/\s+/g, "");
      const fields = ["Payr", "Invoice", view.invoiceNumber, `Version ${view.invoiceVersion}`,
        ...[view.sender, view.client].flatMap((party, index) => [index === 0 ? "From" : "Bill to", party.businessName,
          ...party.addressLines, party.contactName, party.contactEmail]),
        "Issue date", view.issueDate, "Due date", view.dueDate, "Technical payable deadline (UTC)", view.payableUntil,
        "Description", `Amount (${view.asset})`,
        ...view.items.flatMap((item, index) => [String(index + 1), item.description, `Line amount: ${item.amountDecimal} ${view.asset}`, `Atomic units: ${item.amountAtomic} atomic units`]),
        "Total due", `${view.amountDecimal} ${view.asset}`, `Atomic units: ${view.amountAtomic} atomic units`,
        ...(view.memo ? ["Memo", view.memo] : []), "Payment destination", view.payoutWallet, `${view.asset} on ${view.network}`,
        "Open the protected invoice page to review and pay.", view.invoiceUrl];
      if (footerCount !== inspection.pageCount || compact(materialText) !== compact(fields.join("\n"))) throw new DocumentVerificationError();
      const measured = inspection.textItems;
      if (!Array.isArray(measured) || measured.length < 1 || measured.length > 10000 || measured.some((item) =>
        !item || typeof item.text !== "string" || !item.text.trim() || !Number.isInteger(item.page)
        || item.page < 1 || item.page > inspection.pageCount || ![item.x, item.y, item.width, item.height].every(Number.isFinite)
        || item.width <= 0 || item.height <= 0 || item.x < 0 || item.x + item.width > 595.5 || item.y < item.height || item.y > 842.5)) {
        throw new DocumentVerificationError();
      }
      const size = (item: PdfTextItem, points: number) => Math.abs(item.height - points) < 0.05;
      const order = (a: PdfTextItem, b: PdfTextItem) => a.page - b.page || a.y - b.y || a.x - b.x;
      const right = (item: PdfTextItem) => item.x >= 363 && item.x + item.width <= 553.5;
      const cellText = (items: PdfTextItem[], points: number) => compact(items.filter((item) => size(item, points))
        .sort(order).map((item) => item.text).join(""));
      // The narrow 7pt index column cannot be supplied by 10pt description text.
      const anchors = measured.filter((item) => Math.abs(item.x - 42) < 0.25 && size(item, 7)
        && item.width <= 12.25 && /^[1-9][0-9]{0,2}$/.test(item.text)).sort(order);
      const totals = measured.filter((item) => right(item) && size(item, 9) && item.text === "Total due");
      const payments = measured.filter((item) => Math.abs(item.x - 42) < 0.25 && size(item, 9) && item.text === "Payment destination");
      if (anchors.length !== view.items.length || totals.length !== 1 || payments.length !== 1) throw new DocumentVerificationError();
      const total = totals[0], payment = payments[0];
      if (order(anchors[anchors.length - 1], total) >= 0 || total.page > anchors[anchors.length - 1].page + 1
        || order(total, payment) >= 0) throw new DocumentVerificationError();
      for (const [index, anchor] of anchors.entries()) {
        const next = anchors[index + 1] ?? total;
        const end = next.page === anchor.page ? next.y - next.height : 794;
        if (anchor.text !== String(index + 1) || anchor.y < 40 || anchor.y >= end
          || next.page > anchor.page + 1) throw new DocumentVerificationError();
        // Rows never wrap. On a page transition the next row starts a fresh region;
        // the 8pt footer below the 794pt content edge is never amount evidence.
        const row = measured.filter((item) => item.page === anchor.page && item.y >= anchor.y - 1 && item.y < end);
        const description = row.filter((item) => item.x >= 55.9 && item.x + item.width <= 361.5);
        const money = row.filter(right), expected = view.items[index];
        if (description.some((item) => !size(item, 10)) || cellText(description, 10) !== compact(expected.description)
          || money.some((item) => !size(item, 10) && !size(item, 7))
          || cellText(money, 10) !== compact(`Line amount: ${expected.amountDecimal} ${view.asset}`)
          || cellText(money, 7) !== compact(`Atomic units: ${expected.amountAtomic} atomic units`)) throw new DocumentVerificationError();
      }
      // The total is an unwrapped 20pt decimal / 7pt atomic block. A memo (10pt),
      // row, payment section or other page cannot lend it a matching amount.
      const totalMoney = measured.filter((item) => item.page === total.page && item.y > total.y
        && item.y < (payment.page === total.page ? payment.y - payment.height : 794) && (size(item, 20) || size(item, 7)));
      if (totalMoney.some((item) => item.x < 42 || item.x + item.width > 553.5 || size(item, 7) && !right(item))
        || cellText(totalMoney, 20) !== compact(`${view.amountDecimal} ${view.asset}`)
        || cellText(totalMoney, 7) !== compact(`Atomic units: ${view.amountAtomic} atomic units`)) throw new DocumentVerificationError();
      const { computeDocumentCommitment } = await import("../domain/commitment");
      return { bytes: stored.bytes, contentType: "application/pdf", byteLength: stored.byteLength,
        ...computeDocumentCommitment(input.canonicalInvoiceJson, stored.bytes, input.publicationSalt),
        decodedQrDestination: inspection.qrDestinations[0] };
    } catch (error) {
      if (error instanceof DocumentVerificationError) throw error;
      throw new DocumentUnavailableError();
    }
  } };
}
