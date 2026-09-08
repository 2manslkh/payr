# Public Agent Discovery

## Implemented

- `/robots.txt`: plain text, explicit crawler groups, sitemap link. Owner-selected policy: search allowed, AI training and AI input disallowed. Content Signals are preferences, not authorization. Specific search groups repeat private-path exclusions because wildcard groups are not inherited.
- `/sitemap.xml`: generated from the public page allowlist on each build. Add newly published public pages to `src/app/sitemap.ts`; never add published invoice or receipt links. No synthetic last-modified dates.
- `/`: discovery Link headers, including an alternate link to a curated Markdown representation at `/index.md`. Homepage HTML remains unchanged regardless of Accept. Private pages are not converted. No invented token count is emitted.
- `/docs/api.md`, `/auth.md`, `/openapi.json`: actual connector onboarding and a narrowly scoped public health API description. Health is liveness, not dependency readiness.
- `/.well-known/api-catalog`: RFC 9727 linkset for the public health API, with description, docs, status, and discovery Link headers (including automatic HEAD).
- `/.well-known/agent-skills/index.json`: discovery v0.2.0; SHA-256 is computed from the exact repository skill bytes served at `/.well-known/agent-skills/payr-create-invoice/SKILL.md`. The deployment trace explicitly includes the source skill.
- `/.well-known/mcp/server-card.json`: current experimental server-card identity and onboarding URL. Version matches the MCP server, which is independently versioned from the application package. No private endpoint is disclosed and automatic connection is not advertised.
- `/.well-known/ai-catalog.json` and `/.well-known/ard.json`: public skill and MCP-card discovery with CORS. AI Catalog 1.0 and current ARD use different paths and containers. Markdown uses `text/markdown`; the experimental MCP card uses its specification's media type.

Canonical URLs use validated `NEXT_PUBLIC_APP_URL`, falling back to `https://payrlink.xyz`, never the incoming Host header. Keep it identical to the site's canonical deployment origin. The homepage Markdown is curated, not a runtime HTML converter: update it in `src/lib/discovery.ts` when public product claims change.

## Deferred Or Inapplicable

- Same-URL Markdown negotiation: production HTTP testing found that Next 16.3.4 App Page rendering replaces Proxy's `Vary: Accept` with its own RSC variation fields (`next/dist/build/templates/app-page-runtime.js`). Config headers run earlier and cannot fix that overwrite. Therefore the application serves a separate `/index.md` alternate rather than unsafe cache variants. Enabling negotiation requires an outer response-header layer that appends Accept on HTML and a CDN cache key that honors it, or a framework fix. The Markdown-for-Agents negotiation scan will not pass yet.
- OAuth/OIDC and RFC 9728: not implemented because Payr authenticates with wallet signatures, browser session cookies, and private MCP credential URLs. Do not publish invented issuers, token endpoints, JWKS, scopes, or authorization servers. `/auth.md` is truthful documentation, not WorkOS-style autonomous registration or an `agent_auth` implementation.
- DNS-AID: requires authoritative DNS access, confirmed provider SVCB support, interoperable draft parameters, and a real service/index binding. No DNS records or DNSSEC settings were changed. Never publish a connector secret in DNS. Before enabling, check the current DNS-AID draft and the provider's parameter support; do not invent experimental key codes or claim an ALPN the TLS service does not negotiate. DNSSEC verification requires the parent DS chain, not just enabling zone signing.
- WebMCP: not implemented. The September 2026 draft uses `document.modelContext.registerTool()`, unlike the older scanner's `navigator.modelContext.provideContext()`. Shipping this needs a supported browser target and an approved browser-tool surface with authorization, cancellation, and user confirmation tests. The remote MCP connector is not WebMCP.
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
curl -i https://payrlink.xyz/.well-known/ai-catalog.json
curl -i https://payrlink.xyz/.well-known/ard.json
```

Check 200 responses, content types, canonical links, and CORS for public manifests. The homepage should remain HTML for both Accept examples; `/index.md` is the Markdown alternative. Before enabling same-URL negotiation, verify that Vary retains both Accept and Next's own variation fields on HTML and fetch both variants in both orders to detect CDN contamination. Confirm private document responses still require admission and remain private/no-store. These code changes do not constitute a production deployment or DNS verification.
