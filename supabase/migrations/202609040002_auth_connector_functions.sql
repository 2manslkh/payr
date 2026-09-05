begin;

alter table public.auth_nonces
  add column payout_from text,
  add column payout_to text,
  add column profile_revision integer,
  add constraint auth_nonces_purpose_facts check ((
    (purpose = 'payr-login-v1' and workspace_id is null and payout_from is null and payout_to is null and profile_revision is null)
    or (purpose = 'payr-payout-change-v1' and workspace_id is not null
      and payout_from ~ '^0x[0-9a-f]{40}$' and payout_to ~ '^0x[0-9a-f]{40}$'
      and payout_from <> payout_to and profile_revision > 0)
  ) is true),
  add constraint auth_nonces_bounded_facts check (
    chain_id <= 9007199254740991 and expires_at - issued_at <= interval '300 seconds'
    and pg_catalog.isfinite(issued_at) and pg_catalog.isfinite(expires_at)
    and issued_at = pg_catalog.date_trunc('milliseconds', issued_at)
    and expires_at = pg_catalog.date_trunc('milliseconds', expires_at)
    and challenge ~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
    and (consumed_at is null or consumed_at < expires_at)
  );

alter table public.clients add column provenance jsonb not null default '{}'::jsonb
  check (pg_catalog.jsonb_typeof(provenance) = 'object');

create table public.connector_ip_rate_limits (
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count between 0 and 120),
  primary key (subject_hash, window_started_at),
  check (subject_hash ~ '^[0-9a-f]{64}$')
);
alter table public.connector_ip_rate_limits enable row level security;
revoke all on table public.connector_ip_rate_limits from public, anon, authenticated, service_role;
grant select on table public.connector_ip_rate_limits to service_role;

create table public.auth_nonce_rate_limits (
  purpose text not null check (purpose in ('global', 'ip', 'wallet')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null check (pg_catalog.isfinite(window_started_at)
    and window_started_at = pg_catalog.date_trunc('minute', window_started_at)),
  request_count integer not null check (request_count between 1 and
    case purpose when 'wallet' then 5 when 'ip' then 30 else 300 end),
  primary key (purpose, subject_hash, window_started_at),
  check (purpose <> 'global' or subject_hash = pg_catalog.repeat('0', 64))
);
create index auth_nonce_rate_limits_window on public.auth_nonce_rate_limits (window_started_at);
create index auth_nonces_expiry on public.auth_nonces (expires_at);
alter table public.auth_nonce_rate_limits enable row level security;
revoke all on table public.auth_nonce_rate_limits from public, anon, authenticated, service_role;
grant select on table public.auth_nonce_rate_limits to service_role;

create function public.payr_identity_object_v1(p_value jsonb, p_required text[], p_optional text[] default '{}'::text[])
returns boolean language plpgsql immutable security definer set search_path = '' as $$
begin
  if pg_catalog.jsonb_typeof(p_value) is distinct from 'object' then return false; end if;
  return p_value ?& p_required and not exists (
    select 1 from pg_catalog.jsonb_object_keys(p_value) as k(key) where not (k.key = any(p_required || p_optional))
  );
end;
$$;

create function public.payr_identity_scope_v1(p_workspace_id uuid, p_owner_wallet text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.workspaces as w where w.id = p_workspace_id and w.owner_wallet = p_owner_wallet) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
end;
$$;

create function public.payr_identity_nonce_dto_v1(p_row public.auth_nonces)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_row.id is null then 'null'::jsonb else pg_catalog.jsonb_build_object(
    'id', p_row.id, 'workspaceId', p_row.workspace_id, 'wallet', p_row.wallet, 'purpose', p_row.purpose,
    'challenge', p_row.challenge, 'domain', p_row.domain, 'uri', p_row.uri, 'chainId', p_row.chain_id,
    'issuedAt', pg_catalog.to_char(p_row.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'expiresAt', pg_catalog.to_char(p_row.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'consumedAt', p_row.consumed_at, 'payoutFrom', p_row.payout_from, 'payoutTo', p_row.payout_to,
    'profileRevision', p_row.profile_revision
  ) end;
$$;

create function public.payr_identity_profile_dto_v1(p_row public.sender_profiles)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_row.id is null then 'null'::jsonb else pg_catalog.jsonb_build_object(
    'id', p_row.id, 'revision', p_row.revision, 'businessName', p_row.business_name, 'billingAddress', p_row.billing_address,
    'contactName', p_row.contact_name, 'contactEmail', p_row.contact_email, 'payoutWallet', p_row.payout_wallet,
    'invoicePrefix', p_row.invoice_prefix, 'defaultPaymentTermsDays', p_row.default_terms::integer
  ) end;
$$;

create function public.payr_identity_protect_nonce_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.expires_at <= pg_catalog.clock_timestamp() then return old; end if;
    raise exception using errcode = '55000', message = 'AUTH_NONCE_IMMUTABLE';
  end if;
  if (pg_catalog.to_jsonb(new) - 'consumed_at') is distinct from (pg_catalog.to_jsonb(old) - 'consumed_at')
    or old.consumed_at is not null or new.consumed_at is null
    or new.consumed_at < new.issued_at or new.consumed_at >= new.expires_at then
    raise exception using errcode = '55000', message = 'AUTH_NONCE_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger auth_nonces_immutable before update or delete on public.auth_nonces
  for each row execute function public.payr_identity_protect_nonce_v1();

create function public.payr_admit_nonce_issuance_v1(p_wallet_hash text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz; v_window timestamptz;
  v_global_count integer; v_ip_count integer; v_wallet_count integer;
begin
  if p_wallet_hash is null or p_wallet_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- One global lock serializes cleanup and all quotas, including previously unseen hashes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payr:nonce-issuance:v1', 0));
  v_now := pg_catalog.clock_timestamp();
  delete from public.auth_nonce_rate_limits where window_started_at < v_now - interval '10 minutes';
  delete from public.auth_nonces where expires_at <= v_now;
  -- Choose the database minute after any cleanup/lock waits, even on denial calls.
  v_now := pg_catalog.clock_timestamp();
  v_window := pg_catalog.date_trunc('minute', v_now);
  select r.request_count into v_global_count from public.auth_nonce_rate_limits as r
    where r.purpose = 'global' and r.subject_hash = pg_catalog.repeat('0', 64) and r.window_started_at = v_window;
  select r.request_count into v_ip_count from public.auth_nonce_rate_limits as r
    where r.purpose = 'ip' and r.subject_hash = p_ip_hash and r.window_started_at = v_window;
  select r.request_count into v_wallet_count from public.auth_nonce_rate_limits as r
    where r.purpose = 'wallet' and r.subject_hash = p_wallet_hash and r.window_started_at = v_window;
  if coalesce(v_global_count, 0) >= 300 or coalesce(v_ip_count, 0) >= 30 or coalesce(v_wallet_count, 0) >= 5 then
    return pg_catalog.jsonb_build_object('allowed', false, 'retryAfterSeconds',
      greatest(1, least(60, pg_catalog.ceil(extract(epoch from (v_window + interval '1 minute' - v_now)))::integer)));
  end if;
  -- Denials never allocate buckets or increment any counter. Write global, IP, then wallet.
  insert into public.auth_nonce_rate_limits (purpose, subject_hash, window_started_at, request_count)
    values ('global', pg_catalog.repeat('0', 64), v_window, 1), ('ip', p_ip_hash, v_window, 1), ('wallet', p_wallet_hash, v_window, 1)
    on conflict (purpose, subject_hash, window_started_at)
    do update set request_count = public.auth_nonce_rate_limits.request_count + 1;
  return pg_catalog.jsonb_build_object('allowed', true, 'retryAfterSeconds', 0);
end;
$$;
revoke all on function public.payr_admit_nonce_issuance_v1(text, text) from public, anon, authenticated, service_role;
grant execute on function public.payr_admit_nonce_issuance_v1(text, text) to service_role;

create function public.payr_identity_protect_audit_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  raise exception using errcode = '55000', message = 'AUDIT_EVENT_IMMUTABLE';
end;
$$;
create trigger audit_events_immutable before update or delete on public.audit_events
  for each row execute function public.payr_identity_protect_audit_v1();
alter table public.audit_events add constraint audit_events_bounded_codes check (
  action in ('auth.login', 'auth.payout_nonce', 'profile.save', 'profile.payout_change', 'client.save',
    'connector.create', 'connector.revoke', 'connector.admit', 'invoice:draft', 'invoice:publish', 'invoice:status', 'invoice:void')
  and outcome in ('allowed', 'denied', 'rate_limited', 'succeeded')
);

create function public.payr_issue_auth_nonce_v1(p_nonce jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_nonce public.auth_nonces;
  v_profile public.sender_profiles;
  v_key text;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if not public.payr_identity_object_v1(p_nonce, array['id','workspaceId','wallet','purpose','challenge','domain','uri',
    'chainId','issuedAt','expiresAt','consumedAt','payoutFrom','payoutTo','profileRevision']) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  foreach v_key in array array['id','wallet','purpose','challenge','domain','uri','issuedAt','expiresAt'] loop
    if pg_catalog.jsonb_typeof(p_nonce -> v_key) <> 'string' then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  if (p_nonce ->> 'id') !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    or (p_nonce ->> 'wallet') !~ '^0x[0-9a-f]{40}$'
    or (p_nonce ->> 'challenge') !~ '^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$'
    or pg_catalog.jsonb_typeof(p_nonce -> 'chainId') <> 'number'
    or (p_nonce ->> 'chainId') !~ '^[1-9][0-9]{0,15}$'
    or (p_nonce ->> 'chainId')::numeric > 9007199254740991
    or p_nonce -> 'consumedAt' <> 'null'::jsonb
    or pg_catalog.length(p_nonce ->> 'domain') not between 1 and 253
    or (p_nonce ->> 'domain') !~ '^[a-z0-9.\[\]:-]+$'
    or not ((p_nonce ->> 'uri') = 'https://' || (p_nonce ->> 'domain')
      or ((p_nonce ->> 'domain') ~ '^(localhost|127\.0\.0\.1|\[::1\]):[0-9]{1,5}$'
        and (p_nonce ->> 'uri') = 'http://' || (p_nonce ->> 'domain')))
    or (p_nonce ->> 'issuedAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    or (p_nonce ->> 'expiresAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  v_nonce.id := (p_nonce ->> 'id')::uuid;
  v_nonce.wallet := p_nonce ->> 'wallet';
  v_nonce.purpose := p_nonce ->> 'purpose';
  v_nonce.challenge := p_nonce ->> 'challenge';
  v_nonce.domain := p_nonce ->> 'domain';
  v_nonce.uri := p_nonce ->> 'uri';
  v_nonce.chain_id := (p_nonce ->> 'chainId')::bigint;
  v_nonce.issued_at := (p_nonce ->> 'issuedAt')::timestamptz;
  v_nonce.expires_at := (p_nonce ->> 'expiresAt')::timestamptz;
  if v_nonce.issued_at > v_now or v_nonce.expires_at <= v_now
    or pg_catalog.to_char(v_nonce.issued_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_nonce ->> 'issuedAt'
    or pg_catalog.to_char(v_nonce.expires_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') <> p_nonce ->> 'expiresAt'
    or v_nonce.expires_at <= v_nonce.issued_at or v_nonce.expires_at - v_nonce.issued_at > interval '300 seconds' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if v_nonce.purpose = 'payr-login-v1' then
    if p_nonce -> 'workspaceId' <> 'null'::jsonb or p_nonce -> 'payoutFrom' <> 'null'::jsonb
      or p_nonce -> 'payoutTo' <> 'null'::jsonb or p_nonce -> 'profileRevision' <> 'null'::jsonb then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  elsif v_nonce.purpose = 'payr-payout-change-v1' then
    if (pg_catalog.jsonb_typeof(p_nonce -> 'workspaceId') = 'string'
      and (p_nonce ->> 'workspaceId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and pg_catalog.jsonb_typeof(p_nonce -> 'payoutFrom') = 'string' and (p_nonce ->> 'payoutFrom') ~ '^0x[0-9a-f]{40}$'
      and pg_catalog.jsonb_typeof(p_nonce -> 'payoutTo') = 'string' and (p_nonce ->> 'payoutTo') ~ '^0x[0-9a-f]{40}$'
      and pg_catalog.jsonb_typeof(p_nonce -> 'profileRevision') = 'number'
      and (p_nonce ->> 'profileRevision') ~ '^[1-9][0-9]{0,9}$'
      and (p_nonce ->> 'profileRevision')::numeric <= 2147483647
      and (p_nonce ->> 'payoutFrom') <> (p_nonce ->> 'payoutTo')) is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    v_nonce.workspace_id := (p_nonce ->> 'workspaceId')::uuid;
    v_nonce.payout_from := p_nonce ->> 'payoutFrom';
    v_nonce.payout_to := p_nonce ->> 'payoutTo';
    v_nonce.profile_revision := (p_nonce ->> 'profileRevision')::integer;
    perform public.payr_identity_scope_v1(v_nonce.workspace_id, v_nonce.wallet);
    select s.* into v_profile from public.sender_profiles as s where s.workspace_id = v_nonce.workspace_id for update;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
    if v_profile.revision <> v_nonce.profile_revision or v_profile.payout_wallet is distinct from v_nonce.payout_from then
      raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
    end if;
  else
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  insert into public.auth_nonces (id, workspace_id, wallet, purpose, challenge, domain, uri, chain_id,
    issued_at, expires_at, payout_from, payout_to, profile_revision)
  values (v_nonce.id, v_nonce.workspace_id, v_nonce.wallet, v_nonce.purpose, v_nonce.challenge, v_nonce.domain,
    v_nonce.uri, v_nonce.chain_id, v_nonce.issued_at, v_nonce.expires_at, v_nonce.payout_from, v_nonce.payout_to, v_nonce.profile_revision)
  returning * into v_nonce;
  if v_nonce.workspace_id is not null then
    insert into public.audit_events (id, workspace_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), v_nonce.workspace_id, 'auth.payout_nonce', 'succeeded');
  end if;
  return public.payr_identity_nonce_dto_v1(v_nonce);
exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range or check_violation then
  raise exception using errcode = '22023', message = 'INVALID_INPUT';
when unique_violation then
  raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
end;
$$;

create function public.payr_find_auth_nonce_v1(p_nonce_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select public.payr_identity_nonce_dto_v1(n) from public.auth_nonces as n where n.id = p_nonce_id), 'null'::jsonb);
$$;

create function public.payr_complete_login_v1(p_nonce_id uuid, p_verified_wallet text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_nonce public.auth_nonces; v_workspace public.workspaces; v_now timestamptz;
begin
  select n.* into v_nonce from public.auth_nonces as n where n.id = p_nonce_id for update;
  if not found or v_nonce.purpose <> 'payr-login-v1' or v_nonce.wallet is distinct from p_verified_wallet
    or v_nonce.consumed_at is not null or v_nonce.expires_at <= pg_catalog.clock_timestamp()
    or v_nonce.issued_at > pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
  end if;
  insert into public.workspaces (id, owner_wallet) values (pg_catalog.gen_random_uuid(), p_verified_wallet)
    on conflict (owner_wallet) do nothing;
  -- Serialize logins without blocking audit/profile foreign-key KEY SHARE locks.
  select w.* into strict v_workspace from public.workspaces as w where w.owner_wallet = p_verified_wallet for no key update;
  insert into public.sender_profiles (id, workspace_id, payout_wallet)
    values (pg_catalog.gen_random_uuid(), v_workspace.id, p_verified_wallet)
    on conflict (workspace_id) do nothing;
  -- F1 skeletal profiles may predate the owner-payout initialization rule.
  update public.sender_profiles set payout_wallet = p_verified_wallet, updated_at = pg_catalog.clock_timestamp()
    where workspace_id = v_workspace.id and payout_wallet is null;
  v_now := pg_catalog.clock_timestamp();
  update public.auth_nonces set consumed_at = v_now
    where id = p_nonce_id and consumed_at is null and expires_at > v_now;
  if not found then raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED'; end if;
  insert into public.audit_events (id, workspace_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), v_workspace.id, 'auth.login', 'succeeded');
  return pg_catalog.jsonb_build_object('workspaceId', v_workspace.id, 'ownerWallet', v_workspace.owner_wallet);
end;
$$;

create function public.payr_get_sender_profile_v1(p_workspace_id uuid, p_owner_wallet text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_profile public.sender_profiles;
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  select s.* into v_profile from public.sender_profiles as s where s.workspace_id = p_workspace_id;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  return public.payr_identity_profile_dto_v1(v_profile);
end;
$$;

revoke all on function public.payr_identity_object_v1(jsonb, text[], text[]),
  public.payr_identity_scope_v1(uuid, text), public.payr_identity_nonce_dto_v1(public.auth_nonces),
  public.payr_identity_profile_dto_v1(public.sender_profiles), public.payr_identity_protect_nonce_v1(),
  public.payr_identity_protect_audit_v1(), public.payr_issue_auth_nonce_v1(jsonb), public.payr_find_auth_nonce_v1(uuid),
  public.payr_complete_login_v1(uuid, text), public.payr_get_sender_profile_v1(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.payr_issue_auth_nonce_v1(jsonb), public.payr_find_auth_nonce_v1(uuid),
  public.payr_complete_login_v1(uuid, text), public.payr_get_sender_profile_v1(uuid, text) to service_role;

create function public.payr_apply_payout_change_v1(p_nonce_id uuid, p_workspace_id uuid, p_owner_wallet text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_nonce public.auth_nonces; v_profile public.sender_profiles; v_now timestamptz;
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  select n.* into v_nonce from public.auth_nonces as n where n.id = p_nonce_id and n.workspace_id = p_workspace_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_nonce.purpose <> 'payr-payout-change-v1' or v_nonce.wallet is distinct from p_owner_wallet
    or v_nonce.consumed_at is not null then
    raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
  end if;
  select s.* into v_profile from public.sender_profiles as s where s.workspace_id = p_workspace_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  v_now := pg_catalog.clock_timestamp();
  if v_nonce.expires_at <= v_now or v_nonce.issued_at > v_now then
    raise exception using errcode = 'P0001', message = 'NONCE_INVALID_OR_USED';
  end if;
  if v_nonce.profile_revision <> v_profile.revision or v_nonce.payout_from is distinct from v_profile.payout_wallet
    or v_nonce.payout_to is null or v_nonce.payout_to = v_nonce.payout_from or v_profile.revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
  end if;
  update public.auth_nonces set consumed_at = v_now where id = p_nonce_id;
  update public.sender_profiles set payout_wallet = v_nonce.payout_to, revision = revision + 1, updated_at = v_now
    where id = v_profile.id returning * into v_profile;
  insert into public.audit_events (id, workspace_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), p_workspace_id, 'profile.payout_change', 'succeeded');
  return public.payr_identity_profile_dto_v1(v_profile);
end;
$$;

create function public.payr_identity_save_input_v1(p_input jsonb, p_client boolean)
returns jsonb language plpgsql immutable security definer set search_path = '' as $$
declare
  v_result jsonb := p_input; v_address jsonb; v_key text; v_text text; v_max integer; v_min integer;
  -- Match ECMAScript trim and UTF-16 length, not database-locale whitespace/codepoint counts.
  v_trim text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
begin
  if not public.payr_identity_object_v1(p_input, case when p_client then
    array['id','expectedRevision','alias','businessName','billingAddress','contactName','contactEmail'] else
    array['expectedRevision','businessName','billingAddress','contactName','contactEmail','invoicePrefix','defaultPaymentTermsDays'] end) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  if p_client and p_input -> 'id' = 'null'::jsonb then
    if p_input -> 'expectedRevision' <> 'null'::jsonb then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  else
    if (pg_catalog.jsonb_typeof(p_input -> 'expectedRevision') = 'number'
      and (p_input ->> 'expectedRevision') ~ '^[1-9][0-9]{0,9}$'
      and (p_input ->> 'expectedRevision')::numeric <= 2147483647) is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    if p_client and (pg_catalog.jsonb_typeof(p_input -> 'id') = 'string'
      and (p_input ->> 'id') ~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$') is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end if;
  foreach v_key in array (case when p_client then array['alias','businessName','contactName','contactEmail']
    else array['businessName','contactName','contactEmail'] end) loop
    v_max := case v_key when 'alias' then 100 when 'contactEmail' then 254 else 200 end;
    v_text := pg_catalog.btrim(p_input ->> v_key, v_trim);
    if pg_catalog.jsonb_typeof(p_input -> v_key) <> 'string'
      or pg_catalog.length(pg_catalog.regexp_replace(v_text, U&'[\+010000-\+10FFFF]', 'xx', 'g')) not between 1 and v_max then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    if v_key = 'contactEmail' then
      if v_text !~ '^(?!\.)(?!.*\.\.)([A-Za-z0-9_+''.-]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$' then
        raise exception using errcode = '22023', message = 'INVALID_INPUT';
      end if;
      v_text := pg_catalog.lower(v_text);
    end if;
    v_result := pg_catalog.jsonb_set(v_result, array[v_key], pg_catalog.to_jsonb(v_text));
  end loop;
  v_address := p_input -> 'billingAddress';
  if not public.payr_identity_object_v1(v_address, array['line1','city','postalCode','countryCode'], array['line2','region']) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  for v_key in select pg_catalog.jsonb_object_keys(v_address) loop
    v_text := v_address ->> v_key;
    if v_key <> 'countryCode' then v_text := pg_catalog.btrim(v_text, v_trim); end if;
    v_max := case v_key when 'line1' then 200 when 'line2' then 200 when 'postalCode' then 32 when 'countryCode' then 2 else 100 end;
    v_min := case when v_key in ('line2','region') then 0 else 1 end;
    if pg_catalog.jsonb_typeof(v_address -> v_key) <> 'string'
      or pg_catalog.length(pg_catalog.regexp_replace(v_text, U&'[\+010000-\+10FFFF]', 'xx', 'g')) not between v_min and v_max
      or (v_key = 'countryCode' and v_text !~ '^[A-Z]{2}$') then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
    v_address := pg_catalog.jsonb_set(v_address, array[v_key], pg_catalog.to_jsonb(v_text));
  end loop;
  if not p_client and (
    pg_catalog.jsonb_typeof(p_input -> 'invoicePrefix') <> 'string' or (p_input ->> 'invoicePrefix') !~ '^[A-Z0-9][A-Z0-9-]{0,31}$'
    or pg_catalog.jsonb_typeof(p_input -> 'defaultPaymentTermsDays') <> 'number'
    or (p_input ->> 'defaultPaymentTermsDays') !~ '^(0|[1-9][0-9]{0,2})$'
    or (p_input ->> 'defaultPaymentTermsDays')::numeric > 365) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  return pg_catalog.jsonb_set(v_result, array['billingAddress'], v_address);
exception when invalid_text_representation or numeric_value_out_of_range then
  raise exception using errcode = '22023', message = 'INVALID_INPUT';
end;
$$;

create function public.payr_save_sender_profile_v1(p_workspace_id uuid, p_owner_wallet text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_input jsonb; v_profile public.sender_profiles;
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  v_input := public.payr_identity_save_input_v1(p_input, false);
  select s.* into v_profile from public.sender_profiles as s where s.workspace_id = p_workspace_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_profile.revision <> (v_input ->> 'expectedRevision')::integer or v_profile.revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
  end if;
  update public.sender_profiles set business_name = v_input ->> 'businessName', billing_address = v_input -> 'billingAddress',
    contact_name = v_input ->> 'contactName', contact_email = v_input ->> 'contactEmail', invoice_prefix = v_input ->> 'invoicePrefix',
    default_terms = (v_input ->> 'defaultPaymentTermsDays')::integer::text, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_profile.id returning * into v_profile;
  insert into public.audit_events (id, workspace_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), p_workspace_id, 'profile.save', 'succeeded');
  return public.payr_identity_profile_dto_v1(v_profile);
end;
$$;

create function public.payr_identity_client_dto_v1(p_row public.clients)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p_row.id, 'revision', p_row.revision, 'alias', p_row.alias,
    'businessName', p_row.business_name, 'billingAddress', p_row.billing_address, 'contactName', p_row.contact_name,
    'contactEmail', p_row.contact_email, 'provenance', p_row.provenance);
$$;

create function public.payr_list_clients_v1(p_workspace_id uuid, p_owner_wallet text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  return (select coalesce(pg_catalog.jsonb_agg(public.payr_identity_client_dto_v1(c) order by c.alias, c.id), '[]'::jsonb)
    from public.clients as c where c.workspace_id = p_workspace_id);
end;
$$;

create function public.payr_save_client_v1(p_workspace_id uuid, p_owner_wallet text, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_input jsonb; v_client public.clients; v_provenance jsonb;
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  v_input := public.payr_identity_save_input_v1(p_input, true);
  select pg_catalog.jsonb_object_agg(k, '{"kind":"user_provided","confirmed":true}'::jsonb) into v_provenance
    from pg_catalog.unnest(array['alias','businessName','billingAddress','contactName','contactEmail']) as k;
  if v_input -> 'id' = 'null'::jsonb then
    insert into public.clients (id, workspace_id, alias, business_name, billing_address, contact_name, contact_email, provenance)
      values (pg_catalog.gen_random_uuid(), p_workspace_id, v_input ->> 'alias', v_input ->> 'businessName',
        v_input -> 'billingAddress', v_input ->> 'contactName', v_input ->> 'contactEmail', v_provenance) returning * into v_client;
  else
    select c.* into v_client from public.clients as c where c.workspace_id = p_workspace_id and c.id = (v_input ->> 'id')::uuid for update;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
    if v_client.revision <> (v_input ->> 'expectedRevision')::integer or v_client.revision = 2147483647 then
      raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
    end if;
    update public.clients set alias = v_input ->> 'alias', business_name = v_input ->> 'businessName',
      billing_address = v_input -> 'billingAddress', contact_name = v_input ->> 'contactName', contact_email = v_input ->> 'contactEmail',
      provenance = v_provenance, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
      where id = v_client.id returning * into v_client;
  end if;
  insert into public.audit_events (id, workspace_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), p_workspace_id, 'client.save', 'succeeded');
  return public.payr_identity_client_dto_v1(v_client);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'CLIENT_ALIAS_CONFLICT';
end;
$$;

revoke all on function public.payr_apply_payout_change_v1(uuid, uuid, text), public.payr_identity_save_input_v1(jsonb, boolean),
  public.payr_save_sender_profile_v1(uuid, text, jsonb), public.payr_identity_client_dto_v1(public.clients),
  public.payr_list_clients_v1(uuid, text), public.payr_save_client_v1(uuid, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.payr_apply_payout_change_v1(uuid, uuid, text), public.payr_save_sender_profile_v1(uuid, text, jsonb),
  public.payr_list_clients_v1(uuid, text), public.payr_save_client_v1(uuid, text, jsonb) to service_role;

create function public.payr_identity_connector_dto_v1(p_row public.connector_tokens)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('id', p_row.id, 'createdAt', p_row.created_at, 'expiresAt', p_row.expires_at,
    'revokedAt', p_row.revoked_at, 'lastUsedAt', p_row.last_used_at, 'scopes', p_row.scopes);
$$;

create function public.payr_list_connectors_v1(p_workspace_id uuid, p_owner_wallet text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  return (select coalesce(pg_catalog.jsonb_agg(public.payr_identity_connector_dto_v1(t) order by t.created_at desc, t.id), '[]'::jsonb)
    from public.connector_tokens as t where t.workspace_id = p_workspace_id);
end;
$$;

create function public.payr_create_connector_v1(p_workspace_id uuid, p_owner_wallet text, p_id uuid, p_token_hash text, p_expires_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token public.connector_tokens; v_now timestamptz := pg_catalog.clock_timestamp();
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at is null
    or p_id::text !~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$'
    or not pg_catalog.isfinite(p_expires_at) or p_expires_at <= v_now or p_expires_at > v_now + interval '30 days' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  insert into public.connector_tokens (id, workspace_id, token_hash, expires_at, created_at)
    values (p_id, p_workspace_id, p_token_hash, p_expires_at, v_now) returning * into v_token;
  insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), p_workspace_id, p_id, 'connector.create', 'succeeded');
  return public.payr_identity_connector_dto_v1(v_token);
exception when unique_violation then
  if exists (select 1 from public.connector_tokens as t where t.id = p_id and t.workspace_id <> p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  raise exception using errcode = 'P0001', message = 'CONNECTOR_CONFLICT';
end;
$$;

create function public.payr_revoke_connector_v1(p_workspace_id uuid, p_owner_wallet text, p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token public.connector_tokens;
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  select t.* into v_token from public.connector_tokens as t where t.id = p_id and t.workspace_id = p_workspace_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_token.revoked_at is null then
    update public.connector_tokens set revoked_at = pg_catalog.clock_timestamp() where id = p_id returning * into v_token;
    insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
      values (pg_catalog.gen_random_uuid(), p_workspace_id, p_id, 'connector.revoke', 'succeeded');
  end if;
  return public.payr_identity_connector_dto_v1(v_token);
end;
$$;

create function public.payr_find_connector_v1(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select public.payr_identity_connector_dto_v1(t)
    || pg_catalog.jsonb_build_object('workspaceId', t.workspace_id, 'tokenHash', t.token_hash)
    from public.connector_tokens as t where t.id = p_id), 'null'::jsonb);
$$;

alter table public.connector_rate_limits add constraint connector_rate_limits_token_bound
  check (purpose <> 'token' or request_count <= 60);

create function public.payr_admit_connector_v1(p_id uuid, p_token_hash text, p_ip_hash text, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_token public.connector_tokens; v_now timestamptz; v_window timestamptz;
  v_token_count integer; v_ip_count integer; v_outcome text; v_action text;
begin
  if p_id is null or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    return pg_catalog.jsonb_build_object('outcome', 'denied');
  end if;
  -- All admission/revocation paths lock the token first, then the global IP.
  -- Acquire the IP lock before choosing the minute, including after lock waits.
  select t.* into v_token from public.connector_tokens as t where t.id = p_id for update;
  if not found then return pg_catalog.jsonb_build_object('outcome', 'denied'); end if;
  v_action := case when p_action = any(v_token.scopes) then p_action else 'connector.admit' end;
  if v_token.token_hash is distinct from p_token_hash or v_token.revoked_at is not null
    or v_token.expires_at <= pg_catalog.clock_timestamp() or (p_action = any(v_token.scopes)) is not true then
    insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
      values (pg_catalog.gen_random_uuid(), v_token.workspace_id, p_id, v_action, 'denied');
    return pg_catalog.jsonb_build_object('outcome', 'denied');
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payr:connector-ip:' || p_ip_hash, 0));
  v_now := pg_catalog.clock_timestamp();
  if v_token.expires_at <= v_now then
    insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
      values (pg_catalog.gen_random_uuid(), v_token.workspace_id, p_id, v_action, 'denied');
    return pg_catalog.jsonb_build_object('outcome', 'denied');
  end if;
  v_window := pg_catalog.date_trunc('minute', v_now);
  select r.request_count into v_token_count from public.connector_rate_limits as r
    where r.workspace_id = v_token.workspace_id and r.connector_token_id = p_id and r.purpose = 'token'
      and r.subject_hash = v_token.token_hash and r.window_started_at = v_window for update;
  select r.request_count into v_ip_count from public.connector_ip_rate_limits as r
    where r.subject_hash = p_ip_hash and r.window_started_at = v_window for update;
  if coalesce(v_token_count, 0) >= 60 or coalesce(v_ip_count, 0) >= 120 then
    v_outcome := 'rate_limited';
  else
    insert into public.connector_rate_limits (workspace_id, connector_token_id, purpose, subject_hash, window_started_at, request_count, updated_at)
      values (v_token.workspace_id, p_id, 'token', v_token.token_hash, v_window, 1, v_now)
      on conflict (workspace_id, connector_token_id, purpose, subject_hash, window_started_at)
      do update set request_count = public.connector_rate_limits.request_count + 1, updated_at = v_now;
    insert into public.connector_ip_rate_limits (subject_hash, window_started_at, request_count) values (p_ip_hash, v_window, 1)
      on conflict (subject_hash, window_started_at) do update set request_count = public.connector_ip_rate_limits.request_count + 1;
    update public.connector_tokens set last_used_at = v_now where id = p_id;
    v_outcome := 'allowed';
  end if;
  insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), v_token.workspace_id, p_id, v_action, v_outcome);
  if v_outcome = 'rate_limited' then
    return pg_catalog.jsonb_build_object('outcome', v_outcome, 'retryAfterSeconds',
      greatest(1, least(60, pg_catalog.ceil(extract(epoch from (v_window + interval '1 minute' - v_now)))::integer)));
  end if;
  return pg_catalog.jsonb_build_object('outcome', v_outcome, 'workspaceId', v_token.workspace_id, 'tokenId', p_id);
end;
$$;

create index audit_events_workspace_newest on public.audit_events (workspace_id, created_at desc, id desc);
create function public.payr_list_activity_v1(p_workspace_id uuid, p_owner_wallet text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', a.id, 'tokenId', a.connector_token_id, 'action', a.action, 'outcome', a.outcome, 'createdAt', a.created_at
  ) order by a.created_at desc, a.id desc), '[]'::jsonb) from (
    select e.* from public.audit_events as e where e.workspace_id = p_workspace_id order by e.created_at desc, e.id desc limit 100
  ) as a);
end;
$$;

revoke all on function public.payr_identity_connector_dto_v1(public.connector_tokens), public.payr_list_connectors_v1(uuid, text),
  public.payr_create_connector_v1(uuid, text, uuid, text, timestamptz), public.payr_revoke_connector_v1(uuid, text, uuid),
  public.payr_find_connector_v1(uuid), public.payr_admit_connector_v1(uuid, text, text, text), public.payr_list_activity_v1(uuid, text)
from public, anon, authenticated, service_role;
grant execute on function public.payr_list_connectors_v1(uuid, text), public.payr_create_connector_v1(uuid, text, uuid, text, timestamptz),
  public.payr_revoke_connector_v1(uuid, text, uuid), public.payr_find_connector_v1(uuid),
  public.payr_admit_connector_v1(uuid, text, text, text), public.payr_list_activity_v1(uuid, text) to service_role;

commit;
