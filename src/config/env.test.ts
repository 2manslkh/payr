import { describe, expect, it } from "vitest";

import { createServerEnv, parsePublicEnv } from "./env";

describe("parsePublicEnv", () => {
  it("rejects a non-HTTPS production app URL", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://payrlink.xyz" })).toThrow();
  });

  it("accepts an HTTPS app URL", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "https://payrlink.xyz" }).NEXT_PUBLIC_APP_URL).toBe(
      "https://payrlink.xyz",
    );
  });

  it("accepts an HTTPS Vercel hostname", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "https://payr-preview.vercel.app" }).NEXT_PUBLIC_APP_URL).toBe(
      "https://payr-preview.vercel.app",
    );
  });

  it("accepts a localhost app URL with an explicit port", () => {
    expect(parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://localhost:3000" }).NEXT_PUBLIC_APP_URL).toBe(
      "http://localhost:3000",
    );
  });

  it("rejects a localhost app URL without a port", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_APP_URL: "http://localhost" })).toThrow();
  });
});

describe("createServerEnv", () => {
  it("fails clearly when runtime server configuration is missing", () => {
    expect(() => createServerEnv({})).toThrow();
  });

  it("rejects a short link token key", () => {
    expect(() =>
      createServerEnv({
        ARC_RPC_URL: "https://rpc.example",
        ARC_CHAIN_ID: "1",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SESSION_ENCRYPTION_KEY: "session-key",
        LINK_ACTIVE_KEY_VERSION: "1",
        LINK_TOKEN_KEY_V1: "too-short",
        CONNECTOR_TOKEN_PEPPER: "connector-pepper",
        CRON_SECRET: "cron-secret",
      }),
    ).toThrow("link token key must encode at least 32 bytes");
  });

  it("rejects an active link key version without supported key material", () => {
    expect(() =>
      createServerEnv({
        ARC_RPC_URL: "https://rpc.example",
        ARC_CHAIN_ID: "1",
        SUPABASE_URL: "https://project.supabase.co",
        SUPABASE_ANON_KEY: "anon-key",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        SESSION_ENCRYPTION_KEY: "session-key",
        LINK_ACTIVE_KEY_VERSION: "2",
        LINK_TOKEN_KEY_V1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        CONNECTOR_TOKEN_PEPPER: "connector-pepper",
        CRON_SECRET: "cron-secret",
      }),
    ).toThrow();
  });
});
