begin;

-- Historical workspace owner addresses remain authorization anchors for shipped RPCs.
create table public.privy_accounts (
  user_id text primary key check (user_id ~ '^did:privy:[a-zA-Z0-9_-]+$' and length(user_id) <= 200),
  wallet_id text not null unique check (length(wallet_id) between 1 and 200),
  wallet_address text not null unique check (wallet_address ~ '^0x[0-9a-f]{40}$'),
  workspace_id uuid unique references public.workspaces(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create table public.privy_link_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.privy_accounts(user_id),
  workspace_id uuid not null references public.workspaces(id),
  owner_wallet text not null check (owner_wallet ~ '^0x[0-9a-f]{40}$'),
  message text not null check (length(message) between 1 and 4096),
  expires_at timestamptz not null,
  consumed_at timestamptz
);
alter table public.privy_accounts enable row level security;
alter table public.privy_link_challenges enable row level security;
revoke all on public.privy_accounts, public.privy_link_challenges from public, anon, authenticated, service_role;

create function public.payr_privy_account_v1(p_user_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (select pg_catalog.jsonb_build_object(
    'wallet', pg_catalog.jsonb_build_object('id', a.wallet_id, 'address', a.wallet_address),
    'session', case when w.id is null then null else pg_catalog.jsonb_build_object(
      'workspaceId', w.id, 'ownerWallet', w.owner_wallet, 'privyUserId', a.user_id) end)
    from public.privy_accounts a left join public.workspaces w on w.id = a.workspace_id
    where a.user_id = p_user_id and a.revoked_at is null);
$$;

create function public.payr_privy_wallet_v1(p_user_id text, p_wallet_id text, p_address text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_account public.privy_accounts;
begin
  insert into public.privy_accounts(user_id, wallet_id, wallet_address)
    values (p_user_id, p_wallet_id, p_address) on conflict (user_id) do nothing;
  select * into strict v_account from public.privy_accounts where user_id = p_user_id for update;
  if v_account.wallet_id <> p_wallet_id or v_account.wallet_address <> p_address or v_account.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'IDENTITY_CONFLICT';
  end if;
  return public.payr_privy_account_v1(p_user_id);
exception when unique_violation then raise exception using errcode = 'P0001', message = 'IDENTITY_CONFLICT';
end;
$$;

create function public.payr_privy_create_workspace_v1(p_user_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_account public.privy_accounts; v_workspace_id uuid;
begin
  select * into v_account from public.privy_accounts where user_id = p_user_id and revoked_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_account.workspace_id is not null then return public.payr_privy_account_v1(p_user_id); end if;
  -- Never claim an existing workspace by an address collision. It requires a linking proof.
  insert into public.workspaces(id, owner_wallet) values (pg_catalog.gen_random_uuid(), v_account.wallet_address)
    returning id into v_workspace_id;
  insert into public.sender_profiles(id, workspace_id, payout_wallet)
    values (pg_catalog.gen_random_uuid(), v_workspace_id, v_account.wallet_address);
  update public.privy_accounts set workspace_id = v_workspace_id where user_id = p_user_id;
  insert into public.audit_events(id, workspace_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), v_workspace_id, 'auth.login', 'succeeded');
  return public.payr_privy_account_v1(p_user_id);
exception when unique_violation then raise exception using errcode = 'P0001', message = 'IDENTITY_CONFLICT';
end;
$$;

create function public.payr_privy_find_link_v1(p_user_id text, p_nonce_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (select pg_catalog.jsonb_build_object('id', n.id, 'userId', n.user_id,
    'workspaceId', n.workspace_id, 'ownerWallet', n.owner_wallet, 'message', n.message,
    'expiresAt', n.expires_at, 'consumed', n.consumed_at is not null)
    from public.privy_link_challenges n where n.id = p_nonce_id and n.user_id = p_user_id);
$$;

create function public.payr_privy_issue_link_v1(p_user_id text, p_owner_wallet text, p_origin text, p_chain_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_account public.privy_accounts; v_workspace public.workspaces; v_id uuid := pg_catalog.gen_random_uuid();
  v_expiry timestamptz := pg_catalog.clock_timestamp() + interval '5 minutes'; v_message text;
begin
  if p_origin is null or length(p_origin) > 512 or p_origin ~ '[[:cntrl:]]'
    or p_chain_id is null or p_chain_id <> 5042002 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  select * into v_account from public.privy_accounts where user_id = p_user_id and revoked_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  select * into v_workspace from public.workspaces where owner_wallet = p_owner_wallet;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_account.workspace_id is not null and v_account.workspace_id <> v_workspace.id then
    raise exception using errcode = 'P0001', message = 'IDENTITY_CONFLICT';
  end if;
  v_message := 'Link this existing PAYR workspace to your Privy identity.' || E'\n'
    || 'This grants workspace access. It does not move funds or change payout addresses.' || E'\n'
    || 'Purpose: payr-privy-link-v1' || E'\n' || 'URI: ' || p_origin || E'\n'
    || 'Chain ID: ' || p_chain_id::text || E'\n' || 'Privy User: ' || p_user_id || E'\n'
    || 'Workspace ID: ' || v_workspace.id::text || E'\n' || 'Owner Wallet: ' || p_owner_wallet || E'\n'
    || 'Nonce: ' || v_id::text || E'\n' || 'Expiration Time: ' || v_expiry::text;
  delete from public.privy_link_challenges where expires_at < pg_catalog.clock_timestamp();
  insert into public.privy_link_challenges(id, user_id, workspace_id, owner_wallet, message, expires_at)
    values(v_id, p_user_id, v_workspace.id, p_owner_wallet, v_message, v_expiry);
  return public.payr_privy_find_link_v1(p_user_id, v_id);
end;
$$;

create function public.payr_privy_complete_link_v1(p_user_id text, p_nonce_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_account public.privy_accounts; v_nonce public.privy_link_challenges;
begin
  select * into v_account from public.privy_accounts where user_id = p_user_id and revoked_at is null for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  select * into v_nonce from public.privy_link_challenges where id = p_nonce_id and user_id = p_user_id for update;
  if not found or v_nonce.consumed_at is not null or v_nonce.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
  end if;
  if (v_account.workspace_id is not null and v_account.workspace_id <> v_nonce.workspace_id)
    or not exists(select 1 from public.workspaces where id = v_nonce.workspace_id and owner_wallet = v_nonce.owner_wallet) then
    raise exception using errcode = 'P0001', message = 'IDENTITY_CONFLICT';
  end if;
  update public.privy_accounts set workspace_id = v_nonce.workspace_id where user_id = p_user_id;
  update public.privy_link_challenges set consumed_at = pg_catalog.clock_timestamp() where id = p_nonce_id
    and expires_at > pg_catalog.clock_timestamp();
  if not found then raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED'; end if;
  insert into public.audit_events(id, workspace_id, action, outcome)
    values(pg_catalog.gen_random_uuid(), v_nonce.workspace_id, 'auth.login', 'succeeded');
  return public.payr_privy_account_v1(p_user_id);
exception when unique_violation then raise exception using errcode = 'P0001', message = 'IDENTITY_CONFLICT';
end;
$$;

-- Discovery is a new, explicit permission. No existing credential is broadened.
create or replace function public.payr_connector_scopes_valid_v1(p_scopes text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when p_scopes is not null and pg_catalog.array_ndims(p_scopes) = 1
    and pg_catalog.array_lower(p_scopes, 1) = 1 and pg_catalog.cardinality(p_scopes) between 1 and 7
    then pg_catalog.array_position(p_scopes, null) is null and p_scopes @> array['invoice:status']::text[]
    and p_scopes <@ array['invoice:draft','invoice:publish','invoice:status','invoice:void','sender:read','sender:write','wallet:read']::text[]
    and pg_catalog.cardinality(p_scopes) = (select count(distinct s) from pg_catalog.unnest(p_scopes) as s)
    else false end;
$$;

alter table public.audit_events drop constraint audit_events_bounded_codes;
alter table public.audit_events add constraint audit_events_bounded_codes check (
  action in ('auth.login','auth.payout_nonce','profile.save','profile.payout_change','client.save',
    'connector.create','connector.revoke','connector.admit','invoice:draft','invoice:publish','invoice:status','invoice:void',
    'settlement.recorded','receipt.generate','receipt.deliver','sender:read','sender:write','wallet:read')
  and outcome in ('allowed','denied','rate_limited','succeeded','failed','retry_wait','manual_review')
);

create or replace function public.payr_gateway_operations_valid_v1(p_operations text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when p_operations is not null and pg_catalog.array_ndims(p_operations) = 1
    and pg_catalog.array_lower(p_operations, 1) = 1 and pg_catalog.cardinality(p_operations) between 1 and 12 then
    pg_catalog.array_position(p_operations, null) is null
    and p_operations <@ array['create_account_challenge','register_account','get_account','revoke_current_credential',
      'get_sender_profile','save_sender_profile','create_invoice_draft','list_invoices','get_invoice','publish_invoice','get_invoice_status','get_account_context']::text[]
    and pg_catalog.cardinality(p_operations) = (select count(distinct s) from pg_catalog.unnest(p_operations) s)
    else false end;
$$;
create or replace function public.payr_agent_scopes_valid_v1(p_scopes text[])
returns boolean language sql immutable set search_path = '' as $$
  select public.payr_connector_scopes_valid_v1(p_scopes) is true
    and p_scopes <@ array['invoice:draft','invoice:publish','invoice:status','sender:read','sender:write','wallet:read']::text[];
$$;

create function public.payr_privy_gateway_credential_v1(p_user_id text, p_workspace_id uuid, p_service_id text,
  p_id uuid, p_token_hash text, p_expires_at timestamptz, p_scopes text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_owner text; v_result jsonb;
begin
  select w.owner_wallet into v_owner from public.privy_accounts a join public.workspaces w on w.id = a.workspace_id
    where a.user_id = p_user_id and a.workspace_id = p_workspace_id and a.revoked_at is null for share of a;
  if not found then raise exception using errcode = 'P0001', message = 'FORBIDDEN'; end if;
  if not exists(select 1 from public.gateway_service_keys where service_id = p_service_id and revoked_at is null)
    then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if public.payr_agent_scopes_valid_v1(p_scopes) is not true or p_expires_at > pg_catalog.clock_timestamp() + interval '7 days'
    then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  v_result := public.payr_create_connector_v2(p_workspace_id, v_owner, p_id, p_token_hash, p_expires_at, p_scopes);
  insert into public.agent_account_credentials(connector_token_id, service_id) values(p_id, p_service_id);
  return v_result;
end;
$$;
revoke all on function public.payr_privy_gateway_credential_v1(text,uuid,text,uuid,text,timestamptz,text[]) from public, anon, authenticated, service_role;
grant execute on function public.payr_privy_gateway_credential_v1(text,uuid,text,uuid,text,timestamptz,text[]) to service_role;

create function public.payr_wallet_context_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_wallet text; v_payout text;
begin
  perform public.payr_draft_scope_v1(p_workspace_id, p_owner_wallet, p_connector_id, 'wallet:read');
  select wallet_address into v_wallet from public.privy_accounts where workspace_id = p_workspace_id and revoked_at is null;
  select payout_wallet into v_payout from public.sender_profiles where workspace_id = p_workspace_id;
  return pg_catalog.jsonb_build_object('workspaceId', p_workspace_id,
    'businessWallet', case when v_wallet is null then null else pg_catalog.jsonb_build_object(
      'address', v_wallet, 'network', 'arc-testnet', 'chainId', 5042002, 'agentControl', false) end,
    'invoicePayoutAddress', v_payout);
end;
$$;

revoke all on function public.payr_privy_account_v1(text), public.payr_privy_wallet_v1(text,text,text),
  public.payr_privy_create_workspace_v1(text), public.payr_privy_find_link_v1(text,uuid),
  public.payr_privy_issue_link_v1(text,text,text,bigint), public.payr_privy_complete_link_v1(text,uuid),
  public.payr_wallet_context_v1(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.payr_privy_account_v1(text), public.payr_privy_wallet_v1(text,text,text),
  public.payr_privy_create_workspace_v1(text), public.payr_privy_find_link_v1(text,uuid),
  public.payr_privy_issue_link_v1(text,text,text,bigint), public.payr_privy_complete_link_v1(text,uuid),
  public.payr_wallet_context_v1(uuid,text,uuid) to service_role;

commit;
