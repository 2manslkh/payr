begin;

create function public.payr_reconciliation_target_v1(p_chain_id bigint, p_contract_address text, p_invoice_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts;
begin
  if p_chain_id is null or p_chain_id <= 0 or p_contract_address is null or p_contract_address !~ '^0x[0-9a-f]{40}$'
    or p_invoice_key is null or p_invoice_key !~ '^0x[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  select a.* into v_attempt from public.publication_attempts a
    join public.invoice_versions v on v.workspace_id=a.workspace_id and v.invoice_id=a.invoice_id and v.id=a.invoice_version_id
    where a.invoice_key=p_invoice_key and a.state='finalized' and v.frozen_at is not null
      and v.chain_id=p_chain_id and v.contract_address=p_contract_address;
  if not found then return 'null'::jsonb; end if;
  -- Settlement evidence must survive voiding, link revocation, and delayed discovery.
  return public.payr_publication_attempt_dto_v1(v_attempt);
end;
$$;

create function public.payr_reconciliation_cursor_v1(p_chain_id bigint, p_contract_address text, p_start_block numeric)
returns text language plpgsql security definer set search_path = '' as $$
declare v_next numeric;
begin
  if p_chain_id is null or p_chain_id <= 0 or p_contract_address is null or p_contract_address !~ '^0x[0-9a-f]{40}$'
    or p_start_block is null or p_start_block < 0 or p_start_block >= 'Infinity'::numeric
    or p_start_block <> pg_catalog.trunc(p_start_block) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  insert into public.reconciliation_cursors(chain_id,contract_address,next_block)
    values(p_chain_id,p_contract_address,p_start_block) on conflict do nothing;
  select next_block into v_next from public.reconciliation_cursors where chain_id=p_chain_id and contract_address=p_contract_address;
  return v_next::text;
end;
$$;

create function public.payr_advance_reconciliation_v1(p_chain_id bigint, p_contract_address text, p_expected numeric, p_next numeric)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (p_expected >= 0 and p_expected < 'Infinity'::numeric and p_expected = pg_catalog.trunc(p_expected)
    and p_next > p_expected and p_next <= p_expected+10000 and p_next = pg_catalog.trunc(p_next)) is not true then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  update public.reconciliation_cursors set next_block=p_next,updated_at=pg_catalog.clock_timestamp()
    where chain_id=p_chain_id and contract_address=p_contract_address and next_block=p_expected;
  return found;
end;
$$;

revoke all on function public.payr_reconciliation_target_v1(bigint,text,text),
  public.payr_reconciliation_cursor_v1(bigint,text,numeric),public.payr_advance_reconciliation_v1(bigint,text,numeric,numeric)
  from public,anon,authenticated,service_role;
grant execute on function public.payr_reconciliation_target_v1(bigint,text,text),
  public.payr_reconciliation_cursor_v1(bigint,text,numeric),public.payr_advance_reconciliation_v1(bigint,text,numeric,numeric)
  to service_role;
commit;
