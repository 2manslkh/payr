begin;

create function public.payr_gateway_operations_valid_v1(p_operations text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when p_operations is not null and pg_catalog.array_ndims(p_operations) = 1
    and pg_catalog.array_lower(p_operations, 1) = 1 and pg_catalog.cardinality(p_operations) between 1 and 11 then
    pg_catalog.array_position(p_operations, null) is null
    and p_operations <@ array['create_account_challenge','register_account','get_account','revoke_current_credential',
      'get_sender_profile','save_sender_profile','create_invoice_draft','list_invoices','get_invoice','publish_invoice','get_invoice_status']::text[]
    and pg_catalog.cardinality(p_operations) = (select count(distinct s) from pg_catalog.unnest(p_operations) s)
    else false end;
$$;

create function public.payr_agent_scopes_valid_v1(p_scopes text[])
returns boolean language sql immutable set search_path = '' as $$
  select public.payr_connector_scopes_valid_v1(p_scopes) is true
    and p_scopes <@ array['invoice:draft','invoice:publish','invoice:status','sender:read','sender:write']::text[];
$$;

create table public.gateway_service_keys (
  id uuid primary key,
  service_id text not null check (service_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  allowed_operations text[] not null check (public.payr_gateway_operations_valid_v1(allowed_operations) is true),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  check ((revoked_at is null or (pg_catalog.isfinite(revoked_at) and revoked_at >= created_at))
    and (last_used_at is null or (pg_catalog.isfinite(last_used_at) and last_used_at >= created_at)))
);
create index gateway_service_keys_service on public.gateway_service_keys(service_id) where revoked_at is null;

create table public.agent_registration_challenges (
  id uuid primary key,
  purpose text not null default 'payr-agent-registration-v1' check (purpose = 'payr-agent-registration-v1'),
  service_id text not null check (service_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  wallet text not null check (wallet ~ '^0x[0-9a-f]{40}$'),
  challenge text not null unique check (challenge ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'),
  domain text not null check (pg_catalog.length(domain) between 1 and 253 and domain ~ '^[a-z0-9.\[\]:-]+$'),
  uri text not null check (uri = 'https://' || domain or
    (domain ~ '^(localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}$' and uri = 'http://' || domain)),
  chain_id bigint not null check (chain_id between 1 and 9007199254740991),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  scopes text[] not null check (public.payr_agent_scopes_valid_v1(scopes) is true),
  expires_in_days integer not null check (expires_in_days between 1 and 7),
  check (pg_catalog.isfinite(issued_at) and pg_catalog.isfinite(expires_at)
    and issued_at = pg_catalog.date_trunc('milliseconds', issued_at)
    and expires_at = pg_catalog.date_trunc('milliseconds', expires_at)
    and expires_at > issued_at and expires_at - issued_at <= interval '300 seconds'
    and (consumed_at is null or (consumed_at >= issued_at and consumed_at < expires_at)))
);
create index agent_registration_challenges_expiry on public.agent_registration_challenges(expires_at);
-- The existing generic trigger freezes all signed columns and allows only one timely consumption.
create trigger agent_registration_challenges_immutable before update or delete on public.agent_registration_challenges
  for each row execute function public.payr_identity_protect_nonce_v1();

create table public.agent_account_credentials (
  connector_token_id uuid primary key references public.connector_tokens(id),
  service_id text not null check (service_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index agent_account_credentials_service on public.agent_account_credentials(service_id);

create table public.gateway_rate_limits (
  purpose text not null check (purpose in ('service','ip','challenge_service','challenge_ip','challenge_wallet')),
  subject text not null,
  window_started_at timestamptz not null check (pg_catalog.isfinite(window_started_at)
    and window_started_at = pg_catalog.date_trunc('minute', window_started_at)),
  request_count integer not null check (request_count between 1 and case purpose
    when 'service' then 600 when 'ip' then 1200 when 'challenge_service' then 60 when 'challenge_ip' then 120 else 5 end),
  primary key (purpose, subject, window_started_at),
  check (case when purpose in ('service','challenge_service') then subject ~ '^[a-z][a-z0-9_-]{0,63}$'
    else subject ~ '^[0-9a-f]{64}$' end)
);
create index gateway_rate_limits_window on public.gateway_rate_limits(window_started_at);

alter table public.gateway_service_keys enable row level security;
alter table public.gateway_service_keys force row level security;
alter table public.agent_registration_challenges enable row level security;
alter table public.agent_registration_challenges force row level security;
alter table public.agent_account_credentials enable row level security;
alter table public.agent_account_credentials force row level security;
alter table public.gateway_rate_limits enable row level security;
alter table public.gateway_rate_limits force row level security;
revoke all on table public.gateway_service_keys, public.agent_registration_challenges,
  public.agent_account_credentials, public.gateway_rate_limits from public, anon, authenticated, service_role;
grant select on table public.gateway_service_keys, public.agent_registration_challenges,
  public.agent_account_credentials, public.gateway_rate_limits to service_role;

-- Administrative RPCs only: no application/user endpoint should expose these. Hash in trusted TS,
-- using the domain-separated gateway HMAC over the full pgw_<uuid>.<secret>, never SQL crypto.
create function public.payr_admin_provision_gateway_key_v1(p_id uuid, p_service_id text, p_token_hash text, p_allowed_operations text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_id is null or (p_service_id ~ '^[a-z][a-z0-9_-]{0,63}$') is not true
    or (p_token_hash ~ '^[0-9a-f]{64}$') is not true
    or public.payr_gateway_operations_valid_v1(p_allowed_operations) is not true then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  insert into public.gateway_service_keys(id, service_id, token_hash, allowed_operations)
    values (p_id, p_service_id, p_token_hash, p_allowed_operations);
  return pg_catalog.jsonb_build_object('id', p_id, 'serviceId', p_service_id, 'allowedOperations', p_allowed_operations);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'GATEWAY_KEY_CONFLICT';
end;
$$;

create function public.payr_admin_revoke_gateway_key_v1(p_id uuid, p_service_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key public.gateway_service_keys;
begin
  select k.* into v_key from public.gateway_service_keys k
    where k.id = p_id and k.service_id = p_service_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  update public.gateway_service_keys set revoked_at = coalesce(revoked_at, pg_catalog.clock_timestamp()) where id = p_id;
  return pg_catalog.jsonb_build_object('id', p_id, 'revoked', true);
end;
$$;

create function public.payr_gateway_quota_v1(p_service_id text, p_ip_hash text, p_wallet_hash text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz; v_window timestamptz; v_bucket record; v_count integer;
begin
  if (p_service_id ~ '^[a-z][a-z0-9_-]{0,63}$') is not true or (p_ip_hash ~ '^[0-9a-f]{64}$') is not true
    or (p_wallet_hash is not null and p_wallet_hash !~ '^[0-9a-f]{64}$') then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- One lock orders all service/IP/wallet buckets and bounded cleanup. Choose time after waiting.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payr:gateway-quota:v1', 0));
  delete from public.gateway_rate_limits where window_started_at < pg_catalog.clock_timestamp() - interval '10 minutes';
  v_now := pg_catalog.clock_timestamp();
  v_window := pg_catalog.date_trunc('minute', v_now);
  for v_bucket in select * from (values
    (case when p_wallet_hash is null then 'service' else 'challenge_service' end, p_service_id, case when p_wallet_hash is null then 600 else 60 end),
    (case when p_wallet_hash is null then 'ip' else 'challenge_ip' end, p_ip_hash, case when p_wallet_hash is null then 1200 else 120 end),
    ('challenge_wallet', p_wallet_hash, 5)) as b(purpose, subject, quota) where subject is not null loop
    select r.request_count into v_count from public.gateway_rate_limits r
      where r.purpose = v_bucket.purpose and r.subject = v_bucket.subject and r.window_started_at = v_window;
    if coalesce(v_count, 0) >= v_bucket.quota then
      raise exception using errcode = 'P0001', message = 'RATE_LIMITED', detail = pg_catalog.jsonb_build_object('retryAfterSeconds',
        greatest(1, least(60, pg_catalog.ceil(extract(epoch from (v_window + interval '1 minute' - v_now)))::integer)))::text;
    end if;
    insert into public.gateway_rate_limits(purpose, subject, window_started_at, request_count)
      values (v_bucket.purpose, v_bucket.subject, v_window, 1)
      on conflict (purpose, subject, window_started_at) do update set request_count = public.gateway_rate_limits.request_count + 1;
  end loop;
end;
$$;

create function public.payr_admit_gateway_service_v1(p_id uuid, p_token_hash text, p_operation text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_key public.gateway_service_keys;
begin
  select k.* into v_key from public.gateway_service_keys k where k.id = p_id for update;
  if not found or v_key.token_hash is distinct from p_token_hash or v_key.revoked_at is not null then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  if (p_operation = any(v_key.allowed_operations)) is not true then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform public.payr_gateway_quota_v1(v_key.service_id, p_ip_hash);
  update public.gateway_service_keys set last_used_at = pg_catalog.clock_timestamp() where id = p_id;
  return pg_catalog.jsonb_build_object('serviceId', v_key.service_id);
end;
$$;

create function public.payr_agent_challenge_dto_v1(p_row public.agent_registration_challenges)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p_row.id, 'serviceId', p_row.service_id, 'wallet', p_row.wallet,
    'challenge', p_row.challenge, 'domain', p_row.domain, 'uri', p_row.uri, 'chainId', p_row.chain_id,
    'issuedAt', pg_catalog.to_char(p_row.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', pg_catalog.to_char(p_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'consumedAt', p_row.consumed_at, 'scopes', p_row.scopes, 'expiresInDays', p_row.expires_in_days);
$$;

create function public.payr_issue_agent_challenge_v1(p_challenge jsonb, p_wallet_hash text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.agent_registration_challenges; v_key text; v_now timestamptz;
begin
  if not public.payr_identity_object_v1(p_challenge, array['id','serviceId','wallet','challenge','domain','uri','chainId',
    'issuedAt','expiresAt','consumedAt','scopes','expiresInDays']) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  foreach v_key in array array['id','serviceId','wallet','challenge','domain','uri','issuedAt','expiresAt'] loop
    if pg_catalog.jsonb_typeof(p_challenge -> v_key) <> 'string' then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  if (p_challenge ->> 'id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or pg_catalog.jsonb_typeof(p_challenge -> 'chainId') <> 'number' or (p_challenge ->> 'chainId') !~ '^[1-9][0-9]{0,15}$'
    or pg_catalog.jsonb_typeof(p_challenge -> 'expiresInDays') <> 'number' or (p_challenge ->> 'expiresInDays') !~ '^[1-7]$'
    or p_challenge -> 'consumedAt' <> 'null'::jsonb or pg_catalog.jsonb_typeof(p_challenge -> 'scopes') <> 'array'
    or (p_wallet_hash ~ '^[0-9a-f]{64}$') is not true
    or (p_challenge ->> 'issuedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or (p_challenge ->> 'expiresAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  v_row.id := (p_challenge ->> 'id')::uuid;
  v_row.service_id := p_challenge ->> 'serviceId';
  v_row.wallet := p_challenge ->> 'wallet';
  v_row.challenge := p_challenge ->> 'challenge';
  v_row.domain := p_challenge ->> 'domain';
  v_row.uri := p_challenge ->> 'uri';
  v_row.chain_id := (p_challenge ->> 'chainId')::bigint;
  v_row.issued_at := (p_challenge ->> 'issuedAt')::timestamptz;
  v_row.expires_at := (p_challenge ->> 'expiresAt')::timestamptz;
  v_row.scopes := array(select pg_catalog.jsonb_array_elements_text(p_challenge -> 'scopes'));
  v_row.expires_in_days := (p_challenge ->> 'expiresInDays')::integer;
  perform public.payr_gateway_quota_v1(v_row.service_id, p_ip_hash, p_wallet_hash);
  delete from public.agent_registration_challenges where expires_at <= pg_catalog.clock_timestamp();
  v_now := pg_catalog.clock_timestamp();
  if v_row.issued_at > v_now or v_row.expires_at <= v_now
    or pg_catalog.to_char(v_row.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_challenge ->> 'issuedAt'
    or pg_catalog.to_char(v_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_challenge ->> 'expiresAt' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  insert into public.agent_registration_challenges(id, service_id, wallet, challenge, domain, uri, chain_id,
    issued_at, expires_at, scopes, expires_in_days) values (v_row.id, v_row.service_id, v_row.wallet, v_row.challenge,
    v_row.domain, v_row.uri, v_row.chain_id, v_row.issued_at, v_row.expires_at, v_row.scopes, v_row.expires_in_days);
  return pg_catalog.jsonb_build_object('issued', true);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or check_violation or not_null_violation then
  raise exception using errcode = '22023', message = 'INVALID_INPUT';
when unique_violation then
  raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
end;
$$;

create function public.payr_find_agent_challenge_v1(p_id uuid, p_service_id text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select public.payr_agent_challenge_dto_v1(c) from public.agent_registration_challenges c
    where c.id = p_id and c.service_id = p_service_id), 'null'::jsonb);
$$;

create function public.payr_agent_account_dto_v1(p_token public.connector_tokens)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('workspaceId', w.id, 'ownerWallet', w.owner_wallet,
    'credential', public.payr_identity_connector_dto_v1(p_token), 'senderSetupRequired',
    s.id is null or s.business_name is null or s.billing_address is null or s.contact_name is null
      or s.contact_email is null or s.payout_wallet is null or s.invoice_prefix is null or s.default_terms is null)
  from public.workspaces w left join public.sender_profiles s on s.workspace_id = w.id where w.id = p_token.workspace_id;
$$;

create function public.payr_complete_agent_registration_v1(p_challenge_id uuid, p_service_id text,
  p_verified_wallet text, p_connector_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_challenge public.agent_registration_challenges; v_workspace public.workspaces; v_token public.connector_tokens; v_now timestamptz;
begin
  -- Only trusted TS may supply this wallet, after verifying the complete signed registration message.
  -- p_token_hash is the existing connector HMAC over FULL pac_<uuid>.<secret>; stripped MCP tokens cannot match it.
  select c.* into v_challenge from public.agent_registration_challenges c where c.id = p_challenge_id for update;
  if not found or v_challenge.service_id is distinct from p_service_id or v_challenge.wallet is distinct from p_verified_wallet
    or v_challenge.consumed_at is not null or v_challenge.expires_at <= pg_catalog.clock_timestamp()
    or v_challenge.issued_at > pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
  end if;
  insert into public.workspaces(id, owner_wallet) values (pg_catalog.gen_random_uuid(), p_verified_wallet)
    on conflict (owner_wallet) do nothing;
  select w.* into strict v_workspace from public.workspaces w where w.owner_wallet = p_verified_wallet for no key update;
  -- Existing profiles, including payout, are deliberately never updated by registration.
  insert into public.sender_profiles(id, workspace_id, payout_wallet)
    values (pg_catalog.gen_random_uuid(), v_workspace.id, p_verified_wallet) on conflict (workspace_id) do nothing;
  v_now := pg_catalog.clock_timestamp();
  if v_challenge.expires_at <= v_now or v_challenge.issued_at > v_now then
    raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
  end if;
  perform public.payr_create_connector_v2(v_workspace.id, p_verified_wallet, p_connector_id, p_token_hash,
    v_now + v_challenge.expires_in_days * interval '24 hours', v_challenge.scopes);
  insert into public.agent_account_credentials(connector_token_id, service_id) values (p_connector_id, p_service_id);
  -- Mint/mapping may wait on unique constraints. Recheck the clock after every possible lock wait.
  v_now := pg_catalog.clock_timestamp();
  update public.agent_registration_challenges set consumed_at = v_now
    where id = p_challenge_id and consumed_at is null and issued_at <= v_now and expires_at > v_now;
  if not found then raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED'; end if;
  select t.* into strict v_token from public.connector_tokens t where t.id = p_connector_id;
  return public.payr_agent_account_dto_v1(v_token);
end;
$$;

create function public.payr_admit_agent_account_v1(p_service_id text, p_id uuid, p_token_hash text, p_action text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token public.connector_tokens; v_admission jsonb;
begin
  if (p_ip_hash ~ '^[0-9a-f]{64}$') is not true then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  select t.* into v_token from public.connector_tokens t join public.agent_account_credentials m on m.connector_token_id = t.id
    where t.id = p_id and m.service_id = p_service_id for update of t;
  if not found or v_token.token_hash is distinct from p_token_hash then
    return pg_catalog.jsonb_build_object('outcome', 'denied', 'code', 'UNAUTHORIZED');
  end if;
  -- Source IP is metered only by gateway admission. Use the account's existing HMAC as its
  -- legacy IP bucket so a proxy cannot merge all accounts or rotate forwarded IPs to evade quotas.
  -- Invalid account scopes must also reach the legacy denial audit, never its allowed path.
  v_admission := public.payr_admit_connector_v1(p_id, p_token_hash, v_token.token_hash,
    case when public.payr_agent_scopes_valid_v1(v_token.scopes) is true then p_action else null end);
  if v_admission ->> 'outcome' = 'rate_limited' then
    return v_admission;
  elsif v_admission ->> 'outcome' is distinct from 'allowed' then
    return pg_catalog.jsonb_build_object('outcome', 'denied', 'code',
      case when v_token.revoked_at is not null or v_token.expires_at <= pg_catalog.clock_timestamp()
        then 'UNAUTHORIZED' else 'FORBIDDEN' end);
  end if;
  -- Do not raise after admission and roll back its audit. Canonical action RPCs recheck authority.
  select t.* into strict v_token from public.connector_tokens t where t.id = p_id;
  return public.payr_agent_account_dto_v1(v_token);
end;
$$;

create function public.payr_revoke_agent_account_v1(p_service_id text, p_id uuid, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token public.connector_tokens;
begin
  select t.* into v_token from public.connector_tokens t join public.agent_account_credentials m on m.connector_token_id = t.id
    where t.id = p_id and m.service_id = p_service_id for update of t;
  if not found or v_token.token_hash is distinct from p_token_hash or v_token.revoked_at is not null
    or v_token.expires_at <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'UNAUTHORIZED';
  end if;
  perform public.payr_draft_scope_v1(v_token.workspace_id, null, p_id, 'invoice:status');
  update public.connector_tokens set revoked_at = pg_catalog.clock_timestamp() where id = p_id;
  insert into public.audit_events(id, workspace_id, connector_token_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), v_token.workspace_id, p_id, 'connector.revoke', 'succeeded');
  return pg_catalog.jsonb_build_object('credentialId', p_id, 'revoked', true);
end;
$$;

revoke all on function public.payr_gateway_operations_valid_v1(text[]), public.payr_agent_scopes_valid_v1(text[]),
  public.payr_gateway_quota_v1(text,text,text), public.payr_agent_challenge_dto_v1(public.agent_registration_challenges),
  public.payr_agent_account_dto_v1(public.connector_tokens),
  public.payr_admin_provision_gateway_key_v1(uuid,text,text,text[]), public.payr_admin_revoke_gateway_key_v1(uuid,text),
  public.payr_admit_gateway_service_v1(uuid,text,text,text), public.payr_issue_agent_challenge_v1(jsonb,text,text),
  public.payr_find_agent_challenge_v1(uuid,text), public.payr_complete_agent_registration_v1(uuid,text,text,uuid,text),
  public.payr_admit_agent_account_v1(text,uuid,text,text,text), public.payr_revoke_agent_account_v1(text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.payr_admin_provision_gateway_key_v1(uuid,text,text,text[]), public.payr_admin_revoke_gateway_key_v1(uuid,text),
  public.payr_admit_gateway_service_v1(uuid,text,text,text), public.payr_issue_agent_challenge_v1(jsonb,text,text),
  public.payr_find_agent_challenge_v1(uuid,text), public.payr_complete_agent_registration_v1(uuid,text,text,uuid,text),
  public.payr_admit_agent_account_v1(text,uuid,text,text,text), public.payr_revoke_agent_account_v1(text,uuid,text) to service_role;

commit;
