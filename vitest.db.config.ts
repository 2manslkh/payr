import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const requiredEnvironment = ["SUPABASE_URL", "SUPABASE_DB_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  throw new Error(`Database tests require local Supabase environment: missing ${missingEnvironment.join(", ")}`);
}

const isLocalSupabase = (() => {
  try {
    const url = new URL(process.env.SUPABASE_URL!);
    return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port !== "";
  } catch {
    return false;
  }
})();

if (!isLocalSupabase) {
  throw new Error("Database tests refuse non-local SUPABASE_URL values");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.integration.test.tsx"],
    fileParallelism: false,
  },
});
