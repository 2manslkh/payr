import nextEnv from "@next/env";
import { defineConfig } from "vitest/config";
import { fixtureDatabaseContainer } from "./scripts/local-test-config.mjs";

const { loadEnvConfig } = nextEnv;

loadEnvConfig(process.cwd());

const requiredEnvironment = ["SUPABASE_URL", "SUPABASE_DB_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  throw new Error(`Database tests require local Supabase environment: missing ${missingEnvironment.join(", ")}`);
}

fixtureDatabaseContainer();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts", "src/**/*.integration.test.tsx"],
    fileParallelism: false,
  },
});
