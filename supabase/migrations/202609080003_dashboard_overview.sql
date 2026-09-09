begin;

-- Keep v1's strict response contract available during application rollouts.
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
