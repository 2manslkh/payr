import { Document, Image as PdfImage, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import { receiptProofRows, type ReceiptView } from "./receipt-view";
import { DocumentUnavailableError, DocumentVerificationError } from "./contracts";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", fontSize: 10, color: "#071B3B", backgroundColor: "#FFFFFF" },
  header: { flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderColor: "#DDE2E6", paddingBottom: 14, marginBottom: 16 },
  brand: { fontFamily: "Helvetica-Bold", fontSize: 22 }, title: { fontSize: 20, textAlign: "right" },
  label: { color: "#68717D", fontSize: 9, marginBottom: 3 },
  amount: { fontFamily: "Helvetica-Bold", fontSize: 18, marginBottom: 4 },
  atomic: { fontFamily: "Courier", fontSize: 7, marginBottom: 12 },
  row: { borderTopWidth: 1, borderColor: "#DDE2E6", paddingVertical: 7 },
  value: { fontFamily: "Courier", fontSize: 8, lineHeight: 1.3 },
  verification: { flexDirection: "row", alignItems: "center", gap: 20, marginTop: 12 },
  verificationText: { width: 347 }, qr: { width: 144, height: 144 },
  footer: { position: "absolute", left: 42, bottom: 22, fontSize: 8, color: "#68717D" },
});
const wrap = (value: string, size = 80) => value.replace(new RegExp(`(\\S{${size}})(?=\\S)`, "g"), "$1\n");

export async function receiptQrDataUrl(receiptUrl: string) {
  try {
    const url = new URL(receiptUrl);
    if (receiptUrl.length > 512 || !["http:", "https:"].includes(url.protocol) || url.username || url.password
      || url.search || url.hash || url.href !== receiptUrl || !/^\/receipt\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(url.pathname)) throw new Error();
  } catch { throw new DocumentVerificationError(); }
  try { return await QRCode.toDataURL(receiptUrl, { errorCorrectionLevel: "M", margin: 4, width: 600, color: { dark: "#071B3B", light: "#FFFFFF" } }); }
  catch { throw new DocumentUnavailableError(); }
}

export async function renderReceiptPdf(view: ReceiptView) {
  const rows = receiptProofRows(view);
  if ([view.invoiceNumber, view.amountDecimal, view.amountAtomic, view.receiptUrl, ...rows.flat()].some((text) =>
    typeof text !== "string" || text.length > 512 || /[^\x20-\x7e]/.test(text))) throw new DocumentVerificationError();
  const qr = await receiptQrDataUrl(view.receiptUrl);
  try {
    const date = new Date(view.blockTime);
    return new Uint8Array(await renderToBuffer(<Document title={`Receipt ${view.invoiceNumber}`} author="Payr" creator="Payr" producer="Payr"
      subject="Verified payment receipt" language="en-US" creationDate={date} modificationDate={date}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}><Text style={styles.brand}>Payr</Text><View>
          <Text style={styles.title}>Receipt</Text><Text>{view.invoiceNumber}</Text><Text>Version {view.invoiceVersion}</Text>
        </View></View>
        <Text style={styles.label}>Amount settled</Text>
        <Text style={[styles.amount, view.amountDecimal.length > 35 ? { fontSize: 9 } : {}]} hyphenationCallback={(word) => [word]}>{view.amountDecimal} USDC</Text>
        <Text style={styles.atomic}>Atomic units: {view.amountAtomic} atomic units</Text>
        {rows.map(([label, value]) => <View key={label} style={styles.row} wrap={false}>
          <Text style={styles.label}>{label}</Text><Text style={styles.value} hyphenationCallback={(word) => [word]}>{wrap(value)}</Text>
        </View>)}
        <View style={styles.verification} wrap={false}><View style={styles.verificationText}>
          <Text style={styles.label}>Receipt verification</Text><Text>Open this protected receipt to inspect settlement proof.</Text>
          <Text style={{ fontFamily: "Courier", fontSize: 7, marginTop: 8 }} hyphenationCallback={(word) => [word]}>{wrap(view.receiptUrl)}</Text>
        </View><PdfImage src={qr} style={styles.qr} cache={false} /></View>
        <Text style={styles.footer}>Verified settlement record</Text>
      </Page>
    </Document>));
  } catch { throw new DocumentUnavailableError(); }
}
