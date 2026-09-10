import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/.well-known/*": ["./skills/payr-create-invoice/SKILL.md"],
    "/{api/v1/*,api/mcp,api/mcp/*,api/invoices/*/publish,api/jobs/publications,api/jobs/receipts,api/jobs/outbox,api/jobs/invoice-outbox,api/jobs/reconcile,api/reconcile/transaction,receipt/*}": [
      // Native-worker imports are intentionally opaque to Turbopack/NFT.
      "./node_modules/pdfjs-dist/package.json",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/legacy/build/{pdf,pdf.worker}.mjs",
      "./node_modules/jsqr/{package.json,dist/jsQR.js}",
      // Canvas symlinks are already traced; include their real pnpm targets,
      // never files beneath the symlinks (invalid in Vercel function packages).
      "./node_modules/.pnpm/@napi-rs+canvas@*/node_modules/@napi-rs/canvas/{package.json,*.js}",
      "./node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/*",
    ],
  },
};

export default nextConfig;
