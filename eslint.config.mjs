import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  globalIgnores([".worktrees/**", ".next/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
