# R03 Identity And Console Evidence

Evidence recorded `2026-09-06`. Base release: `v0.1.3` at `8fb6df58a5e07d4650da60a51a4158de63b4cda5`.

## Delivered Scope

- Exact server-reconstructed EOA login and payout messages, five-minute single-use nonces, and eight-hour encrypted/authenticated JWE sessions.
- Always-Secure host cookies, exact Origin/Host checks for mutations, and independent session authorization on each private API.
- Revision-checked sender/client profile forms and owner-only, separately signed payout changes.
- Show-once, purpose-keyed connector credentials; fixed scopes; bounded expiry; immediate revocation; transactional denial audit and independent token/IP rate limits.
- Database-backed nonce admission limits with purpose/wallet/IP separation, a global cap, bounded counters, and expired-nonce cleanup.
- Responsive `Commit Ledger` login and console surfaces, meaningful redacted Activity, and explicit unavailable invoice/MCP states.

The core migration and four brand reference files are unchanged. R03 adds `202609040002_auth_connector_functions.sql`; its new RPCs and tables preserve F1's default-deny privileges and private data boundaries. No hosted migration, funded-wallet payment, actual MCP connection, rendered financial document, or email delivery is claimed.

## Lane Manifest

F2 baseline: `969226ab17ec7e8de7280372c588647ee7e95e40`.

| Lane | Worktree | Initial implementation commit |
| --- | --- | --- |
| Identity database | `.worktrees/r03-database` | `66c8cd0222ac77268cf003f74fb795c8045e96ca` |
| Auth | `.worktrees/r03-auth` | `083e153ee53d7083f300f8bf89d2b80c3c2b1bc4` |
| Profiles/connectors | `.worktrees/r03-connectors` | `6a84416e8a26ed09e7e9ad64cc8bd235dc9ec025` |
| Console | `.worktrees/r03-console` | `78104454ca6ae29964cceb1b890b2d7a22afeadc` |

Agent branches were integrated with merges, preserving ancestry for ordinary post-release deletion. The database lane received the updated integration freeze and produced concurrency/admission repair `b5dd2e8575d10e9529be0c2a4c4627915aef8bcf`. Coordinator changes reconciled GET authorization, error envelopes, test isolation, signed browser cookies, audit labels, and quota purpose/IP separation.

## Verification

| Gate | Local result |
| --- | --- |
| Lint / typecheck / production build | Passed |
| Unit tests | 417 passed across 22 files |
| Database integration | 116 passed across 4 files, including all prior kernel tests |
| Release-tool tests | 10 passed |
| Production browser tests | 26 passed across desktop and mobile Chromium, no skipped authenticated cases |
| Reset / SQL lint | Both migrations applied cleanly; no SQL lint errors |
| Brand/core migration preservation | No diff against `v0.1.3` |
| Clean GitHub runner | Draft PR #4 run `33982572962` passed `web`, `browser`, and `database`; version metadata was intentionally deferred until the final release commit |

The unmocked `src/lib/auth/flow.integration.test.ts` calls actual route handlers with real viem signatures and local Supabase. It proves one winner for concurrent nonce verification, a usable encrypted session, profile/client persistence, owner-only payout changes, connector authentication/revocation, and denial audit. PostgreSQL fixtures are local only; application operations use the service-role RPC adapter.

Browser tests separately use the real session codec with per-run ephemeral keys and mock UI data APIs. They cover desktop/mobile/tablet navigation, Secure-cookie logout, rejected wallet requests, exact signing payloads, field/revision recovery, client saves, show-once credential handling, clipboard behavior, redacted Activity, 44px controls, and overflow/focus behavior. No production auth bypass exists.

## Review And Repairs

- Standards, specification, and adversarial security reviews have no remaining high/medium findings.
- Both repeat-login versus profile-save and repeat-login versus payout deadlocks were reproduced with coordinated transactions and fixed using a workspace lock compatible with foreign-key checks.
- Unsigned nonce requests now have atomic quotas and cleanup rather than unbounded persistent growth. Purpose/wallet/IP tuple hashing prevents cross-IP targeted wallet lockout; shared IP/global limits remain intentional capacity controls.
- Expired/revoked, hash-verified connectors reach transactional denial audit rather than bypassing it.
- Duplicate aliases remain editable; only revision conflicts enter the review-latest flow.
- Activity uses the actual database action/outcome vocabulary and retains safe unknown-code fallbacks.
- Visual review accepted the approved design with one small correction: payout success resets its own validation state without clearing sender edits. Desktop/mobile confirmation screenshots and the regression passed.
- The design detector's Helvetica warning is accepted because the approved design explicitly permits that system fallback; no font network fetch or unlicensed asset was added.
- Gitleaks found two reviewed deterministic HMAC test-vector false positives in `src/lib/connectors/auth.test.ts`, not real credentials. Actual runtime keys, wallet private keys, and local Supabase credentials were never committed.

## Runtime And Remaining Gates

Identity runtime requires the canonical app origin, Arc chain ID, independent encoded session/connector secrets, and the intended Supabase URL/service-role key. The public site remains the previous health shell; its existing health response is not proof of an R03 hosted deployment.

The hosted Supabase project, funded Arc wallets, Resend sender/inbox proof, Claude account connector UI, and exact authenticated ETHGlobal cutoff remain external operator gates. Local test wallets are generated or deterministic test fixtures, not live payment evidence. Global session revocation and smart-account signatures are not claimed.

The release PR must pass `web`, `browser`, `database`, and `release-metadata`, then trusted CI must publish the annotated `v0.2.0` tag on the exact merge commit. The PR and post-merge Actions run are the authoritative release read-back, superseding this pre-release snapshot.
