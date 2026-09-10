begin;

-- Explicit v2 approval is recorded only for a newly reserved attempt. No backfill.
create table public.invoice_email_approvals (
  publication_attempt_id uuid primary key,
  workspace_id uuid not null,
  config jsonb not null,
  foreign key (workspace_id,publication_attempt_id) references public.publication_attempts(workspace_id,id),
  check ((public.payr_identity_object_v1(config,array['from','appOrigin','templateVersion','network'])
    and config ?& array['from','appOrigin','templateVersion','network']
    and config->>'templateVersion'='invoice-issued-v1' and config->>'network'='Arc Testnet'
    and length(config->>'from') between 3 and 320 and config->>'from' !~ '[[:cntrl:]]'
    and config->>'appOrigin' ~ '^https?://[^/[:space:]]+$') is true)
);
alter table public.invoice_email_approvals enable row level security;
revoke all on public.invoice_email_approvals from public,anon,authenticated,service_role;

alter table public.email_deliveries
  alter column settlement_id drop not null,
  alter column receipt_document_id drop not null,
  add column publication_attempt_id uuid,
  add constraint email_deliveries_publication_fk foreign key (workspace_id,publication_attempt_id)
    references public.publication_attempts(workspace_id,id),
  drop constraint email_deliveries_message_kind,
  add constraint email_deliveries_message_shape check (
    (message_kind='receipt' and settlement_id is not null and receipt_document_id is not null and publication_attempt_id is null)
    or (message_kind='invoice_issued' and settlement_id is null and receipt_document_id is null and publication_attempt_id is not null));
create unique index email_deliveries_invoice_recipient on public.email_deliveries(publication_attempt_id,normalized_recipient)
  where message_kind='invoice_issued';
create index email_deliveries_invoice_claim on public.email_deliveries(updated_at,created_at,id)
  where message_kind='invoice_issued' and state in ('pending','retry_wait','sending');

-- Add origin only at new application DTO seams. Shipped v1 functions/DTOs stay byte-shape compatible.
create function public.payr_pin_publication_origin_v1(p_attempt jsonb)
returns jsonb language sql volatile security definer set search_path='' as $$
  -- A replay may have waited for reservation to commit. Read approval using a fresh snapshot.
  select coalesce((select pg_catalog.jsonb_set(p_attempt,'{link,appOrigin}',c.config->'appOrigin')
    from public.invoice_email_approvals c where c.workspace_id=(p_attempt->>'workspaceId')::uuid
      and c.publication_attempt_id=(p_attempt->>'id')::uuid),p_attempt);
$$;

create function public.payr_find_publication_replay_v2(p_workspace_id uuid,p_owner_wallet text,p_connector_id uuid,
  p_idempotency_key text,p_request_fingerprint text)
returns jsonb language sql security definer set search_path='' as $$
  select public.payr_pin_publication_origin_v1(public.payr_find_publication_replay_v1(
    p_workspace_id,p_owner_wallet,p_connector_id,p_idempotency_key,p_request_fingerprint));
$$;

create function public.payr_claim_publication_v2(p_attempt_id uuid,p_lease_owner uuid)
returns jsonb language sql security definer set search_path='' as $$
  select public.payr_pin_publication_origin_v1(public.payr_claim_publication_v1(p_attempt_id,p_lease_owner));
$$;

create function public.payr_read_invoice_document_v2(p_token_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb;
begin
  v_result:=public.payr_read_invoice_document_v1(p_token_id);
  if v_result='null'::jsonb then return v_result; end if;
  return pg_catalog.jsonb_set(v_result,'{attempt}',public.payr_pin_publication_origin_v1(v_result->'attempt'));
end;
$$;

create function public.payr_reserve_publication_v2(p_workspace_id uuid,p_owner_wallet text,p_connector_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_existing jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:publish');
  if p_input->'deliveryApproval' is distinct from 'true'::jsonb or p_input->'emailConfig' is null then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;
  v_existing:=public.payr_find_publication_replay_v1(p_workspace_id,p_owner_wallet,p_connector_id,
    p_input->>'idempotencyKey',p_input->>'requestFingerprint');
  v_result:=public.payr_reserve_publication_v1(p_workspace_id,p_owner_wallet,p_connector_id,p_input-array['deliveryApproval','emailConfig']);
  -- v1 returns the original ID on replay. Never attach approval to an existing attempt.
  if v_existing='null'::jsonb and v_result->>'id'=p_input->>'attemptId' and v_result->>'state'='reserved' then
    insert into public.invoice_email_approvals(publication_attempt_id,workspace_id,config)
      values((v_result->>'id')::uuid,p_workspace_id,p_input->'emailConfig');
  end if;
  return public.payr_pin_publication_origin_v1(v_result);
end;
$$;

create function public.payr_enqueue_invoice_email_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_snapshot jsonb; v_sender text; v_client text; v_recipient text; v_roles text[];
begin
  if new.state<>'finalized' or old.state='finalized' or not exists(
    select 1 from public.invoice_email_approvals where publication_attempt_id=new.id and workspace_id=new.workspace_id) then return new; end if;
  select draft_snapshot into strict v_snapshot from public.invoice_versions
    where workspace_id=new.workspace_id and id=new.invoice_version_id;
  v_sender:=pg_catalog.lower(pg_catalog.btrim(v_snapshot#>>'{sender,contactEmail}'));
  v_client:=pg_catalog.lower(pg_catalog.btrim(v_snapshot#>>'{client,contactEmail}'));
  if v_sender is null or v_client is null then raise exception using errcode='22023',message='INVALID_EMAIL_RECIPIENT'; end if;
  for v_recipient in select distinct unnest(array[v_sender,v_client]) loop
    v_roles:='{}';
    if v_recipient=v_sender then v_roles:=v_roles||array['issuer']; end if;
    if v_recipient=v_client then v_roles:=v_roles||array['client']; end if;
    insert into public.email_deliveries(id,workspace_id,publication_attempt_id,message_kind,normalized_recipient,roles,provider_idempotency_key)
      values(pg_catalog.gen_random_uuid(),new.workspace_id,new.id,'invoice_issued',v_recipient,v_roles,
        'invoice-issued/'||new.id::text||'/'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(v_recipient,'UTF8')),'hex'));
  end loop;
  return new;
end;
$$;
-- Runs inside payr_finalize_publication_v1; enqueue failure rolls back every finalization write.
create trigger publication_invoice_email after update of state on public.publication_attempts
  for each row execute function public.payr_enqueue_invoice_email_v1();

create function public.payr_invoice_email_identity_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='invoice_email_approvals' then
    raise exception using errcode='55000',message='DELIVERY_IDENTITY_IMMUTABLE';
  end if;
  if new.publication_attempt_id is distinct from old.publication_attempt_id then
    raise exception using errcode='55000',message='DELIVERY_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger invoice_email_approval_immutable before update or delete on public.invoice_email_approvals
  for each row execute function public.payr_invoice_email_identity_v1();
create trigger invoice_email_identity before update on public.email_deliveries
  for each row execute function public.payr_invoice_email_identity_v1();

-- Preserve the receipt DTO signature/shape and let the shared completion algorithm dispatch by kind.
create or replace function public.payr_delivery_worker_dto_v1(p_row public.email_deliveries)
returns jsonb language sql stable security definer set search_path='' as $$
  select case when p_row.message_kind='receipt' then coalesce((select pg_catalog.jsonb_build_object(
    'id',p_row.id,'workspaceId',p_row.workspace_id,'settlementId',p_row.settlement_id,'receiptDocumentId',p_row.receipt_document_id,
    'messageKind',p_row.message_kind,'normalizedRecipient',p_row.normalized_recipient,'roles',p_row.roles,
    'state',p_row.state,'fence',p_row.fence::text,'attemptCount',p_row.attempt_count,'leaseUntil',p_row.lease_until,
    'nextAttemptAt',p_row.next_attempt_at,'providerIdempotencyKey',p_row.provider_idempotency_key,
    'firstProviderAttemptAt',p_row.first_provider_attempt_at,'providerRequestStartedAt',p_row.provider_request_started_at,
    'ambiguousSince',p_row.ambiguous_since,'providerMessageId',p_row.provider_message_id,'lastErrorCode',p_row.last_error_code,
    'payloadHash',p_row.provider_payload_hash,'receipt',public.payr_receipt_worker_dto_v1(r))
    from public.receipt_documents r where r.workspace_id=p_row.workspace_id and r.id=p_row.receipt_document_id
      and r.settlement_id=p_row.settlement_id),'null'::jsonb)
  else (select pg_catalog.jsonb_build_object(
    'id',p_row.id,'workspaceId',p_row.workspace_id,'publicationAttemptId',p_row.publication_attempt_id,
    'messageKind',p_row.message_kind,'normalizedRecipient',p_row.normalized_recipient,'roles',p_row.roles,
    'state',p_row.state,'fence',p_row.fence::text,'attemptCount',p_row.attempt_count,'leaseUntil',p_row.lease_until,
    'nextAttemptAt',p_row.next_attempt_at,'providerIdempotencyKey',p_row.provider_idempotency_key,
    'firstProviderAttemptAt',p_row.first_provider_attempt_at,'providerRequestStartedAt',p_row.provider_request_started_at,
    'ambiguousSince',p_row.ambiguous_since,'providerMessageId',p_row.provider_message_id,'lastErrorCode',p_row.last_error_code,
    'payloadHash',p_row.provider_payload_hash,'publication',public.payr_pin_publication_origin_v1(public.payr_publication_attempt_dto_v1(a)),'emailConfig',c.config)
    from public.publication_attempts a join public.invoice_email_approvals c on c.publication_attempt_id=a.id
    where a.id=p_row.publication_attempt_id and a.workspace_id=p_row.workspace_id and c.workspace_id=a.workspace_id) end;
$$;

create function public.payr_invoice_email_sendable_v1(p_attempt_id uuid,p_now timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.publication_attempts a
    join public.invoices i on i.workspace_id=a.workspace_id and i.id=a.invoice_id
    join public.access_links l on l.workspace_id=a.workspace_id and l.token_id=a.invoice_token_id and l.purpose='invoice-bearer'
    where a.id=p_attempt_id and a.state='finalized' and i.commercial_state='published' and i.payable_until>p_now
      and l.activated_at<=p_now and l.revoked_at is null and l.expires_at>p_now
      and not exists(select 1 from public.settlements s where s.workspace_id=a.workspace_id and s.invoice_id=a.invoice_id));
$$;

create function public.payr_claim_invoice_delivery_v1(p_id uuid default null,p_publication_attempt_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.email_deliveries; v_now timestamptz; v_ambiguous timestamptz; v_code text;
begin
  select * into v_row from public.email_deliveries d where d.message_kind='invoice_issued'
    and (p_id is null or d.id=p_id) and (p_publication_attempt_id is null or d.publication_attempt_id=p_publication_attempt_id)
    and d.fence<9223372036854775807 and d.attempt_count<2147483647
    and (d.state='pending' or d.state='retry_wait' and d.next_attempt_at<=pg_catalog.clock_timestamp()
      or d.state='sending' and d.lease_until<=pg_catalog.clock_timestamp())
    order by d.updated_at,d.created_at,d.id for update skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  v_now:=pg_catalog.clock_timestamp();
  v_ambiguous:=v_row.ambiguous_since;
  if v_row.state='sending' and v_row.provider_request_started_at is not null then
    v_ambiguous:=coalesce(v_ambiguous,v_row.provider_request_started_at);
  end if;
  if not public.payr_invoice_email_sendable_v1(v_row.publication_attempt_id,v_now) then v_code:='LINK_UNAVAILABLE';
  elsif public.payr_delivery_window_closed_v1(v_row.first_provider_attempt_at,v_ambiguous,v_now) then v_code:='AMBIGUOUS_WINDOW_EXPIRED'; end if;
  if v_code is not null then
    update public.email_deliveries set state=case when v_ambiguous is not null then 'manual_review'::public.delivery_state else 'failed'::public.delivery_state end,
      last_error_code=v_code,ambiguous_since=v_ambiguous,lease_until=null,next_attempt_at=null,updated_at=v_now
      where id=v_row.id returning * into v_row;
  else
    update public.email_deliveries set state='sending',fence=fence+1,attempt_count=attempt_count+1,
      lease_until=v_now+interval '180 seconds',next_attempt_at=null,ambiguous_since=v_ambiguous,
      provider_request_started_at=null,last_error_code=null,updated_at=v_now where id=v_row.id returning * into v_row;
  end if;
  return public.payr_delivery_worker_dto_v1(v_row);
end;
$$;

create function public.payr_begin_invoice_delivery_v1(p_id uuid,p_fence bigint,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row public.email_deliveries; v_now timestamptz; v_code text; v_attempt public.publication_attempts;
begin
  if p_id is null or p_fence is null or p_fence<1 or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  -- Read immutable identity without row locks. Settlement/void take this advisory lock first;
  -- never wait for it while holding invoice, link, connector or delivery row locks.
  select a.* into v_attempt from public.email_deliveries d join public.publication_attempts a
    on a.workspace_id=d.workspace_id and a.id=d.publication_attempt_id
    where d.id=p_id and d.message_kind='invoice_issued';
  if not found then return 'null'::jsonb; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payr:invoice:'||v_attempt.chain_id::text||':'||v_attempt.contract_address||':'||v_attempt.invoice_key,0));
  select * into v_row from public.email_deliveries where id=p_id and message_kind='invoice_issued' for update;
  if not found then return 'null'::jsonb; end if;
  -- Serialize the last pre-I/O decision with void/revocation and settlement writes.
  perform 1 from public.invoices i join public.publication_attempts a on a.workspace_id=i.workspace_id and a.invoice_id=i.id
    where a.id=v_row.publication_attempt_id for share of i;
  perform 1 from public.access_links l join public.publication_attempts a on a.workspace_id=l.workspace_id and a.invoice_token_id=l.token_id
    where a.id=v_row.publication_attempt_id for share of l;
  v_now:=pg_catalog.clock_timestamp();
  if v_row.state<>'sending' or v_row.fence<>p_fence or v_row.lease_until is null or v_row.lease_until<=v_now
    or v_row.provider_request_started_at is not null then return 'null'::jsonb; end if;
  if public.payr_delivery_window_closed_v1(v_row.first_provider_attempt_at,v_row.ambiguous_since,v_now) then v_code:='AMBIGUOUS_WINDOW_EXPIRED';
  elsif v_row.provider_payload_hash is not null and v_row.provider_payload_hash<>p_payload_hash then v_code:='PAYLOAD_CHANGED';
  elsif not public.payr_invoice_email_sendable_v1(v_row.publication_attempt_id,v_now) then v_code:='LINK_UNAVAILABLE'; end if;
  if v_code is not null then
    update public.email_deliveries set state='manual_review',last_error_code=v_code,lease_until=null,next_attempt_at=null,updated_at=v_now
      where id=p_id returning * into v_row;
  else
    update public.email_deliveries set first_provider_attempt_at=coalesce(first_provider_attempt_at,v_now),
      provider_request_started_at=v_now,provider_payload_hash=coalesce(provider_payload_hash,p_payload_hash),updated_at=v_now
      where id=p_id returning * into v_row;
  end if;
  return public.payr_delivery_worker_dto_v1(v_row);
end;
$$;

create function public.payr_claim_invoice_publication_v1(p_attempt_id uuid,p_lease_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_lease_owner is null then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  select a.id into v_id from public.publication_attempts a join public.invoice_email_approvals c
    on c.workspace_id=a.workspace_id and c.publication_attempt_id=a.id
    where (p_attempt_id is null or a.id=p_attempt_id) and a.chain_id is not null and a.fence<9223372036854775807
      and a.state in ('reserved','rendering','stored') and (a.lease_until is null or a.lease_until<=pg_catalog.clock_timestamp())
    order by a.updated_at,a.created_at,a.id limit 1;
  if not found then return 'null'::jsonb; end if;
  -- The existing scoped claim owns locking, lease and fence CAS. A racing claim may return null.
  -- Never pass null here: that would let v1 claim unrelated historical no-send work.
  return public.payr_claim_publication_v2(v_id,p_lease_owner);
end;
$$;

create function public.payr_publication_status_v2(p_workspace_id uuid,p_owner_wallet text,p_connector_id uuid,p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_deliveries jsonb;
begin
  v_result:=public.payr_publication_status_v1(p_workspace_id,p_owner_wallet,p_connector_id,p_invoice_id);
  if v_result='null'::jsonb then return v_result; end if;
  v_result:=pg_catalog.jsonb_set(v_result,'{attempt}',public.payr_pin_publication_origin_v1(v_result->'attempt'));
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('roles',d.roles,'state',d.state,
    'attemptCount',d.attempt_count,'nextAttemptAt',d.next_attempt_at) order by d.normalized_recipient),'[]'::jsonb)
    into v_deliveries from public.email_deliveries d where d.workspace_id=p_workspace_id
      and d.publication_attempt_id=(v_result#>>'{attempt,id}')::uuid and d.message_kind='invoice_issued';
  return v_result||pg_catalog.jsonb_build_object('invoiceDeliveries',v_deliveries);
end;
$$;

alter table public.audit_events drop constraint audit_events_bounded_codes;
alter table public.audit_events add constraint audit_events_bounded_codes check (
  action in ('auth.login','auth.payout_nonce','profile.save','profile.payout_change','client.save',
    'connector.create','connector.revoke','connector.admit','invoice:draft','invoice:publish','invoice:status','invoice:void',
    'settlement.recorded','receipt.generate','receipt.deliver','sender:read','sender:write','wallet:read','invoice.deliver')
  and outcome in ('allowed','denied','rate_limited','succeeded','failed','retry_wait','manual_review')
);
create or replace function public.payr_audit_settlement_work_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_action text; v_outcome text;
begin
  if tg_table_name='settlements' then v_action:='settlement.recorded'; v_outcome:='succeeded';
  elsif new.state is distinct from old.state then
    if tg_table_name='receipt_documents' then v_action:='receipt.generate';
    else v_action:=case when new.message_kind='invoice_issued' then 'invoice.deliver' else 'receipt.deliver' end; end if;
    v_outcome:=case when new.state::text in ('ready','sent') then 'succeeded'
      when new.state::text in ('failed','retry_wait','manual_review') then new.state::text else null end;
  end if;
  if v_outcome is not null then insert into public.audit_events(id,workspace_id,action,outcome)
    values(pg_catalog.gen_random_uuid(),new.workspace_id,v_action,v_outcome); end if;
  return new;
end;
$$;

revoke all on function public.payr_reserve_publication_v2(uuid,text,uuid,jsonb),public.payr_enqueue_invoice_email_v1(),
  public.payr_invoice_email_identity_v1(),public.payr_delivery_worker_dto_v1(public.email_deliveries),
  public.payr_invoice_email_sendable_v1(uuid,timestamptz),public.payr_claim_invoice_delivery_v1(uuid,uuid),
  public.payr_begin_invoice_delivery_v1(uuid,bigint,text),public.payr_publication_status_v2(uuid,text,uuid,uuid),
  public.payr_claim_invoice_publication_v1(uuid,uuid),public.payr_pin_publication_origin_v1(jsonb),
  public.payr_find_publication_replay_v2(uuid,text,uuid,text,text),public.payr_claim_publication_v2(uuid,uuid),
  public.payr_read_invoice_document_v2(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.payr_reserve_publication_v2(uuid,text,uuid,jsonb),public.payr_claim_invoice_delivery_v1(uuid,uuid),
  public.payr_begin_invoice_delivery_v1(uuid,bigint,text),public.payr_publication_status_v2(uuid,text,uuid,uuid),
  public.payr_claim_invoice_publication_v1(uuid,uuid),public.payr_find_publication_replay_v2(uuid,text,uuid,text,text),
  public.payr_claim_publication_v2(uuid,uuid),public.payr_read_invoice_document_v2(uuid) to service_role;
commit;
