# R01 Preflight Evidence

Initial evidence window: `2026-09-05T06:47:09Z` through `2026-09-05T06:50:52Z`. Operator follow-up window: `2026-09-05T06:56:45Z` through `2026-09-05T07:02:44Z`.

This is a sanitized prerequisite ledger for R01-T01. Initial evidence gathering was read-only. The follow-up created and configured the intended Vercel project, deployed the existing secret-free shell, and assigned the already-owned domain. It records no tokens, keys, raw credentials, account email addresses, connector URLs, receipt inbox addresses, or funded wallet addresses. Authenticated facts are reduced to booleans, counts, project/domain names already public in this repository, and control settings.

Status vocabulary:

- `verified`: observed from the authoritative service, official documentation, or a live read-back.
- `blocked`: attempted, but the required runtime or service behavior was unavailable or requires an authenticated human action.
- `not configured`: the local/project configuration needed for the check was absent.

## Repository Baseline And GitHub

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Worktree scope | Branch `agent/r01-preflight-evidence` started clean at required base `0cab1c5d254cb831ee9649e7bfdb3e00dafbbb32`. |
| `verified` | GitHub authentication and origin | `gh auth status` succeeded. `origin` is `https://github.com/2manslkh/payr.git`; the authoritative repository is public and its default branch is `main`. No account identity or credential was retained. |
| `verified` | Merge controls | Merge commits are enabled; squash and rebase merges are disabled; merged branches are deleted automatically. |
| `verified` | `main` controls | An active ruleset requires pull requests, strict up-to-date `web`, `browser`, and `release-metadata` checks, resolved review threads, and merge-commit merges. It blocks deletion and force-push/non-fast-forward updates and has no bypass actor. The legacy branch-protection endpoint returns `404`, which is expected because protection is implemented by a ruleset instead. |
| `verified` | Release-tag controls | Active `v*.*.*` tag rules restrict creation to an authorized user or deploy key and block update, deletion, and non-fast-forward changes. The expected Actions secret exists, and one verified writable deploy key is present; neither value was read. |
| `verified` | Release read-back | Remote `main` is `15fa22b9aa17e6e00dfd9588228c4621a5220a88`. Annotated tag `v0.1.1` targets that commit, and the post-merge `main` CI run succeeded. The annotated tag is unsigned; signing is not required by `docs/ops/versioning.md`. |
| `verified` | Release-control ownership and platform limit | `CODEOWNERS` identifies the workflow, release scripts, and versioning document. The ruleset does not require a code-owner approval, but the repository currently reports one administrator and zero non-admin collaborators with write access. Default Actions workflow permissions are read-only. GitHub rejected release-path push restrictions because push rules are unavailable to public user-owned source repositories; protected `main`, owner-only write authority, CODEOWNERS visibility, and the dedicated release-tag deploy key are the available compensating controls. |

Sources:

- https://github.com/2manslkh/payr
- https://api.github.com/repos/2manslkh/payr/rulesets
- https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets
- https://docs.github.com/en/rest/repos/rules

## Local Capabilities

Observed during the evidence window above.

| Status | Capability | Sanitized evidence |
| --- | --- | --- |
| `verified` | Node.js | `v22.22.0`; satisfies repository engine `>=22 <23`. |
| `verified` | pnpm | `10.19.0`; exactly matches `packageManager` and the repository engine. |
| `verified` | Foundry | `forge 1.4.0-nightly` is invocable. No contract write or deployment was attempted. |
| `verified` | Supabase CLI authentication | Supabase CLI `2.84.2` is invocable, and a sanitized project-list read succeeded against stored authentication. |
| `not configured` | Intended Supabase project | The authenticated scope contains projects but no exact `payr` name; this worktree has no `supabase/config.toml` and no project link. The intended project cannot be selected safely by inference. |
| `verified` | Docker runtime | Docker client and daemon `24.0.2` are available after the operator started the local runtime. |
| `not configured` | Local Supabase runtime | Docker is available, but this repository still has no `supabase/config.toml`. The local Supabase stack and Task 2 database tests wait on Task 2 schema/project initialization rather than the Docker daemon. |
| `verified` | Vercel CLI authentication | Vercel CLI `54.20.1` is invocable and authenticated. Account identity was not retained. |

Sources:

- https://nodejs.org/en/about/previous-releases
- https://pnpm.io/10.x/installation
- https://supabase.com/docs/reference/cli/introduction
- https://vercel.com/docs/cli/project

## Arc Testnet

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Official network identity | Arc Testnet chain ID is decimal `5042002`, hexadecimal `0x4cef52`; the primary public RPC is `https://rpc.testnet.arc.io`; the explorer is `https://testnet.arcscan.app`. |
| `verified` | Live chain read-back | A direct JSON-RPC `eth_chainId` call to the official primary RPC returned `0x4cef52`. `eth_blockNumber` also returned successfully. The repository's `pnpm verify:arc` passed when supplied only the official public RPC and chain ID for this process. |
| `verified` | Native-USDC behavior | Official Arc documentation states that native USDC and ERC-20 USDC are one underlying asset. The native interface uses 18 decimals for gas, `msg.value`, and `eth_getBalance`; the linked ERC-20 interface uses 6 decimals. Arc has no native ETH balance. |
| `verified` | Explorer identity and TLS | The official explorer hostname resolves and presented a valid certificate for `testnet.arcscan.app` during a direct TLS read-back. |
| `blocked` | Automated explorer page read | An unauthenticated HTTP read returned `403`, consistent with an edge/anti-bot restriction. This does not invalidate the official explorer identity or Arc RPC read-back, but automated explorer-page evidence is unavailable from this runner. |
| `not configured` | Runtime Arc variables | `ARC_RPC_URL` and `ARC_CHAIN_ID` were absent from the inherited runtime. The successful verifier invocation used temporary public values only and did not modify an environment file. |
| `blocked` | Deployment and payer balances | No deployment or payer address was supplied to this isolated worktree. The operator must select the intended wallets and read both native balances without placing addresses in this ledger. |

Sources:

- https://docs.arc.io/arc/references/connect-to-arc.md
- https://docs.arc.io/arc/references/evm-differences.md
- https://docs.arc.io/integrate/wallets.md
- https://docs.arc.io/integrate/wallets/add-arc-to-a-wallet.md

## Vercel, Public Health, And `payrlink.xyz`

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Domain account read-back | The authenticated Vercel CLI can inspect `payrlink.xyz`. Vercel is the registrar, the domain is on its edge network, and intended/current nameservers match. No account identity was retained. |
| `verified` | Public DNS delegation | Local DNS, Cloudflare `1.1.1.1`, and Google `8.8.8.8` all see apex A records and Vercel nameservers. Observed apex A records were `64.29.17.65` and `216.198.79.65`; no apex CNAME or AAAA record was returned. |
| `verified` | Intended Vercel project/link | The operator created and linked the exact `payr` project in the authenticated scope. Its framework preset is Next.js and its runtime is Node.js `22.x`, matching the repository engine. Local link metadata and downloaded environment material remain ignored and untracked. |
| `verified` | Production deployment and public preview | Vercel built the existing shell with pnpm `10.19.0` and Next.js `16.3.4`; the production deployment is `Ready`. Public health at `https://payr-sandy.vercel.app/api/health` returned `status: ok` and commit `8b17dbae4420b523492d6a086ada2ef4e5189946`. The unique deployment host remains behind Vercel Authentication and is not the selected public fallback. |
| `verified` | `payrlink.xyz` TLS and HTTP | Assigning the domain to the project issued a certificate and attached it to the latest production deployment. Plain HTTP `/` returns `308` to HTTPS; HTTPS `/` returns `200`; HTTPS `/api/health` returns `status: ok` with the deployed commit above. |
| `verified` | Stable Vercel fallback host | `https://payr-sandy.vercel.app` is a stable public production alias and its health endpoint returns the expected JSON. The healthy custom domain is now the intended `NEXT_PUBLIC_APP_URL`; the Vercel alias remains the fallback. |

The Vercel project, public fallback, custom-domain certificate, HTTPS redirect, shell route, and health route are now live. This closes the Task 1 public-preview blocker without claiming that later product routes or integrations exist.

Sources:

- https://vercel.com/docs/cli/project
- https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting

## Resend

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `not configured` | Local capability/configuration | No Resend CLI, API-key variable, or sender-email variable was available to this process. No credential value was requested or read. |
| `not configured` | Public sender DNS | No SPF record was observed at the apex or conventional `send` subdomain; no record was observed at the conventional Resend DKIM selector; no `send` MX record or apex DMARC record was observed. Exact records are generated by the Resend dashboard, so this is evidence that the common configuration is absent, not permission to guess dashboard-issued names. |
| `blocked` | Resend account and sender-domain state | The authenticated Resend dashboard/API was unavailable. The operator must identify the intended account and sender domain, then confirm that its exact generated SPF/DKIM records are verified. |
| `blocked` | Receipt inboxes | The operator must confirm two intended receipt inboxes by receiving test messages. No inbox address may be added to this document. |

Resend sender-domain verification is not demonstrably started from the observable DNS or local configuration.

Sources:

- https://resend.com/docs/add-a-domain
- https://resend.com/docs/dashboard/domains/introduction

## ETHGlobal Cutoff

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Public event dates | ETHGlobal's public events listing identifies ETHOnline 2026 as running `2026-09-04` through `2026-09-16`. |
| `blocked` | Exact submission cutoff | The public listing does not provide an exact cutoff time/timezone, the public event route returned `500` to this runner, and no authenticated participant-dashboard session is available. The operator must read the exact deadline from the participant dashboard and record it in coordinator-owned status/release evidence. No time is inferred from the end date. |

Sources:

- https://ethglobal.com/events
- https://ethglobal.com/events/ethonline2026

## Claude Custom Connector

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Product capability | Anthropic documents remote MCP custom connectors for Claude, Cowork, and Claude Desktop on Free, Pro, Max, Team, and Enterprise plans; Free is limited to one custom connector. Remote servers must be publicly reachable. |
| `verified` | Local client | Claude Desktop and its local support directory are present. No local connector configuration was opened because it may contain endpoint credentials. |
| `blocked` | Account availability and Payr connector | The operator must confirm that the signed-in Claude account exposes the custom-connector UI and later configure/test Payr after a public MCP endpoint exists. No connector URL was observed or recorded. |

Sources:

- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://platform.claude.com/docs/en/agents-and-tools/mcp-connector

## External Client Wallet

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Supported wallet capability | MetaMask is explicitly included in Arc's official wallet setup instructions, and a MetaMask browser extension installation was observed locally. No profile, account, or address data was opened. |
| `blocked` | Arc setup and funding | The operator must select the demo browser profile, add/switch to Arc Testnet, confirm that the wallet labels the native asset as USDC where supported, and verify sufficient payer balance plus gas reserve. Address and balance evidence must remain out of this document. |

Source:

- https://docs.arc.io/arc/references/connect-to-arc.md

## Commands And Checks

Initial evidence commands were read-only or made public GET/JSON-RPC requests. Outputs were reduced before recording. The follow-up made only the scoped Vercel project, deployment, certificate, and domain-assignment changes listed below.

```text
git status --short --branch
git rev-parse HEAD

gh auth status
gh repo view 2manslkh/payr --json ...
gh api repos/2manslkh/payr/rulesets ...
gh api repos/2manslkh/payr/actions/permissions/workflow ...
gh api repos/2manslkh/payr/actions/runs ...
gh api repos/2manslkh/payr/actions/secrets ...
gh api repos/2manslkh/payr/keys ...
gh api repos/2manslkh/payr/collaborators ...

node --version
pnpm --version
forge --version
supabase --version
supabase projects list --output json
docker version --format ...
pnpm exec vercel --version
pnpm exec vercel whoami
pnpm exec vercel project ls --filter payr --format json
pnpm exec vercel domains inspect payrlink.xyz
pnpm exec vercel inspect https://payrlink.xyz
pnpm exec vercel link
pnpm exec vercel api /v9/projects/payr -X PATCH -F framework=nextjs -F nodeVersion=22.x --silent
pnpm exec vercel deploy --prod --yes
pnpm exec vercel alias set <deployment-host> payrlink.xyz
pnpm exec vercel domains add payrlink.xyz payr

curl JSON-RPC eth_chainId and eth_blockNumber against https://rpc.testnet.arc.io
ARC_RPC_URL=<official-public-host> ARC_CHAIN_ID=5042002 pnpm verify:arc
curl/openssl read-backs for testnet.arcscan.app

dig A/AAAA/CNAME/NS/TXT/MX read-backs for payrlink.xyz and conventional mail records
dig A/NS read-backs through 1.1.1.1 and 8.8.8.8
curl HTTP/HTTPS root and /api/health for payrlink.xyz
openssl TLS certificate read-back for payrlink.xyz

Presence-only checks for required environment variable names, Claude Desktop,
browser extension storage, and the MetaMask extension
```

No Supabase initialization/start, DNS-record edit, email send, connector change, wallet access, or chain write was performed. Vercel generated local environment material during linking; it remains ignored and was neither read into this ledger nor committed.

## Task 1 Kill Gates And Continuation

| Gate | Outcome | Consequence |
| --- | --- | --- |
| R01 prerequisite classification | `verified` | Every requested prerequisite now has a `verified`, `blocked`, or `not configured` outcome. |
| Arc RPC/chain identity | `verified` | The implementation plan's Arc identity kill gate passes. Chain-independent Tasks 2-5 do not need the Arc fallback, and Task 6 is not blocked on chain identity. |
| Arc funded deployment/payer wallets | `blocked` | Task 6 contract/local work may proceed after its normal dependencies, but live deployment and the real operator-payment completion gate remain blocked until both balances are read back by the operator. |
| Vercel authentication | `verified` | CLI/account access exists. |
| Vercel project and public health preview | `verified` | The intended Next.js/Node 22 project has a `Ready` production deployment. The stable public Vercel alias and custom domain return the expected secret-free health JSON, so the public-preview prerequisite for later Task 9/10 deployment work passes. |
| `payrlink.xyz` DNS | `verified` | Delegation/A-record propagation has started and is visible through independent public resolvers. |
| `payrlink.xyz` TLS/HTTP | `verified` | Certificate issuance, HTTP-to-HTTPS redirect, HTTPS root, and health read-back pass. Use `https://payrlink.xyz` as `NEXT_PUBLIC_APP_URL`; retain the verified Vercel alias as fallback. |
| Resend sender verification | `not configured` | Task 1's requirement to start Resend verification is not met. Task 7 implementation can proceed after its dependencies, but real delivery proof and Task 10 are blocked pending exact SPF/DKIM verification and inbox receipts. |
| Supabase intended project/local runtime | `not configured` | Docker is running. Task 2 domain/unit work may continue, but its database integration gate cannot pass until `supabase/config.toml` and the intended project/schema lane exist. |
| ETHGlobal exact cutoff | `blocked` | Submission scheduling and Task 10 cutoff evidence remain blocked on an operator dashboard read-back; do not infer a time or timezone from `2026-09-16`. |
| Claude account connector availability | `blocked` | MCP implementation may continue after its dependencies; Task 9 live Claude smoke remains blocked until the operator confirms the UI and a public endpoint exists. |
| External wallet support | `verified` | MetaMask is an officially supported installed client. Task 6/8 live wallet gates still require operator Arc configuration and funded-balance confirmation. |

Overall Task 1 operational outcome: `blocked`. Arc identity, repository controls, Docker, Vercel public health, and custom-domain HTTPS are real. Resend verification is not observably configured, and wallet funding, the Claude account UI, receipt inboxes, and the exact submission cutoff remain human gates. Tasks 2-5 may continue, subject to each task's own dependency gates; Task 2 database proof waits on Supabase configuration rather than Docker. Task 6 may continue through non-live work once Tasks 2, 4, and 5 pass, but cannot complete its real-payment gate. Tasks 7-8 follow their normal dependencies, with Task 7 live email proof blocked. The public-hosting blocker for Task 9/10 is closed, but those tasks must not claim deployed/live completion until their remaining Claude, Resend, wallet, deadline, and product-integration gates are closed.
