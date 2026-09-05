# F1 Domain And Database Freeze

**Status:** Approved for R02 fanout

**Base:** `v0.1.2` / `7b49d404659bec59e8c8a58a55d96c478346a66d`

This freeze resolves the interfaces shared by the R02 domain, token-security, schema, and repository lanes. The implementation plan remains authoritative except where this document resolves an ambiguity called out below. A lane must stop rather than silently change these interfaces.

## Public Seams

- `src/lib/domain/invoice.ts`: commercial/payment/display state, effective expiry, payability, and settlement-after-void derivation.
- `src/lib/domain/money.ts`: strict native Arc USDC decimal parsing and 18-decimal atomic conversion.
- `src/lib/domain/canonical-json.ts`: deterministic JSON serialization for fingerprints and commitments.
- `src/lib/domain/status.ts`: the exact authenticated status result and its public whitelist projection.
- `src/lib/security/keyed-token.ts`: deterministic invoice/receipt bearer derivation and verification.
- `src/lib/db/repositories.ts`: workspace-scoped R02 transaction interface; direct Supabase details remain inside the adapter.

Tests cross these interfaces only. Database integration tests additionally cross the Supabase Data API, RPC, and Storage interfaces as `service_role`, `anon`, and `authenticated` callers.

## Resolved Domain Rules

1. Commercial state is exactly `draft | published | voided | expired`. Payment status is exactly `unpaid | paid`. `Paid` is derived from settlement presence and never stored as commercial state.
2. Runtime invoice deadlines use JavaScript `Date` values and PostgreSQL `timestamptz`; payability is half-open at millisecond precision. Chain-bound issue and deadline fields are separate integer Unix seconds.
3. Authorization requires `authorizationValidUntil > issuedAtSecond` and `authorizationValidUntil < payableUntilSecond`. Equality with the payable deadline is invalid.
4. F1 owns the exact status DTOs and public redaction now. F5 may implement receipt/outbox transitions but may not change these shapes without a new freeze.
5. `SettlementFacts` contains the event block time needed for race derivation. Display/payment derivation depends only on whether the value is null.

## Money And Canonicalization

- Accepted USDC input grammar is `(?:0|[1-9][0-9]*)(?:\.[0-9]{1,18})?` with no sign, exponent, comma, leading zero, leading/trailing decimal point, or surrounding whitespace.
- Zero is rejected. Accepted values normalize by removing trailing fractional zeroes; the integer part remains present.
- Atomic values use `bigint`, exactly 18 decimal places, and no floating-point operation. Canonical decimal output never uses exponent notation.
- Canonical JSON accepts only JSON values, recursively sorts object keys by JavaScript's default UTF-16 code-unit ordering, preserves array order, and emits no whitespace. Non-finite numbers and unsupported runtime values are rejected.

## Bearer Serialization

- Link purposes are exactly `invoice-bearer | receipt-bearer`.
- Token IDs are canonical lowercase RFC 4122 UUID text. The slug prefix is the UUID's 16 raw bytes encoded as unpadded base64url.
- HMAC output in the slug is unpadded base64url. The stored verifier hash is lowercase hexadecimal.
- The derivation labels are exactly those pinned in the implementation plan. Verification uses the key version stored with the candidate row, rejects unknown versions, and never falls back to an active key.
- Every configured key must contain at least 32 bytes. Link derivation is origin-independent; absolute URLs are materialized later from validated configuration.

## Relational Choices

- The enum and column name is `commercial_state`, not `commercial_status`.
- Tenant identifiers and relationships use UUIDs plus explicit composite `(workspace_id, id)` keys. A global UUID never replaces the workspace component of a child foreign key.
- EVM addresses and hashes are canonical lowercase `0x` text with length/check constraints. Atomic amounts and block numbers use integer-only `numeric(78,0)` values; chain IDs use positive `bigint`.
- PostgREST results containing sequence values, atomic amounts, or block numbers use decimal text, not JSON numbers. RPCs return those fields as text and table reads explicitly select `field::text`; callers must never recover precision by converting an already-rounded JavaScript number.
- A draft may have a null `client_id` while carrying a proposed client snapshot in its version. `client_id` is required when publication finalizes.
- Invoice artifact facts live on the finalized `publication_attempts` row. R02 does not add an `invoice_documents` table.
- A logical invoice has at most one finalized publication, even across versions or attempts. Failed attempts may remain for audit; replacement requires a new invoice.
- Invoice sequences are scoped by workspace and UTC calendar year. The database allocates a positive integer; later formatting combines it with the frozen sender prefix.
- Settlement invoice-key uniqueness is `(chain_id, contract_address, invoice_key)`. Delivery uniqueness is `(workspace_id, settlement_id, message_kind, normalized_recipient)` with one sorted role array retaining `issuer`, `client`, or both.
- Reconciliation cursors store `next_block`, the first block not fully processed.
- The private `documents` bucket permits only `application/pdf`, has a 10 MiB object limit, and is recreated by migration. Object-key format remains a Task 5 freeze because R02 stores no document.
- Idempotency result descriptors have one allowlisted shape: optional `ids`, `hashes`, and `filenames` string maps plus an optional lowercase `state`. Map labels are bounded snake_case identifiers, never URLs. IDs must be UUIDs, hashes must be canonical hexadecimal, and filenames must be PDF basenames with no dots except the `.pdf` extension, preventing raw bearer slugs from fitting the filename shape. Callers reconstruct every other result from those identifiers; arbitrary nested JSON and URL-bearing values are not accepted.

## R02 SQL Transactions

All functions are versioned, `SECURITY DEFINER`, use `set search_path = ''`, fully qualify relations, revoke execution from `PUBLIC`, `anon`, and `authenticated`, and grant execution only to `service_role`.

Idempotency reservation and completion are not exposed as independently composable RPCs. Every owning mutation claims the key, performs its mutation, and stores its allowlisted descriptor in one database transaction. A crash therefore commits neither an incomplete reservation nor the mutation.

### `payr_allocate_invoice_sequence_v1`

Inputs: `p_workspace_id uuid`, `p_sequence_year integer`, `p_idempotency_key text`, and `p_request_fingerprint text`.

Returns one row with `outcome text` (`allocated | replayed | conflict`) and nullable `sequence_value text`, containing a canonical positive bigint decimal string. Allocation, idempotency claim, and the descriptor containing the sequence state occur atomically. A replay returns the same value; a conflict returns no value or prior private descriptor. Every new successful call permanently consumes a distinct value. This pre-release F1 correction preserves the TypeScript bigint result while avoiding PostgREST JSON-number precision loss.

### `payr_record_payment_authorization_v1`

Inputs, without overloads:

```text
p_workspace_id uuid
p_authorization_id uuid
p_invoice_id uuid
p_invoice_version_id uuid
p_invoice_key text
p_chain_id bigint
p_contract_address text
p_document_commitment text
p_payee text
p_amount_atomic numeric
p_attestor text
p_typed_data_digest text
p_signature_hash text
p_signer_mode text
p_policy_result text
p_issued_at_second bigint
p_authorization_valid_until bigint
```

The function verifies the exact frozen publication tuple, current effective payability, settlement absence, and strict authorization deadlines, then inserts the authorization before a signature can be returned. It returns one row with `outcome = recorded` and `authorization_id uuid`. F4 owns the signing policy and external denied-error mapping, but uses this frozen persistence transaction.

### `payr_record_settlement_v1`

Inputs, without overloads:

```text
p_workspace_id uuid
p_chain_id bigint
p_contract_address text
p_invoice_key text
p_transaction_hash text
p_log_index integer
p_block_number numeric
p_block_time timestamptz
p_document_commitment text
p_payer text
p_payee text
p_amount_atomic numeric
p_receipt_token_id uuid
p_receipt_key_version integer
p_receipt_verifier_hash text
p_receipt_expires_at timestamptz
p_deliveries jsonb
```

`p_deliveries` is an array ordered by `normalizedRecipient`. Every object has exactly `messageKind: "receipt"`, `normalizedRecipient`, and a sorted unique nonempty `roles` array containing only `issuer` and/or `client`.

The function derives and verifies the exact invoice/version/publication tuple, then atomically inserts one immutable settlement, one pending receipt document, one receipt access link, and deduplicated pending deliveries. It returns one row with `outcome text`, `settlement_id uuid`, and `receipt_document_id uuid`, where outcome is `recorded | replayed`.

Replay compares only the immutable event identity and verified event/publication facts. When those facts match, newly supplied receipt token metadata or delivery ordering is ignored and the existing settlement/receipt IDs are returned. Reusing an event identity or invoice key with different verified facts fails closed as `SETTLEMENT_CONFLICT` and creates no side effects.

The exact parameter/result TypeScript forms are in `src/lib/db/repositories.ts`; the migration must match them without overloads.

## Security And Immutability

- RLS is enabled on every private table with no permissive `anon` or `authenticated` policy. Table, sequence, function, and Storage access is also explicitly revoked where supported.
- `anon` and `authenticated` receive no table, sequence, or application-function privileges for core records and no `documents` bucket policies.
- `service_role` receives schema usage and `SELECT` on the named core tables for workspace-filtered repository reads. Core writes are RPC-only: it receives no direct `INSERT`, `UPDATE`, `DELETE`, or sequence privilege and may execute only named application functions.
- The Storage API's existing `service_role` capability may create and read objects in the private `documents` bucket. Application calls use create-only upload (`upsert: false`) and never expose a public or Supabase signed URL. The migration does not broaden `storage` schema grants.
- `postgres` retains migration ownership. No application runtime uses a `postgres` credential.
- Frozen invoice versions cannot update or delete. Settlements cannot update or delete. Finalized publication facts and ready receipt target/artifact facts cannot change through ordinary service-role writes.
- Legitimate mutable transitions use the versioned transaction functions and fences. Database time owns sequence allocation, leases, and transactional deadlines.
- The migration creates all 18 core records named in Task 2, the four exact enums, composite tenant foreign keys, required unique indexes, and the private bucket in one reproducible reset path.

## Deferred Decisions

- Invoice-number presentation, publication and receipt object-key formats, link lifetimes, connector limits, worker lease durations, and retry schedules freeze in their owning later tranche.
- The framing/implementation retry-jitter contradiction must be resolved before F5. R02 does not implement retry timing.
- Later migrations may add transaction functions only after their owning freeze. They may not weaken R02 tenant, privilege, immutability, idempotency, or event-identity rules.

## Required Red Evidence

The freeze commit contains one failing contract slice for each TypeScript seam. Each owning lane uses vertical red-green cycles to satisfy and extend those tests. The schema lane writes database tests before each migration slice and is the only lane allowed to run the shared local Supabase runtime.
