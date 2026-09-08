begin;

create or replace function public.payr_claim_publication_v1(p_attempt_id uuid, p_lease_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_attempt public.publication_attempts;
begin
  if p_lease_owner is null then raise exception using errcode = '22023', message = 'INVALID_INPUT'; end if;
  select a.* into v_attempt from public.publication_attempts as a join public.invoices as i
    on i.workspace_id = a.workspace_id and i.id = a.invoice_id
    where (p_attempt_id is null or a.id = p_attempt_id) and a.chain_id is not null and a.fence < 9223372036854775807
      and a.state in ('reserved','rendering','stored') and (a.lease_until is null or a.lease_until <= pg_catalog.clock_timestamp())
    -- Each claim moves behind untouched work, even when its artifact stays unavailable.
    order by a.updated_at,a.created_at,a.id limit 1 for update of i skip locked;
  if not found then return 'null'::jsonb; end if;
  select a.* into v_attempt from public.publication_attempts as a where a.id = v_attempt.id for update;
  if v_attempt.state not in ('reserved','rendering','stored') or v_attempt.lease_until > pg_catalog.clock_timestamp() then return 'null'::jsonb; end if;
  update public.publication_attempts set state = case when state = 'stored' then 'stored'::public.publication_state else 'rendering'::public.publication_state end,
    lease_owner = p_lease_owner, lease_until = pg_catalog.clock_timestamp() + interval '60 seconds', fence = fence + 1,
    updated_at = pg_catalog.clock_timestamp() where id = v_attempt.id returning * into v_attempt;
  return public.payr_publication_attempt_dto_v1(v_attempt);
end;
$$;

commit;
