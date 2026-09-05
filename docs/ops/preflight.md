# R01 Preflight Evidence

Evidence window: `2026-09-05T06:47:09Z` through `2026-09-05T06:50:52Z`.

This is a read-only, sanitized prerequisite ledger for R01-T01. It records no tokens, keys, raw credentials, account email addresses, connector URLs, receipt inbox addresses, or funded wallet addresses. Authenticated facts are reduced to booleans, counts, project/domain names already public in this repository, and control settings.

Status vocabulary:

- `verified`: observed from the authoritative service, official documentation, or a live read-back.
- `blocked`: attempted, but the required runtime or service behavior was unavailable.
- `not configured`: the local/project configuration needed for the check was absent.
- `human required`: an authenticated UI, inbox, wallet, or participant-dashboard fact cannot be safely observed by this agent.

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
| `verified` | Release-control ownership | `CODEOWNERS` identifies the workflow, release scripts, and versioning document. The ruleset does not require a code-owner approval, but the repository currently reports one administrator and zero non-admin collaborators with write access. Default Actions workflow permissions are read-only. |

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
| `blocked` | Local Supabase runtime | Docker client `24.0.2` is installed, but its daemon is not running. The local Supabase stack and Task 2 database tests cannot run until Docker is available and project config exists. |
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
| `human required` | Deployment and payer balances | No deployment or payer address was supplied to this isolated worktree. The operator must select the intended wallets and read both native balances without placing addresses in this ledger. |

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
| `not configured` | Intended Vercel project/link | A read-only exact-name project lookup returned no `payr` project in the selected authenticated scope. This worktree has no `.vercel` link metadata, and deployment inspection for the public domain found no deployment. Nothing was created, linked, or deployed. |
| `blocked` | TLS | Both resolved apex addresses failed the TLS handshake before presenting a certificate for `payrlink.xyz`. HTTPS is not healthy. |
| `blocked` | HTTP and health route | Plain HTTP `/` returned `404` rather than redirecting to HTTPS. HTTPS `/` and `/api/health` could not complete TLS, so the expected health JSON was not read back. |
| `not configured` | Stable Vercel fallback host | No project or deployment was discoverable, so no authoritative `*.vercel.app` hostname can be recorded for `NEXT_PUBLIC_APP_URL`. |

The DNS delegation has started and is globally visible, but project assignment, certificate issuance, HTTPS, and public health remain incomplete.

Sources:

- https://vercel.com/docs/cli/project
- https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting

## Resend

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `not configured` | Local capability/configuration | No Resend CLI, API-key variable, or sender-email variable was available to this process. No credential value was requested or read. |
| `not configured` | Public sender DNS | No SPF record was observed at the apex or conventional `send` subdomain; no record was observed at the conventional Resend DKIM selector; no `send` MX record or apex DMARC record was observed. Exact records are generated by the Resend dashboard, so this is evidence that the common configuration is absent, not permission to guess dashboard-issued names. |
| `human required` | Resend account and sender-domain state | The authenticated Resend dashboard/API was unavailable. The operator must identify the intended account and sender domain, then confirm that its exact generated SPF/DKIM records are verified. |
| `human required` | Receipt inboxes | The operator must confirm two intended receipt inboxes by receiving test messages. No inbox address may be added to this document. |

Resend sender-domain verification is not demonstrably started from the observable DNS or local configuration.

Sources:

- https://resend.com/docs/add-a-domain
- https://resend.com/docs/dashboard/domains/introduction

## ETHGlobal Cutoff

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Public event dates | ETHGlobal's public events listing identifies ETHOnline 2026 as running `2026-09-04` through `2026-09-16`. |
| `human required` | Exact submission cutoff | The public listing does not provide an exact cutoff time/timezone, the public event route returned `500` to this runner, and no authenticated participant-dashboard session is available. The operator must read the exact deadline from the participant dashboard and record it in coordinator-owned status/release evidence. No time is inferred from the end date. |

Sources:

- https://ethglobal.com/events
- https://ethglobal.com/events/ethonline2026

## Claude Custom Connector

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Product capability | Anthropic documents remote MCP custom connectors for Claude, Cowork, and Claude Desktop on Free, Pro, Max, Team, and Enterprise plans; Free is limited to one custom connector. Remote servers must be publicly reachable. |
| `verified` | Local client | Claude Desktop and its local support directory are present. No local connector configuration was opened because it may contain endpoint credentials. |
| `human required` | Account availability and Payr connector | The operator must confirm that the signed-in Claude account exposes the custom-connector UI and later configure/test Payr after a public MCP endpoint exists. No connector URL was observed or recorded. |

Sources:

- https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- https://platform.claude.com/docs/en/agents-and-tools/mcp-connector

## External Client Wallet

Observed during the evidence window above.

| Status | Check | Sanitized evidence |
| --- | --- | --- |
| `verified` | Supported wallet capability | MetaMask is explicitly included in Arc's official wallet setup instructions, and a MetaMask browser extension installation was observed locally. No profile, account, or address data was opened. |
| `human required` | Arc setup and funding | The operator must select the demo browser profile, add/switch to Arc Testnet, confirm that the wallet labels the native asset as USDC where supported, and verify sufficient payer balance plus gas reserve. Address and balance evidence must remain out of this document. |

Source:

- https://docs.arc.io/arc/references/connect-to-arc.md

## Commands And Checks

All commands were read-only or made public GET/JSON-RPC requests. Outputs were reduced before recording.

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

No Vercel link/deploy, Supabase initialization/start, DNS change, email send, connector change, wallet access, or chain write was performed.

## Task 1 Kill Gates And Continuation

| Gate | Outcome | Consequence |
| --- | --- | --- |
| R01 prerequisite classification | `verified` | Every requested prerequisite now has a `verified`, `blocked`, `not configured`, or `human required` outcome. |
| Arc RPC/chain identity | `verified` | The implementation plan's Arc identity kill gate passes. Chain-independent Tasks 2-5 do not need the Arc fallback, and Task 6 is not blocked on chain identity. |
| Arc funded deployment/payer wallets | `human required` | Task 6 contract/local work may proceed after its normal dependencies, but live deployment and the real operator-payment completion gate remain blocked until both balances are read back. |
| Vercel authentication | `verified` | CLI/account access exists. |
| Vercel project and public health preview | `blocked` | Continue locally under Task 1.2/1.6 fallback. Task 9 deployed connector proof and Task 10 release proof are blocked until an intended project, public preview, and stable public health host are read back. |
| `payrlink.xyz` DNS | `verified` | Delegation/A-record propagation has started and is visible through independent public resolvers. |
| `payrlink.xyz` TLS/HTTP | `blocked` | Do not use the custom domain in the demo or as `NEXT_PUBLIC_APP_URL` until HTTPS and health pass. No verified Vercel fallback host exists yet. |
| Resend sender verification | `not configured` | Task 1's requirement to start Resend verification is not met. Task 8 implementation can proceed after its dependencies, but real delivery proof and Task 10 are blocked pending exact SPF/DKIM verification and inbox receipts. |
| Supabase intended project/local runtime | `not configured` / `blocked` | Task 2 domain/unit work may continue, but its database integration gate cannot pass until `supabase/config.toml` exists in the coordinator/schema lane and Docker is running. |
| ETHGlobal exact cutoff | `human required` | Submission scheduling and Task 10 cutoff evidence remain blocked; do not infer a time or timezone from `2026-09-16`. |
| Claude account connector availability | `human required` | MCP implementation may continue after its dependencies; Task 9 live Claude smoke remains blocked until the operator confirms the UI and a public endpoint exists. |
| External wallet support | `verified` | MetaMask is an officially supported installed client. Task 6/8 live wallet gates still require operator Arc configuration and funded-balance confirmation. |

Overall Task 1 operational outcome: `blocked`. Arc identity and repository controls are real, and domain DNS has started, but no public Vercel health preview exists and Resend verification is not observably configured. Tasks 2-5 may continue locally under the documented fallback, subject to each task's own dependency gates; Task 2 database proof additionally waits on Docker/configuration. Task 6 may continue through non-live work once Tasks 2, 4, and 5 pass, but cannot complete its real-payment gate. Tasks 7-8 follow their normal dependencies, with Task 8 live email proof blocked. Tasks 9-10 must not claim deployed/live completion until the Vercel, HTTPS, Claude, Resend, wallet, and deadline human gates above are closed.
