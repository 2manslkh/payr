begin;

-- Keep the fenced worker RPCs unchanged; inject samples into the delay calculation
-- for exact tests and draw once when the winning transition persists its retry.
create function public.payr_worker_retry_sample_v1(p_now timestamptz,p_attempt integer,p_sample double precision)
returns timestamptz language plpgsql immutable security definer set search_path = '' as $$
begin
  if p_now is null or not pg_catalog.isfinite(p_now) or p_attempt is null or p_attempt<0
    or p_sample is null or p_sample<0 or p_sample>1 then
    raise exception using errcode='22023',message='INVALID_INPUT';
  end if;
  return p_now+pg_catalog.make_interval(secs=>
    least(1800::numeric,30*pg_catalog.power(2::numeric,least(p_attempt,6)))::double precision*(0.5+p_sample/2));
end;
$$;

create or replace function public.payr_worker_retry_at_v1(p_now timestamptz,p_attempt integer)
returns timestamptz language sql volatile security definer set search_path = '' as $$
  select public.payr_worker_retry_sample_v1(p_now,p_attempt,pg_catalog.random());
$$;

revoke all on function public.payr_worker_retry_sample_v1(timestamptz,integer,double precision),
  public.payr_worker_retry_at_v1(timestamptz,integer) from public,anon,authenticated,service_role;

commit;
