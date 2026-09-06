import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@react-pdf/renderer", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/{invoices/*/publish,jobs/publications}": [
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
      "./node_modules/pdfjs-dist/{build,legacy/build}/pdf.worker.mjs",
      "./node_modules/.pnpm/@napi-rs+canvas-*/node_modules/@napi-rs/canvas-*/*",
    ],
  },
};

export default nextConfig;
