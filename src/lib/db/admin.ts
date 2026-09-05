import { createClient } from "@supabase/supabase-js";

type SupabaseAdminEnvironment = Readonly<{
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}>;

export function createSupabaseAdminClient(environment: SupabaseAdminEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
}) {
  const supabaseUrl = environment.SUPABASE_URL;
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl?.trim() || !serviceRoleKey?.trim()) {
    throw new Error("Supabase admin client requires runtime URL and service-role configuration");
  }

  try {
    const url = new URL(supabaseUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Invalid URL");
    }
  } catch {
    throw new Error("Supabase admin client requires a valid runtime URL");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
