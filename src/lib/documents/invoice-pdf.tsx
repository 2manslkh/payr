import { Document, Image as PdfImage, Page, StyleSheet, Text, View, renderToBuffer, type TextProps } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { Children, type PropsWithChildren } from "react";
import { DocumentVerificationError, type PublishedInvoiceView } from "./contracts";

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingHorizontal: 42, paddingBottom: 48, fontFamily: "Helvetica", fontSize: 10,
    color: "#071B3B", backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#DDE2E6", paddingBottom: 16, marginBottom: 18 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 22 },
  title: { fontSize: 20, textAlign: "right" },
  label: { color: "#68717D", fontSize: 9, marginBottom: 4 },
  number: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  parties: { flexDirection: "row", gap: 24, marginBottom: 18 },
  party: { width: 243 },
  name: { fontFamily: "Helvetica-Bold", marginBottom: 4 },
  dates: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DDE2E6", paddingVertical: 10, marginBottom: 18 },
  dateRow: { flexDirection: "row", justifyContent: "space-between" },
  ledgerHeader: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: "#DDE2E6", paddingBottom: 5 },
  row: { borderBottomWidth: 1, borderBottomColor: "#DDE2E6", paddingVertical: 10, flexShrink: 0 },
  item: { flexDirection: "row", justifyContent: "space-between", gap: 16 },
  description: { width: 305 },
  amount: { width: 190, textAlign: "right" },
  atomic: { fontSize: 7, color: "#68717D", textAlign: "right" },
  total: { paddingVertical: 16, alignItems: "flex-end" },
  totalAmount: { fontFamily: "Helvetica-Bold", fontSize: 20 },
  section: { marginTop: 16 },
  payment: { borderTopWidth: 1, borderTopColor: "#DDE2E6", marginTop: 20, paddingTop: 14 },
  paymentRow: { flexDirection: "row", gap: 20, alignItems: "center" },
  paymentText: { width: 347 },
  qr: { width: 144, height: 144 },
  wallet: { fontFamily: "Courier", fontSize: 9, marginBottom: 10 },
  footer: { position: "absolute", bottom: 22, left: 42, right: 42, fontSize: 8, color: "#68717D", textAlign: "right" },
});

function InvoiceText({ children, maxWordLength = 30, ...props }: PropsWithChildren<TextProps> & { maxWordLength?: number }) {
  // Line breaks are layout only. Automatic hyphenation would invent characters
  // in addresses, identifiers and amounts; an unbroken long token would clip.
  return <Text {...props} hyphenationCallback={(word) => [word]}>{Children.map(children, (child) => typeof child === "string"
    ? child.replace(new RegExp(`(\\S{${maxWordLength}})(?=\\S)`, "g"), "$1\n") : child)}</Text>;
}

export async function invoiceQrDataUrl(invoiceUrl: string): Promise<string> {
  try {
    const url = new URL(invoiceUrl);
    if (invoiceUrl.length > 512 || !["https:", "http:"].includes(url.protocol) || url.username || url.password
      || url.hash || url.search || url.href !== invoiceUrl || !url.pathname.startsWith("/invoice/")) throw new DocumentVerificationError();
    return await QRCode.toDataURL(invoiceUrl, { errorCorrectionLevel: "M", margin: 4, width: 600,
      color: { dark: "#071B3B", light: "#FFFFFF" } });
  } catch { throw new DocumentVerificationError(); }
}

export async function renderInvoicePdf(view: PublishedInvoiceView): Promise<Uint8Array> {
  try {
    // Deliberately narrower than WinAnsi: printable ASCII plus LF only. Built-in
    // Helvetica has no safe Unicode fallback; never substitute or drop a glyph.
    const fields: Array<[string, number]> = [[view.invoiceNumber, 100], [view.issueDate, 10], [view.dueDate, 10],
      [view.payableUntil, 40], [view.memo, 2000], [view.payoutWallet, 42], [view.invoiceUrl, 512],
      [view.amountDecimal, 79], [view.amountAtomic, 78], [view.asset, 4], [view.network, 3]];
    if (!Number.isInteger(view.invoiceVersion) || view.invoiceVersion < 1 || view.items.length < 1 || view.items.length > 100
      || view.asset !== "USDC" || view.network !== "Arc") throw new DocumentVerificationError();
    for (const party of [view.sender, view.client]) {
      if (party.addressLines.length < 1 || party.addressLines.length > 6) throw new DocumentVerificationError();
      fields.push([party.businessName, 200], [party.contactName, 200], [party.contactEmail, 254],
        ...party.addressLines.map((line): [string, number] => [line, 200]));
    }
    for (const item of view.items) fields.push([item.description, 500], [item.amountDecimal, 79], [item.amountAtomic, 78]);
    let characters = 0, lineBreaks = 0;
    for (const [text, maximum] of fields) {
      if (typeof text !== "string" || text.length > maximum || /[^\x20-\x7e\n]/.test(text)
        || (characters += text.length) > 64000) throw new DocumentVerificationError();
      const lines = text.split("\n").length - 1;
      if (lines > 30 || (lineBreaks += lines) > 200) throw new DocumentVerificationError();
    }
    const qr = await invoiceQrDataUrl(view.invoiceUrl);
    const issued = new Date(`${view.issueDate}T00:00:00.000Z`);
    if (!Number.isFinite(issued.getTime()) || issued.toISOString().slice(0, 10) !== view.issueDate) throw new DocumentVerificationError();
    const bytes = new Uint8Array(await renderToBuffer(
      <Document title={`Invoice ${view.invoiceNumber}`} author="Payr" creator="Payr" producer="Payr"
        subject="Commercial invoice / payment request" language="en-US" creationDate={issued} modificationDate={issued}>
        <Page size="A4" style={styles.page}>
          <View style={styles.header}>
            <InvoiceText style={styles.brand}>Payr</InvoiceText>
            <View>
              <InvoiceText style={styles.title}>Invoice</InvoiceText>
              <InvoiceText style={styles.number}>{view.invoiceNumber}</InvoiceText>
              <InvoiceText style={{ textAlign: "right" }}>Version {view.invoiceVersion}</InvoiceText>
            </View>
          </View>
          <View style={styles.parties}>
            {[view.sender, view.client].map((party, index) => <View key={index} style={styles.party}>
              <InvoiceText style={styles.label}>{index === 0 ? "From" : "Bill to"}</InvoiceText>
              <InvoiceText maxWordLength={24} style={styles.name}>{party.businessName}</InvoiceText>
              {party.addressLines.map((line, lineIndex) => <InvoiceText maxWordLength={24} key={lineIndex}>{line}</InvoiceText>)}
              <InvoiceText maxWordLength={24} style={{ marginTop: 6 }}>{party.contactName}</InvoiceText>
              <InvoiceText maxWordLength={24}>{party.contactEmail}</InvoiceText>
            </View>)}
          </View>
          <View style={styles.dates} wrap={false}>
            {[["Issue date", view.issueDate], ["Due date", view.dueDate], ["Technical payable deadline (UTC)", view.payableUntil]]
              .map(([label, value]) => <View key={label} style={styles.dateRow}><InvoiceText>{label}</InvoiceText><InvoiceText>{value}</InvoiceText></View>)}
          </View>
          <View style={styles.ledgerHeader} minPresenceAhead={35}>
            <InvoiceText>Description</InvoiceText><InvoiceText>Amount ({view.asset})</InvoiceText>
          </View>
          {view.items.map((item, index) => <View key={index} style={styles.row} wrap={false}>
            <View style={styles.item}>
              <InvoiceText style={styles.description}>{item.description}</InvoiceText>
              <View style={styles.amount}>
                <InvoiceText>{item.amountDecimal} {view.asset}</InvoiceText>
                <InvoiceText style={styles.atomic}>{item.amountAtomic} atomic units</InvoiceText>
              </View>
            </View>
          </View>)}
          <View style={styles.total} wrap={false}>
            <InvoiceText style={styles.label}>Total due</InvoiceText>
            <InvoiceText style={styles.totalAmount}>{view.amountDecimal} {view.asset}</InvoiceText>
            <InvoiceText style={styles.atomic}>{view.amountAtomic} atomic units</InvoiceText>
          </View>
          {view.memo ? <View style={styles.section}><InvoiceText style={styles.label} minPresenceAhead={20}>Memo</InvoiceText>
            <InvoiceText>{view.memo}</InvoiceText></View> : null}
          <View style={styles.payment} wrap={false}>
            <InvoiceText style={styles.label}>Payment destination</InvoiceText>
            <InvoiceText maxWordLength={80} style={styles.wallet}>{view.payoutWallet}</InvoiceText>
            <View style={styles.paymentRow}>
              <View style={styles.paymentText}>
                <InvoiceText style={styles.name}>{view.asset} on {view.network}</InvoiceText>
                <InvoiceText>Open the protected invoice page to review and pay.</InvoiceText>
                <InvoiceText maxWordLength={40} style={{ fontSize: 8, marginTop: 8 }}>{view.invoiceUrl}</InvoiceText>
              </View>
              <PdfImage src={qr} style={styles.qr} cache={false} />
            </View>
          </View>
          <InvoiceText fixed style={styles.footer} render={({ pageNumber, totalPages }) =>
            `Commercial invoice / payment request   |   Page ${pageNumber} of ${totalPages}`} />
        </Page>
      </Document>,
    ));
    if (bytes.byteLength < 5 || bytes.byteLength > 10485760) throw new DocumentVerificationError();
    return bytes;
  } catch { throw new DocumentVerificationError(); }
}
