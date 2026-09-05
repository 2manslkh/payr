import { z } from "zod";

const isAllowedAppUrl = (value: string) => {
  const url = new URL(value);

  return url.protocol === "https:" || (url.protocol === "http:" && url.hostname === "localhost" && url.port !== "");
};

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().refine(isAllowedAppUrl, "production app URL must use HTTPS"),
});

const serverEnvSchema = z.object({
  ARC_RPC_URL: z.string().url(),
  ARC_CHAIN_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_ENCRYPTION_KEY: z.string().min(1),
  NONCE_HASH_PEPPER: z.string().min(1),
  LINK_TOKEN_PEPPER: z.string().min(1),
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
