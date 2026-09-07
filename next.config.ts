import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/{invoices/*/publish,jobs/publications}": [
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
