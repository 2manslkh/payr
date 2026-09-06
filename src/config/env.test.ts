import { describe, expect, it } from "vitest";

import { createDocumentAccessEnv, createDocumentRpcOrigins, createIdentityEnv, createPublicationEnv, createPublicationLinkEnv, createServerEnv, parsePublicEnv } from "./env";

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

describe("publication runtime configuration", () => {
  const valid = {
    NEXT_PUBLIC_APP_URL: "https://payrlink.xyz", LINK_ACTIVE_KEY_VERSION: "2",
    LINK_TOKEN_KEY_V1: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    LINK_TOKEN_KEY_V2: btoa(String.fromCharCode(...new Uint8Array(32).fill(8))),
  };
  it("retains old versions and allows read configuration without deployment binding", () => {
    const parsed = createPublicationLinkEnv(valid);
    expect([...parsed.keys.keys()]).toEqual([1, 2]);
    expect(() => createPublicationEnv(valid)).toThrow();
  });
  it("rejects missing active material and zero deployment addresses", () => {
    expect(createPublicationLinkEnv({ ...valid, LINK_TOKEN_KEY_V2: undefined }).keys.has(1)).toBe(true);
    expect(createPublicationLinkEnv({ ...valid, LINK_TOKEN_KEY_V2: undefined, LINK_ACTIVE_KEY_VERSION: "invalid" }).keys.has(1)).toBe(true);
    expect(() => createPublicationEnv({ ...valid, LINK_TOKEN_KEY_V2: undefined, ARC_CHAIN_ID: "5042002", NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"1".repeat(40)}` })).toThrow();
    expect(() => createPublicationEnv({ ...valid, ARC_CHAIN_ID: "5042002", NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"0".repeat(40)}` })).toThrow();
    expect(createPublicationEnv({ ...valid, ARC_CHAIN_ID: "5042002", NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"1".repeat(40)}` }).chainId).toBe(5042002);
  });
});

describe("document access configuration", () => {
  const valid = {
    NEXT_PUBLIC_APP_URL: "https://payrlink.xyz",
    LINK_TOKEN_KEY_V1: btoa(String.fromCharCode(...new Uint8Array(32).fill(7))),
    CONNECTOR_TOKEN_PEPPER: btoa(String.fromCharCode(...new Uint8Array(32).fill(8))),
  };

  it("uses retained link keys and the admission pepper independently of session and current reservation configuration", () => {
    const config = createDocumentAccessEnv(valid);
    expect(config).toEqual({
      appOrigin: "https://payrlink.xyz", explorerOrigin: "https://testnet.arcscan.app",
      keys: new Map([[1, new Uint8Array(32).fill(7)]]), pepper: new Uint8Array(32).fill(8),
    });
    expect(createDocumentAccessEnv({
      ...valid, SESSION_ENCRYPTION_KEY: "invalid", ARC_CHAIN_ID: "invalid",
      NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: `0x${"0".repeat(40)}`, LINK_ACTIVE_KEY_VERSION: "invalid",
      LINK_TOKEN_KEY_V2: undefined,
    })).toEqual(config);
  });

  it.each([undefined, "", "short", "!".repeat(44), btoa("a".repeat(31)), `${btoa("a".repeat(32))}=`])("rejects a missing, malformed or shorter-than-32-byte admission pepper: %s", (pepper) => {
    expect(() => createDocumentAccessEnv({ ...valid, CONNECTOR_TOKEN_PEPPER: pepper })).toThrow();
  });

  it("accepts longer base64url pepper material and validates retained key and origin configuration", () => {
    const pepper = new Uint8Array(48).fill(255);
    expect(createDocumentAccessEnv({ ...valid, CONNECTOR_TOKEN_PEPPER: btoa(String.fromCharCode(...pepper)).replace(/\//g, "_") }).pepper).toEqual(pepper);
    expect(() => createDocumentAccessEnv({ ...valid, LINK_TOKEN_KEY_V1: "short" })).toThrow();
    expect(() => createDocumentAccessEnv({ ...valid, NEXT_PUBLIC_APP_URL: "https://payrlink.xyz/path" })).toThrow();
    expect(() => createDocumentAccessEnv({ ...valid, NEXT_PUBLIC_ARC_EXPLORER_URL: "http://explorer.test" })).toThrow();
  });
});

describe("document RPC origins", () => {
  it("allows a missing RPC without session, binding or caller-supplied origin configuration", () => {
    expect(createDocumentRpcOrigins({})).toEqual([]);
    expect(createDocumentRpcOrigins({ ARC_RPC_URL: undefined, host: "attacker.test", headers: { origin: "https://attacker.test" } })).toEqual([]);
  });

  it.each([
    ["https://rpc.example", "https://rpc.example"],
    ["https://RPC.example:8443/v1/PRIVATE_KEY?token=PRIVATE_QUERY#fragment", "https://rpc.example:8443"],
    ["http://localhost:3123/rpc", "http://localhost:3123"],
    ["http://127.0.0.1:3123/rpc", "http://127.0.0.1:3123"],
    ["http://[::1]:3123/rpc", "http://[::1]:3123"],
  ])("exposes only the configured safe origin for %s", (url, origin) => {
    expect(createDocumentRpcOrigins({ ARC_RPC_URL: url })).toEqual([origin]);
  });

  it.each([
    "", "not a URL", "/rpc", "http://rpc.example:3123", "http://localhost", "http://127.0.0.1", "http://[::1]",
    "http://localhost.attacker.test:3123", "https://user:pass@rpc.example/path", "https://user@rpc.example",
    "http://user:pass@localhost:3123", "file:///rpc", "wss://rpc.example",
  ])("rejects unsafe or malformed configured RPC URLs: %s", (url) => {
    expect(() => createDocumentRpcOrigins({ ARC_RPC_URL: url })).toThrow();
  });
});
