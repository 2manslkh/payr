begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Applied invoice-email history predates integration with Privy's audit action.
-- Preserve that history and all existing invoice/receipt outcomes in this forward repair.
alter table public.audit_events drop constraint audit_events_bounded_codes;
alter table public.audit_events add constraint audit_events_bounded_codes check (
  action in ('auth.login','auth.payout_nonce','profile.save','profile.payout_change','client.save',
    'connector.create','connector.revoke','connector.admit','invoice:draft','invoice:publish','invoice:status','invoice:void',
    'settlement.recorded','receipt.generate','receipt.deliver','sender:read','sender:write','wallet:read','invoice.deliver')
  and outcome in ('allowed','denied','rate_limited','succeeded','failed','retry_wait','manual_review')
);

commit;
