# Public Agent Discovery

## Current Scope: 10 September Reconciliation

Preserve the later production/scanner record at the end, imported from the newer
root donor, alongside the original implementation evidence. Neither record is
fresh CI/deployment proof for this candidate. `privy-onboarding.md` identifies the
later production snapshot as base `cbcf7e2` plus uncommitted Privy source; health
does not identify its complete content. Privy login/receiving-wallet onboarding
does not implement OAuth for Payr's agent credentials or replace the payment signer.

Public onboarding now follows the MCP-first guide in `mcp-onboarding.md`, without
the archived optional plugin. The recorded public gateway has eleven Payr
operations without context/void, while local upstream has twelve including context.
Direct MCP and public generated MCP have different authentication/catalogs; listing
tools is not proof of private per-user account injection, which remains unverified.
Keep secrets out of chat. New Publish & Send requires both literal approvals,
frozen recipients/PDF/private links and configured email; disabled email blocks
fresh publication. The served portable skill must match that current contract,
not older separate-Gmail prose. Recheck its exact hash on the eventual candidate
deployment; this docs edit does not claim it has been deployed.

## Implemented

- `/robots.txt`: plain text, explicit crawler groups, sitemap link. Owner-selected policy: search allowed, AI training and AI input disallowed. Content Signals are preferences, not authorization. Specific search groups repeat private-path exclusions because wildcard groups are not inherited.
- `/sitemap.xml`: generated from the public page allowlist on each build. Add newly published public pages to `src/app/sitemap.ts`; never add published invoice or receipt links. No synthetic last-modified dates.
- `/`: discovery Link headers and, on Vercel, explicit `Accept: text/markdown` negotiation for GET/HEAD. HTML stays the browser default, `q=0` is respected, and wildcard Accept does not opt in. `/index.md` remains available directly and is the fallback on other hosting platforms. Private pages are not converted. No invented token count is emitted.
- `/docs/api.md`, `/auth.md`, `/openapi.json`: actual connector onboarding and a narrowly scoped public health API description. Health is liveness, not dependency readiness.
- `/.well-known/api-catalog`: RFC 9727 linkset for the public health API, with description, docs, status, and discovery Link headers (including automatic HEAD).
- `/.well-known/agent-skills/index.json`: discovery v0.2.0; SHA-256 is computed from the exact repository skill bytes served at `/.well-known/agent-skills/payr-create-invoice/SKILL.md`. The deployment trace explicitly includes the source skill.
- `/api/mcp`: stable Streamable HTTP endpoint accepting `Authorization: Bearer <connector credential>`. All operations require authentication; missing/invalid credentials receive 401 with a Bearer challenge. It reuses the existing verifier, action scopes, origin checks, token/IP limits, and request bounds. No cookies or query-string credentials are accepted. Existing `/api/mcp/<credential>` connections remain supported.
- `/.well-known/mcp/server-card.json`: current experimental server-card identity and `remotes` connection metadata. The Authorization header is described with a required secret variable; no credential is published. Version matches the MCP server, which is independently versioned from the application package.
- `/.well-known/mcp.json`: legacy `serverInfo`/`endpoint`/`capabilities` discovery document for older clients and scanners. It points at the same real authenticated endpoint; it is not a second implementation or anonymous tool surface.
- `/.well-known/ai-catalog.json` and `/.well-known/ard.json`: public skill and MCP-card discovery with CORS. AI Catalog 1.0 and current ARD use different paths and containers. Markdown uses `text/markdown`; the experimental MCP card uses its specification's media type.
- Homepage WebMCP: `get_payr_setup_instructions` and `get_payr_capabilities` return the same public auth/API text as the documentation endpoints. They accept no parameters, perform no network requests or mutations, and access no wallet, cookies, storage, or workspace records. Registration prefers the current Document API, with a Navigator API adapter for Chrome previews. Unsupported browsers keep the ordinary page; cancellation/unmount disables the callbacks and unregisters the tools.

Canonical URLs use validated `NEXT_PUBLIC_APP_URL`, falling back to `https://payrlink.xyz`, never the incoming Host header. Keep it identical to the site's canonical deployment origin. The homepage Markdown is curated, not a runtime HTML converter: update it in `src/lib/discovery.ts` when public product claims change.

## Markdown Hosting Requirements

Next 16.3.4 replaces handler-provided Vary on HTML. The homepage-only `response.headers` append transform in `vercel.json` adds Accept at Vercel's edge after rendering, preserving every Next variation field. Do not replace it with ordinary Next config headers or hard-code the RSC header list. Negotiation is enabled only when `VERCEL=1`; other platforms need an equivalent response layer before opting in. Markdown responses are no-store. Duplicate Accept tokens on the Markdown response after appending are harmless HTTP list semantics.

Next also strips RSC/prefetch headers before invoking Proxy. The public-root matcher excludes those requests before normalization; handler-only header checks are insufficient. Invoice/receipt matchers deliberately have no such exclusions: every protected representation still requires admission. Do not enable global URL-normalization bypass as a workaround.

## Deferred Or Inapplicable

- OAuth/OIDC and RFC 9728: not implemented because Payr authenticates with wallet signatures, browser session cookies, and connector credentials. Header Bearer transport does not make these OAuth-issued tokens. Do not publish invented issuers, token endpoints, JWKS, scopes, or authorization servers. `/auth.md` is self-contained owner-assisted provisioning documentation with the required auth.md H1, not WorkOS-style autonomous registration or an `agent_auth` implementation.
- DNS-AID: requires authoritative DNS access, confirmed provider SVCB support, interoperable draft parameters, and a real service/index binding. No DNS records or DNSSEC settings were changed. Never publish a connector secret in DNS. Before enabling, check the current DNS-AID draft and the provider's parameter support; do not invent experimental key codes or claim an ALPN the TLS service does not negotiate. DNSSEC verification requires the parent DS chain, not just enabling zone signing.
- WebMCP is experimental. Current Document and Navigator-preview adapters have unit and instrumented desktop/mobile browser coverage; that is not proof of universal native-browser support. No browser invoice mutations or financial tools are exposed. Remote MCP permissions are not granted by these public browser tools.
- Older scanners may expect superseded MCP-card fields or ARD formats. Do not add fake capabilities or public endpoints solely to pass a scanner.
- The experimental card uses the required reverse-DNS catalog identity `xyz.payrlink/payr`; the shipped MCP initialize response retains its existing `Payr` name for existing clients. The version is shared. This advisory identity mismatch is a known low-priority interoperability limitation; do not use the card as an authentication claim.

## Verification After Deployment

Use the canonical production origin, not a preview alias:

```sh
curl -i https://payrlink.xyz/robots.txt
curl -i https://payrlink.xyz/sitemap.xml
curl -I https://payrlink.xyz/
curl -i https://payrlink.xyz/index.md
curl -i -H 'Accept: text/markdown' https://payrlink.xyz/
curl -i -H 'Accept: text/markdown;q=0, text/html' https://payrlink.xyz/
curl -I https://payrlink.xyz/.well-known/api-catalog
curl -i https://payrlink.xyz/.well-known/agent-skills/index.json
curl -i https://payrlink.xyz/.well-known/agent-skills/payr-create-invoice/SKILL.md
curl -i https://payrlink.xyz/.well-known/mcp/server-card.json
curl -i https://payrlink.xyz/.well-known/mcp.json
curl -i https://payrlink.xyz/api/mcp
curl -i https://payrlink.xyz/.well-known/ai-catalog.json
curl -i https://payrlink.xyz/.well-known/ard.json
```

Check 200 responses, content types, canonical links, and CORS for public manifests; the unauthenticated MCP endpoint must return 401. On Vercel the first homepage Accept example should return Markdown and the q=0 example HTML. Verify that Vary retains both Accept and Next's own variation fields on HTML, and fetch both variants in both orders on cold/warm caches. Exercise GET/HEAD, real client navigation/prefetch, and the two browser tools. Confirm private document responses still require admission and remain private/no-store. Never put a real connector credential in a scan URL or command history.

These source changes and preview checks do not constitute a production deployment, new scanner score, or DNS verification.

## Implementation Verification (2026-09-09)

Preview `dpl_JAi1HvYnjNqvEFETmdoKHwhpjnnC` at `https://payr-k9u8ba7kc-kenks-projects.vercel.app` verified the no-paid-plan Vercel response transform. Authenticated preview requests passed HTML/Markdown alternation with cold and warm HTML cache responses, q=0, mixed preferences, wildcard defaults, GET/HEAD, and an RSC request returning React component data rather than Markdown. Auth.md heading, legacy card identity/endpoint, and missing-credential 401/Bearer challenge also passed. Production remained on the prior release throughout.

Six focused desktop/mobile tests exercise public discovery and real page-load tool registration/execution/cleanup using both browser API adapters. Native experimental-browser availability is not claimed by the instrumented tests. The new MCP route tests use the real credential verifier and SDK with a repository fixture to cover scopes, expiry/revocation, rate limits, origin denial, redaction, and unsupported methods; existing token-in-path route tests remain unchanged. The package trace gate now checks the stable MCP function's PDF dependencies as well.

Final focused regression run: 146 tests passed across nine files. Lint, typecheck, production builds, ten release-tool tests, and 35 compiled-document tests passed. A full current-worktree run passed 2,073 tests with 13 package-only skips before the final matcher regression cases. A later full run passed 2,077 tests but hit the existing 45-second native PDF inspection budget on the 100-item document test; the entire affected 21-test file subsequently passed in isolation. No PDF code, resource limits, or test deadlines were changed. Database fixtures and live financial workflows were not run for this implementation.

## Production Verification (2026-09-09)

User-approved production deployment `dpl_HSVN4DC2t5sETjG1wQg5GimJD6FL` is Ready at `https://payr-2gnlg8xf8-kenks-projects.vercel.app`, with `payrlink.xyz` and `payr-sandy.vercel.app` promoted to it. Source is committed AEO `fba7a1fc0c327d0f073dec23ce1ba37a1cd2b7e2` plus the exact already-deployed Bazantic publication route and `/openapi/publish.json` source, preserved with explicit user approval from `dpl_DfNrv7RPaYgrxb5wbHgF5q7Y7rG6`. Both preserved source files matched Vercel's stored SHA-1 hashes before upload. Other live runtime source files matched the recorded v1.6.0 baseline. No unrelated worktree files were uploaded.

Combined source manifest SHA-256: `7be7bcaba1c46d3a2f1e22efc923268ea229e7235e0cbd4537ae65a8f57bac35`, computed from sorted file paths and content SHA-1 hashes. Vercel metadata records the AEO commit, preserved deployment, and combined fingerprint. Health reports the AEO commit; it is not the complete identity of the preserved Bazantic overlay. This is a deployment, not a new tagged version or a merge to main.

Production HTTP checks passed HTML/Markdown alternation, warm-cache isolation, q=0 and wildcard defaults, GET/HEAD, RSC, discovery documents, exact skill hashes, and 401/Bearer/private-no-store responses for invalid MCP and publication credentials. The Bazantic spec still exposes only its publication operation. Node/build settings, production environment metadata, disabled Git-triggered deployments, and all three daily cron schedules were preserved. Receipt email remains disabled. No database migrations, authenticated publication, payments, or email sends were performed.

At `2026-09-09T07:57:11.843Z`, the external scanner reported **73/100, 11 of 15 passes**, using the same check selection as the original 53-point screenshot, and labeled it Level 5 / Agent-Native. Newly passing checks: Markdown negotiation, MCP Server Card, and WebMCP (both actual registered tools detected). Remaining failures: DNS-AID, OAuth discovery, OAuth Protected Resource, and Auth.md agent-registration detection. Auth.md's heading now passes, but the scanner still does not recognize the documented owner-assisted provisioning as agent registration. Do not claim that check is fixed or fabricate OAuth registration to satisfy it. The scanner API's broader default adds unsupported A2A and reports 69/100 (11/16); compare like-for-like profiles.
