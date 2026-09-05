import { describe, expect, it } from "vitest";

import { createIdentityEnv, createServerEnv, parsePublicEnv } from "./env";

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

describe("identity runtime configuration", () => {
  const valid = {
    NEXT_PUBLIC_APP_URL: "https://payrlink.xyz",
    ARC_CHAIN_ID: "5042002",
    SESSION_ENCRYPTION_KEY: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    CONNECTOR_TOKEN_PEPPER: btoa(String.fromCharCode(...new Uint8Array(32).fill(8))),
  };

  it("parses only the identity runtime configuration without unrelated provider keys", () => {
    expect(createIdentityEnv(valid).chainId).toBe(5042002);
    expect(createIdentityEnv(valid).sessionKey).toHaveLength(32);
  });

  it("rejects short secrets and unsafe chain IDs", () => {
    expect(() => createIdentityEnv({ ...valid, SESSION_ENCRYPTION_KEY: "short" })).toThrow();
    expect(() => createIdentityEnv({ ...valid, CONNECTOR_TOKEN_PEPPER: "short" })).toThrow();
    expect(() => createIdentityEnv({ ...valid, ARC_CHAIN_ID: "9007199254740993" })).toThrow();
  });

  it("rejects URL credentials, paths, query strings and fragments", () => {
    for (const suffix of ["/path", "?query=1", "#fragment"]) {
      expect(() => createIdentityEnv({ ...valid, NEXT_PUBLIC_APP_URL: `https://payrlink.xyz${suffix}` })).toThrow();
    }
    expect(() => createIdentityEnv({ ...valid, NEXT_PUBLIC_APP_URL: "https://user:pass@payrlink.xyz" })).toThrow();
    expect(createIdentityEnv({ ...valid, NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3123" }).appOrigin).toBe("http://127.0.0.1:3123");
  });
});
