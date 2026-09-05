import { z } from "zod";

const isAllowedAppUrl = (value: string) => {
  const url = new URL(value);

  return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost" && url.port !== "");
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
  NEXT_PUBLIC_APP_URL: z.string().url().refine(isAllowedAppUrl, "production app URL must use HTTPS"),
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
