-- Operator-only setup, not an application migration. Run as postgres after the
-- invoice email migration and deployment are verified. No secrets belong here.
begin;

do $$
begin
  if current_user <> 'postgres' then
    raise exception 'Run invoice email cron setup as the persistent postgres role';
  end if;
  if not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron')
    or not exists (select 1 from pg_catalog.pg_extension where extname = 'pg_net')
    or pg_catalog.to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Enable pg_cron, pg_net and Supabase Vault before invoice email cron setup';
  end if;
end;
$$;

create or replace function public.payr_wake_invoice_email_v1()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_origin text; v_secret text; v_origins bigint; v_secrets bigint;
begin
  select pg_catalog.count(*), pg_catalog.min(decrypted_secret) into v_origins, v_origin
    from vault.decrypted_secrets where name = 'payr_invoice_email_origin';
  select pg_catalog.count(*), pg_catalog.min(decrypted_secret) into v_secrets, v_secret
    from vault.decrypted_secrets where name = 'payr_invoice_email_cron_secret';
  -- This installation targets production Payr only, not a caller-controlled URL.
  if v_origins <> 1 or v_origin is distinct from 'https://payrlink.xyz'
    or v_secrets <> 1 or v_secret is null or pg_catalog.length(v_secret) < 32
    or v_secret ~ '[[:space:][:cntrl:]]' then
    raise exception 'Invoice email cron Vault configuration is invalid';
  end if;
  return net.http_get(
    url := v_origin || '/api/jobs/invoice-outbox',
    headers := pg_catalog.jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 300000
  );
end;
$$;

revoke all on function public.payr_wake_invoice_email_v1() from public, anon, authenticated, service_role;

-- Validate configuration without invoking the endpoint or exposing decrypted values.
do $$
begin
  if (select count(*) from vault.decrypted_secrets where name = 'payr_invoice_email_origin') <> 1
    or (select min(decrypted_secret) from vault.decrypted_secrets where name = 'payr_invoice_email_origin') is distinct from 'https://payrlink.xyz'
    or (select count(*) from vault.decrypted_secrets where name = 'payr_invoice_email_cron_secret') <> 1
    or not exists (select 1 from vault.decrypted_secrets where name = 'payr_invoice_email_cron_secret'
      and length(decrypted_secret) >= 32 and decrypted_secret !~ '[[:space:][:cntrl:]]') then
    raise exception 'Create the two named invoice email Vault entries before scheduling';
  end if;
end;
$$;

-- pg_cron updates a same-name job for this role instead of adding duplicates.
select cron.schedule('payr-invoice-email-outbox', '* * * * *', 'select public.payr_wake_invoice_email_v1();');
commit;

select jobid, jobname, schedule, active from cron.job
where jobname = 'payr-invoice-email-outbox' and username = current_user;
