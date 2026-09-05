import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Payr",
  description: "Invoice. Settle. Reconcile.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
