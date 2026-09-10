-- Operator-only rollback. Leave delivery records and Vault secrets intact.
select cron.unschedule(jobid) from cron.job
where jobname = 'payr-invoice-email-outbox' and username = current_user;
