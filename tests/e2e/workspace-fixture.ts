import { execFileSync } from "node:child_process";

export function seedBrowserWorkspace(identity: { workspaceId: string; ownerWallet: string }): void {
  const database = new URL(process.env.SUPABASE_DB_URL ?? "http://invalid");
  if (database.protocol !== "postgresql:" || database.hostname !== "127.0.0.1" || database.port !== "58322"
    || database.username !== "postgres" || database.pathname !== "/postgres"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(identity.workspaceId)
    || !/^0x[0-9a-f]{40}$/.test(identity.ownerWallet)) {
    throw new Error("Browser fixtures require the isolated local Payr database and valid fixture identities");
  }
  execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--quiet", "--set=ON_ERROR_STOP=1"], {
    stdio: ["pipe", "pipe", "pipe"],
    input: `begin;
      insert into public.workspaces (id, owner_wallet) values ('${identity.workspaceId}', '${identity.ownerWallet}') on conflict (id) do nothing;
      insert into public.sender_profiles (id, workspace_id, payout_wallet) values ('${identity.workspaceId}', '${identity.workspaceId}', '${identity.ownerWallet}') on conflict (workspace_id) do nothing;
      commit;`,
  });
}
