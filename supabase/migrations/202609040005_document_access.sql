begin;

-- Storage API v1.70.3 checks create permission before upload but completes with an upsert.
-- Freeze the committed object-version pointer so concurrent upsert:false calls cannot replace it.
create function public.payr_document_object_immutable_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (old.bucket_id = 'documents' or new.bucket_id = 'documents')
    and row(new.id,new.bucket_id,new.name,new.version,new.metadata,new.user_metadata,new.owner,new.owner_id)
      is distinct from row(old.id,old.bucket_id,old.name,old.version,old.metadata,old.user_metadata,old.owner,old.owner_id) then
    raise exception using errcode = '23505', message = 'DOCUMENT_EXISTS';
  end if;
  return new;
end;
$$;
create trigger payr_document_object_immutable before update on storage.objects
  for each row execute function public.payr_document_object_immutable_v1();
revoke all on function public.payr_document_object_immutable_v1() from public, anon, authenticated, service_role;

create function public.payr_find_invoice_access_candidate_v1(p_token_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select public.payr_publication_link_dto_v1(l) || pg_catalog.jsonb_build_object(
    'purpose',l.purpose,'workspaceId',l.workspace_id,'invoiceId',v.invoice_id,'invoiceVersionId',v.id)
    from public.access_links as l
    left join public.receipt_documents as r on r.workspace_id = l.workspace_id and r.id = l.receipt_document_id
    join public.invoice_versions as v on v.workspace_id = l.workspace_id and v.id = coalesce(l.invoice_version_id,r.invoice_version_id)
    where l.token_id = p_token_id), 'null'::jsonb);
$$;

create function public.payr_read_invoice_document_v1(p_token_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_link public.access_links; v_invoice public.invoices; v_version public.invoice_versions;
  v_attempt public.publication_attempts; v_settlement_id uuid; v_settlement jsonb; v_receipt jsonb; v_deliveries jsonb;
begin
  select l.* into v_link from public.access_links as l where l.token_id = p_token_id and l.purpose = 'invoice-bearer';
  if not found then return 'null'::jsonb; end if;
  select v.* into v_version from public.invoice_versions as v
    where v.workspace_id = v_link.workspace_id and v.id = v_link.invoice_version_id;
  if not found or v_version.frozen_at is null then return 'null'::jsonb; end if;
  -- Follow publication/void's invoice-first lock order, then re-read the credential after lock waits.
  select i.* into v_invoice from public.invoices as i
    where i.workspace_id = v_link.workspace_id and i.id = v_version.invoice_id for share;
  if not found or v_invoice.commercial_state not in ('published','expired') or v_invoice.voided_at is not null
    or v_invoice.current_version <> v_version.version_number then return 'null'::jsonb; end if;
  select l.* into v_link from public.access_links as l where l.token_id = p_token_id
    and l.workspace_id = v_version.workspace_id and l.invoice_version_id = v_version.id and l.purpose = 'invoice-bearer' for share;
  if not found or v_link.activated_at is null or v_link.activated_at > pg_catalog.clock_timestamp()
    or v_link.revoked_at is not null or v_link.expires_at <= pg_catalog.clock_timestamp() then return 'null'::jsonb; end if;
  select a.* into v_attempt from public.publication_attempts as a
    where a.workspace_id = v_link.workspace_id and a.invoice_id = v_invoice.id and a.invoice_version_id = v_version.id
      and a.state = 'finalized' and a.finalized_at is not null and a.qr_verified is true
      and a.invoice_token_id = v_link.token_id and a.invoice_key_version = v_link.key_version
      and a.invoice_verifier_hash = v_link.verifier_hash and a.invoice_link_expires_at = v_link.expires_at
      and a.chain_id = v_version.chain_id and a.contract_address = v_version.contract_address
      and a.invoice_number = v_invoice.invoice_number and v_invoice.payable_until = v_version.payable_until
      and a.storage_key = 'workspace/' || a.workspace_id::text || '/invoice/' || a.invoice_id::text || '/'
        || v_version.version_number::text || '/attempt/' || a.id::text || '.pdf';
  if not found then return 'null'::jsonb; end if;
  select s.id,pg_catalog.jsonb_build_object('chainId',s.chain_id,'contractAddress',s.contract_address,'invoiceVersion',v_version.version_number,
    'transactionHash',s.transaction_hash,'logIndex',s.log_index,'blockNumber',s.block_number::text,'blockTime',s.block_time,
    'payer',s.payer,'payee',s.payee,'amountDecimal',pg_catalog.trim_scale(s.amount_atomic * 0.000000000000000001::numeric)::text,
    'amountAtomic',s.amount_atomic::text,'documentCommitment',s.document_commitment) into v_settlement_id,v_settlement
    from public.settlements as s where s.workspace_id = v_link.workspace_id and s.invoice_id = v_invoice.id
      and s.invoice_version_id = v_version.id and s.publication_attempt_id = v_attempt.id;
  -- Pin all follow-ups to the observed settlement, never a second read of invoice payment status.
  select pg_catalog.jsonb_build_object('state',r.state,'link',public.payr_publication_link_dto_v1(l),'artifact',
    case when r.content_hash is null then 'null'::jsonb else pg_catalog.jsonb_build_object('pdfFilename',r.pdf_filename,'pdfContentHash',r.content_hash) end)
    into v_receipt from public.receipt_documents as r join public.access_links as l on l.workspace_id = r.workspace_id
      and l.receipt_document_id = r.id and l.token_id = r.token_id and l.key_version = r.key_version
      and l.verifier_hash = r.verifier_hash and l.expires_at = r.link_expires_at and l.purpose = 'receipt-bearer'
    where r.workspace_id = v_link.workspace_id and r.invoice_id = v_invoice.id and r.invoice_version_id = v_version.id
      and r.settlement_id = v_settlement_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('roles',d.roles,'normalizedRecipient',d.normalized_recipient,
    'state',d.state,'providerMessageId',d.provider_message_id,'attemptCount',d.attempt_count,'nextAttemptAt',d.next_attempt_at)
    order by d.normalized_recipient,d.id),'[]'::jsonb) into v_deliveries from public.email_deliveries as d
    where d.workspace_id = v_link.workspace_id and d.settlement_id = v_settlement_id;
  if v_link.expires_at <= pg_catalog.clock_timestamp() then return 'null'::jsonb; end if;
  return pg_catalog.jsonb_build_object('invoiceId',v_invoice.id,'invoiceVersion',v_version.version_number,'invoiceNumber',v_invoice.invoice_number,
    'commercialState',v_invoice.commercial_state,'payableUntil',v_invoice.payable_until,'voidedAt',v_invoice.voided_at,
    'snapshot',v_version.draft_snapshot,'attempt',public.payr_publication_attempt_dto_v1(v_attempt),
    'settlement',v_settlement,'receipt',v_receipt,'deliveries',v_deliveries);
end;
$$;

create function public.payr_document_storage_state_v1(p_storage_key text)
returns text language sql stable security definer set search_path = '' as $$
  select a.state::text from public.publication_attempts as a join public.invoice_versions as v
    on v.workspace_id = a.workspace_id and v.invoice_id = a.invoice_id and v.id = a.invoice_version_id
    where a.storage_key = p_storage_key and a.chain_id is not null
      and p_storage_key = 'workspace/' || a.workspace_id::text || '/invoice/' || a.invoice_id::text || '/'
        || v.version_number::text || '/attempt/' || a.id::text || '.pdf';
$$;

create table public.document_access_rate_limits (
  scope text not null check (scope in ('ip','token','global')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null check (pg_catalog.isfinite(window_start)),
  request_count integer not null check (request_count between 1 and case scope when 'ip' then 120 when 'token' then 60 else 600 end),
  primary key (scope,key_hash)
);
create index document_access_rate_limits_window on public.document_access_rate_limits (window_start);
alter table public.document_access_rate_limits enable row level security;
revoke all on table public.document_access_rate_limits from public, anon, authenticated, service_role;

create function public.payr_admit_document_access_v1(p_scope text, p_key_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_minute timestamptz; v_count integer; v_limit integer;
  v_global_hash text := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('payr:document:global-ip-stage','UTF8')),'hex');
begin
  if p_scope is null or p_scope not in ('ip','token') or p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- At most 600 IP-stage requests/minute: a short transaction-wide lock makes both counters atomic,
  -- including rollover after lock waits, with no I/O or document locks in this transaction.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payr:document:admission',0));
  v_minute := pg_catalog.date_trunc('minute',pg_catalog.clock_timestamp());
  if p_scope = 'ip' then
    insert into public.document_access_rate_limits as c (scope,key_hash,window_start,request_count)
      values ('global',v_global_hash,v_minute,1)
      on conflict (scope,key_hash) do update set window_start = v_minute,
        request_count = case when c.window_start = v_minute then c.request_count + 1 else 1 end
      where c.window_start <> v_minute or c.request_count < 600 returning request_count into v_count;
    if not found then return pg_catalog.jsonb_build_object('allowed',false); end if;
  end if;
  v_limit := case p_scope when 'ip' then 120 else 60 end;
  insert into public.document_access_rate_limits as c (scope,key_hash,window_start,request_count)
    values (p_scope,p_key_hash,v_minute,1)
    on conflict (scope,key_hash) do update set window_start = v_minute,
      request_count = case when c.window_start = v_minute then c.request_count + 1 else 1 end
    where c.window_start <> v_minute or c.request_count < v_limit returning request_count into v_count;
  if not found then return pg_catalog.jsonb_build_object('allowed',false); end if;
  -- No unbounded sweep, and denied requests cannot force cleanup work or allocate arbitrary IP keys.
  delete from public.document_access_rate_limits as c using (
    select old.scope,old.key_hash from public.document_access_rate_limits as old
      where old.window_start < v_minute order by old.window_start,old.scope,old.key_hash limit 16
  ) as expired where c.scope = expired.scope and c.key_hash = expired.key_hash;
  return pg_catalog.jsonb_build_object('allowed',true);
end;
$$;

revoke all on function public.payr_find_invoice_access_candidate_v1(uuid), public.payr_read_invoice_document_v1(uuid),
  public.payr_document_storage_state_v1(text), public.payr_admit_document_access_v1(text,text) from public, anon, authenticated, service_role;
grant execute on function public.payr_find_invoice_access_candidate_v1(uuid), public.payr_read_invoice_document_v1(uuid),
  public.payr_document_storage_state_v1(text), public.payr_admit_document_access_v1(text,text) to service_role;

commit;
