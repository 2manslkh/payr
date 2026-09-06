import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "payr-document-package-"));
try {
  const result = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.config.ts",
    "src/lib/documents/pdf-verification.test.ts"], {
    stdio: "inherit", env: { ...process.env, PAYR_TEST_PDF_PACKAGE_DIR: directory },
  });
  process.exitCode = result.status ?? 1;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
