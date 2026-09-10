# Privy Migration History Reconciliation

## Scope

Source-only reconciliation of hosted migration `202609090003_privy_identity`
missing from `v1.8.0` / `cbcf7e28b9882d7ea3ee93599d2398381fe7938e`.
This does not release Privy onboarding, change login behavior, configure Privy,
provision wallets, link identities, or broaden existing credential scope arrays.
The unfinished primary-worktree feature is excluded.

## Provenance

On 10 September 2026, the pinned Supabase CLI 2.116.0 read
`supabase_migrations.schema_migrations` for project `grutkfsoekcpwdksgasm`.
Hosted history contains 15 versions, including gateway `202609090002`, Privy
`202609090003`, and dashboard hardening `202609090010`.

The hosted Privy entry has name `privy_identity` and one stored statement.
Its 14,082-byte body exactly matches the local donor after removing only the
outer `begin;` and `commit;` envelope using the original operator's extraction:
`source.slice(7).trimEnd().slice(0, -7)`. The comparison used the authoritative
history read in memory, not backup prose or inferred schema equivalence.

- Exact file SHA-256: `c864606e44a48cfff971553452af908d4fcb0de5ad95ea91ff621157e42afa27`.
- Hosted and donor body SHA-256: `e4ed255de1828d9b00e70a6f791eb912ee0ddfa26aa3678e7b11e783de306baf`.
- The original operator script stored the entire body as one statement inside
  the same transaction that applied it. A normal local reset may split it into
  multiple statements; array shape alone is not source drift.

Production preflight: `payrlink.xyz` resolves to Ready deployment
`dpl_3VwyXCNunStit6v7LjmxHLzTQnXY`, also aliased as `payr-sandy.vercel.app`.
Its public health response reports the same `v1.8.0` SHA as freshly fetched main.

## Compatibility And Security

The SQL adds two RLS-enabled tables with no application-role direct grants and
eight service-only security-definer RPCs with empty search paths. It does not
replace existing login RPCs or update existing identity, payout, invoice, or
credential records. Three validators and the audit constraint gain explicit
wallet-discovery vocabulary; existing credential arrays remain unchanged.
The gateway prerequisite is already released. Dashboard `010` touches separate
objects, so normal numeric replay and the hosted application order are compatible.

The new identity RPCs trust the privileged backend to verify Privy subjects and
owner signatures before invocation; they are not public authentication APIs.
In particular, link completion does not itself verify a wallet signature.
Service-role secrecy remains essential. No feature activation is authorized by
adding this historical file. Future activation requires its own reviewed server
verification, live onboarding evidence, and explicit release scope.

## Release Gate

The coordinator owns `.worktrees/privy-reconcile-fresh` on
`integration/privy-reconcile-fresh`, based on the SHA above. No primary user files
or ignored credentials are copied. The owned disposable database is
`payr-privy-reconcile-v181`, with API/Postgres/shadow ports 61321/61322/61320.
Start and reset have passed, applying all 15 migrations in numeric order.
Further tests, independent reviews, PR, tag, and deployment are pending; this
checkpoint does not claim a completed release.

Do not replay this migration on hosted, repair history, reset hosted data, or
edit the historical SQL. Verify a migration push dry run is up to date. Any
future defect requires a new forward migration after `010` and a patch-release
PR. Application deployment is unnecessary for schema activation because this
SQL is already hosted; any approved source-alignment deployment must use the
tagged release and recheck that production has not advanced first.
