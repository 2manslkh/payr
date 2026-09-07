import type { Metadata, Viewport } from "next";
import { parsePublicEnv } from "../config/env";

import "./globals.css";

const title = "Payr | Invoice. Settle. Reconcile.";
const description = "Agent-first invoices and protected PDFs for independent developers. Arc testnet payments and receipts are in development.";

export function generateMetadata(): Metadata {
  const { NEXT_PUBLIC_APP_URL } = parsePublicEnv({ NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://payrlink.xyz" });
  return {
    metadataBase: new URL(NEXT_PUBLIC_APP_URL),
    applicationName: "Payr",
    title,
    description,
    openGraph: { type: "website", locale: "en_US", siteName: "Payr", title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export const viewport: Viewport = { themeColor: "#071B3B", colorScheme: "light" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
