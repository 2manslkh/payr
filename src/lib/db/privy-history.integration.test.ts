import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { fixtureDatabaseContainer } from "../../../scripts/local-test-config.mjs";

function fixture(sql: string): string[] {
  return execFileSync("docker", ["exec", "-i", fixtureDatabaseContainer(), "psql", "-U", "postgres", "-d", "postgres",
    "--no-psqlrc", "--quiet", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], {
    input: `begin; set local statement_timeout = '10s'; ${sql} rollback;`,
    encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 15_000,
  }).trim().split("\n").filter(Boolean);
}

it("preserves the exact hosted migration source, including its transaction envelope", () => {
  const source = readFileSync("supabase/migrations/202609090003_privy_identity.sql");
  expect(createHash("sha256").update(source).digest("hex"))
    .toBe("c864606e44a48cfff971553452af908d4fcb0de5ad95ea91ff621157e42afa27");
});

it("keeps all eight new RPCs service-only with hardened definer search paths", () => {
  const [result] = fixture(`select jsonb_build_object('count',count(*),'safe',bool_and(
    p.prosecdef and 'search_path=""' = any(p.proconfig)
    and has_function_privilege('service_role',p.oid,'execute')
    and not has_function_privilege('anon',p.oid,'execute')
    and not has_function_privilege('authenticated',p.oid,'execute')
    and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee = 0 and a.privilege_type = 'EXECUTE')))
    from pg_proc p where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'payr_privy_%' or p.proname = 'payr_wallet_context_v1');`);
  expect(JSON.parse(result)).toEqual({ count: 8, safe: true });
});

it("denies direct mapping and challenge access to all application roles", () => {
  const [result] = fixture(`select bool_and(c.relrowsecurity
    and not exists(select 1 from pg_policy where polrelid = c.oid)
    and not has_table_privilege(r.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    from pg_class c cross join (values ('anon'),('authenticated'),('service_role')) r(name)
    where c.oid in ('public.privy_accounts'::regclass,'public.privy_link_challenges'::regclass);`);
  expect(result).toBe("t");
});

it("retains legacy credentials without silently granting wallet discovery", () => {
  const [result] = fixture(`do $$ declare w uuid := gen_random_uuid(); t uuid := gen_random_uuid(); c jsonb;
    owner text := '0x1111111111111111111111111111111111111111';
    begin
      insert into public.workspaces(id,owner_wallet) values(w,owner);
      insert into public.sender_profiles(id,workspace_id,payout_wallet) values(gen_random_uuid(),w,owner);
      c := public.payr_create_connector_v1(w,owner,t,repeat('a',64),clock_timestamp()+interval '1 day');
      if (select scopes @> array['wallet:read'] from public.connector_tokens where id=t)
        then raise exception 'legacy scope broadened'; end if;
      begin
        perform public.payr_wallet_context_v1(w,null,t);
        raise exception 'wallet discovery allowed';
      exception when raise_exception then if sqlerrm <> 'NOT_FOUND' then raise; end if; end;
      if public.payr_wallet_context_v1(w,owner,null)->'businessWallet' <> 'null'::jsonb
        then raise exception 'legacy identity inferred'; end if;
      if not exists(select 1 from public.workspaces where id=w and owner_wallet=owner)
        or not exists(select 1 from public.sender_profiles where workspace_id=w and payout_wallet=owner)
        then raise exception 'legacy authority changed'; end if;
    end $$; select true;`);
  expect(result).toBe("t");
});

it("extends validators only by explicit discovery permissions and retains strict input checks", () => {
  const [result] = fixture(`select public.payr_connector_scopes_valid_v1(array['invoice:status','wallet:read'])
    and public.payr_agent_scopes_valid_v1(array['invoice:status','sender:write'])
    and public.payr_gateway_operations_valid_v1(array['get_account_context'])
    and not public.payr_connector_scopes_valid_v1(array['wallet:read'])
    and not public.payr_connector_scopes_valid_v1(array['invoice:status','wallet:read','wallet:read'])
    and not public.payr_connector_scopes_valid_v1(array['invoice:status',null])
    and not public.payr_gateway_operations_valid_v1(array['sign_transaction'])
    and not public.payr_agent_scopes_valid_v1(array['invoice:status','invoice:void']);`);
  expect(result).toBe("t");
});
