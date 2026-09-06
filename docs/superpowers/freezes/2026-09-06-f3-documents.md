# F3 Immutable Documents And Protected Surfaces

R06 base: `v0.4.0` / `6761096fba1ed2900d5fedfc91416d1b270dafdd`. Task 5 implements real invoice documents; R07 owns authorization, R08 receipts/delivery, R09 wallet payment/public polling. The approved verification seams are the shared view/renderer, real `InvoiceDocumentPort` read-back, service-only database RPCs, and actual protected HTTP/browser responses.

## Decisions And Boundaries

- The user approved the invoice self-hash parity exception on 2026-09-06: invoice PDF has immutable invoice facts/URL/QR, not its own final hash or commitment. Invoice HTML and subsequent receipt show that proof. Keccak and three-bytes32 ABI encoding remain unchanged; never stamp bytes after hashing.
- `NEXT_PUBLIC_APP_URL` is operationally fixed while published artifacts/active attempts reference it. Do not switch to a fallback origin mid-publication or rewrite objects. An origin migration requires separate planning; a changed origin must fail exact QR verification, not silently accept or mutate the PDF.
- Only invoice page/PDF are new public surfaces. Commercial expiry retains live document access; credential expiry/revocation, void, inactive or nonfinalized targets deny access. Late settlement never revives a revoked invoice bearer.
- Existing brand references and `Commit Ledger` remain unchanged. Use approved system fallbacks; built-in PDF fonts require explicit supported-glyph checks, never silent lost/substituted invoice text. Record any supported-character limitation.
- Renderer metadata uses issue-date/frozen facts, never retry time. Canonical JSON remains F3-P's exact versioned object. No salt or bearer in canonical JSON, DB descriptors, diagnostics, or test artifacts.
- Amount verification must retain field boundaries: fixed `Line amount:` and `Atomic units:` labels separate free-form descriptions from decimal/atomic values. Ordered text equality must not permit a description suffix to become a digit in a different amount.
- Labels alone are insufficient when free-form descriptions imitate complete rows. The renderer prints a 7pt line index in a 12pt column at x=42, then its existing 305pt description and 190pt right-aligned amount column with 2pt minimum gaps. The inspector returns bounded `textItems` from actual PDF text transforms (`page`, `text`, `x`, top-down baseline `y`, `width`, `height`), not supplied metadata. Storage verifies sequential line anchors, per-row decimal/atomic cells and the total region independently, in addition to full material text parity. Amount-cell left edge is approximately x=363.28 on A4 with 42pt margins; free-form descriptions must never supply amount-cell evidence.

## Shared Type And Function Seams

Types are in `src/lib/documents/contracts.ts`. Existing `InvoiceDocumentPort`, `PublicationArtifact`, F1 status contracts remain unchanged. DB publication exports its existing snapshot/attempt/status schemas for strict reuse rather than parallel validators.

- `invoice-view.ts`: `parseCanonicalInvoiceDocument(json: string): CanonicalInvoiceDocument`; strict schema and canonical-string equality. `buildPublishedInvoiceView(document, invoiceUrl): PublishedInvoiceView` is the only invoice formatting source for protected HTML and PDF.
- `invoice-pdf.tsx`: `renderInvoicePdf(view: PublishedInvoiceView): Promise<Uint8Array>` and `invoiceQrDataUrl(invoiceUrl: string): Promise<string>`. PDF contains text, full wallet, URL and visible QR with long-content pagination.
- `pdf-verification.ts`: `inspectInvoicePdf(bytes: Uint8Array): Promise<PdfInspection>`. Parse and rasterize actual bytes, decode QR pixels; no expected URL parameter or metadata/embedded-text shortcut. Bound bytes/pages/pixels/time, disable external resource/network loading and PDF evaluation. Return extracted text and decoded destinations; malformed/unsupported artifacts throw `DocumentVerificationError`.
- `commitment.ts`: `computeDocumentCommitment(canonicalInvoiceJson, bytes, publicationSalt)` returns `{invoiceDataHash,pdfContentHash,documentCommitment}` using frozen formulas; vectors and text/QR tests are independent evidence.
- `invoice-storage.ts`: `createPrivateDocumentStorage(client: SupabaseClient): PrivateDocumentStorage`; `createInvoiceDocumentPort(storage: PrivateDocumentStorage, repository: Pick<DocumentRepository,"storageState">): InvoiceDocumentPort`. Read first; confirmed absence alone permits creating in reserved/rendering state. Stored/finalized missing objects must not regenerate. Create is only `documents`, PDF, `upsert:false`; read back after success or collision, then inspect downloaded bytes, compare exactly one QR destination with requested URL, compute hashes and return proof. Never overwrite/delete/sign URLs. Generic I/O remains unavailable/retryable, invalid proof is terminal.
- `db/documents.ts`: `createDocumentRepository(client: RpcClient): DocumentRepository`. Strict DTO validation, sanitized errors. Candidate lookup exposes only metadata; exact-target RPC rechecks activation/revocation/expiry and finalization, returns consistent existing status data pinned to the observed settlement. No fabricated owner actor.
- `access.ts`: `createInvoiceAccessService(repository, config)` returns `resolve(slug: string, ip?: string): Promise<InvoiceAccessTarget|null>`. Config is `{appOrigin,explorerOrigin,keys,pepper:Uint8Array}`. Optional IP performs request admission; omitted IP revalidates credential/target without recounting after Proxy admission. Canonical token parse and retained-key constant-time checks precede target read; recheck exact workspace/invoice/version and token metadata. Unknown key/purpose/state/target returns null. Operational failures are sanitized, not raw provider exceptions.
- Configuration steward supplies `createDocumentAccessEnv(value=process.env): DocumentAccessConfig` independently of session/current binding, and `createDocumentRpcOrigins(value=process.env): string[]` for the optional configured RPC origin, never credentials/path/query. Protected-route runtime composes these factories with the DB/storage factories; no module-side environment reads.
- `private-response.ts`: private header helper plus CSP generator shared by Proxy and PDF/errors. Protected HTML gets fresh request/response CSP nonce; never trust caller nonce/CSP headers or broaden origins from request Host. Proxy performs admission/auth before rendering to guarantee real non-sensitive 404, including RSC/prefetch. Page/PDF independently revalidate, never trust an unsigned caller context header.

## Storage, Admission, And RPCs

New additive migration `202609040005_document_access.sql`; never edit released `0001-0004`. New functions are service-only SECURITY DEFINER with empty search path, fully qualified objects and same-transaction revokes. New counter table has RLS/no anon/auth grants and RPC-only writes.

| RPC | Parameters | Result |
| --- | --- | --- |
| `payr_find_invoice_access_candidate_v1` | `p_token_id uuid` | `InvoiceAccessCandidate` or null |
| `payr_read_invoice_document_v1` | `p_token_id uuid` | `InvoiceAccessTarget` or null; active live invoice target only |
| `payr_document_storage_state_v1` | `p_storage_key text` | publication state string or null |
| `payr_admit_document_access_v1` | `p_scope text, p_key_hash text` | `{allowed:boolean}` |

Fixed database-minute windows: 120 requests/IP, 60 verified-token requests, 600 global IP-stage requests. IP stage runs before candidate lookup, including malformed/unknown links. Token stage runs only after cryptographic verification. Hash normalized IP and token ID with purpose-separated HMAC-SHA256 using the existing `CONNECTOR_TOKEN_PEPPER`, read independently of session configuration. Only Vercel-overwritten IP is trusted when `VERCEL=1`; otherwise use one conservative local IP bucket. Expired counter cleanup is bounded by admission/global ceilings. Quota denial uses the same private 404 body as invalid credentials, without an existence oracle. Do not store raw addresses, slugs, URLs or arbitrary unbounded attacker keys.

Private headers on all protected responses: `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`. HTML CSP is Task 5's nonce policy, no unsafe-inline, configured RPC origins only. PDF adds exact type/length/hash and safe immutable filename; no storage redirect. Authenticated default invoice HTML/RSC stays bearer-free.

## Ownership And Evidence

Concurrent root email/preview work remains untouched on `main`. The coordinator uses repository-root `.worktrees/r06-integration` as the isolated integration worktree for this tranche; lane worktrees are sibling `.worktrees/r06-renderer`, `r06-storage`, `r06-surfaces`, not nested under it. All start from the committed freeze. This explicit isolation exception preserves the orchestration runbook's serialized integration owner without moving user changes.

| Ticket | Branch / worktree | Owned files | Gate |
| --- | --- | --- | --- |
| R06-T01 | `agent/r06-renderer` / `.worktrees/r06-renderer` | document view/PDF/inspection/test-utils, commitment and their tests | real rendered/rasterized QR and extracted field parity, bounded hostile PDFs/long content |
| R06-T02 | `agent/r06-storage` / `.worktrees/r06-storage` | invoice-storage, db/documents, migration 0005 and their tests | create-only collision/recovery, private bucket and exact target/admission SQL |
| R06-T03 | `agent/r06-surfaces` / `.worktrees/r06-surfaces` | access/private-response/runtime, src/proxy, app/invoice, protected component/CSS, invoice-page e2e and their tests | uniform true404/CSP, no bearer artifacts, byte equality, responsive/a11y |

Coordinator owns shared types/config/dependencies, Next config, publication runtime/worker integration, existing publication UI/tests, shared Playwright setup, root docs/version/release. Only T02 starts or resets the shared Payr stack during fanout (API57321/Postgres58322); other lanes use public seams/fakes until integrated gates. No .env.local copies/reads, hosted writes, credentials or real bearer artifacts. Browser secrets stay in Node memory, trace/video/automatic screenshots disabled for sensitive scenarios; safe visual evidence uses noncredential fixtures or fully cleared QR/URLs. Review desktop/mobile in one bounded batch plus one correction pass.

Production dependencies: @react-pdf/renderer4.9.0, qrcode1.5.4, pdfjs-dist6.3.289, @napi-rs/canvas1.0.8, jsqr1.4.0; @types/qrcode1.5.6. Node22.13+ within Node22 is required by PDF.js. Real PDF raster/QR verification runs server-side, not only in tests. Delivery evidence is local/CI unless a separate hosted proof is explicitly performed.

The required `web` check and local `verify` run `pnpm test:documents:package` after the build. Its isolated traced-package cases must execute, not remain skipped in the ordinary pre-build unit invocation. Test-only faults prove missing packages/native bindings/fonts remain retryable; decoded-resource bounds apply before PDF.js bootstrap. Runtime supports the restricted current producer format, not arbitrary PDF uploads. The storage-version trigger added during implementation prevents the observed Storage concurrent-create path from replacing a committed `documents` object pointer; it is not a public RPC and grants no client access.
