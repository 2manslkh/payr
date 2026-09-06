# F3 Publication And Recovery Contract

Base: `v0.3.0` / `57638dcbfc34342ea680d42acfba9b3988ee2ad6`.

R05 implements Task 4.3-4.6 using the frozen `InvoiceDocumentPort`. R06 supplies real PDF/QR/storage/protected-route behavior. A deterministic document adapter exists only in tests; production publication and cron processing must fail closed before reservation/claim when no real adapter is installed. No fake provider environment switch or application test bypass is permitted.

## Reservation And Binding

- Publish input is exactly `{draftId, expectedVersion, approval:true, idempotencyKey}`. Fingerprint SHA-256 of canonical `{operation:"publish_invoice",workspaceId,draftId,expectedVersion,approval:true}`. Generated metadata and current configuration are not fingerprint inputs.
- Actor scope uses F3's owner-or-connector shape and `invoice:publish`. Replay checks precede mutable draft/profile/binding checks. Same-key retries use the original attempt and its stored chain/contract/key version, ignoring newly generated metadata. Different input returns `IDEMPOTENCY_CONFLICT` without the original descriptor.
- Under the invoice lock, require an editable complete exact version, current authoritative sender/client revisions, future technical deadline, and no competing active publication. R04 revisions are blocked while any attempt on that invoice is active. Replays of previously saved draft requests remain valid.
- Consume the workspace/UTC-year sequence atomically. Format `<frozen prefix>-<UTC year>-<sequence padded to at least six digits>`. Successful reservations permanently burn a number, including terminal failures. Enforce unique reserved number/sequence and object key.
- Store server-generated attempt UUID, invoice key, salt, token UUID/key version/verifier, configured chain/contract, initiating actor, and immutable storage key. Key is `workspace/<workspaceId>/invoice/<invoiceId>/<version>/attempt/<attemptId>.pdf`.
- Chain/contract live on the attempt until finalization; never rebind an existing attempt after configuration changes. A missing/zero deployment binding is configuration failure, not permission to use a placeholder.
- Invoice link expiry is 365 days after the later of reservation time and the invoice's technical deadline. Reject unsupported date overflow. Retain key material while referenced links need it; never fall back from an unknown stored key version.
- Create the invoice access-link row inactive at reservation. Draft invoice number/publication timestamp remain null until finalization. Idempotency descriptors contain only IDs, hashes, filenames, and safe state; never snapshots, slugs, URLs, salt, or signatures.

## Worker Protocol

- Reserved attempts start eligible with fence `0` and a database-time expired/unowned lease. Claim transitions reserved to rendering, assigns a random worker UUID, increments fence, and grants a 60-second lease. Reclaiming a stored attempt preserves stored state/artifact facts.
- At most one live claimant. Every store/finalize/fail call checks attempt, lease owner, fence, and live database-time lease after lock waits. Stale writes return null and map to `LEASE_LOST`. Use consistent invoice-before-attempt locking; do not hold SQL locks across document I/O.
- Canonical document JSON is exactly `{schemaVersion:"payr.invoice-document.v1",invoiceId,invoiceVersion,invoiceNumber,invoiceKey,chainId,contractAddress,invoice:<immutable DraftSnapshot>}` using the existing canonical serializer. Neither bearer URL nor salt appears in it; those are separate port inputs.
- Regenerate invoice URL from the attempt's stored token metadata. The worker independently checks nonempty bytes <=10 MiB, `%PDF-` magic, exact byte length, `application/pdf`, recomputed keccak invoice/PDF hashes, `keccak256(abi.encode(salt,invoiceDataHash,pdfContentHash))`, and decoded QR destination equal to that regenerated URL.
- Persist only verification metadata, including `qrVerified:true`, never decoded URL or bytes. A stored attempt can be reread/reverified after a crash, but its artifact facts cannot be replaced by different metadata.
- Generic I/O/transport failures remain active/retryable until lease expiry; no jitter or invented terminal code. Invalid returned artifact proof is terminal `ARTIFACT_VERIFICATION_FAILED`. Fenced failure burns the number, revokes inactive access, and stores a bounded failure code. A later approved call needs a new idempotency key.
- Finalization atomically checks exact current version, verified stored artifact, deadline, current sender/client snapshots, and still-valid initiating actor; applies only approved client changes/provenance; freezes chain/contract/version; assigns invoice number/deadline/timestamp; activates link; finalizes attempt and descriptor. Any conflict commits a terminal failed attempt without partial profile/link/invoice changes.
- Alias-less confirmed client creation uses `client-<invoice UUID>` as an opaque alias, not invented legal identity. Saved-client updates use the frozen revision and only approved changed fields. Web-source provenance remains readable in saved-client DTOs; immutable draft snapshots and old draft replays never change.

## Status, Void, And Share

- Reuse `InvoiceStatusResult` and existing derivation rules, including explicit nulls, effective expiry, settlement-driven Paid, receipt readiness, and email aggregate precedence. Never build a second payment state model.
- An active/unfinalized attempt exposes no invoice document or Gmail package. Ready invoice/receipt links are regenerated only from verified matching metadata and retained keys. Public status redaction remains unchanged.
- Publish responses include finalized artifact fields, `gmailLinkPackage`, current commercial state, and `sendApprovalRequired:true`. A replay reports current lifecycle separately from historical artifact success; it never republishes a voided/expired invoice.
- Gmail package is exactly `to,subject,textBody,htmlBody,paymentUrl,invoicePdfUrl`, with the confirmed client email only, exact subject, escaped HTML, exact amount/USDC-on-Arc/due date, no attachments/CC/BCC/send fields, and no implicit send approval.
- Void input is `{invoiceId, expectedVersion, approval:true, idempotencyKey}` with operation `void_invoice` in its canonical fingerprint. Scope is `invoice:void`; replay precedes current-state checks. Require published, unexpired, exact version and no settlement, then atomically set void facts, revoke invoice links and store a safe descriptor. It cannot revoke existing chain signatures.
- Serialize void and authorization persistence with settlement insertion using the existing `payr:invoice:<chain>:<contract>:<key>` advisory lock before invoice locks, so already-recorded settlement prevents void. Valid late events remain recordable and may derive Paid after void.
- Bounded expiry sweep changes only published to expired when `now >= payableUntil`, preserving the independent document-link lifetime. Authorization still checks time directly. Expiry is idempotent.
- Dashboard default HTML/props contain only safe publication state/failure/share/void flags. Share is explicit, owner-authenticated POST and may return links only for finalized artifacts with live unrevoked access. Void requires visible exact-version confirmation. No browser publication/authoring form, automatic Gmail send, or default bearer URLs.

## Frozen RPCs

All new functions use empty search path, fully qualified objects, explicit same-transaction revokes, service-role-only execute, and no permissive RLS policy. Use additive `202609040004_publication_functions.sql`; released migrations remain unchanged. All bigint fences/sequence values travel as decimal text.

Actor parameters are `p_workspace_id uuid, p_owner_wallet text, p_connector_id uuid`.

| RPC | Additional/exact parameters | Result |
| --- | --- | --- |
| `payr_reserve_publication_v1` | actor + `p_input jsonb` (PublicationReservation) | PublicationAttempt |
| `payr_claim_publication_v1` | `p_attempt_id uuid` (nullable), `p_lease_owner uuid` | PublicationAttempt or null |
| `payr_store_publication_v1` | `p_attempt_id uuid, p_lease_owner uuid, p_fence bigint, p_artifact jsonb` | PublicationAttempt or null |
| `payr_finalize_publication_v1` | `p_attempt_id uuid, p_lease_owner uuid, p_fence bigint` | finalized/failed PublicationAttempt or null |
| `payr_fail_publication_v1` | same fence fields + `p_failure_code text` | failed PublicationAttempt or null |
| `payr_publication_status_v1` | actor + `p_invoice_id uuid` | PublicationStatusData or null |
| `payr_void_invoice_v1` | actor + `p_input jsonb` (VoidWrite) | VoidResult |
| `payr_expire_invoices_v1` | `p_limit integer` (1..100) | `{expired:number}` |

Worker RPCs are deliberately privileged platform operations, never fake owner sessions. Runtime cron entry validates `CRON_SECRET` by constant-time comparison before accessing the worker. Unknown/malformed/future inputs fail closed; raw provider errors and request bodies never leave an API error boundary.

## Routes And Ownership

- POST `/api/invoices/[id]/publish`: strict expectedVersion/approval/key body, F2 session+CSRF, real-adapter gate, same canonical service used by future MCP.
- GET `/api/invoices/[id]/status`: scoped canonical status, private/no-store/no-referrer.
- POST `/api/invoices/[id]/share`: scoped owner+CSRF, strict empty body, materialize links only on explicit request.
- POST `/api/invoices/[id]/void`: strict expectedVersion/approval/key body, owner+CSRF and atomic lifecycle service.
- POST `/api/jobs/publications`: timing-safe cron bearer, strict bounded limit, no caller actor/workspace override. No provider means 503 without claims/reservations.
- Coordinator owns shared types/runtime/config/keys/CI/freeze/version files. Four lanes own database+adapter, publication+worker, lifecycle/status/Gmail/routes, and invoice UI/browser tests. Only the database steward uses local Supabase during fanout. Tests may inject deterministic documents; production cannot select that adapter.
