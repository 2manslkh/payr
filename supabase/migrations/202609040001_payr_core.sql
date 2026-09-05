begin;

create type public.commercial_state as enum ('draft', 'published', 'voided', 'expired');
create type public.publication_state as enum ('reserved', 'rendering', 'stored', 'finalized', 'failed');
create type public.receipt_document_state as enum ('pending', 'rendering', 'retry_wait', 'ready', 'failed');
create type public.delivery_state as enum ('pending', 'sending', 'retry_wait', 'sent', 'manual_review', 'failed');

create function public.payr_is_safe_result_descriptor(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_value is not null
    and pg_catalog.jsonb_typeof(p_value) = 'object'
    and not exists (
      select 1
      from pg_catalog.jsonb_object_keys(p_value) as root_key(key)
      where root_key.key not in ('ids', 'hashes', 'filenames', 'state')
    )
    and (
      not (p_value ? 'ids')
      or (
        pg_catalog.jsonb_typeof(p_value -> 'ids') = 'object'
        and not exists (
          select 1
          from pg_catalog.jsonb_each_text(p_value -> 'ids') as item(key, value)
          where pg_catalog.length(item.key) > 63
             or item.key !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
             or (item.key ~ '(url|slug|token)' and item.key <> 'token_id')
             or item.value !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_each(p_value -> 'ids') as item(key, value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        )
      )
    )
    and (
      not (p_value ? 'hashes')
      or (
        pg_catalog.jsonb_typeof(p_value -> 'hashes') = 'object'
        and not exists (
          select 1
          from pg_catalog.jsonb_each_text(p_value -> 'hashes') as item(key, value)
          where pg_catalog.length(item.key) > 63
             or item.key !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
             or item.key ~ '(url|slug|token)'
             or item.value !~ '^0x[0-9a-f]{64}$'
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_each(p_value -> 'hashes') as item(key, value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        )
      )
    )
    and (
      not (p_value ? 'filenames')
      or (
        pg_catalog.jsonb_typeof(p_value -> 'filenames') = 'object'
        and not exists (
          select 1
          from pg_catalog.jsonb_each_text(p_value -> 'filenames') as item(key, value)
          where pg_catalog.length(item.key) > 63
             or item.key !~ '^[a-z][a-z0-9]*(_[a-z0-9]+)*$'
             or item.key ~ '(url|slug|token)'
             or item.value !~ '^[A-Za-z0-9_-]+[.]pdf$'
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_each(p_value -> 'filenames') as item(key, value)
          where pg_catalog.jsonb_typeof(item.value) <> 'string'
        )
      )
    )
    and (
      not (p_value ? 'state')
      or (
        pg_catalog.jsonb_typeof(p_value -> 'state') = 'string'
        and (p_value ->> 'state') ~ '^[a-z0-9][a-z0-9_:-]*$'
      )
    );
$$;

create function public.payr_is_valid_deliveries(p_value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_value is not null
    and pg_catalog.jsonb_typeof(p_value) = 'array'
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_value) with ordinality as delivery(value, position)
      where pg_catalog.jsonb_typeof(delivery.value) <> 'object'
         or (
           select pg_catalog.array_agg(k order by k)
           from pg_catalog.jsonb_object_keys(delivery.value) as keys(k)
         ) is distinct from array['messageKind', 'normalizedRecipient', 'roles']::text[]
         or delivery.value ->> 'messageKind' <> 'receipt'
         or pg_catalog.jsonb_typeof(delivery.value -> 'normalizedRecipient') <> 'string'
         or delivery.value ->> 'normalizedRecipient' = ''
         or delivery.value ->> 'normalizedRecipient' <> pg_catalog.lower(pg_catalog.btrim(delivery.value ->> 'normalizedRecipient'))
         or delivery.value ->> 'normalizedRecipient' !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
         or pg_catalog.jsonb_typeof(delivery.value -> 'roles') <> 'array'
         or delivery.value -> 'roles' not in ('["issuer"]'::jsonb, '["client"]'::jsonb, '["issuer", "client"]'::jsonb)
         or exists (
           select 1
           from pg_catalog.jsonb_array_elements(p_value) with ordinality as earlier(value, position)
           where earlier.position < delivery.position
             and earlier.value ->> 'normalizedRecipient' >= delivery.value ->> 'normalizedRecipient'
         )
    );
$$;

create table public.workspaces (
  id uuid primary key,
  owner_wallet text not null unique,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint workspaces_owner_wallet_format check (owner_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint workspaces_updated_after_creation check (updated_at >= created_at)
);

create table public.sender_profiles (
  id uuid primary key,
  workspace_id uuid not null,
  business_name text,
  billing_address jsonb,
  contact_name text,
  contact_email text,
  payout_wallet text,
  invoice_prefix text,
  default_terms text,
  revision integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint sender_profiles_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint sender_profiles_workspace_id_key unique (workspace_id, id),
  constraint sender_profiles_one_per_workspace unique (workspace_id),
  constraint sender_profiles_revision_positive check (revision > 0),
  constraint sender_profiles_billing_address_object check (billing_address is null or pg_catalog.jsonb_typeof(billing_address) = 'object'),
  constraint sender_profiles_contact_email_normalized check (contact_email is null or contact_email = pg_catalog.lower(pg_catalog.btrim(contact_email))),
  constraint sender_profiles_payout_wallet_format check (payout_wallet is null or payout_wallet ~ '^0x[0-9a-f]{40}$'),
  constraint sender_profiles_invoice_prefix_format check (invoice_prefix is null or invoice_prefix ~ '^[A-Z0-9][A-Z0-9-]{0,31}$'),
  constraint sender_profiles_updated_after_creation check (updated_at >= created_at)
);

create table public.clients (
  id uuid primary key,
  workspace_id uuid not null,
  alias text not null,
  business_name text not null,
  billing_address jsonb not null,
  contact_name text,
  contact_email text,
  revision integer not null default 1,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint clients_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint clients_workspace_id_key unique (workspace_id, id),
  constraint clients_workspace_alias_key unique (workspace_id, alias),
  constraint clients_alias_nonempty check (pg_catalog.btrim(alias) <> ''),
  constraint clients_business_name_nonempty check (pg_catalog.btrim(business_name) <> ''),
  constraint clients_billing_address_object check (pg_catalog.jsonb_typeof(billing_address) = 'object'),
  constraint clients_contact_email_normalized check (contact_email is null or contact_email = pg_catalog.lower(pg_catalog.btrim(contact_email))),
  constraint clients_revision_positive check (revision > 0),
  constraint clients_updated_after_creation check (updated_at >= created_at)
);

create table public.invoice_sequences (
  workspace_id uuid not null,
  sequence_year integer not null,
  next_value bigint not null default 1,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (workspace_id, sequence_year),
  constraint invoice_sequences_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint invoice_sequences_year_range check (sequence_year between 2000 and 9999),
  constraint invoice_sequences_next_value_positive check (next_value > 0)
);

create table public.auth_nonces (
  id uuid primary key,
  workspace_id uuid,
  wallet text not null,
  purpose text not null,
  challenge text not null unique,
  domain text not null,
  uri text not null,
  chain_id bigint not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint auth_nonces_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint auth_nonces_workspace_id_key unique (workspace_id, id),
  constraint auth_nonces_wallet_format check (wallet ~ '^0x[0-9a-f]{40}$'),
  constraint auth_nonces_challenge_format check (challenge ~ '^[A-Za-z0-9_-]{43}$'),
  constraint auth_nonces_chain_positive check (chain_id > 0),
  constraint auth_nonces_time_order check (expires_at > issued_at and (consumed_at is null or consumed_at >= issued_at))
);

create table public.connector_tokens (
  id uuid primary key,
  workspace_id uuid not null,
  token_hash text not null unique,
  scopes text[] not null default array['invoice:draft', 'invoice:publish', 'invoice:status', 'invoice:void']::text[],
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint connector_tokens_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint connector_tokens_workspace_id_key unique (workspace_id, id),
  constraint connector_tokens_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint connector_tokens_fixed_scopes check (scopes = array['invoice:draft', 'invoice:publish', 'invoice:status', 'invoice:void']::text[]),
  constraint connector_tokens_time_order check (expires_at > created_at and (revoked_at is null or revoked_at >= created_at) and (last_used_at is null or last_used_at >= created_at))
);

create table public.connector_rate_limits (
  workspace_id uuid not null,
  connector_token_id uuid not null,
  purpose text not null,
  subject_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (workspace_id, connector_token_id, purpose, subject_hash, window_started_at),
  constraint connector_rate_limits_token_fk foreign key (workspace_id, connector_token_id) references public.connector_tokens(workspace_id, id),
  constraint connector_rate_limits_subject_hash_format check (subject_hash ~ '^[0-9a-f]{64}$'),
  constraint connector_rate_limits_count_nonnegative check (request_count >= 0),
  constraint connector_rate_limits_updated_after_window check (updated_at >= window_started_at)
);

create table public.audit_events (
  id uuid primary key,
  workspace_id uuid not null,
  connector_token_id uuid,
  action text not null,
  outcome text not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint audit_events_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint audit_events_workspace_id_key unique (workspace_id, id),
  constraint audit_events_token_fk foreign key (workspace_id, connector_token_id) references public.connector_tokens(workspace_id, id),
  constraint audit_events_action_nonempty check (pg_catalog.btrim(action) <> ''),
  constraint audit_events_outcome_nonempty check (pg_catalog.btrim(outcome) <> '')
);

create table public.idempotency_requests (
  id uuid primary key,
  workspace_id uuid not null,
  operation text not null,
  idempotency_key text not null,
  request_fingerprint text not null,
  result_descriptor jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  completed_at timestamptz,
  constraint idempotency_requests_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint idempotency_requests_workspace_id_key unique (workspace_id, id),
  constraint idempotency_requests_scope_key unique (workspace_id, operation, idempotency_key),
  constraint idempotency_requests_operation_nonempty check (pg_catalog.btrim(operation) <> ''),
  constraint idempotency_requests_key_nonempty check (pg_catalog.btrim(idempotency_key) <> ''),
  constraint idempotency_requests_fingerprint_format check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint idempotency_requests_safe_result check (public.payr_is_safe_result_descriptor(result_descriptor) is true),
  constraint idempotency_requests_completion_order check (completed_at is null or completed_at >= created_at)
);

create table public.invoices (
  id uuid primary key,
  workspace_id uuid not null,
  client_id uuid,
  current_version integer not null default 1,
  commercial_state public.commercial_state not null default 'draft',
  invoice_number text,
  published_at timestamptz,
  payable_until timestamptz,
  voided_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint invoices_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint invoices_workspace_id_key unique (workspace_id, id),
  constraint invoices_client_fk foreign key (workspace_id, client_id) references public.clients(workspace_id, id),
  constraint invoices_workspace_number_key unique (workspace_id, invoice_number),
  constraint invoices_current_version_positive check (current_version > 0),
  constraint invoices_state_facts check (
    (commercial_state = 'draft' and invoice_number is null and published_at is null and payable_until is null and voided_at is null and expired_at is null)
    or (commercial_state = 'published' and client_id is not null and invoice_number is not null and published_at is not null and payable_until is not null and voided_at is null and expired_at is null)
    or (commercial_state = 'voided' and client_id is not null and invoice_number is not null and published_at is not null and payable_until is not null and voided_at is not null and expired_at is null)
    or (commercial_state = 'expired' and client_id is not null and invoice_number is not null and published_at is not null and payable_until is not null and voided_at is null and expired_at is not null)
  ),
  constraint invoices_publication_before_deadline check (published_at is null or published_at < payable_until),
  constraint invoices_void_after_publication check (voided_at is null or voided_at >= published_at),
  constraint invoices_expiry_at_deadline check (expired_at is null or expired_at >= payable_until),
  constraint invoices_updated_after_creation check (updated_at >= created_at)
);

create table public.invoice_versions (
  id uuid primary key,
  workspace_id uuid not null,
  invoice_id uuid not null,
  version_number integer not null,
  sender_snapshot jsonb,
  client_snapshot jsonb,
  line_items jsonb,
  memo text,
  issue_date date,
  due_date date,
  payable_until timestamptz,
  payable_until_second bigint,
  amount_decimal text,
  amount_atomic numeric(78, 0),
  chain_id bigint,
  contract_address text,
  payee text,
  frozen_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint invoice_versions_invoice_fk foreign key (workspace_id, invoice_id) references public.invoices(workspace_id, id),
  constraint invoice_versions_workspace_id_key unique (workspace_id, id),
  constraint invoice_versions_invoice_id_id_key unique (workspace_id, invoice_id, id),
  constraint invoice_versions_number_key unique (workspace_id, invoice_id, version_number),
  constraint invoice_versions_number_positive check (version_number > 0),
  constraint invoice_versions_sender_snapshot_object check (sender_snapshot is null or pg_catalog.jsonb_typeof(sender_snapshot) = 'object'),
  constraint invoice_versions_client_snapshot_object check (client_snapshot is null or pg_catalog.jsonb_typeof(client_snapshot) = 'object'),
  constraint invoice_versions_line_items_array check (line_items is null or pg_catalog.jsonb_typeof(line_items) = 'array'),
  constraint invoice_versions_date_order check (issue_date is null or due_date is null or due_date >= issue_date),
  constraint invoice_versions_deadline_pair check ((payable_until is null) = (payable_until_second is null)),
  constraint invoice_versions_deadline_second check (payable_until is null or payable_until_second = pg_catalog.floor(extract(epoch from payable_until))::bigint),
  constraint invoice_versions_deadline_after_due check (payable_until is null or due_date is null or payable_until > (due_date::timestamp at time zone 'UTC')),
  constraint invoice_versions_amount_pair check ((amount_decimal is null) = (amount_atomic is null)),
  constraint invoice_versions_amount_decimal_format check (
    amount_decimal is null
    or (
      amount_decimal ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$'
      and amount_decimal::numeric > 0
      and amount_decimal !~ '\.[0-9]*0$'
    )
  ),
  constraint invoice_versions_amount_positive check (amount_atomic is null or (amount_atomic > 0 and amount_atomic < 'Infinity'::numeric)),
  constraint invoice_versions_amount_consistent check (amount_decimal is null or amount_atomic = amount_decimal::numeric * 1000000000000000000),
  constraint invoice_versions_chain_positive check (chain_id is null or chain_id > 0),
  constraint invoice_versions_contract_format check (contract_address is null or contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint invoice_versions_payee_format check (payee is null or payee ~ '^0x[0-9a-f]{40}$'),
  constraint invoice_versions_frozen_complete check (
    frozen_at is null
    or (
      sender_snapshot is not null
      and client_snapshot is not null
      and line_items is not null
      and issue_date is not null
      and due_date is not null
      and payable_until is not null
      and amount_decimal is not null
      and amount_atomic is not null
      and chain_id is not null
      and contract_address is not null
      and payee is not null
    )
  ),
  constraint invoice_versions_frozen_after_creation check (frozen_at is null or frozen_at >= created_at)
);

create table public.publication_attempts (
  id uuid primary key,
  workspace_id uuid not null,
  invoice_id uuid not null,
  invoice_version_id uuid not null,
  state public.publication_state not null default 'reserved',
  request_fingerprint text not null,
  sequence_year integer not null,
  sequence_value bigint not null,
  invoice_number text not null,
  invoice_key text not null,
  publication_salt text not null,
  storage_key text not null,
  invoice_token_id uuid not null,
  invoice_key_version integer not null,
  invoice_verifier_hash text not null,
  invoice_link_expires_at timestamptz not null,
  lease_until timestamptz,
  fence bigint not null default 0,
  terminal_failure_code text,
  invoice_data_hash text,
  pdf_content_hash text,
  document_commitment text,
  pdf_filename text,
  pdf_byte_length bigint,
  pdf_content_type text,
  stored_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint publication_attempts_version_fk foreign key (workspace_id, invoice_id, invoice_version_id) references public.invoice_versions(workspace_id, invoice_id, id),
  constraint publication_attempts_workspace_id_key unique (workspace_id, id),
  constraint publication_attempts_target_id_key unique (workspace_id, invoice_id, invoice_version_id, id),
  constraint publication_attempts_invoice_key_key unique (invoice_key),
  constraint publication_attempts_invoice_token_key unique (invoice_token_id),
  constraint publication_attempts_fingerprint_format check (request_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint publication_attempts_sequence_year_range check (sequence_year between 2000 and 9999),
  constraint publication_attempts_sequence_positive check (sequence_value > 0),
  constraint publication_attempts_invoice_number_nonempty check (pg_catalog.btrim(invoice_number) <> ''),
  constraint publication_attempts_invoice_key_format check (invoice_key ~ '^0x[0-9a-f]{64}$'),
  constraint publication_attempts_salt_format check (publication_salt ~ '^0x[0-9a-f]{64}$'),
  constraint publication_attempts_storage_key_safe check (storage_key <> '' and storage_key !~ '(^/|(^|/)\.\.(/|$)|[[:cntrl:]])'),
  constraint publication_attempts_link_key_version_positive check (invoice_key_version > 0),
  constraint publication_attempts_verifier_hash_format check (invoice_verifier_hash ~ '^[0-9a-f]{64}$'),
  constraint publication_attempts_link_expiry_order check (invoice_link_expires_at > created_at),
  constraint publication_attempts_fence_nonnegative check (fence >= 0),
  constraint publication_attempts_terminal_facts check ((state = 'failed') = (terminal_failure_code is not null) and (state = 'finalized') = (finalized_at is not null)),
  constraint publication_attempts_artifact_group check (
    (invoice_data_hash is null and pdf_content_hash is null and document_commitment is null and pdf_filename is null and pdf_byte_length is null and pdf_content_type is null and stored_at is null)
    or (invoice_data_hash is not null and pdf_content_hash is not null and document_commitment is not null and pdf_filename is not null and pdf_byte_length is not null and pdf_content_type is not null and pdf_content_type = 'application/pdf' and stored_at is not null)
  ),
  constraint publication_attempts_artifact_state check (
    (state in ('reserved', 'rendering') and invoice_data_hash is null)
    or (state in ('stored', 'finalized') and invoice_data_hash is not null)
    or state = 'failed'
  ),
  constraint publication_attempts_invoice_data_hash_format check (invoice_data_hash is null or invoice_data_hash ~ '^0x[0-9a-f]{64}$'),
  constraint publication_attempts_pdf_hash_format check (pdf_content_hash is null or pdf_content_hash ~ '^0x[0-9a-f]{64}$'),
  constraint publication_attempts_commitment_format check (document_commitment is null or document_commitment ~ '^0x[0-9a-f]{64}$'),
  constraint publication_attempts_pdf_filename_safe check (pdf_filename is null or (pdf_filename not in ('', '.', '..') and pdf_filename !~ '[/\\]' and pdf_filename !~ '[[:cntrl:]]')),
  constraint publication_attempts_pdf_length_positive check (pdf_byte_length is null or pdf_byte_length > 0),
  constraint publication_attempts_stored_after_creation check (stored_at is null or stored_at >= created_at),
  constraint publication_attempts_finalized_after_storage check (finalized_at is null or finalized_at >= stored_at),
  constraint publication_attempts_updated_after_creation check (updated_at >= created_at)
);

create unique index publication_attempts_one_active_per_version
on public.publication_attempts (workspace_id, invoice_id, invoice_version_id)
where state in ('reserved', 'rendering', 'stored');

create unique index publication_attempts_one_finalized_per_invoice
on public.publication_attempts (workspace_id, invoice_id)
where state = 'finalized';

create table public.payment_authorizations (
  id uuid primary key,
  workspace_id uuid not null,
  invoice_id uuid not null,
  invoice_version_id uuid not null,
  publication_attempt_id uuid not null,
  invoice_key text not null,
  chain_id bigint not null,
  contract_address text not null,
  document_commitment text not null,
  payee text not null,
  amount_atomic numeric(78, 0) not null,
  attestor text not null,
  typed_data_digest text not null,
  signature_hash text not null,
  signer_mode text not null,
  policy_result text not null,
  issued_at_second bigint not null,
  authorization_valid_until bigint not null,
  payable_until_second bigint not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint payment_authorizations_version_fk foreign key (workspace_id, invoice_id, invoice_version_id) references public.invoice_versions(workspace_id, invoice_id, id),
  constraint payment_authorizations_attempt_fk foreign key (workspace_id, invoice_id, invoice_version_id, publication_attempt_id) references public.publication_attempts(workspace_id, invoice_id, invoice_version_id, id),
  constraint payment_authorizations_workspace_id_key unique (workspace_id, id),
  constraint payment_authorizations_invoice_key_format check (invoice_key ~ '^0x[0-9a-f]{64}$'),
  constraint payment_authorizations_chain_positive check (chain_id > 0),
  constraint payment_authorizations_contract_format check (contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint payment_authorizations_commitment_format check (document_commitment ~ '^0x[0-9a-f]{64}$'),
  constraint payment_authorizations_payee_format check (payee ~ '^0x[0-9a-f]{40}$'),
  constraint payment_authorizations_amount_positive check (amount_atomic > 0 and amount_atomic < 'Infinity'::numeric),
  constraint payment_authorizations_attestor_format check (attestor ~ '^0x[0-9a-f]{40}$'),
  constraint payment_authorizations_digest_format check (typed_data_digest ~ '^0x[0-9a-f]{64}$'),
  constraint payment_authorizations_signature_hash_format check (signature_hash ~ '^0x[0-9a-f]{64}$'),
  constraint payment_authorizations_signer_mode_nonempty check (pg_catalog.btrim(signer_mode) <> ''),
  constraint payment_authorizations_policy_result_nonempty check (pg_catalog.btrim(policy_result) <> ''),
  constraint payment_authorizations_deadline_order check (authorization_valid_until > issued_at_second and authorization_valid_until < payable_until_second)
);

create table public.settlements (
  id uuid primary key,
  workspace_id uuid not null,
  invoice_id uuid not null,
  invoice_version_id uuid not null,
  publication_attempt_id uuid not null,
  chain_id bigint not null,
  contract_address text not null,
  invoice_key text not null,
  transaction_hash text not null,
  log_index integer not null,
  block_number numeric(78, 0) not null,
  block_time timestamptz not null,
  document_commitment text not null,
  payer text not null,
  payee text not null,
  amount_atomic numeric(78, 0) not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint settlements_version_fk foreign key (workspace_id, invoice_id, invoice_version_id) references public.invoice_versions(workspace_id, invoice_id, id),
  constraint settlements_attempt_fk foreign key (workspace_id, invoice_id, invoice_version_id, publication_attempt_id) references public.publication_attempts(workspace_id, invoice_id, invoice_version_id, id),
  constraint settlements_workspace_id_key unique (workspace_id, id),
  constraint settlements_target_id_key unique (workspace_id, invoice_id, invoice_version_id, id),
  constraint settlements_event_key unique (chain_id, transaction_hash, log_index),
  constraint settlements_invoice_key_key unique (chain_id, contract_address, invoice_key),
  constraint settlements_chain_positive check (chain_id > 0),
  constraint settlements_contract_format check (contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint settlements_invoice_key_format check (invoice_key ~ '^0x[0-9a-f]{64}$'),
  constraint settlements_transaction_hash_format check (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  constraint settlements_log_index_nonnegative check (log_index >= 0),
  constraint settlements_block_number_nonnegative check (block_number >= 0 and block_number < 'Infinity'::numeric),
  constraint settlements_commitment_format check (document_commitment ~ '^0x[0-9a-f]{64}$'),
  constraint settlements_payer_format check (payer ~ '^0x[0-9a-f]{40}$'),
  constraint settlements_payee_format check (payee ~ '^0x[0-9a-f]{40}$'),
  constraint settlements_amount_positive check (amount_atomic > 0 and amount_atomic < 'Infinity'::numeric)
);

create table public.receipt_documents (
  id uuid primary key,
  workspace_id uuid not null,
  settlement_id uuid not null,
  invoice_id uuid not null,
  invoice_version_id uuid not null,
  token_id uuid not null unique,
  key_version integer not null,
  verifier_hash text not null,
  link_expires_at timestamptz not null,
  state public.receipt_document_state not null default 'pending',
  lease_until timestamptz,
  next_attempt_at timestamptz,
  fence bigint not null default 0,
  attempt_count integer not null default 0,
  storage_key text,
  byte_length bigint,
  content_type text,
  content_hash text,
  pdf_filename text,
  ready_at timestamptz,
  terminal_failure_code text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint receipt_documents_settlement_fk foreign key (workspace_id, invoice_id, invoice_version_id, settlement_id) references public.settlements(workspace_id, invoice_id, invoice_version_id, id),
  constraint receipt_documents_workspace_id_key unique (workspace_id, id),
  constraint receipt_documents_settlement_id_id_key unique (workspace_id, settlement_id, id),
  constraint receipt_documents_one_per_settlement unique (workspace_id, settlement_id),
  constraint receipt_documents_key_version_positive check (key_version > 0),
  constraint receipt_documents_verifier_hash_format check (verifier_hash ~ '^[0-9a-f]{64}$'),
  constraint receipt_documents_link_expiry_order check (link_expires_at > created_at),
  constraint receipt_documents_fence_nonnegative check (fence >= 0),
  constraint receipt_documents_attempt_count_nonnegative check (attempt_count >= 0),
  constraint receipt_documents_terminal_failure check ((state = 'failed') = (terminal_failure_code is not null)),
  constraint receipt_documents_ready_time check ((state = 'ready') = (ready_at is not null)),
  constraint receipt_documents_artifact_group check (
    (storage_key is null and byte_length is null and content_type is null and content_hash is null and pdf_filename is null)
    or (storage_key is not null and byte_length is not null and content_type is not null and content_type = 'application/pdf' and content_hash is not null and pdf_filename is not null)
  ),
  constraint receipt_documents_ready_artifact check (state <> 'ready' or storage_key is not null),
  constraint receipt_documents_storage_key_safe check (storage_key is null or (storage_key <> '' and storage_key !~ '(^/|(^|/)\.\.(/|$)|[[:cntrl:]])')),
  constraint receipt_documents_byte_length_positive check (byte_length is null or byte_length > 0),
  constraint receipt_documents_content_hash_format check (content_hash is null or content_hash ~ '^0x[0-9a-f]{64}$'),
  constraint receipt_documents_pdf_filename_safe check (pdf_filename is null or (pdf_filename not in ('', '.', '..') and pdf_filename !~ '[/\\]' and pdf_filename !~ '[[:cntrl:]]')),
  constraint receipt_documents_ready_after_creation check (ready_at is null or ready_at >= created_at),
  constraint receipt_documents_updated_after_creation check (updated_at >= created_at)
);

create table public.access_links (
  id uuid primary key,
  workspace_id uuid not null,
  token_id uuid not null unique,
  purpose text not null,
  key_version integer not null,
  verifier_hash text not null,
  invoice_version_id uuid,
  receipt_document_id uuid,
  activated_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  constraint access_links_workspace_fk foreign key (workspace_id) references public.workspaces(id),
  constraint access_links_workspace_id_key unique (workspace_id, id),
  constraint access_links_invoice_version_fk foreign key (workspace_id, invoice_version_id) references public.invoice_versions(workspace_id, id),
  constraint access_links_receipt_document_fk foreign key (workspace_id, receipt_document_id) references public.receipt_documents(workspace_id, id),
  constraint access_links_purpose_target check (
    (purpose = 'invoice-bearer' and invoice_version_id is not null and receipt_document_id is null)
    or (purpose = 'receipt-bearer' and invoice_version_id is null and receipt_document_id is not null)
  ),
  constraint access_links_key_version_positive check (key_version > 0),
  constraint access_links_verifier_hash_format check (verifier_hash ~ '^[0-9a-f]{64}$'),
  constraint access_links_expiry_order check (expires_at > created_at),
  constraint access_links_activation_order check (activated_at is null or activated_at >= created_at),
  constraint access_links_revocation_order check (revoked_at is null or revoked_at >= created_at)
);

create table public.email_deliveries (
  id uuid primary key,
  workspace_id uuid not null,
  settlement_id uuid not null,
  receipt_document_id uuid not null,
  message_kind text not null default 'receipt',
  normalized_recipient text not null,
  roles text[] not null,
  state public.delivery_state not null default 'pending',
  lease_until timestamptz,
  next_attempt_at timestamptz,
  fence bigint not null default 0,
  attempt_count integer not null default 0,
  provider_idempotency_key text not null,
  first_provider_attempt_at timestamptz,
  provider_request_started_at timestamptz,
  ambiguous_since timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint email_deliveries_settlement_fk foreign key (workspace_id, settlement_id) references public.settlements(workspace_id, id),
  constraint email_deliveries_receipt_fk foreign key (workspace_id, settlement_id, receipt_document_id) references public.receipt_documents(workspace_id, settlement_id, id),
  constraint email_deliveries_workspace_id_key unique (workspace_id, id),
  constraint email_deliveries_recipient_key unique (workspace_id, settlement_id, message_kind, normalized_recipient),
  constraint email_deliveries_message_kind check (message_kind = 'receipt'),
  constraint email_deliveries_recipient_normalized check (normalized_recipient = pg_catalog.lower(pg_catalog.btrim(normalized_recipient)) and normalized_recipient ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint email_deliveries_roles check (roles in (array['issuer']::text[], array['client']::text[], array['issuer', 'client']::text[])),
  constraint email_deliveries_fence_nonnegative check (fence >= 0),
  constraint email_deliveries_attempt_count_nonnegative check (attempt_count >= 0),
  constraint email_deliveries_provider_key_nonempty check (pg_catalog.btrim(provider_idempotency_key) <> ''),
  constraint email_deliveries_provider_time_order check (
    (first_provider_attempt_at is null or first_provider_attempt_at >= created_at)
    and (provider_request_started_at is null or provider_request_started_at >= created_at)
    and (ambiguous_since is null or ambiguous_since >= created_at)
  ),
  constraint email_deliveries_updated_after_creation check (updated_at >= created_at)
);

create table public.reconciliation_cursors (
  chain_id bigint not null,
  contract_address text not null,
  next_block numeric(78, 0) not null,
  updated_at timestamptz not null default pg_catalog.now(),
  primary key (chain_id, contract_address),
  constraint reconciliation_cursors_chain_positive check (chain_id > 0),
  constraint reconciliation_cursors_contract_format check (contract_address ~ '^0x[0-9a-f]{40}$'),
  constraint reconciliation_cursors_next_block_nonnegative check (next_block >= 0 and next_block < 'Infinity'::numeric)
);

create function public.payr_protect_frozen_invoice_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.frozen_at is not null then
    raise exception using errcode = '55000', message = 'FROZEN_INVOICE_VERSION';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger invoice_versions_frozen_immutable
before update or delete on public.invoice_versions
for each row execute function public.payr_protect_frozen_invoice_version();

create function public.payr_protect_finalized_publication()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'finalized' then
    raise exception using errcode = '55000', message = 'FINALIZED_PUBLICATION_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger publication_attempts_finalized_immutable
before update or delete on public.publication_attempts
for each row execute function public.payr_protect_finalized_publication();

create function public.payr_protect_settlement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000', message = 'SETTLEMENT_IMMUTABLE';
end;
$$;

create trigger settlements_immutable
before update or delete on public.settlements
for each row execute function public.payr_protect_settlement();

create function public.payr_protect_ready_receipt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'ready' then
    raise exception using errcode = '55000', message = 'READY_RECEIPT_IMMUTABLE';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger receipt_documents_ready_immutable
before update or delete on public.receipt_documents
for each row execute function public.payr_protect_ready_receipt();

create function public.payr_allocate_invoice_sequence_v1(
  p_workspace_id uuid,
  p_sequence_year integer,
  p_idempotency_key text,
  p_request_fingerprint text
)
returns table (outcome text, sequence_value text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claimed integer;
  v_existing_fingerprint text;
  v_descriptor jsonb;
  v_sequence_value bigint;
begin
  insert into public.idempotency_requests (
    id,
    workspace_id,
    operation,
    idempotency_key,
    request_fingerprint,
    result_descriptor
  ) values (
    pg_catalog.gen_random_uuid(),
    p_workspace_id,
    'allocate_invoice_sequence',
    p_idempotency_key,
    p_request_fingerprint,
    '{}'::jsonb
  )
  on conflict (workspace_id, operation, idempotency_key) do nothing;

  get diagnostics v_claimed = row_count;

  if v_claimed = 0 then
    select request.request_fingerprint, request.result_descriptor
      into v_existing_fingerprint, v_descriptor
    from public.idempotency_requests as request
    where request.workspace_id = p_workspace_id
      and request.operation = 'allocate_invoice_sequence'
      and request.idempotency_key = p_idempotency_key
    for update;

    if v_existing_fingerprint is distinct from p_request_fingerprint then
      return query select 'conflict'::text, null::text;
      return;
    end if;

    return query select 'replayed'::text, (v_descriptor ->> 'state')::bigint::text;
    return;
  end if;

  insert into public.invoice_sequences (workspace_id, sequence_year, next_value)
  values (p_workspace_id, p_sequence_year, 2)
  on conflict (workspace_id, sequence_year) do update
    set next_value = public.invoice_sequences.next_value + 1,
        updated_at = pg_catalog.now()
  returning public.invoice_sequences.next_value - 1 into v_sequence_value;

  update public.idempotency_requests as request
  set result_descriptor = pg_catalog.jsonb_build_object('state', v_sequence_value::text),
      completed_at = pg_catalog.now()
  where request.workspace_id = p_workspace_id
    and request.operation = 'allocate_invoice_sequence'
    and request.idempotency_key = p_idempotency_key;

  return query select 'allocated'::text, v_sequence_value::text;
end;
$$;

create function public.payr_record_payment_authorization_v1(
  p_workspace_id uuid,
  p_authorization_id uuid,
  p_invoice_id uuid,
  p_invoice_version_id uuid,
  p_invoice_key text,
  p_chain_id bigint,
  p_contract_address text,
  p_document_commitment text,
  p_payee text,
  p_amount_atomic numeric,
  p_attestor text,
  p_typed_data_digest text,
  p_signature_hash text,
  p_signer_mode text,
  p_policy_result text,
  p_issued_at_second bigint,
  p_authorization_valid_until bigint
)
returns table (outcome text, authorization_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publication public.publication_attempts%rowtype;
  v_version public.invoice_versions%rowtype;
  v_now_second bigint := pg_catalog.floor(extract(epoch from pg_catalog.clock_timestamp()))::bigint;
begin
  select attempt.*
    into v_publication
  from public.publication_attempts as attempt
  join public.invoices as invoice
    on invoice.workspace_id = attempt.workspace_id
   and invoice.id = attempt.invoice_id
  where attempt.workspace_id = p_workspace_id
    and attempt.invoice_id = p_invoice_id
    and attempt.invoice_version_id = p_invoice_version_id
    and attempt.invoice_key = p_invoice_key
    and attempt.state = 'finalized'
    and invoice.commercial_state = 'published'
    and invoice.client_id is not null
    and invoice.payable_until > pg_catalog.clock_timestamp();

  if not found then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_PAYABLE';
  end if;

  select version.*
    into strict v_version
  from public.invoice_versions as version
  where version.workspace_id = p_workspace_id
    and version.invoice_id = p_invoice_id
    and version.id = p_invoice_version_id
    and version.frozen_at is not null;

  if v_version.chain_id is distinct from p_chain_id
     or v_version.contract_address is distinct from p_contract_address
     or v_publication.document_commitment is distinct from p_document_commitment
     or v_version.payee is distinct from p_payee
     or v_version.amount_atomic is distinct from p_amount_atomic
  then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_FACTS_MISMATCH';
  end if;

  if exists (
    select 1
    from public.settlements as settlement
    where settlement.workspace_id = p_workspace_id
      and settlement.invoice_id = p_invoice_id
      and settlement.invoice_version_id = p_invoice_version_id
  ) then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_ALREADY_SETTLED';
  end if;

  if p_issued_at_second > v_now_second
     or p_authorization_valid_until < v_now_second
     or p_authorization_valid_until <= p_issued_at_second
     or p_authorization_valid_until >= v_version.payable_until_second
  then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_DEADLINE_INVALID';
  end if;

  insert into public.payment_authorizations (
    id,
    workspace_id,
    invoice_id,
    invoice_version_id,
    publication_attempt_id,
    invoice_key,
    chain_id,
    contract_address,
    document_commitment,
    payee,
    amount_atomic,
    attestor,
    typed_data_digest,
    signature_hash,
    signer_mode,
    policy_result,
    issued_at_second,
    authorization_valid_until,
    payable_until_second
  ) values (
    p_authorization_id,
    p_workspace_id,
    p_invoice_id,
    p_invoice_version_id,
    v_publication.id,
    p_invoice_key,
    p_chain_id,
    p_contract_address,
    p_document_commitment,
    p_payee,
    p_amount_atomic,
    p_attestor,
    p_typed_data_digest,
    p_signature_hash,
    p_signer_mode,
    p_policy_result,
    p_issued_at_second,
    p_authorization_valid_until,
    v_version.payable_until_second
  );

  return query select 'recorded'::text, p_authorization_id;
exception
  when no_data_found then
    raise exception using errcode = 'P0001', message = 'AUTHORIZATION_NOT_PAYABLE';
end;
$$;

create function public.payr_record_settlement_v1(
  p_workspace_id uuid,
  p_chain_id bigint,
  p_contract_address text,
  p_invoice_key text,
  p_transaction_hash text,
  p_log_index integer,
  p_block_number numeric,
  p_block_time timestamptz,
  p_document_commitment text,
  p_payer text,
  p_payee text,
  p_amount_atomic numeric,
  p_receipt_token_id uuid,
  p_receipt_key_version integer,
  p_receipt_verifier_hash text,
  p_receipt_expires_at timestamptz,
  p_deliveries jsonb
)
returns table (outcome text, settlement_id uuid, receipt_document_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_publication public.publication_attempts%rowtype;
  v_version public.invoice_versions%rowtype;
  v_existing public.settlements%rowtype;
  v_settlement_id uuid;
  v_receipt_document_id uuid;
  v_delivery jsonb;
begin
  select attempt.*
    into v_publication
  from public.publication_attempts as attempt
  where attempt.workspace_id = p_workspace_id
    and attempt.invoice_key = p_invoice_key
    and attempt.state = 'finalized';

  if not found then
    raise exception using errcode = 'P0001', message = 'SETTLEMENT_FACTS_MISMATCH';
  end if;

  select version.*
    into strict v_version
  from public.invoice_versions as version
  where version.workspace_id = v_publication.workspace_id
    and version.invoice_id = v_publication.invoice_id
    and version.id = v_publication.invoice_version_id
    and version.frozen_at is not null;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payr:event:' || p_chain_id::text || ':' || p_transaction_hash || ':' || p_log_index::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payr:invoice:' || p_chain_id::text || ':' || p_contract_address || ':' || p_invoice_key, 0)
  );

  select settlement.*
    into v_existing
  from public.settlements as settlement
  where (settlement.chain_id = p_chain_id and settlement.transaction_hash = p_transaction_hash and settlement.log_index = p_log_index)
     or (settlement.chain_id = p_chain_id and settlement.contract_address = p_contract_address and settlement.invoice_key = p_invoice_key)
  for update;

  if found then
    if v_existing.workspace_id is not distinct from p_workspace_id
       and v_existing.invoice_id is not distinct from v_publication.invoice_id
       and v_existing.invoice_version_id is not distinct from v_publication.invoice_version_id
       and v_existing.publication_attempt_id is not distinct from v_publication.id
       and v_existing.chain_id is not distinct from p_chain_id
       and v_existing.contract_address is not distinct from p_contract_address
       and v_existing.invoice_key is not distinct from p_invoice_key
       and v_existing.transaction_hash is not distinct from p_transaction_hash
       and v_existing.log_index is not distinct from p_log_index
       and v_existing.block_number is not distinct from p_block_number
       and v_existing.block_time is not distinct from p_block_time
       and v_existing.document_commitment is not distinct from p_document_commitment
       and v_existing.payer is not distinct from p_payer
       and v_existing.payee is not distinct from p_payee
       and v_existing.amount_atomic is not distinct from p_amount_atomic
    then
      select receipt.id
        into strict v_receipt_document_id
      from public.receipt_documents as receipt
      where receipt.workspace_id = v_existing.workspace_id
        and receipt.settlement_id = v_existing.id;

      return query select 'replayed'::text, v_existing.id, v_receipt_document_id;
      return;
    end if;

    raise exception using errcode = 'P0001', message = 'SETTLEMENT_CONFLICT';
  end if;

  if v_version.chain_id is distinct from p_chain_id
     or v_version.contract_address is distinct from p_contract_address
     or v_publication.document_commitment is distinct from p_document_commitment
     or v_version.payee is distinct from p_payee
     or v_version.amount_atomic is distinct from p_amount_atomic
  then
    raise exception using errcode = 'P0001', message = 'SETTLEMENT_FACTS_MISMATCH';
  end if;

  -- Validate before numeric(78, 0) assignment can round fractional event facts.
  -- PostgreSQL orders NaN above Infinity, so this bound excludes both.
  if p_block_number is null
     or p_block_number < 0
     or p_block_number >= 'Infinity'::numeric
     or p_block_number <> pg_catalog.trunc(p_block_number)
  then
    raise exception using errcode = '22023', message = 'SETTLEMENT_BLOCK_NUMBER_INVALID';
  end if;

  if public.payr_is_valid_deliveries(p_deliveries) is not true then
    raise exception using errcode = '22023', message = 'SETTLEMENT_DELIVERIES_INVALID';
  end if;

  if p_receipt_key_version <= 0
     or p_receipt_verifier_hash !~ '^[0-9a-f]{64}$'
     or p_receipt_expires_at <= pg_catalog.clock_timestamp()
  then
    raise exception using errcode = '22023', message = 'SETTLEMENT_RECEIPT_METADATA_INVALID';
  end if;

  v_settlement_id := pg_catalog.gen_random_uuid();
  v_receipt_document_id := pg_catalog.gen_random_uuid();

  insert into public.settlements (
    id,
    workspace_id,
    invoice_id,
    invoice_version_id,
    publication_attempt_id,
    chain_id,
    contract_address,
    invoice_key,
    transaction_hash,
    log_index,
    block_number,
    block_time,
    document_commitment,
    payer,
    payee,
    amount_atomic
  ) values (
    v_settlement_id,
    p_workspace_id,
    v_publication.invoice_id,
    v_publication.invoice_version_id,
    v_publication.id,
    p_chain_id,
    p_contract_address,
    p_invoice_key,
    p_transaction_hash,
    p_log_index,
    p_block_number,
    p_block_time,
    p_document_commitment,
    p_payer,
    p_payee,
    p_amount_atomic
  );

  insert into public.receipt_documents (
    id,
    workspace_id,
    settlement_id,
    invoice_id,
    invoice_version_id,
    token_id,
    key_version,
    verifier_hash,
    link_expires_at
  ) values (
    v_receipt_document_id,
    p_workspace_id,
    v_settlement_id,
    v_publication.invoice_id,
    v_publication.invoice_version_id,
    p_receipt_token_id,
    p_receipt_key_version,
    p_receipt_verifier_hash,
    p_receipt_expires_at
  );

  insert into public.access_links (
    id,
    workspace_id,
    token_id,
    purpose,
    key_version,
    verifier_hash,
    receipt_document_id,
    activated_at,
    expires_at
  ) values (
    pg_catalog.gen_random_uuid(),
    p_workspace_id,
    p_receipt_token_id,
    'receipt-bearer',
    p_receipt_key_version,
    p_receipt_verifier_hash,
    v_receipt_document_id,
    pg_catalog.now(),
    p_receipt_expires_at
  );

  for v_delivery in
    select delivery.value
    from pg_catalog.jsonb_array_elements(p_deliveries) as delivery(value)
  loop
    insert into public.email_deliveries (
      id,
      workspace_id,
      settlement_id,
      receipt_document_id,
      message_kind,
      normalized_recipient,
      roles,
      provider_idempotency_key
    ) values (
      pg_catalog.gen_random_uuid(),
      p_workspace_id,
      v_settlement_id,
      v_receipt_document_id,
      v_delivery ->> 'messageKind',
      v_delivery ->> 'normalizedRecipient',
      array(select pg_catalog.jsonb_array_elements_text(v_delivery -> 'roles')),
      'payr-receipt-' || pg_catalog.gen_random_uuid()::text
    );
  end loop;

  return query select 'recorded'::text, v_settlement_id, v_receipt_document_id;
exception
  when no_data_found then
    raise exception using errcode = 'P0001', message = 'SETTLEMENT_FACTS_MISMATCH';
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf']::text[])
on conflict (id) do update
set name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

alter table public.workspaces enable row level security;
alter table public.sender_profiles enable row level security;
alter table public.clients enable row level security;
alter table public.invoice_sequences enable row level security;
alter table public.auth_nonces enable row level security;
alter table public.connector_tokens enable row level security;
alter table public.connector_rate_limits enable row level security;
alter table public.audit_events enable row level security;
alter table public.idempotency_requests enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_versions enable row level security;
alter table public.publication_attempts enable row level security;
alter table public.access_links enable row level security;
alter table public.payment_authorizations enable row level security;
alter table public.settlements enable row level security;
alter table public.receipt_documents enable row level security;
alter table public.email_deliveries enable row level security;
alter table public.reconciliation_cursors enable row level security;

revoke all on schema public from public, anon, authenticated;
grant usage on schema public to service_role;

revoke all on all tables in schema public from public, anon, authenticated, service_role;
revoke all on all sequences in schema public from public, anon, authenticated, service_role;

grant select on table
  public.workspaces,
  public.sender_profiles,
  public.clients,
  public.invoice_sequences,
  public.auth_nonces,
  public.connector_tokens,
  public.connector_rate_limits,
  public.audit_events,
  public.idempotency_requests,
  public.invoices,
  public.invoice_versions,
  public.publication_attempts,
  public.access_links,
  public.payment_authorizations,
  public.settlements,
  public.receipt_documents,
  public.email_deliveries,
  public.reconciliation_cursors
to service_role;

revoke execute on all functions in schema public from public, anon, authenticated, service_role;
alter default privileges for role postgres revoke execute on functions from public;
alter default privileges for role postgres revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres revoke all on sequences from public, anon, authenticated;

grant execute on function public.payr_allocate_invoice_sequence_v1(uuid, integer, text, text) to service_role;
grant execute on function public.payr_record_payment_authorization_v1(uuid, uuid, uuid, uuid, text, bigint, text, text, text, numeric, text, text, text, text, text, bigint, bigint) to service_role;
grant execute on function public.payr_record_settlement_v1(uuid, bigint, text, text, text, integer, numeric, timestamptz, text, text, text, numeric, uuid, integer, text, timestamptz, jsonb) to service_role;

commit;
