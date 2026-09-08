begin;
alter table public.reconciliation_cursors add column next_log_index integer not null default 0 check (next_log_index >= 0);

create function public.payr_reconciliation_position_v1(p_chain_id bigint,p_contract_address text,p_start_block numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_position public.reconciliation_cursors;
begin
  perform public.payr_reconciliation_cursor_v1(p_chain_id,p_contract_address,p_start_block);
  select * into strict v_position from public.reconciliation_cursors where chain_id=p_chain_id and contract_address=p_contract_address;
  return pg_catalog.jsonb_build_object('block',v_position.next_block::text,'logIndex',v_position.next_log_index);
end;
$$;

create function public.payr_advance_reconciliation_position_v1(p_chain_id bigint,p_contract_address text,p_expected numeric,
  p_expected_log integer,p_next numeric,p_next_log integer)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (p_expected >= 0 and p_expected < 'Infinity'::numeric and p_expected = pg_catalog.trunc(p_expected)
    and p_expected_log >= 0 and p_next_log >= 0 and p_next >= p_expected and p_next <= p_expected+10000
    and p_next = pg_catalog.trunc(p_next) and (p_next > p_expected or p_next_log > p_expected_log)) is not true then
    raise exception using errcode = '22023',message = 'INVALID_INPUT';
  end if;
  update public.reconciliation_cursors set next_block=p_next,next_log_index=p_next_log,updated_at=pg_catalog.clock_timestamp()
    where chain_id=p_chain_id and contract_address=p_contract_address and next_block=p_expected and next_log_index=p_expected_log;
  return found;
end;
$$;

revoke all on function public.payr_reconciliation_position_v1(bigint,text,numeric),
  public.payr_advance_reconciliation_position_v1(bigint,text,numeric,integer,numeric,integer) from public,anon,authenticated,service_role;
revoke all on function public.payr_reconciliation_cursor_v1(bigint,text,numeric),
  public.payr_advance_reconciliation_v1(bigint,text,numeric,numeric) from service_role;
grant execute on function public.payr_reconciliation_position_v1(bigint,text,numeric),
  public.payr_advance_reconciliation_position_v1(bigint,text,numeric,integer,numeric,integer) to service_role;
commit;
