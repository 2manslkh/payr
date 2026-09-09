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

export function seedBrowserReceivables(identity: { workspaceId: string; ownerWallet: string }): void {
  seedBrowserWorkspace(identity);
  execFileSync("docker", ["exec", "-i", "supabase_db_payr", "psql", "-U", "postgres", "-d", "postgres", "--no-psqlrc", "--quiet", "--set=ON_ERROR_STOP=1"], {
    stdio: ["pipe", "pipe", "pipe"],
    input: `with invoices as (
      insert into public.invoices (id,workspace_id,client_id,commercial_state,invoice_number,published_at,payable_until,expired_at)
        select gen_random_uuid(),'${identity.workspaceId}'::uuid,c.id,'published'::public.commercial_state,'INV-2026-000001',now() - interval '40 days',now() + interval '30 days',null
          from public.clients c where c.workspace_id = '${identity.workspaceId}'
        union all
        select gen_random_uuid(),'${identity.workspaceId}'::uuid,c.id,'expired'::public.commercial_state,'INV-2026-000002',now() - interval '40 days',now() - interval '1 day',now()
          from public.clients c where c.workspace_id = '${identity.workspaceId}'
        returning id,invoice_number,payable_until
    ) insert into public.invoice_versions (id,workspace_id,invoice_id,version_number,client_snapshot,issue_date,due_date,
        payable_until,payable_until_second,amount_decimal,amount_atomic)
      select gen_random_uuid(),'${identity.workspaceId}',id,1,
        case when invoice_number = 'INV-2026-000001' then '{"businessName":"North Studio"}'::jsonb else '{"businessName":"Canopy Labs"}'::jsonb end,
        current_date - 40,current_date - 10,date_trunc('second',payable_until),extract(epoch from date_trunc('second',payable_until))::bigint,
        case when invoice_number = 'INV-2026-000001' then '1250' else '680' end,
        case when invoice_number = 'INV-2026-000001' then 1250000000000000000000 else 680000000000000000000 end
      from invoices;`,
  });
}
