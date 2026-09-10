-- A fixed cutover excludes both the old queue and late reconciliation of old payments.
create table public.receipt_email_activation (
  singleton boolean primary key default true check (singleton),
  activated_at timestamptz not null
);
insert into public.receipt_email_activation (activated_at) values (pg_catalog.clock_timestamp());
alter table public.receipt_email_activation enable row level security;
revoke all on public.receipt_email_activation from public, anon, authenticated, service_role;

create function public.payr_claim_automatic_receipt_delivery_v1(p_id uuid default null, p_receipt_document_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select d.id into v_id
    from public.email_deliveries d
    join public.receipt_documents r on r.id=d.receipt_document_id and r.workspace_id=d.workspace_id
      and r.settlement_id=d.settlement_id and r.state='ready'
    join public.settlements s on s.id=d.settlement_id and s.workspace_id=d.workspace_id
    cross join public.receipt_email_activation a
    where d.message_kind='receipt' and d.created_at>=a.activated_at and s.block_time>=a.activated_at
      and (p_id is null or d.id=p_id) and (p_receipt_document_id is null or r.id=p_receipt_document_id)
      and d.fence<9223372036854775807 and d.attempt_count<2147483647
      and (d.state='pending' or d.state='retry_wait' and d.next_attempt_at<=pg_catalog.clock_timestamp()
        or d.state='sending' and d.lease_until<=pg_catalog.clock_timestamp())
    order by d.updated_at,d.id for update of d skip locked limit 1;
  -- Never let an empty scoped selection fall through to the unrestricted queue.
  if not found then return 'null'::jsonb; end if;
  return public.payr_claim_delivery_v1(v_id);
end;
$$;
revoke all on function public.payr_claim_automatic_receipt_delivery_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.payr_claim_automatic_receipt_delivery_v1(uuid,uuid) to service_role;

create function public.payr_claim_next_automatic_receipt_v1()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select r.id into v_id from public.receipt_documents r
    join public.settlements s on s.id=r.settlement_id and s.workspace_id=r.workspace_id
    cross join public.receipt_email_activation a
    where r.created_at>=a.activated_at and s.block_time>=a.activated_at
      and r.fence<9223372036854775807 and r.attempt_count<2147483647
      and (r.state='pending' or r.state='retry_wait' and r.next_attempt_at<=pg_catalog.clock_timestamp()
        or r.state='rendering' and r.lease_until<=pg_catalog.clock_timestamp())
    order by r.updated_at,r.id for update of r skip locked limit 1;
  if not found then return 'null'::jsonb; end if;
  return public.payr_claim_receipt_v1(v_id);
end;
$$;
revoke all on function public.payr_claim_next_automatic_receipt_v1() from public, anon, authenticated;
grant execute on function public.payr_claim_next_automatic_receipt_v1() to service_role;
