import { z } from "zod";
import type { IdentityConfig } from "../lib/identity/contracts";
import type { PublicationConfig, PublicationLinkConfig } from "../lib/invoices/publication-contracts";

const isAllowedAppUrl = (value: string) => {
  const url = new URL(value);

  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port !== "";
  return (url.protocol === "https:" || localHttp) && !url.username && !url.password
    && url.pathname === "/" && !url.search && !url.hash;
};

const isAtLeast32ByteEncodedKey = (value: string) => {
  const match = /^([A-Za-z0-9+/_-]+)(={0,2})$/.exec(value);
  if (!match) {
    return false;
  }

  const unpadded = match[1];
  const suppliedPadding = match[2].length;
  const remainder = unpadded.length % 4;
  if (remainder === 1 || (suppliedPadding > 0 && suppliedPadding !== (4 - remainder) % 4)) {
    return false;
  }

  const normalized = unpadded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - remainder) % 4);

  try {
    return atob(padded).length >= 32;
  } catch {
    return false;
  }
};

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().refine(isAllowedAppUrl, "app URL must be an HTTPS origin or explicit local HTTP origin")
    .transform((value) => new URL(value).origin),
});

const serverEnvSchema = z.object({
  ARC_RPC_URL: z.string().url(),
  ARC_CHAIN_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().min(1),
  LINK_ACTIVE_KEY_VERSION: z.literal("1"),
  LINK_TOKEN_KEY_V1: z.string().refine(isAtLeast32ByteEncodedKey, "link token key must encode at least 32 bytes"),
  CONNECTOR_TOKEN_PEPPER: z.string().min(1),
  CRON_SECRET: z.string().min(1),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const parsePublicEnv = (value: unknown): PublicEnv => publicEnvSchema.parse(value);

/**
 * Server callers must invoke this factory at runtime; configuration is never
 * parsed as a module side effect, so builds do not require deployment secrets.
 */
export const createServerEnv = (value: unknown = process.env): ServerEnv => serverEnvSchema.parse(value);

const identityEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: publicEnvSchema.shape.NEXT_PUBLIC_APP_URL,
  ARC_CHAIN_ID: z.string().regex(/^[1-9][0-9]*$/).refine((value) => Number.isSafeInteger(Number(value))),
  SESSION_ENCRYPTION_KEY: z.string().refine(isAtLeast32ByteEncodedKey, "session key must encode 32 bytes")
    .refine((value) => {
      try { return atob(value.replace(/-/g, "+").replace(/_/g, "/")).length === 32; } catch { return false; }
    }, "session key must encode exactly 32 bytes"),
  CONNECTOR_TOKEN_PEPPER: z.string().refine(isAtLeast32ByteEncodedKey, "connector pepper must encode at least 32 bytes"),
});

export function createIdentityEnv(value: unknown = process.env): IdentityConfig {
  const parsed = identityEnvSchema.parse(value);
  const decode = (key: string) => Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
  return {
    appOrigin: parsed.NEXT_PUBLIC_APP_URL,
    chainId: Number(parsed.ARC_CHAIN_ID),
    sessionKey: decode(parsed.SESSION_ENCRYPTION_KEY),
    connectorPepper: decode(parsed.CONNECTOR_TOKEN_PEPPER),
  };
}

export function createPublicationLinkEnv(value: unknown = process.env): PublicationLinkConfig {
  const parsed = z.object({
    NEXT_PUBLIC_APP_URL: publicEnvSchema.shape.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_ARC_EXPLORER_URL: z.string().optional(),
  }).parse(value);
  const keys = new Map<number, Uint8Array>();
  for (const [name, key] of Object.entries(value as Record<string, unknown>)) {
    const match = /^LINK_TOKEN_KEY_V([1-9][0-9]*)$/.exec(name);
    if (!match || key === undefined || key === "") continue;
    const version = Number(match[1]);
    if (!Number.isSafeInteger(version) || version > 2147483647 || typeof key !== "string" || !isAtLeast32ByteEncodedKey(key)) {
      throw new Error("Invalid publication link key configuration");
    }
    keys.set(version, Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0)));
  }
  const explorer = new URL(parsed.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app");
  if (explorer.protocol !== "https:" || explorer.username || explorer.password || explorer.pathname !== "/" || explorer.search || explorer.hash) {
    throw new Error("Invalid explorer origin");
  }
  return { appOrigin: parsed.NEXT_PUBLIC_APP_URL, explorerOrigin: explorer.origin, keys };
}

export function createPublicationEnv(value: unknown = process.env): PublicationConfig {
  const links = createPublicationLinkEnv(value);
  const parsed = z.object({
    LINK_ACTIVE_KEY_VERSION: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().max(2147483647)),
    ARC_CHAIN_ID: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().max(Number.MAX_SAFE_INTEGER)),
    NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/)
      .refine((address) => address.toLowerCase() !== `0x${"0".repeat(40)}`).transform((address) => address.toLowerCase() as `0x${string}`),
  }).parse(value);
  if (!links.keys.has(parsed.LINK_ACTIVE_KEY_VERSION)) throw new Error("Active publication link key is unavailable");
  return { ...links, activeKeyVersion: parsed.LINK_ACTIVE_KEY_VERSION, chainId: parsed.ARC_CHAIN_ID, contractAddress: parsed.NEXT_PUBLIC_PAYR_CONTRACT_ADDRESS };
}
