# R06 Immutable Documents And Protected Surfaces

Snapshot: `2026-09-06`. Base: `v0.4.0` / `6761096fba1ed2900d5fedfc91416d1b270dafdd`. Integration: `integration/r06-documents-v0.5.0` in `.worktrees/r06-integration`. Intended version: `v0.5.0`. This pre-release snapshot is superseded by the release PR's verified merge/tag read-back.

The structural repair `8fb06d3a22a42c56c55a8ee6df3130ab36b35582` is integrated. Independent security review closed the whole-row-shift finding after checking actual positioned PDF evidence and a real collision with identical flattened text. Prior standards/specification and other security findings are closed within their reviewed scope. Local checks below include the completed repair; protected CI and release read-back remain required.

## Delivered Scope

- A canonical immutable invoice view feeds real PDF and protected HTML. The PDF includes confirmed parties, line items, exact decimal/atomic USDC amounts, dates, full payee wallet, network, invoice URL, and a visible QR. Metadata uses frozen issue-date facts, not retry time.
- Publication reads back actual private Storage bytes, parses/rasterizes the PDF, decodes the visible QR, checks material text and exactly one destination, and computes the existing Keccak/three-bytes32 ABI commitment. Measured line indexes, positions and font sizes independently bind decimal/atomic amounts to each row and the total region; free-form text cannot supply money-cell evidence. Real compiled publication is exercised locally, not substituted with a production fake provider.
- The user-approved self-reference exception in `DECISIONS.md` and the framing spec places the invoice PDF's own final hash/commitment on protected HTML and subsequent receipts, not inside that PDF. No post-hash stamping or changed hashing formula is permitted. R08 still owns receipt implementation.
- The private PDF-only `documents` bucket uses attempt-specific keys and `upsert:false`. Success/collision requires downloaded-byte verification; no overwrite, delete, signed URL, or regeneration of a known stored/finalized missing object is provided.
- Additive migration `202609040005_document_access.sql` supplies service-only candidate/target/storage-state/admission RPCs and a storage-version guard. The guard prevents the observed Supabase Storage `v1.70.3` concurrent-create race from replacing an existing `documents` object pointer despite `upsert:false`. Released migrations `0001-0004` remain unchanged.
- Protected `/invoice/[slug]` and `/invoice/[slug]/pdf` independently authorize exact finalized targets. After downloading and checking stored type/length/hash, PDF routes revalidate access before serving those bytes with an immutable safe filename. There is no Storage redirect.

## Runtime Boundaries

PDF fields accept printable ASCII plus LF only. Accents, Thai, emoji, and other unsupported characters fail closed; do not transliterate, drop glyphs, or invent legal details. This restriction is prominent in the README and is a product limitation, not general multilingual support.

The verifier supports the restricted current producer profile, not arbitrary PDF uploads. Preflight bounds decoded resources before PDF.js bootstrap and disables external/network resources and PDF evaluation.

| Bound | Limit |
| --- | --- |
| PDF input / pages | 10 MiB / 24 pages |
| Decoded stream | 4 MiB each |
| Aggregate decoded streams | 16 MiB |
| Aggregate image pixels | 4 million |
| Worker timer | 45 seconds; termination is awaited, with the original 60-second publication fence |
| Positioned text / inspection output | 10,000 items / 2 MiB |

The worker/resource checks are not an OS-enforced RSS sandbox. Missing native producer packages, bindings, fonts, or other infrastructure failures are unavailable/retryable; invalid document proof is terminal. Reserved invoice numbers remain consumed, including after terminal failure.

Clean Linux runner attempts `34038270355` and `34038912522` passed database/browser checks but exceeded the original 30-second inspection budget on valid 100-item PDFs. Isolating native PDF tests from UI workers did not eliminate the timeout. The inspection budget is now 45 seconds; all byte/decoded-resource limits and the 60-second live fence are unchanged. Tests that perform two independent inspections have a separate longer harness deadline. Run `34039716909` then passed all three implementation checks, including the isolated package gate. Its 18-page, 50,105-byte fixture took 1,090 ms to render and 30,851 ms to inspect (31,942 ms combined, excluding storage/database I/O).

Runtime requires Node `>=22.13 <23`, pnpm `10.19.0`, and frozen dependencies: `@react-pdf/renderer 4.9.0`, `qrcode 1.5.4`, `pdfjs-dist 6.3.289`, `@napi-rs/canvas 1.0.8`, `jsqr 1.4.0` (`@types/qrcode 1.5.6`). New publication requires real configured chain/contract binding, retained/active link keys, and Supabase. No browser authoring or production fake-provider switch exists. Keep the configured app origin fixed while active attempts or published artifacts reference it; changing QR destinations must fail verification, not mutate stored PDFs.

## Protected Responses

- HTML, PDF, and denial responses carry a fresh nonce CSP and the full private header set: `Cache-Control: private, no-store, max-age=0`, `Pragma: no-cache`, `X-Robots-Tag: noindex, nofollow, noarchive`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Caller nonce/context headers are not trusted.
- Malformed, wrong-purpose, expired, revoked, inactive, or nonfinalized credentials/targets receive the same generic true `404` at admission, including RSC/prefetch. Commercial expiry preserves access for a live bearer; voiding revokes it, and late settlement does not revive the link. Operational failures use sanitized private unavailability responses.
- Fixed database-minute limits are 120 requests/IP, 60/cryptographically verified token, and 600/global IP-stage requests. Purpose-separated HMAC-SHA256 keys use `CONNECTOR_TOKEN_PEPPER`, loaded independently of session identity configuration. Only Vercel-overwritten IP is trusted; other environments use a conservative shared local bucket. No raw IP, slug, or bearer URL is stored in counters.
- Current Next.js RSC validation can issue a `307` to the same origin/path with canonical `_rsc` query state; private redirect headers and this protocol are verified. Partial dynamic prefetch can omit invoice facts without constituting a page failure. Default authenticated HTML/RSC remains bearer-free; sensitive browser evidence keeps credentials in Node memory with trace/video/automatic screenshots disabled.

## Integration Manifest

| Lane | Initial implementation |
| --- | --- |
| Renderer, view, PDF inspection | `e4b8892` |
| Private storage and database | `4f700b3` |
| Protected surfaces | `77af111` |
| Configuration and publication runtime | `31af59b` |

Review corrections include bounded preflight/native packaging (`b72b1d2`), required package/current RSC tests (`eabd4cd`), labeled money fields (`107d320`), UUID rejection and post-download revalidation (`4bae0f0`), empty QR candidate handling (`0eb436d`), and positioned row/total evidence (`8fb06d3`). The row repair resumed preserved work after interruption, rather than discarding it. The active contract and ownership are in [`../superpowers/freezes/2026-09-06-f3-documents.md`](../superpowers/freezes/2026-09-06-f3-documents.md).

## Verification

Final local results after structural integration and the decoder timing correction:

| Gate | Local result |
| --- | --- |
| Lint / typecheck / production build | Passed |
| Pre-build unit | 1,564 passed across 54 files; 13 isolated package cases deferred |
| Post-build `pnpm test:documents:package` | 35 passed, including all 13 isolated package cases |
| Database integration | 433 passed across 9 files |
| Production browser | 44 desktop/mobile tests passed |
| Release tooling | 10 tests passed |
| Local reset / SQL lint | Passed, including migration `0005` |
| Secret scan | Clean at the recorded gate |
| Clean Linux runner | PR #7 run `34039716909`: `web`, `browser`, and `database` passed; version metadata awaited final preparation |

Twenty-two post-build cases overlap the unit suite; do not add all 35 to the unit count. The 13 isolated cases must run after build, not remain skipped. Both required CI `web` and local `pnpm verify` run `pnpm test:documents:package` after `pnpm build`; passing pre-build units alone is insufficient. These results are local evidence, not a hosted deployment or final R06 CI claim.

After Docker was restarted, two document-read tests transiently failed; their exact earlier timing/response predicate was not captured. Eight isolated repetitions and the complete document suite then passed. Separate deterministic regressions reproduced a decoder problem with an application clock 1 ms behind activation or at expiry during transit. The DTO decoder now checks timestamp ordering, not current wall time. SQL and the access service still enforce live activation/expiry, including post-download revalidation. Independent security review accepted this separation; no MAC, scope or time-based access checks were relaxed. The subsequent full 433-test database and 44-test browser gates passed. This does not establish the cause of the earlier transient failures or resolve R05 nonce clock sensitivity.

## Remaining Gates

- **Release metadata and CI: PENDING.** The coordinator owns the final version-only commit, release PR, required checks, trusted merge tag, and post-merge verification. Immutable tags require a forward-fix release for any post-merge regression.

Protected HTML retains a verification gap for denial-status uniformity when a request is live at admission but becomes invalid in flight. This is not an established confidentiality bypass. PDF post-download access revalidation is tested; that does not prove HTML in-flight status behavior.

The R05 suspected cross-runtime nonce clock sensitivity remains unresolved and unchanged. Preserve strict timing checks and stop release preparation on recurrence; prior diagnostics and evidence are in [`r05-publication.md`](r05-publication.md#pre-release-timing-risk).

Hosted Supabase/deployment configuration is unverified by this tranche, not declared absent. No hosted document delivery, funded Arc payment, receipt, MCP connection, Gmail send, or receipt email is claimed. R07/R09 own authorization/payment, R08 receipts/durable delivery, and R09 MCP. Root user planning/branding/email/diagram changes are outside this release snapshot; environment files were not read, copied, or changed by the documentation task.
