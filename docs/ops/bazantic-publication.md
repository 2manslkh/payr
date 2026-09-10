# Bazantic: Invoice Publication Only

This integration exposes one operation: publish an existing Payr invoice draft.
Draft creation and review stay in Payr or the existing MCP. It does not expose
client/profile administration, draft creation, status tools, voiding, payment
execution, or workers through the Bazantic specification.

## Gateway Setup

After deploying and verifying this change, enter:

| Bazantic field | Value |
| --- | --- |
| API Base URL | `https://payrlink.xyz` |
| Spec URL | `https://payrlink.xyz/openapi/publish.json` |
| Docs URL | Optional; leave blank |

Do not use `/openapi.json`: that is the separate public liveness specification.
The publication operation is `POST /api/invoices/{id}/publish` and its generated
tool name is `publish_invoice`.

Use a dedicated, short-lived connector in an isolated demo workspace with
`invoice:publish` and `invoice:status` scopes. The existing credential model
requires `invoice:status`, and publication uses it to read the finalized result.
The credential can also use those scopes through Payr's existing MCP; the
publication-only spec is not a credential-level restriction to one transport.
Do not select the broader default scope set if these two scopes suffice.

Configure the upstream header privately as `Authorization: Bearer <credential>`.
Never put the credential in the spec, recipe, URL, recording, or repository.
Bearer requests never fall back to a browser session if authentication fails.
Server-to-server calls should omit `Origin`; if present, it must match Payr's
canonical origin. Existing cookie-authenticated dashboard publication is unchanged.

Before activation, verify Bazantic's credential storage and caller authorization.
Do not publish an unrestricted gateway backed by a real workspace's shared
credential. A paid x402/MPP request is not authorization to publish that workspace's
invoices. Use private/caller-restricted gateway access or verified per-user upstream
credentials; if Bazantic offers neither, stop before activation.

## Recipe

1. Have the owner create and review a draft through Payr or its existing MCP.
2. Supply the existing draft ID and exact reviewed version to the agent.
3. Obtain explicit Publish & Send approval of that version, all defaults/client changes and both snapshot email recipients. Do not infer it from drafting or an older no-send approval. Refresh/reimport clients whose body schema lacks `deliveryApproval` before activation.
4. Call `publish_invoice` with the ID and the following JSON body:

```json
{
  "expectedVersion": 1,
  "approval": true,
  "deliveryApproval": true,
  "idempotencyKey": "publish-approved-draft-1"
}
```

5. Present the private invoice/PDF links and `invoiceEmail` per-recipient states. One distinct-address Resend message each contains the frozen PDF and links; equal client/sender addresses combine roles.
6. Do not send a duplicate through Gmail. The retained legacy Gmail package is not a sending instruction. `sent` means provider acceptance, not inbox delivery. Publication does not move funds. Disabled invoice email blocks fresh publication; historical no-send publications never backfill.

Reuse the same key and unchanged input after a timeout, `PUBLICATION_IN_PROGRESS`,
or `PUBLICATION_RETRYABLE`. Back off between retries and honor `Retry-After` on
429 responses. Do not generate a new key to bypass a failure. For version/profile
conflicts, return to Payr to review the updated draft and obtain fresh approval.
Failed publication attempts may require owner intervention. A successful replay
can return an expired or voided invoice; do not promise that every returned link
is currently payable.

## Acceptance and Submission

- Verify a live authenticated publication and unchanged retry return the same invoice and document links.
- Verify missing/invalid/revoked credentials, insufficient scopes, and cross-workspace IDs cannot publish.
- Verify absent approval, stale versions, and changed-input key reuse fail safely.
- Check the generated MCP exposes only `publish_invoice` from this spec.
- Record the Bazantic gateway and recipe executing without revealing credentials or private customer data.
- Include the Bazantic account identifier and gateway/recipe references in the submission.

Target: [Agentify a new API](https://ethglobal.com/events/ethonline2026/prizes/bazantic).
Creating this endpoint/spec does not by itself complete gateway setup or prove
prize qualification. The published requirements also call for a working gateway,
recipe, screen recording, and a flow using "both services"; confirm the final
submission satisfies that wording. No second service is implemented in this scope.

## Deployment Evidence: 9 September 2026

Deployed with user approval from the isolated `.worktrees/bazantic-publication-deploy`
worktree, then promoted after build and public-spec verification.

- Production: `https://payrlink.xyz`.
- Deployment: `dpl_DfNrv7RPaYgrxb5wbHgF5q7Y7rG6` (Ready).
- Unique URL: `https://payr-386c6uzi5-kenks-projects.vercel.app`.
- Rollback target: `dpl_8CihKbbNacMkLkjqirHb4Rn7yRDo`, `https://payr-d639gjtkg-kenks-projects.vercel.app`.
- Base commit: `aebcd154810c234ade8f59cf2a451aa161ce11ff`. This is an uncommitted publication-only snapshot, not a new tagged release; health reports the base SHA, not the complete source identity.
- Source manifest SHA-256: `23fdbff64b4636b4586984ba17bdf45890a6e8870bd7cbed2796dadda1f563eb`, computed from sorted uploaded file paths and their SHA-1 digests, separated by NUL and joined with newlines.

All 244 source files uploaded in the prior production deployment matched the
committed baseline. The new upload changed only the publication route and its
tests, added the publication spec and its tests, and added this runbook (before
this evidence section). Generated Next.js type references were also uploaded.
Unrelated root-worktree homepage, discovery, proxy, and MCP changes were excluded.

Verification on the isolated snapshot:

- Lint, typecheck, 10 release-tool tests, local production build, and Vercel production build passed.
- All 1,985 non-PDF unit tests passed. The PDF suite had three initial timing/budget failures; all 50 active PDF tests passed on an isolated rerun, with 13 existing skips.
- Native dependency tracing and all 35 compiled-document tests passed.
- Live health and `/openapi/publish.json` returned 200; the spec contained only `POST /api/invoices/{id}/publish`, with bearer security and the canonical production server.
- Missing, malformed, and invalid bearer authentication returned 401 with private/no-store responses; explicit credential failures included the bearer challenge.
- `/openapi.json` remained health-only; homepage, login, and MCP server card returned 200; unauthenticated dashboard access redirected to login; legacy MCP rejected an invalid credential with 401.
- Node 22, disabled Git-triggered deployments, and all three daily cron schedules were preserved. `PAYR_RECEIPT_EMAIL_ENABLED=false` was explicitly retained on the deployment.

No database migrations, connector creation, authenticated invoice publication,
email sends, worker invocations, or payments were performed. Bazantic gateway
configuration and an authenticated end-to-end publication remain unverified.
