begin;

create function public.payr_receipt_worker_dto_v1(p_row public.receipt_documents)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select pg_catalog.jsonb_build_object(
    'id',p_row.id,'workspaceId',p_row.workspace_id,'invoiceId',p_row.invoice_id,
    'invoiceVersionId',p_row.invoice_version_id,'settlementId',p_row.settlement_id,
    'state',p_row.state,'fence',p_row.fence::text,'attemptCount',p_row.attempt_count,
    'leaseUntil',p_row.lease_until,'nextAttemptAt',p_row.next_attempt_at,'failureCode',p_row.terminal_failure_code,
    'link',public.payr_publication_link_dto_v1(l),
    'artifact',case when p_row.content_hash is null then 'null'::jsonb else pg_catalog.jsonb_build_object(
      'storageKey',p_row.storage_key,'pdfFilename',p_row.pdf_filename,'contentType',p_row.content_type,
      'byteLength',p_row.byte_length,'pdfContentHash',p_row.content_hash,'qrVerified',true) end,
    'attempt',public.payr_publication_attempt_dto_v1(a),
    'settlement',pg_catalog.jsonb_build_object('chainId',s.chain_id,'contractAddress',s.contract_address,
      'invoiceVersion',v.version_number,'transactionHash',s.transaction_hash,'logIndex',s.log_index,
      'blockNumber',s.block_number::text,'blockTime',s.block_time,'payer',s.payer,'payee',s.payee,
      'amountDecimal',pg_catalog.trim_scale(s.amount_atomic*0.000000000000000001::numeric)::text,
      'amountAtomic',s.amount_atomic::text,'documentCommitment',s.document_commitment))
    from public.settlements s join public.publication_attempts a
      on a.workspace_id=s.workspace_id and a.id=s.publication_attempt_id and a.invoice_id=s.invoice_id
      and a.invoice_version_id=s.invoice_version_id and a.state='finalized'
    join public.invoice_versions v on v.workspace_id=s.workspace_id and v.invoice_id=s.invoice_id
      and v.id=s.invoice_version_id and v.frozen_at is not null
    join public.access_links l on l.workspace_id=p_row.workspace_id and l.receipt_document_id=p_row.id
      and l.purpose='receipt-bearer' and l.token_id=p_row.token_id and l.key_version=p_row.key_version
      and l.verifier_hash=p_row.verifier_hash and l.expires_at=p_row.link_expires_at
    where s.workspace_id=p_row.workspace_id and s.id=p_row.settlement_id
      and s.invoice_id=p_row.invoice_id and s.invoice_version_id=p_row.invoice_version_id),'null'::jsonb);
$$;

create function public.payr_claim_receipt_v1(p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.receipt_documents; v_now timestamptz; v_dto jsonb;
begin
  select * into v_row from public.receipt_documents r where (p_id is null or r.id=p_id)
    and (r.state='pending' or r.state='retry_wait' and r.next_attempt_at<=pg_catalog.clock_timestamp()
      or r.state='rendering' and r.lease_until<=pg_catalog.clock_timestamp())
    and r.fence<9223372036854775807 and r.attempt_count<2147483647
    order by r.created_at,r.id for update skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  v_dto:=public.payr_receipt_worker_dto_v1(v_row);
  if v_dto='null'::jsonb or v_dto->'attempt'='null'::jsonb then
    raise exception using errcode='P0001',message='RECEIPT_UNAVAILABLE';
  end if;
  v_now:=pg_catalog.clock_timestamp();
  if not exists(select 1 from public.access_links l where l.workspace_id=v_row.workspace_id
    and l.receipt_document_id=v_row.id and l.token_id=v_row.token_id and l.purpose='receipt-bearer'
    and l.activated_at<=v_now and l.revoked_at is null and l.expires_at>v_now) then
    update public.receipt_documents set state='failed',terminal_failure_code='LINK_UNAVAILABLE',
      lease_until=null,next_attempt_at=null,updated_at=v_now where id=v_row.id returning * into v_row;
  else
    update public.receipt_documents set state='rendering',fence=fence+1,attempt_count=attempt_count+1,
      lease_until=v_now+interval '120 seconds',next_attempt_at=null,updated_at=v_now
      where id=v_row.id returning * into v_row;
  end if;
  return public.payr_receipt_worker_dto_v1(v_row);
end;
$$;

create function public.payr_complete_receipt_v1(p_id uuid,p_fence bigint,p_artifact jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_row public.receipt_documents; v_now timestamptz; v_dto jsonb; v_size numeric;
begin
  if p_id is null or p_fence is null or p_fence<1 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  select * into v_row from public.receipt_documents where id=p_id for update;
  if not found then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_row.state<>'rendering' or v_row.fence<>p_fence or v_row.lease_until<=v_now or v_row.lease_until is null then return false; end if;
  v_dto:=public.payr_receipt_worker_dto_v1(v_row);
  if (public.payr_identity_object_v1(p_artifact,array['storageKey','pdfFilename','contentType','byteLength','pdfContentHash','qrVerified'])
    and p_artifact ?& array['storageKey','pdfFilename','contentType','byteLength','pdfContentHash','qrVerified']
    and p_artifact->>'storageKey'='workspace/'||v_row.workspace_id::text||'/receipt/'||v_row.id::text||'.pdf'
    and p_artifact->>'pdfFilename'='receipt-'||(v_dto#>>'{attempt,invoiceNumber}')||'-v'||(v_dto#>>'{attempt,invoiceVersion}')||'.pdf'
    and p_artifact->>'contentType'='application/pdf' and p_artifact->>'pdfContentHash' ~ '^0x[0-9a-f]{64}$'
    and p_artifact->'qrVerified'='true'::jsonb and pg_catalog.jsonb_typeof(p_artifact->'byteLength')='number') is not true then
    raise exception using errcode='22023',message='ARTIFACT_VERIFICATION_FAILED';
  end if;
  v_size:=(p_artifact->>'byteLength')::numeric;
  if (v_size>=5 and v_size<=10485760 and v_size=pg_catalog.trunc(v_size)) is not true then
    raise exception using errcode='22023',message='ARTIFACT_VERIFICATION_FAILED';
  end if;
  if not exists(select 1 from public.access_links l where l.workspace_id=v_row.workspace_id and l.receipt_document_id=v_row.id
    and l.token_id=v_row.token_id and l.purpose='receipt-bearer' and l.activated_at<=v_now and l.revoked_at is null and l.expires_at>v_now) then return false; end if;
  update public.receipt_documents set state='ready',storage_key=p_artifact->>'storageKey',pdf_filename=p_artifact->>'pdfFilename',
    content_type='application/pdf',byte_length=v_size,content_hash=p_artifact->>'pdfContentHash',ready_at=v_now,
    lease_until=null,next_attempt_at=null,terminal_failure_code=null,updated_at=v_now where id=p_id;
  return true;
end;
$$;

create function public.payr_read_receipt_v1(p_token_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select public.payr_receipt_worker_dto_v1(r) from public.receipt_documents r
    join public.access_links l on l.workspace_id=r.workspace_id and l.receipt_document_id=r.id
      and l.token_id=r.token_id and l.purpose='receipt-bearer' and l.key_version=r.key_version
      and l.verifier_hash=r.verifier_hash and l.expires_at=r.link_expires_at
    where r.token_id=p_token_id and r.state='ready' and l.activated_at<=pg_catalog.clock_timestamp()
      and l.revoked_at is null and l.expires_at>pg_catalog.clock_timestamp()),'null'::jsonb);
$$;

create function public.payr_worker_retry_at_v1(p_now timestamptz,p_attempt integer)
returns timestamptz language sql immutable security definer set search_path = '' as $$
  select p_now+pg_catalog.make_interval(secs=>least(1800::numeric,30*pg_catalog.power(2::numeric,least(p_attempt,6)))::double precision);
$$;

create function public.payr_fail_receipt_v1(p_id uuid,p_fence bigint,p_code text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_row public.receipt_documents; v_now timestamptz;
begin
  if p_id is null or p_fence is null or p_fence<1 or p_code is null or p_code not in ('DOCUMENT_UNAVAILABLE','ARTIFACT_VERIFICATION_FAILED') then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;
  select * into v_row from public.receipt_documents where id=p_id for update;
  if not found then return false; end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_row.state<>'rendering' or v_row.fence<>p_fence or v_row.lease_until is null or v_row.lease_until<=v_now then return false; end if;
  update public.receipt_documents set
    state=case when p_code='ARTIFACT_VERIFICATION_FAILED' then 'failed'::public.receipt_document_state else 'retry_wait'::public.receipt_document_state end,
    terminal_failure_code=case when p_code='ARTIFACT_VERIFICATION_FAILED' then p_code else null end,
    next_attempt_at=case when p_code='DOCUMENT_UNAVAILABLE' then public.payr_worker_retry_at_v1(v_now,attempt_count) else null end,
    lease_until=null,updated_at=v_now where id=p_id;
  return true;
end;
$$;

create function public.payr_protect_receipt_identity_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.state='ready' then raise exception using errcode='55000',message='READY_RECEIPT_IMMUTABLE'; end if;
  if tg_op='DELETE' then raise exception using errcode='55000',message='RECEIPT_IDENTITY_IMMUTABLE'; end if;
  if row(new.id,new.workspace_id,new.settlement_id,new.invoice_id,new.invoice_version_id,new.token_id,new.key_version,new.verifier_hash,new.link_expires_at,new.created_at)
    is distinct from row(old.id,old.workspace_id,old.settlement_id,old.invoice_id,old.invoice_version_id,old.token_id,old.key_version,old.verifier_hash,old.link_expires_at,old.created_at)
    or new.fence<old.fence or new.fence::numeric>old.fence::numeric+1 or new.attempt_count<old.attempt_count then
    raise exception using errcode='55000',message='RECEIPT_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger receipt_documents_identity before update or delete on public.receipt_documents
  for each row execute function public.payr_protect_receipt_identity_v1();

alter table public.email_deliveries add column provider_payload_hash text
  check (provider_payload_hash is null or provider_payload_hash ~ '^[0-9a-f]{64}$');

create function public.payr_delivery_worker_dto_v1(p_row public.email_deliveries)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select pg_catalog.jsonb_build_object(
    'id',p_row.id,'workspaceId',p_row.workspace_id,'settlementId',p_row.settlement_id,'receiptDocumentId',p_row.receipt_document_id,
    'messageKind',p_row.message_kind,'normalizedRecipient',p_row.normalized_recipient,'roles',p_row.roles,
    'state',p_row.state,'fence',p_row.fence::text,'attemptCount',p_row.attempt_count,'leaseUntil',p_row.lease_until,
    'nextAttemptAt',p_row.next_attempt_at,'providerIdempotencyKey',p_row.provider_idempotency_key,
    'firstProviderAttemptAt',p_row.first_provider_attempt_at,'providerRequestStartedAt',p_row.provider_request_started_at,
    'ambiguousSince',p_row.ambiguous_since,'providerMessageId',p_row.provider_message_id,'lastErrorCode',p_row.last_error_code,
    'payloadHash',p_row.provider_payload_hash,'receipt',public.payr_receipt_worker_dto_v1(r))
    from public.receipt_documents r where r.workspace_id=p_row.workspace_id and r.id=p_row.receipt_document_id
      and r.settlement_id=p_row.settlement_id),'null'::jsonb);
$$;

create function public.payr_ready_receipt_link_v1(p_id uuid,p_workspace_id uuid,p_now timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.receipt_documents r join public.access_links l
    on l.workspace_id=r.workspace_id and l.receipt_document_id=r.id and l.token_id=r.token_id
      and l.key_version=r.key_version and l.verifier_hash=r.verifier_hash and l.expires_at=r.link_expires_at
      and l.purpose='receipt-bearer'
    where r.id=p_id and r.workspace_id=p_workspace_id and r.state='ready'
      and l.revoked_at is null and l.activated_at<=p_now and l.expires_at>p_now);
$$;

create function public.payr_delivery_window_closed_v1(p_first timestamptz,p_ambiguous timestamptz,p_now timestamptz)
returns boolean language sql immutable security definer set search_path = '' as $$
  select p_ambiguous is not null and (p_first is null or p_now>=p_first+interval '24 hours');
$$;

create function public.payr_claim_delivery_v1(p_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.email_deliveries; v_now timestamptz; v_dto jsonb; v_roles text[]:='{}'; v_ambiguous timestamptz; v_code text;
begin
  select d.* into v_row from public.email_deliveries d join public.receipt_documents r
    on r.workspace_id=d.workspace_id and r.id=d.receipt_document_id and r.settlement_id=d.settlement_id and r.state='ready'
    where (p_id is null or d.id=p_id) and d.fence<9223372036854775807 and d.attempt_count<2147483647
      and (d.state='pending' or d.state='retry_wait' and d.next_attempt_at<=pg_catalog.clock_timestamp()
        or d.state='sending' and d.lease_until<=pg_catalog.clock_timestamp())
    order by d.created_at,d.id for update of d skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  v_dto:=public.payr_delivery_worker_dto_v1(v_row);
  if v_dto='null'::jsonb or v_dto#>'{receipt,attempt}'='null'::jsonb then raise exception using errcode='P0001',message='DELIVERY_UNAVAILABLE'; end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_row.normalized_recipient=pg_catalog.lower(pg_catalog.btrim(v_dto#>>'{receipt,attempt,snapshot,sender,contactEmail}')) then v_roles:=v_roles||array['issuer']; end if;
  if v_row.normalized_recipient=pg_catalog.lower(pg_catalog.btrim(v_dto#>>'{receipt,attempt,snapshot,client,contactEmail}')) then v_roles:=v_roles||array['client']; end if;
  v_ambiguous:=v_row.ambiguous_since;
  if v_row.state='sending' and v_row.provider_request_started_at is not null then v_ambiguous:=coalesce(v_ambiguous,v_row.provider_request_started_at); end if;
  if v_roles<>v_row.roles or pg_catalog.cardinality(v_roles)=0 then v_code:='RECIPIENT_MISMATCH';
  elsif not public.payr_ready_receipt_link_v1(v_row.receipt_document_id,v_row.workspace_id,v_now) then v_code:='LINK_UNAVAILABLE';
  elsif public.payr_delivery_window_closed_v1(v_row.first_provider_attempt_at,v_ambiguous,v_now) then v_code:='AMBIGUOUS_WINDOW_EXPIRED';
  end if;
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

create function public.payr_begin_delivery_v1(p_id uuid,p_fence bigint,p_payload_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.email_deliveries; v_now timestamptz; v_code text;
begin
  if p_id is null or p_fence is null or p_fence<1 or p_payload_hash is null or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;
  select * into v_row from public.email_deliveries where id=p_id for update;
  if not found then return 'null'::jsonb; end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_row.state<>'sending' or v_row.fence<>p_fence or v_row.lease_until is null or v_row.lease_until<=v_now
    or v_row.provider_request_started_at is not null then return 'null'::jsonb; end if;
  if public.payr_delivery_window_closed_v1(v_row.first_provider_attempt_at,v_row.ambiguous_since,v_now) then v_code:='AMBIGUOUS_WINDOW_EXPIRED';
  elsif v_row.provider_payload_hash is not null and v_row.provider_payload_hash<>p_payload_hash then v_code:='PAYLOAD_CHANGED';
  elsif not public.payr_ready_receipt_link_v1(v_row.receipt_document_id,v_row.workspace_id,v_now) then v_code:='LINK_UNAVAILABLE';
  end if;
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

create function public.payr_finish_delivery_v1(p_id uuid,p_fence bigint,p_result jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.email_deliveries; v_now timestamptz; v_kind text; v_code text; v_state public.delivery_state; v_ambiguous timestamptz;
begin
  if p_id is null or p_fence is null or p_fence<1 then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  v_kind:=p_result->>'kind';
  if v_kind='sent' then
    if (public.payr_identity_object_v1(p_result,array['kind','providerMessageId']) and p_result ?& array['kind','providerMessageId']
      and pg_catalog.jsonb_typeof(p_result->'providerMessageId')='string' and length(p_result->>'providerMessageId') between 1 and 1000
      and (p_result->>'providerMessageId') !~ '[[:cntrl:]]') is not true then raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  elsif v_kind in ('retry','ambiguous','failed','manual_review') then
    v_code:=p_result->>'code';
    if (public.payr_identity_object_v1(p_result,array['kind','code']) and p_result ?& array['kind','code']
      and v_code in ('DOCUMENT_UNAVAILABLE','DOCUMENT_INVALID','PROVIDER_RATE_LIMITED','PROVIDER_REJECTED','PROVIDER_AMBIGUOUS','PROVIDER_CONFLICT')) is not true then
      raise exception using errcode='22023',message='INVALID_INPUT';
    end if;
  else raise exception using errcode='22023',message='INVALID_INPUT'; end if;
  select * into v_row from public.email_deliveries where id=p_id for update;
  if not found then return 'null'::jsonb; end if;
  v_now:=pg_catalog.clock_timestamp();
  if v_row.state<>'sending' or v_row.fence<>p_fence or v_row.lease_until is null or v_row.lease_until<=v_now then return 'null'::jsonb; end if;
  v_ambiguous:=v_row.ambiguous_since;
  if v_kind='sent' then
    if v_row.provider_request_started_at is null or v_row.first_provider_attempt_at is null or v_row.provider_payload_hash is null then
      raise exception using errcode='22023',message='REQUEST_MARKER_REQUIRED';
    end if;
    v_state:='sent'; v_ambiguous:=null;
  else
    if v_kind='ambiguous' then v_ambiguous:=coalesce(v_ambiguous,v_row.provider_request_started_at,v_now); end if;
    if v_kind='manual_review' or public.payr_delivery_window_closed_v1(v_row.first_provider_attempt_at,v_ambiguous,v_now)
      or v_kind='failed' and v_ambiguous is not null then v_state:='manual_review';
    elsif v_kind='failed' then v_state:='failed';
    else v_state:='retry_wait'; end if;
  end if;
  update public.email_deliveries set state=v_state,lease_until=null,ambiguous_since=v_ambiguous,
    next_attempt_at=case when v_state='retry_wait' then public.payr_worker_retry_at_v1(v_now,attempt_count) else null end,
    provider_request_started_at=case when v_state in ('sent','manual_review') then provider_request_started_at else null end,
    provider_message_id=case when v_state='sent' then p_result->>'providerMessageId' else null end,last_error_code=v_code,updated_at=v_now
    where id=p_id returning * into v_row;
  return public.payr_delivery_worker_dto_v1(v_row);
end;
$$;

create function public.payr_protect_delivery_identity_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='DELETE' or old.state in ('sent','failed','manual_review') then raise exception using errcode='55000',message='DELIVERY_IMMUTABLE'; end if;
  if row(new.id,new.workspace_id,new.settlement_id,new.receipt_document_id,new.message_kind,new.normalized_recipient,new.roles,new.provider_idempotency_key,new.created_at)
    is distinct from row(old.id,old.workspace_id,old.settlement_id,old.receipt_document_id,old.message_kind,old.normalized_recipient,old.roles,old.provider_idempotency_key,old.created_at)
    or old.first_provider_attempt_at is not null and new.first_provider_attempt_at is distinct from old.first_provider_attempt_at
    or old.provider_payload_hash is not null and new.provider_payload_hash is distinct from old.provider_payload_hash
    or new.fence<old.fence or new.fence::numeric>old.fence::numeric+1 or new.attempt_count<old.attempt_count then
    raise exception using errcode='55000',message='DELIVERY_IDENTITY_IMMUTABLE';
  end if;
  return new;
end;
$$;
create trigger email_deliveries_identity before update or delete on public.email_deliveries
  for each row execute function public.payr_protect_delivery_identity_v1();

alter table public.audit_events drop constraint audit_events_bounded_codes;
alter table public.audit_events add constraint audit_events_bounded_codes check (
  action in ('auth.login','auth.payout_nonce','profile.save','profile.payout_change','client.save',
    'connector.create','connector.revoke','connector.admit','invoice:draft','invoice:publish','invoice:status','invoice:void',
    'settlement.recorded','receipt.generate','receipt.deliver')
  and outcome in ('allowed','denied','rate_limited','succeeded','failed','retry_wait','manual_review')
);

create function public.payr_audit_settlement_work_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_action text; v_outcome text;
begin
  if tg_table_name='settlements' then v_action:='settlement.recorded'; v_outcome:='succeeded';
  elsif new.state is distinct from old.state then
    v_action:=case when tg_table_name='receipt_documents' then 'receipt.generate' else 'receipt.deliver' end;
    v_outcome:=case when new.state::text in ('ready','sent') then 'succeeded'
      when new.state::text in ('failed','retry_wait','manual_review') then new.state::text else null end;
  end if;
  if v_outcome is not null then insert into public.audit_events(id,workspace_id,action,outcome)
    values(pg_catalog.gen_random_uuid(),new.workspace_id,v_action,v_outcome); end if;
  return new;
end;
$$;
create trigger settlements_work_audit after insert on public.settlements for each row execute function public.payr_audit_settlement_work_v1();
create trigger receipt_documents_work_audit after update on public.receipt_documents for each row execute function public.payr_audit_settlement_work_v1();
create trigger email_deliveries_work_audit after update on public.email_deliveries for each row execute function public.payr_audit_settlement_work_v1();

create index email_deliveries_claim on public.email_deliveries(created_at,id) where state in ('pending','retry_wait','sending');
create index receipt_documents_claim on public.receipt_documents(created_at,id)
  where state in ('pending','rendering','retry_wait');

revoke all on function public.payr_receipt_worker_dto_v1(public.receipt_documents),
  public.payr_claim_receipt_v1(uuid),public.payr_complete_receipt_v1(uuid,bigint,jsonb),public.payr_read_receipt_v1(uuid),
  public.payr_worker_retry_at_v1(timestamptz,integer),public.payr_fail_receipt_v1(uuid,bigint,text),public.payr_protect_receipt_identity_v1(),
  public.payr_delivery_worker_dto_v1(public.email_deliveries),public.payr_ready_receipt_link_v1(uuid,uuid,timestamptz),public.payr_claim_delivery_v1(uuid),
  public.payr_delivery_window_closed_v1(timestamptz,timestamptz,timestamptz),public.payr_begin_delivery_v1(uuid,bigint,text),
  public.payr_finish_delivery_v1(uuid,bigint,jsonb),public.payr_protect_delivery_identity_v1(),public.payr_audit_settlement_work_v1()
  from public,anon,authenticated,service_role;
grant execute on function public.payr_claim_receipt_v1(uuid),public.payr_complete_receipt_v1(uuid,bigint,jsonb),
  public.payr_read_receipt_v1(uuid),public.payr_fail_receipt_v1(uuid,bigint,text),public.payr_claim_delivery_v1(uuid),
  public.payr_begin_delivery_v1(uuid,bigint,text),public.payr_finish_delivery_v1(uuid,bigint,jsonb) to service_role;
commit;
