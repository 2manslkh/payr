import { defineConfig } from "vitest/config";

const pdfTests = [
  "src/lib/documents/invoice-pdf.test.tsx",
  "src/lib/documents/invoice-storage.pdf.test.ts",
  "src/lib/documents/pdf-verification.test.ts",
];

export default defineConfig({
  test: {
    projects: [
      { test: {
        name: "unit", environment: "jsdom",
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        exclude: ["src/**/*.integration.test.ts", "src/**/*.integration.test.tsx", ...pdfTests],
        sequence: { groupOrder: 0 },
      } },
      // Native raster/QR work has a real runtime budget; do not compete with UI workers for it.
      { test: {
        name: "pdf", environment: "node", include: pdfTests,
        fileParallelism: false, sequence: { groupOrder: 1 },
      } },
    ],
  },
});
