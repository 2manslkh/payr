begin;

-- Null binding identifies released F1 rows. Never invent a snapshot or claim those rows.
alter table public.publication_attempts
  add column chain_id bigint,
  add column contract_address text,
  add column initiating_owner_wallet text,
  add column initiating_connector_id uuid,
  add column idempotency_request_id uuid,
  add column lease_owner uuid,
  add column qr_verified boolean,
  add constraint publication_attempts_initiator_fk foreign key (workspace_id, initiating_connector_id)
    references public.connector_tokens(workspace_id, id),
  add constraint publication_attempts_request_fk foreign key (workspace_id, idempotency_request_id)
    references public.idempotency_requests(workspace_id, id),
  add constraint publication_attempts_managed_binding check ((
    (chain_id is null and contract_address is null and initiating_owner_wallet is null and initiating_connector_id is null
      and idempotency_request_id is null and lease_owner is null and qr_verified is null)
    or (chain_id between 1 and 9007199254740991 and contract_address ~ '^0x[0-9a-f]{40}$'
      and contract_address <> '0x0000000000000000000000000000000000000000'
      and idempotency_request_id is not null
      and pg_catalog.isfinite(lease_until)
      and ((state = 'reserved' and fence = 0 and lease_owner is null)
        or (state <> 'reserved' and fence > 0 and lease_owner is not null))
      and ((initiating_owner_wallet ~ '^0x[0-9a-f]{40}$' and initiating_connector_id is null)
        or (initiating_owner_wallet is null and initiating_connector_id is not null))
      and (invoice_data_hash is null and qr_verified is null or invoice_data_hash is not null and qr_verified is true)
      and (pdf_byte_length is null or pdf_byte_length <= 10485760)
      and (pdf_filename is null or pdf_filename ~ '^[A-Za-z0-9_-]+[.]pdf$')
      and (terminal_failure_code is null or terminal_failure_code in ('ARTIFACT_VERIFICATION_FAILED','PROFILE_CONFLICT',
        'CLIENT_CONFLICT','AUTH_REVOKED','DEADLINE_EXPIRED','VERSION_CONFLICT')))
  ) is true);
create unique index publication_attempts_one_active_per_invoice on public.publication_attempts (workspace_id, invoice_id)
  where state in ('reserved','rendering','stored');
create unique index publication_attempts_reserved_number on public.publication_attempts (workspace_id, invoice_number);
create unique index publication_attempts_reserved_sequence on public.publication_attempts (workspace_id, sequence_year, sequence_value);
create unique index publication_attempts_storage_key on public.publication_attempts (storage_key);
create unique index publication_attempts_request on public.publication_attempts (idempotency_request_id);

create function public.payr_publication_protect_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' or old.state in ('finalized','failed')
    or (pg_catalog.to_jsonb(new) - array['state','lease_owner','lease_until','fence','terminal_failure_code','invoice_data_hash',
      'pdf_content_hash','document_commitment','pdf_filename','pdf_byte_length','pdf_content_type','stored_at','qr_verified','finalized_at','updated_at'])
      is distinct from (pg_catalog.to_jsonb(old) - array['state','lease_owner','lease_until','fence','terminal_failure_code','invoice_data_hash',
      'pdf_content_hash','document_commitment','pdf_filename','pdf_byte_length','pdf_content_type','stored_at','qr_verified','finalized_at','updated_at']) then
    raise exception using errcode = '55000', message = 'PUBLICATION_IMMUTABLE';
  end if;
  if old.invoice_data_hash is not null and row(new.invoice_data_hash,new.pdf_content_hash,new.document_commitment,
    new.pdf_filename,new.pdf_byte_length,new.pdf_content_type,new.stored_at,new.qr_verified)
    is distinct from row(old.invoice_data_hash,old.pdf_content_hash,old.document_commitment,
    old.pdf_filename,old.pdf_byte_length,old.pdf_content_type,old.stored_at,old.qr_verified) then
    raise exception using errcode = '55000', message = 'PUBLICATION_ARTIFACT_IMMUTABLE';
  end if;
  if new.fence < old.fence or new.fence > old.fence::numeric + 1
    or (new.lease_owner is distinct from old.lease_owner and new.fence <> old.fence::numeric + 1)
    or (old.state = 'stored' and new.state not in ('stored','finalized','failed'))
    or (old.state = 'rendering' and new.state not in ('rendering','stored','failed'))
    or (old.state = 'reserved' and new.state not in ('reserved','rendering','failed')) then
    raise exception using errcode = '55000', message = 'PUBLICATION_INVALID_PROGRESS';
  end if;
  return new;
end;
$$;
create trigger publication_attempts_reservation_immutable before update or delete on public.publication_attempts
  for each row execute function public.payr_publication_protect_v1();

create function public.payr_publication_block_revision_v1()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.current_version is distinct from old.current_version and exists (select 1 from public.publication_attempts as a
    where a.workspace_id = old.workspace_id and a.invoice_id = old.id and a.state in ('reserved','rendering','stored')) then
    raise exception using errcode = 'P0001', message = 'PUBLICATION_IN_PROGRESS';
  end if;
  return new;
end;
$$;
create trigger invoices_publication_revision_guard before update on public.invoices
  for each row execute function public.payr_publication_block_revision_v1();

create function public.payr_publication_link_dto_v1(p_row public.access_links)
returns jsonb language sql stable security definer set search_path = '' as $$
  select pg_catalog.jsonb_build_object('tokenId',p_row.token_id,'keyVersion',p_row.key_version,'verifierHash',p_row.verifier_hash,
    'expiresAt',p_row.expires_at,'activatedAt',p_row.activated_at,'revokedAt',p_row.revoked_at);
$$;
create function public.payr_publication_artifact_dto_v1(p_row public.publication_attempts)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when p_row.invoice_data_hash is null then 'null'::jsonb else pg_catalog.jsonb_build_object(
    'pdfFilename',p_row.pdf_filename,'contentType',p_row.pdf_content_type,'byteLength',p_row.pdf_byte_length,
    'invoiceDataHash',p_row.invoice_data_hash,'pdfContentHash',p_row.pdf_content_hash,'documentCommitment',p_row.document_commitment,
    'qrVerified',p_row.qr_verified) end;
$$;
create function public.payr_publication_attempt_dto_v1(p_row public.publication_attempts)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select pg_catalog.jsonb_build_object('id',p_row.id,'workspaceId',p_row.workspace_id,'invoiceId',p_row.invoice_id,
    'invoiceVersionId',p_row.invoice_version_id,'invoiceVersion',v.version_number,'invoiceNumber',p_row.invoice_number,
    'state',p_row.state,'snapshot',v.draft_snapshot,'chainId',p_row.chain_id,'contractAddress',p_row.contract_address,
    'invoiceKey',p_row.invoice_key,'publicationSalt',p_row.publication_salt,'storageKey',p_row.storage_key,
    'link',public.payr_publication_link_dto_v1(l),'leaseOwner',p_row.lease_owner,'leaseUntil',p_row.lease_until,'fence',p_row.fence::text,
    'artifact',public.payr_publication_artifact_dto_v1(p_row),'failureCode',p_row.terminal_failure_code,'finalizedAt',p_row.finalized_at)
    from public.invoice_versions as v join public.access_links as l on l.workspace_id = v.workspace_id
      and l.invoice_version_id = v.id and l.purpose = 'invoice-bearer' and l.token_id = p_row.invoice_token_id
      and l.key_version = p_row.invoice_key_version and l.verifier_hash = p_row.invoice_verifier_hash
      and l.expires_at = p_row.invoice_link_expires_at
    where v.workspace_id = p_row.workspace_id and v.invoice_id = p_row.invoice_id and v.id = p_row.invoice_version_id
      and p_row.chain_id is not null and v.draft_snapshot is not null), 'null'::jsonb);
$$;

-- Shared reservation/finalization CAS checks. Locks are held only inside an RPC transaction.
create function public.payr_publication_profiles_v1(p_workspace_id uuid, p_snapshot jsonb, p_invoice_id uuid)
returns public.clients language plpgsql security definer set search_path = '' as $$
declare v_sender public.sender_profiles; v_client public.clients; v_dto jsonb; v_key text;
begin
  select s.* into v_sender from public.sender_profiles as s where s.workspace_id = p_workspace_id for share;
  if not found or public.payr_identity_profile_dto_v1(v_sender) is distinct from p_snapshot -> 'sender' then
    raise exception using errcode = 'P0001', message = 'PROFILE_CONFLICT';
  end if;
  if p_snapshot #>> '{clientReference,id}' is not null then
    select c.* into v_client from public.clients as c where c.workspace_id = p_workspace_id
      and c.id = (p_snapshot #>> '{clientReference,id}')::uuid for update;
    if not found or v_client.revision <> (p_snapshot #>> '{clientReference,revision}')::integer
      or v_client.alias is distinct from p_snapshot #>> '{clientReference,alias}' then
      raise exception using errcode = 'P0001', message = 'CLIENT_CONFLICT';
    end if;
    v_dto := public.payr_identity_client_dto_v1(v_client);
    foreach v_key in array array['businessName','billingAddress','contactName','contactEmail'] loop
      if (p_snapshot #> '{proposedClientChanges,fields}' ? v_key) = (p_snapshot -> 'client' -> v_key is not distinct from v_dto -> v_key) then
        raise exception using errcode = 'P0001', message = 'CLIENT_CONFLICT';
      end if;
    end loop;
  elsif exists (select 1 from public.clients as c where c.workspace_id = p_workspace_id
    and c.alias = coalesce(p_snapshot #>> '{clientReference,alias}', 'client-' || p_invoice_id::text)) then
    raise exception using errcode = 'P0001', message = 'CLIENT_CONFLICT';
  end if;
  return v_client;
end;
$$;

create function public.payr_find_publication_replay_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid,
  p_idempotency_key text, p_request_fingerprint text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.idempotency_requests; v_attempt public.publication_attempts; v_result jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:publish');
  if public.payr_draft_text_v1(pg_catalog.to_jsonb(p_idempotency_key),128) is not true
    or p_request_fingerprint is null or p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  -- Share reservation's key lock so an in-flight reservation is observed after it commits.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payr:publish_invoice:' || p_workspace_id::text || ':' || p_idempotency_key,0));
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:publish');
  select r.* into v_request from public.idempotency_requests as r where r.workspace_id = p_workspace_id
    and r.operation = 'publish_invoice' and r.idempotency_key = p_idempotency_key;
  if not found then return 'null'::jsonb; end if;
  if v_request.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
  end if;
  -- Replay bypasses mutable validation, but observes attempt/link facts atomically.
  perform 1 from public.invoices as i where i.workspace_id = p_workspace_id
    and i.id = (v_request.result_descriptor #>> '{ids,invoice_id}')::uuid for share;
  select a.* into v_attempt from public.publication_attempts as a where a.workspace_id = p_workspace_id
    and a.idempotency_request_id = v_request.id and a.request_fingerprint = v_request.request_fingerprint
    and a.id = (v_request.result_descriptor #>> '{ids,attempt_id}')::uuid
    and a.invoice_id = (v_request.result_descriptor #>> '{ids,invoice_id}')::uuid
    and a.invoice_version_id = (v_request.result_descriptor #>> '{ids,version_id}')::uuid;
  if not found then raise exception using errcode = 'P0001', message = 'INVALID_PUBLICATION_DESCRIPTOR'; end if;
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:publish');
  v_result := public.payr_publication_attempt_dto_v1(v_attempt);
  if v_result is null or v_result = 'null'::jsonb then
    raise exception using errcode = 'P0001', message = 'INVALID_PUBLICATION_DESCRIPTOR';
  end if;
  return v_result;
end;
$$;

create function public.payr_reserve_publication_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.idempotency_requests; v_invoice public.invoices; v_version public.invoice_versions;
  v_attempt public.publication_attempts; v_replay jsonb; v_key text; v_now timestamptz; v_expiry timestamptz; v_year integer; v_sequence bigint;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:publish');
  if public.payr_identity_object_v1(p_input,array['draftId','expectedVersion','approval','idempotencyKey','requestFingerprint',
    'attemptId','invoiceKey','publicationSalt','tokenId','keyVersion','verifierHash','chainId','contractAddress']) is not true
    or public.payr_draft_text_v1(p_input -> 'idempotencyKey',128) is not true
    or p_input -> 'approval' is distinct from 'true'::jsonb then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  foreach v_key in array array['draftId','attemptId','tokenId'] loop
    if (pg_catalog.jsonb_typeof(p_input -> v_key) = 'string'
      and p_input ->> v_key ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  foreach v_key in array array['requestFingerprint','verifierHash','invoiceKey','publicationSalt','contractAddress'] loop
    if (pg_catalog.jsonb_typeof(p_input -> v_key) = 'string' and p_input ->> v_key ~ case
      when v_key in ('requestFingerprint','verifierHash') then '^[0-9a-f]{64}$'
      when v_key = 'contractAddress' then '^0x[0-9a-f]{40}$' else '^0x[0-9a-f]{64}$' end) is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  foreach v_key in array array['expectedVersion','keyVersion','chainId'] loop
    if (pg_catalog.jsonb_typeof(p_input -> v_key) = 'number' and p_input ->> v_key ~ '^[1-9][0-9]{0,15}$'
      and (p_input ->> v_key)::numeric <= case when v_key = 'chainId' then 9007199254740991 else 2147483647 end) is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  v_replay := public.payr_find_publication_replay_v1(p_workspace_id,p_owner_wallet,p_connector_id,
    p_input ->> 'idempotencyKey',p_input ->> 'requestFingerprint');
  if v_replay <> 'null'::jsonb then
    if v_replay ->> 'invoiceId' <> p_input ->> 'draftId' or (v_replay ->> 'invoiceVersion')::integer <> (p_input ->> 'expectedVersion')::integer then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    return v_replay;
  end if;
  if p_input ->> 'contractAddress' = '0x0000000000000000000000000000000000000000' then
    raise exception using errcode = 'P0001', message = 'PUBLICATION_CONFIGURATION_REQUIRED';
  end if;
  select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = (p_input ->> 'draftId')::uuid for update;
  if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
  if v_invoice.current_version <> (p_input ->> 'expectedVersion')::integer then
    raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT', detail = pg_catalog.jsonb_build_object(
      'draftId',v_invoice.id,'currentVersion',v_invoice.current_version)::text;
  end if;
  select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id
    and v.invoice_id = v_invoice.id and v.version_number = v_invoice.current_version;
  if v_invoice.commercial_state <> 'draft' or v_version.id is null or v_version.frozen_at is not null
    or v_version.chain_id is not null or v_version.contract_address is not null
    or public.payr_draft_snapshot_valid_v1(v_version.draft_snapshot) is not true
    or exists (select 1 from public.publication_attempts as a where a.workspace_id = p_workspace_id and a.invoice_id = v_invoice.id and a.state = 'finalized') then
    raise exception using errcode = 'P0001', message = 'DRAFT_NOT_EDITABLE';
  end if;
  if exists (select 1 from public.publication_attempts as a where a.workspace_id = p_workspace_id
    and a.invoice_id = v_invoice.id and a.state in ('reserved','rendering','stored')) then
    raise exception using errcode = 'P0001', message = 'PUBLICATION_IN_PROGRESS';
  end if;
  perform public.payr_publication_profiles_v1(p_workspace_id,v_version.draft_snapshot,v_invoice.id);
  v_now := pg_catalog.clock_timestamp();
  v_year := extract(year from v_now at time zone 'UTC')::integer;
  insert into public.invoice_sequences (workspace_id,sequence_year,next_value) values (p_workspace_id,v_year,2)
    on conflict (workspace_id,sequence_year) do update set next_value = public.invoice_sequences.next_value + 1, updated_at = pg_catalog.clock_timestamp()
    returning next_value - 1 into v_sequence;
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:publish');
  v_now := pg_catalog.clock_timestamp();
  if v_version.payable_until <= v_now then raise exception using errcode = 'P0001', message = 'DEADLINE_EXPIRED'; end if;
  v_expiry := greatest(v_now,v_version.payable_until) + interval '8760 hours';
  if v_expiry >= timestamptz '10000-01-01 00:00:00+00' then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  insert into public.idempotency_requests (id,workspace_id,operation,idempotency_key,request_fingerprint,result_descriptor)
    values (pg_catalog.gen_random_uuid(),p_workspace_id,'publish_invoice',p_input ->> 'idempotencyKey',p_input ->> 'requestFingerprint',
      pg_catalog.jsonb_build_object('ids',pg_catalog.jsonb_build_object('invoice_id',v_invoice.id,'version_id',v_version.id,
        'attempt_id',p_input ->> 'attemptId'),'state','reserved')) returning * into v_request;
  insert into public.access_links (id,workspace_id,token_id,purpose,key_version,verifier_hash,invoice_version_id,expires_at)
    values (pg_catalog.gen_random_uuid(),p_workspace_id,(p_input ->> 'tokenId')::uuid,'invoice-bearer',(p_input ->> 'keyVersion')::integer,
      p_input ->> 'verifierHash',v_version.id,v_expiry);
  insert into public.publication_attempts (id,workspace_id,invoice_id,invoice_version_id,request_fingerprint,sequence_year,sequence_value,
    invoice_number,invoice_key,publication_salt,storage_key,invoice_token_id,invoice_key_version,invoice_verifier_hash,invoice_link_expires_at,
    chain_id,contract_address,initiating_owner_wallet,initiating_connector_id,idempotency_request_id,lease_until,created_at,updated_at)
    values ((p_input ->> 'attemptId')::uuid,p_workspace_id,v_invoice.id,v_version.id,p_input ->> 'requestFingerprint',v_year,v_sequence,
      (v_version.draft_snapshot #>> '{sender,invoicePrefix}') || '-' || v_year::text || '-' || pg_catalog.lpad(v_sequence::text,greatest(6,pg_catalog.length(v_sequence::text)),'0'),
      p_input ->> 'invoiceKey',p_input ->> 'publicationSalt',
      'workspace/' || p_workspace_id::text || '/invoice/' || v_invoice.id::text || '/' || v_invoice.current_version::text || '/attempt/' || (p_input ->> 'attemptId') || '.pdf',
      (p_input ->> 'tokenId')::uuid,(p_input ->> 'keyVersion')::integer,p_input ->> 'verifierHash',v_expiry,
      (p_input ->> 'chainId')::bigint,p_input ->> 'contractAddress',p_owner_wallet,p_connector_id,v_request.id,v_now,v_now,v_now) returning * into v_attempt;
  return public.payr_publication_attempt_dto_v1(v_attempt);
exception when unique_violation then raise exception using errcode = 'P0001', message = 'PUBLICATION_CONFLICT';
end;
$$;

create function public.payr_claim_publication_v1(p_attempt_id uuid, p_lease_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts;
begin
  if p_lease_owner is null then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  select a.* into v_attempt from public.publication_attempts as a join public.invoices as i
    on i.workspace_id = a.workspace_id and i.id = a.invoice_id
    where (p_attempt_id is null or a.id = p_attempt_id) and a.chain_id is not null and a.fence < 9223372036854775807
      and a.state in ('reserved','rendering','stored') and (a.lease_until is null or a.lease_until <= pg_catalog.clock_timestamp())
    order by a.created_at,a.id limit 1 for update of i skip locked;
  if not found then return 'null'::jsonb; end if;
  select a.* into v_attempt from public.publication_attempts as a where a.id = v_attempt.id for update;
  if v_attempt.state not in ('reserved','rendering','stored') or v_attempt.lease_until > pg_catalog.clock_timestamp() then return 'null'::jsonb; end if;
  update public.publication_attempts set state = case when state = 'stored' then 'stored'::public.publication_state else 'rendering'::public.publication_state end,
    lease_owner = p_lease_owner, lease_until = pg_catalog.clock_timestamp() + interval '60 seconds', fence = fence + 1,
    updated_at = pg_catalog.clock_timestamp() where id = v_attempt.id returning * into v_attempt;
  return public.payr_publication_attempt_dto_v1(v_attempt);
end;
$$;

create function public.payr_publication_lock_v1(p_attempt_id uuid, p_lease_owner uuid, p_fence bigint)
returns public.publication_attempts language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts;
begin
  if p_attempt_id is null or p_lease_owner is null or p_fence is null or p_fence < 0 then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  perform 1 from public.invoices as i join public.publication_attempts as a on a.workspace_id = i.workspace_id and a.invoice_id = i.id
    where a.id = p_attempt_id for update of i;
  select a.* into v_attempt from public.publication_attempts as a where a.id = p_attempt_id for update;
  if not found or v_attempt.chain_id is null or v_attempt.state not in ('rendering','stored')
    or v_attempt.lease_owner is distinct from p_lease_owner or v_attempt.fence <> p_fence
    or (v_attempt.lease_until > pg_catalog.clock_timestamp()) is not true then return null; end if;
  return v_attempt;
end;
$$;

create function public.payr_store_publication_v1(p_attempt_id uuid, p_lease_owner uuid, p_fence bigint, p_artifact jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts; v_key text;
begin
  v_attempt := public.payr_publication_lock_v1(p_attempt_id,p_lease_owner,p_fence);
  if v_attempt.id is null then return 'null'::jsonb; end if;
  if public.payr_identity_object_v1(p_artifact,array['pdfFilename','contentType','byteLength','invoiceDataHash','pdfContentHash','documentCommitment','qrVerified']) is not true
    or p_artifact -> 'contentType' is distinct from '"application/pdf"'::jsonb or p_artifact -> 'qrVerified' is distinct from 'true'::jsonb
    or (pg_catalog.jsonb_typeof(p_artifact -> 'pdfFilename') = 'string' and pg_catalog.length(p_artifact ->> 'pdfFilename') <= 200
      and p_artifact ->> 'pdfFilename' ~ '^[A-Za-z0-9_-]+[.]pdf$'
      and pg_catalog.jsonb_typeof(p_artifact -> 'byteLength') = 'number' and p_artifact ->> 'byteLength' ~ '^[1-9][0-9]{0,7}$'
      and (p_artifact ->> 'byteLength')::numeric <= 10485760) is not true then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  foreach v_key in array array['invoiceDataHash','pdfContentHash','documentCommitment'] loop
    if (pg_catalog.jsonb_typeof(p_artifact -> v_key) = 'string' and p_artifact ->> v_key ~ '^0x[0-9a-f]{64}$') is not true then
      raise exception using errcode = '22023', message = 'INVALID_INPUT';
    end if;
  end loop;
  if v_attempt.state = 'stored' then
    if public.payr_publication_artifact_dto_v1(v_attempt) is distinct from p_artifact then
      raise exception using errcode = 'P0001', message = 'PUBLICATION_ARTIFACT_CONFLICT';
    end if;
    return public.payr_publication_attempt_dto_v1(v_attempt);
  end if;
  update public.publication_attempts set state = 'stored', invoice_data_hash = p_artifact ->> 'invoiceDataHash',
    pdf_content_hash = p_artifact ->> 'pdfContentHash', document_commitment = p_artifact ->> 'documentCommitment',
    pdf_filename = p_artifact ->> 'pdfFilename', pdf_content_type = 'application/pdf', pdf_byte_length = (p_artifact ->> 'byteLength')::bigint,
    qr_verified = true, stored_at = pg_catalog.clock_timestamp(), updated_at = pg_catalog.clock_timestamp()
    where id = v_attempt.id returning * into v_attempt;
  return public.payr_publication_attempt_dto_v1(v_attempt);
end;
$$;

create function public.payr_fail_publication_v1(p_attempt_id uuid, p_lease_owner uuid, p_fence bigint, p_failure_code text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts;
begin
  v_attempt := public.payr_publication_lock_v1(p_attempt_id,p_lease_owner,p_fence);
  if v_attempt.id is null then return 'null'::jsonb; end if;
  if p_failure_code is null or p_failure_code not in ('ARTIFACT_VERIFICATION_FAILED','PROFILE_CONFLICT','CLIENT_CONFLICT',
    'AUTH_REVOKED','DEADLINE_EXPIRED','VERSION_CONFLICT') then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  perform 1 from public.access_links as l where l.workspace_id = v_attempt.workspace_id and l.token_id = v_attempt.invoice_token_id for update;
  perform 1 from public.idempotency_requests as r where r.id = v_attempt.idempotency_request_id for update;
  if v_attempt.lease_until <= pg_catalog.clock_timestamp() then return 'null'::jsonb; end if;
  update public.access_links set revoked_at = pg_catalog.clock_timestamp() where workspace_id = v_attempt.workspace_id
    and token_id = v_attempt.invoice_token_id and revoked_at is null;
  update public.publication_attempts set state = 'failed',terminal_failure_code = p_failure_code,updated_at = pg_catalog.clock_timestamp()
    where id = v_attempt.id returning * into v_attempt;
  update public.idempotency_requests set result_descriptor = pg_catalog.jsonb_set(result_descriptor,'{state}','"failed"'::jsonb),
    completed_at = pg_catalog.clock_timestamp() where id = v_attempt.idempotency_request_id;
  return public.payr_publication_attempt_dto_v1(v_attempt);
end;
$$;

create function public.payr_finalize_publication_v1(p_attempt_id uuid, p_lease_owner uuid, p_fence bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts; v_invoice public.invoices; v_version public.invoice_versions;
  v_client public.clients; v_link public.access_links; v_snapshot jsonb; v_fields jsonb; v_provenance jsonb; v_key text;
  v_failure text; v_now timestamptz;
begin
  -- Actor locks precede invoice locks, matching draft/reserve and connector revocation.
  select a.* into v_attempt from public.publication_attempts as a where a.id = p_attempt_id;
  if v_attempt.chain_id is not null then
    if v_attempt.initiating_connector_id is not null then
      perform 1 from public.connector_tokens as t where t.workspace_id = v_attempt.workspace_id and t.id = v_attempt.initiating_connector_id for update;
    else
      perform 1 from public.workspaces as w where w.id = v_attempt.workspace_id for share;
    end if;
  end if;
  v_attempt := public.payr_publication_lock_v1(p_attempt_id,p_lease_owner,p_fence);
  if v_attempt.id is null then return 'null'::jsonb; end if;
  if v_attempt.state <> 'stored' or v_attempt.qr_verified is not true then raise exception using errcode = 'P0001', message = 'PUBLICATION_NOT_STORED'; end if;
  begin
    select i.* into v_invoice from public.invoices as i where i.id = v_attempt.invoice_id and i.workspace_id = v_attempt.workspace_id;
    select v.* into v_version from public.invoice_versions as v where v.id = v_attempt.invoice_version_id and v.workspace_id = v_attempt.workspace_id for update;
    if v_invoice.commercial_state <> 'draft' or v_invoice.current_version <> v_version.version_number or v_version.frozen_at is not null
      or v_version.chain_id is not null or v_version.contract_address is not null then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT';
    end if;
    v_snapshot := v_version.draft_snapshot; v_fields := v_snapshot #> '{proposedClientChanges,fields}';
    v_client := public.payr_publication_profiles_v1(v_attempt.workspace_id,v_snapshot,v_invoice.id);
    select l.* into v_link from public.access_links as l where l.workspace_id = v_attempt.workspace_id
      and l.token_id = v_attempt.invoice_token_id for update;
    if not found or v_link.invoice_version_id is distinct from v_version.id or v_link.purpose <> 'invoice-bearer'
      or v_link.key_version <> v_attempt.invoice_key_version or v_link.verifier_hash <> v_attempt.invoice_verifier_hash
      or v_link.expires_at <> v_attempt.invoice_link_expires_at or v_link.activated_at is not null or v_link.revoked_at is not null then
      raise exception using errcode = 'P0001', message = 'ARTIFACT_VERIFICATION_FAILED';
    end if;
    perform 1 from public.idempotency_requests as r where r.id = v_attempt.idempotency_request_id for update;
    v_provenance := coalesce(v_client.provenance,'{}'::jsonb);
    for v_key in select pg_catalog.jsonb_object_keys(v_fields) loop
      v_provenance := pg_catalog.jsonb_set(v_provenance,array[v_key],(v_fields -> v_key -> 'provenance') || '{"confirmed":true}'::jsonb);
    end loop;
    if v_client.id is null then
      insert into public.clients (id,workspace_id,alias,business_name,billing_address,contact_name,contact_email,provenance)
        values (pg_catalog.gen_random_uuid(),v_attempt.workspace_id,coalesce(v_snapshot #>> '{clientReference,alias}','client-' || v_invoice.id::text),
          v_snapshot #>> '{client,businessName}',v_snapshot #> '{client,billingAddress}',v_snapshot #>> '{client,contactName}',
          v_snapshot #>> '{client,contactEmail}',v_provenance) returning * into v_client;
    elsif v_fields <> '{}'::jsonb then
      if v_client.revision = 2147483647 then raise exception using errcode = 'P0001', message = 'CLIENT_CONFLICT'; end if;
      update public.clients set
        business_name = case when v_fields ? 'businessName' then v_snapshot #>> '{client,businessName}' else business_name end,
        billing_address = case when v_fields ? 'billingAddress' then v_snapshot #> '{client,billingAddress}' else billing_address end,
        contact_name = case when v_fields ? 'contactName' then v_snapshot #>> '{client,contactName}' else contact_name end,
        contact_email = case when v_fields ? 'contactEmail' then v_snapshot #>> '{client,contactEmail}' else contact_email end,
        provenance = v_provenance,revision = revision + 1,updated_at = pg_catalog.clock_timestamp() where id = v_client.id;
    end if;
    -- These checks deliberately follow every lock wait, including client alias uniqueness waits.
    begin
      perform public.payr_draft_scope_v1(v_attempt.workspace_id,v_attempt.initiating_owner_wallet,v_attempt.initiating_connector_id,'invoice:publish');
    exception when sqlstate 'P0001' then raise exception using errcode = 'P0001', message = 'AUTH_REVOKED'; end;
    v_now := pg_catalog.clock_timestamp();
    if v_attempt.lease_until <= v_now then raise exception using errcode = 'P0002', message = 'LEASE_LOST'; end if;
    if v_version.payable_until <= v_now then raise exception using errcode = 'P0001', message = 'DEADLINE_EXPIRED'; end if;
    update public.invoice_versions set chain_id = v_attempt.chain_id,contract_address = v_attempt.contract_address,frozen_at = v_now where id = v_version.id;
    update public.invoices set commercial_state = 'published',client_id = v_client.id,invoice_number = v_attempt.invoice_number,
      published_at = v_now,payable_until = v_version.payable_until,updated_at = v_now where id = v_invoice.id;
    update public.access_links set activated_at = v_now where id = v_link.id;
    update public.publication_attempts set state = 'finalized',finalized_at = v_now,updated_at = v_now where id = v_attempt.id returning * into v_attempt;
    update public.idempotency_requests set result_descriptor = result_descriptor || pg_catalog.jsonb_build_object('state','finalized',
      'hashes',pg_catalog.jsonb_build_object('pdf_content_hash',v_attempt.pdf_content_hash,'document_commitment',v_attempt.document_commitment),
      'filenames',pg_catalog.jsonb_build_object('invoice_pdf',v_attempt.pdf_filename)),completed_at = v_now where id = v_attempt.idempotency_request_id;
  exception
    when sqlstate 'P0002' then return 'null'::jsonb;
    when unique_violation then v_failure := 'CLIENT_CONFLICT';
    when sqlstate 'P0001' then
      if sqlerrm not in ('PROFILE_CONFLICT','CLIENT_CONFLICT','AUTH_REVOKED','DEADLINE_EXPIRED','VERSION_CONFLICT','ARTIFACT_VERIFICATION_FAILED') then raise; end if;
      v_failure := sqlerrm;
  end;
  -- The subtransaction rolled back ALL commercial writes, not the fenced terminal outcome.
  if v_failure is not null then return public.payr_fail_publication_v1(p_attempt_id,p_lease_owner,p_fence,v_failure); end if;
  return public.payr_publication_attempt_dto_v1(v_attempt);
end;
$$;

create function public.payr_publication_status_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices; v_version public.invoice_versions; v_attempt public.publication_attempts;
  v_settlement_id uuid; v_settlement jsonb; v_receipt jsonb; v_deliveries jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:status');
  if p_invoice_id is null then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = p_invoice_id for share;
  if not found then return 'null'::jsonb; end if;
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:status');
  select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id
    and v.invoice_id = p_invoice_id and v.version_number = v_invoice.current_version;
  select a.* into v_attempt from public.publication_attempts as a where a.workspace_id = p_workspace_id and a.invoice_id = p_invoice_id
    order by (a.state = 'finalized') desc,a.created_at desc,a.id desc limit 1;
  select s.id,pg_catalog.jsonb_build_object('chainId',s.chain_id,'contractAddress',s.contract_address,'invoiceVersion',v.version_number,
    'transactionHash',s.transaction_hash,'logIndex',s.log_index,'blockNumber',s.block_number::text,'blockTime',s.block_time,
    'payer',s.payer,'payee',s.payee,'amountDecimal',pg_catalog.trim_scale(s.amount_atomic * 0.000000000000000001::numeric)::text,
    'amountAtomic',s.amount_atomic::text,'documentCommitment',s.document_commitment) into v_settlement_id,v_settlement
    from public.settlements as s join public.invoice_versions as v on v.workspace_id = s.workspace_id and v.id = s.invoice_version_id
    where s.workspace_id = p_workspace_id and s.invoice_id = p_invoice_id;
  -- Settlement does not take the invoice row lock. Pin follow-ups to the observed settlement,
  -- so a concurrent first payment cannot produce receipt facts alongside settlement:null.
  select pg_catalog.jsonb_build_object('state',r.state,'link',public.payr_publication_link_dto_v1(l),'artifact',
    case when r.content_hash is null then 'null'::jsonb else pg_catalog.jsonb_build_object('pdfFilename',r.pdf_filename,'pdfContentHash',r.content_hash) end)
    into v_receipt from public.receipt_documents as r join public.access_links as l on l.workspace_id = r.workspace_id
      and l.receipt_document_id = r.id and l.token_id = r.token_id and l.key_version = r.key_version
      and l.verifier_hash = r.verifier_hash and l.expires_at = r.link_expires_at and l.purpose = 'receipt-bearer'
    where r.workspace_id = p_workspace_id and r.invoice_id = p_invoice_id and r.settlement_id = v_settlement_id;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('roles',d.roles,'normalizedRecipient',d.normalized_recipient,
    'state',d.state,'providerMessageId',d.provider_message_id,'attemptCount',d.attempt_count,'nextAttemptAt',d.next_attempt_at)
    order by d.normalized_recipient,d.id),'[]'::jsonb) into v_deliveries from public.email_deliveries as d
    join public.settlements as s on s.workspace_id = d.workspace_id and s.id = d.settlement_id
    where s.workspace_id = p_workspace_id and s.invoice_id = p_invoice_id and s.id = v_settlement_id;
  return pg_catalog.jsonb_build_object('invoiceId',v_invoice.id,'invoiceVersion',v_invoice.current_version,'invoiceNumber',v_invoice.invoice_number,
    'commercialState',v_invoice.commercial_state,'payableUntil',v_invoice.payable_until,'voidedAt',v_invoice.voided_at,
    'snapshot',v_version.draft_snapshot,'attempt',public.payr_publication_attempt_dto_v1(v_attempt),
    'settlement',v_settlement,'receipt',v_receipt,'deliveries',v_deliveries);
end;
$$;

create function public.payr_void_invoice_v1(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid, p_input jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_request public.idempotency_requests; v_invoice public.invoices; v_attempt public.publication_attempts; v_version public.invoice_versions;
  v_now timestamptz; v_replay boolean := false;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:void');
  if public.payr_identity_object_v1(p_input,array['invoiceId','expectedVersion','approval','idempotencyKey','requestFingerprint']) is not true
    or p_input -> 'approval' is distinct from 'true'::jsonb or public.payr_draft_text_v1(p_input -> 'idempotencyKey',128) is not true
    or (pg_catalog.jsonb_typeof(p_input -> 'invoiceId') = 'string' and p_input ->> 'invoiceId' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and pg_catalog.jsonb_typeof(p_input -> 'expectedVersion') = 'number' and p_input ->> 'expectedVersion' ~ '^[1-9][0-9]{0,9}$'
      and (p_input ->> 'expectedVersion')::numeric <= 2147483647 and pg_catalog.jsonb_typeof(p_input -> 'requestFingerprint') = 'string'
      and p_input ->> 'requestFingerprint' ~ '^[0-9a-f]{64}$') is not true then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payr:void_invoice:' || p_workspace_id::text || ':' || (p_input ->> 'idempotencyKey'),0));
  select r.* into v_request from public.idempotency_requests as r where r.workspace_id = p_workspace_id
    and r.operation = 'void_invoice' and r.idempotency_key = p_input ->> 'idempotencyKey';
  if found then
    if v_request.request_fingerprint <> p_input ->> 'requestFingerprint' then raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT'; end if;
    v_replay := true;
    select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = (v_request.result_descriptor #>> '{ids,invoice_id}')::uuid;
    select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id and v.id = (v_request.result_descriptor #>> '{ids,version_id}')::uuid;
    if v_invoice.id <> (p_input ->> 'invoiceId')::uuid or v_version.version_number <> (p_input ->> 'expectedVersion')::integer then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:void');
  else
    select a.* into v_attempt from public.publication_attempts as a where a.workspace_id = p_workspace_id
      and a.invoice_id = (p_input ->> 'invoiceId')::uuid and a.state = 'finalized';
    select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id and v.id = v_attempt.invoice_version_id;
    if v_attempt.id is not null then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        'payr:invoice:' || v_version.chain_id::text || ':' || v_version.contract_address || ':' || v_attempt.invoice_key,0));
    end if;
    select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = (p_input ->> 'invoiceId')::uuid for update;
    if not found then raise exception using errcode = 'P0001', message = 'NOT_FOUND'; end if;
    if v_invoice.current_version <> (p_input ->> 'expectedVersion')::integer then
      raise exception using errcode = 'P0001', message = 'VERSION_CONFLICT', detail = pg_catalog.jsonb_build_object(
        'draftId',v_invoice.id,'currentVersion',v_invoice.current_version)::text;
    end if;
    perform 1 from public.access_links as l join public.invoice_versions as v on v.workspace_id = l.workspace_id and v.id = l.invoice_version_id
      where v.workspace_id = p_workspace_id and v.invoice_id = v_invoice.id for update of l;
    perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:void');
    v_now := pg_catalog.clock_timestamp();
    if v_invoice.commercial_state <> 'published' or v_invoice.payable_until <= v_now or v_attempt.id is null then
      raise exception using errcode = 'P0001', message = 'INVOICE_NOT_VOIDABLE';
    end if;
    if exists (select 1 from public.settlements as s where s.workspace_id = p_workspace_id and s.invoice_id = v_invoice.id) then
      raise exception using errcode = 'P0001', message = 'INVOICE_ALREADY_SETTLED';
    end if;
    update public.invoices set commercial_state = 'voided',voided_at = v_now,updated_at = v_now where id = v_invoice.id returning * into v_invoice;
    update public.access_links as l set revoked_at = v_now from public.invoice_versions as v
      where l.workspace_id = p_workspace_id and l.invoice_version_id = v.id and v.workspace_id = p_workspace_id
        and v.invoice_id = v_invoice.id and l.revoked_at is null;
    insert into public.idempotency_requests (id,workspace_id,operation,idempotency_key,request_fingerprint,result_descriptor,completed_at)
      values (pg_catalog.gen_random_uuid(),p_workspace_id,'void_invoice',p_input ->> 'idempotencyKey',p_input ->> 'requestFingerprint',
        pg_catalog.jsonb_build_object('ids',pg_catalog.jsonb_build_object('invoice_id',v_invoice.id,'version_id',v_version.id),'state','voided'),v_now);
  end if;
  if v_replay and (v_invoice.id is null or v_invoice.voided_at is null) then raise exception using errcode = 'P0001', message = 'INVALID_PUBLICATION_DESCRIPTOR'; end if;
  return pg_catalog.jsonb_build_object('invoiceId',v_invoice.id,'invoiceVersion',v_invoice.current_version,'commercialState','voided','voidedAt',v_invoice.voided_at);
end;
$$;

create function public.payr_expire_invoices_v1(p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  with candidates as (select i.id from public.invoices as i where i.commercial_state = 'published' and i.payable_until <= pg_catalog.clock_timestamp()
    order by i.payable_until,i.id limit p_limit for update skip locked)
  update public.invoices as i set commercial_state = 'expired',expired_at = pg_catalog.clock_timestamp(),updated_at = pg_catalog.clock_timestamp()
    from candidates as c where i.id = c.id and i.commercial_state = 'published' and i.payable_until <= pg_catalog.clock_timestamp();
  get diagnostics v_count = row_count;
  return pg_catalog.jsonb_build_object('expired',v_count);
end;
$$;

-- Same released signature, now serialized with void and settlement persistence.
create or replace function public.payr_record_payment_authorization_v1(
  p_workspace_id uuid, p_authorization_id uuid, p_invoice_id uuid, p_invoice_version_id uuid, p_invoice_key text,
  p_chain_id bigint, p_contract_address text, p_document_commitment text, p_payee text, p_amount_atomic numeric,
  p_attestor text, p_typed_data_digest text, p_signature_hash text, p_signer_mode text, p_policy_result text,
  p_issued_at_second bigint, p_authorization_valid_until bigint)
returns table (outcome text, authorization_id uuid) language plpgsql security definer set search_path = '' as $$
declare v_publication public.publication_attempts; v_version public.invoice_versions; v_invoice public.invoices; v_now_second bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payr:invoice:' || p_chain_id::text || ':' || p_contract_address || ':' || p_invoice_key,0));
  select i.* into v_invoice from public.invoices as i where i.workspace_id = p_workspace_id and i.id = p_invoice_id for update;
  select a.* into v_publication from public.publication_attempts as a where a.workspace_id = p_workspace_id
    and a.invoice_id = p_invoice_id and a.invoice_version_id = p_invoice_version_id and a.invoice_key = p_invoice_key and a.state = 'finalized';
  if v_publication.id is null or v_invoice.commercial_state <> 'published' or v_invoice.client_id is null
    or (v_invoice.payable_until > pg_catalog.clock_timestamp()) is not true then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_PAYABLE';
  end if;
  select v.* into v_version from public.invoice_versions as v where v.workspace_id = p_workspace_id
    and v.invoice_id = p_invoice_id and v.id = p_invoice_version_id and v.frozen_at is not null;
  if not found then raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_PAYABLE'; end if;
  if v_version.chain_id is distinct from p_chain_id or v_version.contract_address is distinct from p_contract_address
    or v_publication.document_commitment is distinct from p_document_commitment or v_version.payee is distinct from p_payee
    or v_version.amount_atomic is distinct from p_amount_atomic then raise exception using errcode = 'P0001', message = 'AUTHORIZATION_FACTS_MISMATCH'; end if;
  if exists (select 1 from public.settlements as s where s.workspace_id = p_workspace_id and s.invoice_id = p_invoice_id) then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_ALREADY_SETTLED';
  end if;
  v_now_second := pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint;
  if (p_issued_at_second <= v_now_second and p_authorization_valid_until >= v_now_second
    and p_authorization_valid_until > p_issued_at_second and p_authorization_valid_until < v_version.payable_until_second) is not true then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_DEADLINE_INVALID';
  end if;
  insert into public.payment_authorizations (id,workspace_id,invoice_id,invoice_version_id,publication_attempt_id,invoice_key,chain_id,
    contract_address,document_commitment,payee,amount_atomic,attestor,typed_data_digest,signature_hash,signer_mode,policy_result,
    issued_at_second,authorization_valid_until,payable_until_second)
    values (p_authorization_id,p_workspace_id,p_invoice_id,p_invoice_version_id,v_publication.id,p_invoice_key,p_chain_id,
      p_contract_address,p_document_commitment,p_payee,p_amount_atomic,p_attestor,p_typed_data_digest,p_signature_hash,p_signer_mode,p_policy_result,
      p_issued_at_second,p_authorization_valid_until,v_version.payable_until_second);
  return query select 'recorded'::text,p_authorization_id;
end;
$$;

revoke all on function public.payr_publication_protect_v1(), public.payr_publication_block_revision_v1(),
  public.payr_publication_link_dto_v1(public.access_links), public.payr_publication_artifact_dto_v1(public.publication_attempts),
  public.payr_publication_attempt_dto_v1(public.publication_attempts), public.payr_publication_profiles_v1(uuid,jsonb,uuid),
  public.payr_find_publication_replay_v1(uuid,text,uuid,text,text),
  public.payr_publication_lock_v1(uuid,uuid,bigint), public.payr_reserve_publication_v1(uuid,text,uuid,jsonb),
  public.payr_claim_publication_v1(uuid,uuid), public.payr_store_publication_v1(uuid,uuid,bigint,jsonb),
  public.payr_finalize_publication_v1(uuid,uuid,bigint), public.payr_fail_publication_v1(uuid,uuid,bigint,text),
  public.payr_publication_status_v1(uuid,text,uuid,uuid), public.payr_void_invoice_v1(uuid,text,uuid,jsonb), public.payr_expire_invoices_v1(integer),
  public.payr_record_payment_authorization_v1(uuid,uuid,uuid,uuid,text,bigint,text,text,text,numeric,text,text,text,text,text,bigint,bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.payr_find_publication_replay_v1(uuid,text,uuid,text,text),
  public.payr_reserve_publication_v1(uuid,text,uuid,jsonb), public.payr_claim_publication_v1(uuid,uuid),
  public.payr_store_publication_v1(uuid,uuid,bigint,jsonb), public.payr_finalize_publication_v1(uuid,uuid,bigint),
  public.payr_fail_publication_v1(uuid,uuid,bigint,text), public.payr_publication_status_v1(uuid,text,uuid,uuid),
  public.payr_void_invoice_v1(uuid,text,uuid,jsonb), public.payr_expire_invoices_v1(integer),
  public.payr_record_payment_authorization_v1(uuid,uuid,uuid,uuid,text,bigint,text,text,text,numeric,text,text,text,text,text,bigint,bigint) to service_role;

commit;
