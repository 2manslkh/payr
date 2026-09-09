begin;

-- Distributed fixed-minute admission: at most 12 reads/owner, 60/IP and 600 globally.
-- Each admitted route request spends at most two Arc RPC calls, without retries.
-- Keep the selected balance address out of authority and quota identity.
create table public.wallet_balance_rate_limits (
  scope text not null check (scope in ('owner','ip','global')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null check (pg_catalog.isfinite(window_start)),
  request_count integer not null check (request_count between 1 and case scope when 'owner' then 12 when 'ip' then 60 else 600 end),
  primary key (scope,key_hash)
);
create index wallet_balance_rate_limits_window on public.wallet_balance_rate_limits (window_start);
alter table public.wallet_balance_rate_limits enable row level security;
revoke all on table public.wallet_balance_rate_limits from public, anon, authenticated, service_role;

create function public.payr_admit_wallet_balance_v1(p_workspace_id uuid, p_owner_wallet text, p_ip_hash text)
returns jsonb language plpgsql security definer set search_path = '' set lock_timeout = '1s' as $$
declare v_minute timestamptz; v_owner_hash text; v_global_hash text := pg_catalog.repeat('0',64);
begin
  if p_workspace_id is null or p_owner_wallet is null or p_owner_wallet !~ '^0x[0-9a-f]{40}$'
    or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,null,'invoice:status');
  v_owner_hash := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_owner_wallet,'UTF8')),'hex');
  -- Serialize only a short DB transaction, never provider I/O. Compute the minute after lock waits.
  -- Lock timeout and the route's admission deadline fail closed under contention.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('payr:wallet-balance:admission',0));
  v_minute := pg_catalog.date_trunc('minute',pg_catalog.clock_timestamp());
  if exists (select 1 from public.wallet_balance_rate_limits as c where c.window_start = v_minute
    and ((c.scope = 'global' and c.key_hash = v_global_hash and c.request_count >= 600)
      or (c.scope = 'owner' and c.key_hash = v_owner_hash and c.request_count >= 12)
      or (c.scope = 'ip' and c.key_hash = p_ip_hash and c.request_count >= 60))) then
    return pg_catalog.jsonb_build_object('allowed',false);
  end if;
  insert into public.wallet_balance_rate_limits as c (scope,key_hash,window_start,request_count)
    values ('global',v_global_hash,v_minute,1),('owner',v_owner_hash,v_minute,1),('ip',p_ip_hash,v_minute,1)
    on conflict (scope,key_hash) do update set window_start = v_minute,
      request_count = case when c.window_start = v_minute then c.request_count + 1 else 1 end;
  -- Each admission adds at most two subject keys and removes up to sixteen expired keys.
  -- Denied requests neither allocate arbitrary keys nor force cleanup work.
  delete from public.wallet_balance_rate_limits as c using (
    select old.scope,old.key_hash from public.wallet_balance_rate_limits as old
      where old.window_start < v_minute order by old.window_start,old.scope,old.key_hash limit 16
  ) as expired where c.scope = expired.scope and c.key_hash = expired.key_hash;
  return pg_catalog.jsonb_build_object('allowed',true);
end;
$$;

revoke all on function public.payr_admit_wallet_balance_v1(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.payr_admit_wallet_balance_v1(uuid,text,text) to service_role;

-- Forward-fix the hosted v2 function; retain v1, the response shape and the single read snapshot.
create or replace function public.payr_get_invoice_overview_v2(p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_overview jsonb;
begin
  perform public.payr_draft_scope_v1(p_workspace_id,p_owner_wallet,p_connector_id,'invoice:status');
  -- One read statement keeps totals, attention and settlement proof on the same snapshot.
  with summaries as materialized (select * from public.payr_invoice_summaries_v1(p_workspace_id)),
  outstanding as (select * from summaries where summary ->> 'commercialState' in ('published','expired')
    and summary ->> 'paymentStatus' = 'unpaid'),
  attention as (select *,case summary ->> 'commercialState' when 'expired' then 0 when 'published' then 1 else 2 end as priority,
      summary ->> 'dueDate' as due_date from summaries
    where summary ->> 'paymentStatus' = 'unpaid' and summary ->> 'commercialState' <> 'voided'
    order by priority,due_date,updated_at desc,id desc limit 50)
  select pg_catalog.jsonb_build_object(
    'invoiceCount',(select pg_catalog.count(*) from summaries),
    'draftCount',(select pg_catalog.count(*) from summaries where summary ->> 'commercialState' = 'draft'),
    'outstandingInvoiceCount',(select pg_catalog.count(*) from outstanding),
    'receivablesUnavailableCount',(select pg_catalog.count(*) from outstanding where summary ->> 'amountAtomic' is null),
    'receivablesAtomic',(select coalesce(pg_catalog.sum((summary ->> 'amountAtomic')::numeric),0)::text from outstanding),
    'attention',(select coalesce(pg_catalog.jsonb_agg(summary order by priority,due_date,updated_at desc,id desc),'[]'::jsonb) from attention),
    'senderComplete',coalesce((select public.payr_draft_billing_v1(public.payr_identity_profile_dto_v1(s)
        - array['id','revision','payoutWallet','invoicePrefix','defaultPaymentTermsDays'])
        and s.payout_wallet ~ '^0x[0-9a-f]{40}$' and s.invoice_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,31}$'
        and s.default_terms::integer between 0 and 365
      from public.sender_profiles as s where s.workspace_id = p_workspace_id),false),
    'clientCount',(select pg_catalog.count(*) from public.clients where workspace_id = p_workspace_id),
    'activeConnectorCount',(select pg_catalog.count(*) from public.connector_tokens where workspace_id = p_workspace_id
      and revoked_at is null and expires_at > pg_catalog.statement_timestamp()),
    'latestSettlement',(select pg_catalog.jsonb_build_object('invoiceId',s.invoice_id,'invoiceNumber',i.invoice_number,
        'transactionHash',s.transaction_hash,'blockTime',s.block_time,
        'amountDecimal',pg_catalog.trim_scale(s.amount_atomic * 0.000000000000000001::numeric)::text)
      from public.settlements as s join public.invoices as i on i.workspace_id = s.workspace_id and i.id = s.invoice_id
      where s.workspace_id = p_workspace_id order by s.block_time desc,s.id desc limit 1)) into v_overview;
  return v_overview;
end;
$$;

revoke all on function public.payr_get_invoice_overview_v2(uuid,text,uuid) from public, anon, authenticated, service_role;
grant execute on function public.payr_get_invoice_overview_v2(uuid,text,uuid) to service_role;

commit;
