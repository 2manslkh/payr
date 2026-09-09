begin;

alter table public.audit_events drop constraint audit_events_bounded_codes;
alter table public.audit_events add constraint audit_events_bounded_codes check (
  action in ('auth.login','auth.payout_nonce','profile.save','profile.payout_change','client.save',
    'connector.create','connector.revoke','connector.admit','invoice:draft','invoice:publish','invoice:status','invoice:void',
    'settlement.recorded','receipt.generate','receipt.deliver','sender:read','sender:write')
  and outcome in ('allowed','denied','rate_limited','succeeded','failed','retry_wait','manual_review')
);

-- Preserve the table default and shipped v1 mint: neither grants sender authority.
create function public.payr_connector_scopes_valid_v1(p_scopes text[])
returns boolean language sql immutable set search_path = '' as $$
  select case when p_scopes is not null and pg_catalog.array_ndims(p_scopes) = 1
    and pg_catalog.array_lower(p_scopes, 1) = 1
    and pg_catalog.cardinality(p_scopes) between 1 and 6
    then pg_catalog.array_position(p_scopes, null) is null
    and p_scopes @> array['invoice:status']::text[]
    and p_scopes <@ array['invoice:draft','invoice:publish','invoice:status','invoice:void','sender:read','sender:write']::text[]
    and pg_catalog.cardinality(p_scopes) = (select count(distinct s) from pg_catalog.unnest(p_scopes) as s)
    else false end;
$$;

alter table public.connector_tokens drop constraint connector_tokens_fixed_scopes;
alter table public.connector_tokens add constraint connector_tokens_supported_scopes
  check (public.payr_connector_scopes_valid_v1(scopes) is true);

create function public.payr_create_connector_v2(
  p_workspace_id uuid, p_owner_wallet text, p_id uuid, p_token_hash text, p_expires_at timestamptz, p_scopes text[]
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token public.connector_tokens;
begin
  perform public.payr_identity_scope_v1(p_workspace_id, p_owner_wallet);
  if public.payr_connector_scopes_valid_v1(p_scopes) is not true then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- v1 retains its shipped validation, defaults and token-attributed creation audit.
  perform public.payr_create_connector_v1(p_workspace_id, p_owner_wallet, p_id, p_token_hash, p_expires_at);
  update public.connector_tokens set scopes = p_scopes where id = p_id and workspace_id = p_workspace_id returning * into v_token;
  return public.payr_identity_connector_dto_v1(v_token);
end;
$$;

create function public.payr_connector_get_sender_profile_v1(p_workspace_id uuid, p_connector_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_profile public.sender_profiles;
begin
  -- A null owner is fixed by the RPC, not supplied by the connector. Token first.
  perform public.payr_draft_scope_v1(p_workspace_id, null, p_connector_id, 'sender:read');
  select s.* into v_profile from public.sender_profiles as s where s.workspace_id = p_workspace_id for share;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  -- Recheck clock time after a possible profile lock wait.
  perform public.payr_draft_scope_v1(p_workspace_id, null, p_connector_id, 'sender:read');
  insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), p_workspace_id, p_connector_id, 'sender:read', 'succeeded');
  return public.payr_identity_profile_dto_v1(v_profile);
end;
$$;

create function public.payr_connector_save_sender_profile_v1(p_workspace_id uuid, p_connector_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_input jsonb; v_profile public.sender_profiles;
begin
  perform public.payr_draft_scope_v1(p_workspace_id, null, p_connector_id, 'sender:write');
  if not public.payr_identity_object_v1(p_input,
    array['expectedProfileId','expectedRevision','approval','businessName','billingAddress','contactName','contactEmail','invoicePrefix','defaultPaymentTermsDays'])
    or (p_input -> 'approval' = 'true'::jsonb) is not true
    or (pg_catalog.jsonb_typeof(p_input -> 'expectedProfileId') = 'string'
      and (p_input ->> 'expectedProfileId') ~* '^([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$') is not true then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  v_input := public.payr_identity_save_input_v1(p_input - 'expectedProfileId' - 'approval', false);
  if not public.payr_draft_country_v1(v_input #> '{billingAddress,countryCode}') then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  select s.* into v_profile from public.sender_profiles as s where s.workspace_id = p_workspace_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  perform public.payr_draft_scope_v1(p_workspace_id, null, p_connector_id, 'sender:write');
  if v_profile.id <> (p_input ->> 'expectedProfileId')::uuid then
    raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
  end if;
  if v_profile.revision <> (v_input ->> 'expectedRevision')::integer or v_profile.revision = 2147483647 then
    raise exception using errcode = 'P0001', message = 'REVISION_CONFLICT';
  end if;
  -- Deliberate allowlist: payout_wallet is never part of a connector update.
  update public.sender_profiles set business_name = v_input ->> 'businessName', billing_address = v_input -> 'billingAddress',
    contact_name = v_input ->> 'contactName', contact_email = v_input ->> 'contactEmail', invoice_prefix = v_input ->> 'invoicePrefix',
    default_terms = (v_input ->> 'defaultPaymentTermsDays')::integer::text, revision = revision + 1, updated_at = pg_catalog.clock_timestamp()
    where id = v_profile.id and workspace_id = p_workspace_id returning * into v_profile;
  insert into public.audit_events (id, workspace_id, connector_token_id, action, outcome)
    values (pg_catalog.gen_random_uuid(), p_workspace_id, p_connector_id, 'sender:write', 'succeeded');
  return public.payr_identity_profile_dto_v1(v_profile);
end;
$$;

revoke all on function public.payr_connector_scopes_valid_v1(text[]),
  public.payr_create_connector_v2(uuid,text,uuid,text,timestamptz,text[]),
  public.payr_connector_get_sender_profile_v1(uuid,uuid), public.payr_connector_save_sender_profile_v1(uuid,uuid,jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.payr_create_connector_v2(uuid,text,uuid,text,timestamptz,text[]),
  public.payr_connector_get_sender_profile_v1(uuid,uuid), public.payr_connector_save_sender_profile_v1(uuid,uuid,jsonb)
  to service_role;

commit;
