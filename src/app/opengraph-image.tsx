import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Payr. Invoice. Settle. Reconcile. Agent-first invoicing on Arc testnet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const icon = await readFile(join(process.cwd(), "public/brand/payr-mark-v2.png"));
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", padding: "56px 64px", background: "#F3F5F6", color: "#071B3B" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 28, borderBottom: "1px solid #DDE2E6" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 700 }}>
          <span>Pay</span>
          {/* ImageResponse requires a native image element rather than next/image. */}
          <img src={`data:image/png;base64,${icon.toString("base64")}`} alt="r" width={56} height={56} />
        </div>
        <span style={{ fontSize: 24 }}>Arc testnet</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 48, fontSize: 76, lineHeight: 1.08, fontWeight: 700 }}>
        <span>Invoice. Settle.</span><span>Reconcile.</span>
      </div>
      <div style={{ display: "flex", marginTop: 32, fontSize: 28, color: "#606A76" }}>Agent-first invoices and protected PDFs.</div>
      <div style={{ display: "flex", marginTop: "auto", fontSize: 20, color: "#606A76" }}>Arc testnet payments and receipts in development</div>
    </div>,
    size,
  );
}
